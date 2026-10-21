import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const STATUSES = ['todo', 'doing', 'done'];
const PRIORITIES = ['low', 'mid', 'high'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => new HttpError(400, msg);
const str = (v, name, { max = 2000, required = false } = {}) => {
  if (v == null || v === '') {
    if (required) throw bad(`${name} は必須です`);
    return '';
  }
  if (typeof v !== 'string' || v.length > max) throw bad(`${name} が不正です`);
  const t = v.trim();
  if (required && !t) throw bad(`${name} は必須です`);
  return t;
};
const date = (v, name, required = false) => {
  if (v == null || v === '') {
    if (required) throw bad(`${name} は必須です`);
    return null;
  }
  if (typeof v !== 'string' || !DATE_RE.test(v) || Number.isNaN(Date.parse(v))) {
    throw bad(`${name} は YYYY-MM-DD 形式で指定してください`);
  }
  return v;
};
const oneOf = (v, list, name) => {
  if (!list.includes(v)) throw bad(`${name} が不正です`);
  return v;
};

export function createApp(db, { jwtSecret }) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  const wrap = (fn) => (req, res, next) => {
    try { fn(req, res); } catch (e) { next(e); }
  };
  const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, theme: u.theme });
  const sign = (u) => jwt.sign({ id: u.id }, jwtSecret, { expiresIn: '14d' });

  // ---- auth ----
  app.post('/api/register', wrap((req, res) => {
    const name = str(req.body.name, '名前', { max: 100, required: true });
    const email = str(req.body.email, 'メールアドレス', { max: 200, required: true }).toLowerCase();
    const password = str(req.body.password, 'パスワード', { max: 200, required: true });
    if (password.length < 8) throw bad('パスワードは8文字以上にしてください');
    const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    // 最初に登録したユーザーが教員になる。以降は招待コードが必要。
    const role = count === 0 ? 'teacher' : 'student';
    if (role === 'student') {
      const code = db.prepare("SELECT value FROM settings WHERE key='invite_code'").get().value;
      if (req.body.inviteCode !== code) throw new HttpError(403, '招待コードが正しくありません');
    }
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) {
      throw new HttpError(409, 'このメールアドレスは登録済みです');
    }
    const info = db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)')
      .run(name, email, bcrypt.hashSync(password, 10), role);
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
    res.status(201).json({ token: sign(user), user: publicUser(user) });
  }));

  app.post('/api/login', wrap((req, res) => {
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (!user || !bcrypt.compareSync(String(req.body.password ?? ''), user.password_hash)) {
      throw new HttpError(401, 'メールアドレスまたはパスワードが違います');
    }
    res.json({ token: sign(user), user: publicUser(user) });
  }));

  // ---- 以降は認証必須 ----
  app.use('/api', (req, _res, next) => {
    try {
      const h = req.headers.authorization ?? '';
      const payload = jwt.verify(h.replace(/^Bearer /, ''), jwtSecret);
      const user = db.prepare('SELECT * FROM users WHERE id=?').get(payload.id);
      if (!user) throw new Error('no user');
      req.user = user;
      next();
    } catch {
      next(new HttpError(401, 'ログインが必要です'));
    }
  });

  const teacherOnly = (req, _res, next) =>
    req.user.role === 'teacher' ? next() : next(new HttpError(403, '教員のみ操作できます'));

  app.get('/api/me', wrap((req, res) => res.json(publicUser(req.user))));

  app.put('/api/me', wrap((req, res) => {
    const theme = str(req.body.theme, '研究テーマ', { max: 200 });
    db.prepare('UPDATE users SET theme=? WHERE id=?').run(theme, req.user.id);
    res.json(publicUser({ ...req.user, theme }));
  }));

  app.get('/api/invite-code', teacherOnly, wrap((_req, res) => {
    res.json({ code: db.prepare("SELECT value FROM settings WHERE key='invite_code'").get().value });
  }));

  // ---- 教員ダッシュボード ----
  app.get('/api/students', teacherOnly, wrap((_req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const rows = db.prepare(`
      SELECT u.id, u.name, u.email, u.theme,
        (SELECT COUNT(*) FROM tasks t WHERE t.user_id=u.id AND t.status='todo') AS todo,
        (SELECT COUNT(*) FROM tasks t WHERE t.user_id=u.id AND t.status='doing') AS doing,
        (SELECT COUNT(*) FROM tasks t WHERE t.user_id=u.id AND t.status='done') AS done,
        (SELECT COUNT(*) FROM tasks t WHERE t.user_id=u.id AND t.status!='done'
           AND t.due_date IS NOT NULL AND t.due_date < ?) AS overdue,
        (SELECT MAX(week_of) FROM logs l WHERE l.user_id=u.id) AS last_log,
        (SELECT COUNT(*) FROM logs l WHERE l.user_id=u.id
           AND NOT EXISTS (SELECT 1 FROM comments c WHERE c.log_id=l.id)) AS unanswered_logs,
        (SELECT title || '|' || end_date FROM milestones m WHERE m.user_id=u.id AND m.done=0
           ORDER BY end_date LIMIT 1) AS next_milestone
      FROM users u WHERE u.role='student' ORDER BY u.name
    `).all(today);
    res.json(rows.map((r) => {
      const [title, end] = r.next_milestone ? r.next_milestone.split('|') : [null, null];
      return { ...r, next_milestone: title ? { title, end_date: end } : null };
    }));
  }));

  // ---- 学生データへのアクセス制御 ----
  // :uid が自分、または教員のみ閲覧可。書き込みは本人のみ (マイルストーンは教員も可)。
  const scope = (req, _res, next) => {
    const uid = req.params.uid === 'me' ? req.user.id : Number(req.params.uid);
    if (!Number.isInteger(uid)) return next(new HttpError(400, 'ID が不正です'));
    if (uid !== req.user.id && req.user.role !== 'teacher') return next(new HttpError(403, '権限がありません'));
    const owner = db.prepare('SELECT * FROM users WHERE id=?').get(uid);
    if (!owner || owner.role !== 'student') return next(new HttpError(404, '学生が見つかりません'));
    req.owner = owner;
    req.isOwner = uid === req.user.id;
    next();
  };
  const ownerOnly = (req, _res, next) =>
    req.isOwner ? next() : next(new HttpError(403, '本人のみ編集できます'));
  const U = '/api/users/:uid';

  app.get(U, scope, wrap((req, res) => res.json(publicUser(req.owner))));

  // tasks
  const taskFields = (b) => ({
    title: str(b.title, 'タイトル', { max: 200, required: true }),
    description: str(b.description, '説明', { max: 5000 }),
    status: b.status == null ? 'todo' : oneOf(b.status, STATUSES, 'ステータス'),
    priority: b.priority == null ? 'mid' : oneOf(b.priority, PRIORITIES, '優先度'),
    due_date: date(b.due_date, '期限'),
  });
  app.get(`${U}/tasks`, scope, wrap((req, res) => {
    res.json(db.prepare('SELECT * FROM tasks WHERE user_id=? ORDER BY id').all(req.owner.id));
  }));
  app.post(`${U}/tasks`, scope, ownerOnly, wrap((req, res) => {
    const t = taskFields(req.body);
    const info = db.prepare(
      'INSERT INTO tasks (user_id,title,description,status,priority,due_date) VALUES (?,?,?,?,?,?)'
    ).run(req.owner.id, t.title, t.description, t.status, t.priority, t.due_date);
    res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id=?').get(info.lastInsertRowid));
  }));
  const findOwned = (table) => (req, _res, next) => {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id=? AND user_id=?`)
      .get(Number(req.params.id), req.owner.id);
    if (!row) return next(new HttpError(404, '見つかりません'));
    req.row = row;
    next();
  };
  app.put(`${U}/tasks/:id`, scope, ownerOnly, findOwned('tasks'), wrap((req, res) => {
    const t = taskFields({ ...req.row, ...req.body });
    db.prepare('UPDATE tasks SET title=?,description=?,status=?,priority=?,due_date=? WHERE id=?')
      .run(t.title, t.description, t.status, t.priority, t.due_date, req.row.id);
    res.json(db.prepare('SELECT * FROM tasks WHERE id=?').get(req.row.id));
  }));
  app.delete(`${U}/tasks/:id`, scope, ownerOnly, findOwned('tasks'), wrap((req, res) => {
    db.prepare('DELETE FROM tasks WHERE id=?').run(req.row.id);
    res.status(204).end();
  }));

  // milestones (学生・教員どちらも編集可)
  const msFields = (b) => {
    const start = date(b.start_date, '開始日', true);
    const end = date(b.end_date, '終了日', true);
    if (end < start) throw bad('終了日は開始日以降にしてください');
    return {
      title: str(b.title, 'タイトル', { max: 200, required: true }),
      start_date: start,
      end_date: end,
      done: b.done ? 1 : 0,
    };
  };
  app.get(`${U}/milestones`, scope, wrap((req, res) => {
    res.json(db.prepare('SELECT * FROM milestones WHERE user_id=? ORDER BY start_date,id').all(req.owner.id));
  }));
  app.post(`${U}/milestones`, scope, wrap((req, res) => {
    const m = msFields(req.body);
    const info = db.prepare(
      'INSERT INTO milestones (user_id,title,start_date,end_date,done,created_by) VALUES (?,?,?,?,?,?)'
    ).run(req.owner.id, m.title, m.start_date, m.end_date, m.done, req.user.id);
    res.status(201).json(db.prepare('SELECT * FROM milestones WHERE id=?').get(info.lastInsertRowid));
  }));
  app.put(`${U}/milestones/:id`, scope, findOwned('milestones'), wrap((req, res) => {
    const m = msFields({ ...req.row, ...req.body });
    db.prepare('UPDATE milestones SET title=?,start_date=?,end_date=?,done=? WHERE id=?')
      .run(m.title, m.start_date, m.end_date, m.done, req.row.id);
    res.json(db.prepare('SELECT * FROM milestones WHERE id=?').get(req.row.id));
  }));
  app.delete(`${U}/milestones/:id`, scope, findOwned('milestones'), wrap((req, res) => {
    db.prepare('DELETE FROM milestones WHERE id=?').run(req.row.id);
    res.status(204).end();
  }));

  // logs + 教員コメント
  const logFields = (b) => ({
    week_of: date(b.week_of, '対象週', true),
    done_text: str(b.done_text, '今週やったこと', { max: 10000 }),
    issues: str(b.issues, '課題・相談', { max: 10000 }),
    next_plan: str(b.next_plan, '来週の予定', { max: 10000 }),
  });
  app.get(`${U}/logs`, scope, wrap((req, res) => {
    const logs = db.prepare('SELECT * FROM logs WHERE user_id=? ORDER BY week_of DESC,id DESC').all(req.owner.id);
    const comments = db.prepare(`
      SELECT c.*, u.name AS author FROM comments c JOIN users u ON u.id=c.user_id
      WHERE c.log_id IN (SELECT id FROM logs WHERE user_id=?) ORDER BY c.id
    `).all(req.owner.id);
    res.json(logs.map((l) => ({ ...l, comments: comments.filter((c) => c.log_id === l.id) })));
  }));
  app.post(`${U}/logs`, scope, ownerOnly, wrap((req, res) => {
    const l = logFields(req.body);
    const info = db.prepare('INSERT INTO logs (user_id,week_of,done_text,issues,next_plan) VALUES (?,?,?,?,?)')
      .run(req.owner.id, l.week_of, l.done_text, l.issues, l.next_plan);
    res.status(201).json({ ...db.prepare('SELECT * FROM logs WHERE id=?').get(info.lastInsertRowid), comments: [] });
  }));
  app.put(`${U}/logs/:id`, scope, ownerOnly, findOwned('logs'), wrap((req, res) => {
    const l = logFields({ ...req.row, ...req.body });
    db.prepare('UPDATE logs SET week_of=?,done_text=?,issues=?,next_plan=? WHERE id=?')
      .run(l.week_of, l.done_text, l.issues, l.next_plan, req.row.id);
    res.json(db.prepare('SELECT * FROM logs WHERE id=?').get(req.row.id));
  }));
  app.delete(`${U}/logs/:id`, scope, ownerOnly, findOwned('logs'), wrap((req, res) => {
    db.prepare('DELETE FROM logs WHERE id=?').run(req.row.id);
    res.status(204).end();
  }));
  app.post(`${U}/logs/:id/comments`, scope, findOwned('logs'), wrap((req, res) => {
    const body = str(req.body.body, 'コメント', { max: 5000, required: true });
    const info = db.prepare('INSERT INTO comments (log_id,user_id,body) VALUES (?,?,?)')
      .run(req.row.id, req.user.id, body);
    res.status(201).json(db.prepare(
      'SELECT c.*, u.name AS author FROM comments c JOIN users u ON u.id=c.user_id WHERE c.id=?'
    ).get(info.lastInsertRowid));
  }));

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON が不正です' });
    if (!err.status) console.error(err);
    res.status(err.status ?? 500).json({ error: err.status ? err.message : 'サーバーエラー' });
  });
  return app;
}
