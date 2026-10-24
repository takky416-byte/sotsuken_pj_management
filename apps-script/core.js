/**
 * 作業レポートリマインドの判定ロジック (純粋な関数だけ。Apps Script にも Node にも依存しない)。
 * Node のテストでは、require して使う。Apps Script では、グローバルの Reminder として使う。
 */
var Reminder = (function () {
  var DAILY_URL = 'https://sotsuken-pj.web.app/daily';
  var MAX_RECIPIENTS = 40; // 想定より多いときは、送らずに止める (設定ミスの暴走を防ぐ)

  // ---- Firestore REST の値を、普通の JS の値にする ----
  function decodeValue(v) {
    if (v === undefined || v === null) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
    if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
    return null; // nullValue など
  }
  function decodeFields(fields) {
    var out = {};
    Object.keys(fields).forEach(function (k) { out[k] = decodeValue(fields[k]); });
    return out;
  }
  /** ドキュメントの名前の最後の部分を id にする (名簿は、メールアドレスが id) */
  function decodeDoc(doc) {
    var o = decodeFields(doc.fields || {});
    o.id = doc.name.split('/').pop();
    return o;
  }

  // ---- 日付・時間帯 ----
  function jstDate(ms) { return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10); }
  /** morning = 木曜の 1-2限 / afternoon = 火・水の 3-4限 */
  function slotMatches(periods, slot) {
    return (slot === 'morning' && periods === '1-2') || (slot === 'afternoon' && periods === '3-4');
  }

  /** アプリの lib/daily.ts の statusOf と同じ。一言のある項目か、困っていることがあれば、提出済み。 */
  function statusOf(d) {
    if (!d) return 'missing';
    if (d.absent === true) return 'absent';
    var entries = d.entries || [];
    var hasNote = entries.some(function (e) { return String(e.note || '').trim() !== ''; });
    return hasNote || String(d.blocker || '').trim() !== '' ? 'submitted' : 'missing';
  }

  function skip(reason) { return { skip: reason, recipients: [] }; }

  /**
   * 今日・この時間帯に、リマインドを送る相手を決める。
   * input: { today, slot, dailyStartDate, classDays, teams, students, dailiesByTeam }
   */
  function plan(input) {
    var today = input.today;
    if (input.dailyStartDate && today < input.dailyStartDate) {
      return skip('作業レポートの運用開始日 (' + input.dailyStartDate + ') より前です');
    }
    var day = (input.classDays || []).filter(function (d) { return d.date === today; })[0];
    if (!day) return skip('今日 (' + today + ') は授業日ではありません');
    if (!slotMatches(day.periods, input.slot)) {
      return skip('この時間帯の対象ではありません (今日は ' + day.periods + '限の日です)');
    }

    var active = {};
    (input.teams || []).forEach(function (t) { if (t.status === 'active') active[t.id] = true; });

    var recipients = [];
    (input.students || []).forEach(function (s) {
      if (s.role !== 'student' || !s.sid || !s.id || !active[s.teamId]) return;
      var daily = ((input.dailiesByTeam || {})[s.teamId] || []).filter(function (d) { return d.sid === s.sid && d.date === today; })[0];
      if (statusOf(daily) === 'missing') recipients.push({ name: s.name, email: s.id, teamId: s.teamId, sid: s.sid });
    });
    recipients.sort(function (a, b) { return a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : a.sid.localeCompare(b.sid, 'en', { numeric: true }); });

    return { skip: null, date: today, slot: input.slot, recipients: recipients, tooMany: recipients.length > MAX_RECIPIENTS };
  }

  // ---- メールの文面 ----
  function studentMail(name, date) {
    return {
      subject: '【卒研】今日の作業レポートをお願いします (' + date.slice(5).replace('-', '/') + ')',
      body: [
        name + ' さん',
        '',
        '今日の作業レポートが、まだ提出されていません。',
        'できたことを選んで、選んだ項目に一言(何をしたか)を添えて、提出してください。1分ほどで書けます。',
        '',
        DAILY_URL,
        '',
        '※ 今日、欠席の人は、このメールは気にしなくて大丈夫です(欠席は先生が入力します)。',
        '※ このメールは、作業レポートの提出を促すための自動送信です。',
      ].join('\n'),
    };
  }

  /** 試験モード: 学生には送らず、先生に「誰に、どの文面で送る予定か」を知らせる。 */
  function teacherTestMail(p) {
    var sample = studentMail('(学生の名前)', p.date);
    var list = p.recipients.length
      ? p.recipients.map(function (r) { return '・' + r.teamId + 'チーム ' + r.name + ' <' + r.email + '>'; }).join('\n')
      : '(送る相手はいません)';
    return {
      subject: '[試験] 作業レポートリマインドの送信予定 (' + p.date + ' ' + (p.slot === 'morning' ? '午前' : '午後') + ')',
      body: [
        '試験モードです。学生には、メールを送っていません。',
        '本番モードにすると、次の ' + p.recipients.length + ' 名に、下の文面を送ります。',
        '',
        list,
        '',
        '--- 件名 ---',
        sample.subject,
        '--- 本文 ---',
        sample.body,
      ].join('\n'),
    };
  }

  /** 本番モード: 送信したあと、先生に結果を知らせる。 */
  function teacherLiveSummary(p, failed) {
    var list = p.recipients.map(function (r) { return '・' + r.teamId + 'チーム ' + r.name; }).join('\n');
    return {
      subject: '作業レポートリマインドを送信しました (' + p.date + ' ' + (p.slot === 'morning' ? '午前' : '午後') + ' / ' + p.recipients.length + '名)',
      body: [
        p.recipients.length + ' 名に、作業レポートのリマインドを送りました。',
        failed && failed.length ? '\n送れなかった人: ' + failed.join('、') : '',
        '',
        list,
      ].join('\n'),
    };
  }

  function tooManyMail(p) {
    return {
      subject: '[要確認] 作業レポートリマインドを止めました',
      body: '送信先が ' + p.recipients.length + ' 名で、上限 (' + MAX_RECIPIENTS + ' 名) を超えたため、送らずに止めました。\n設定やデータを確認してください。',
    };
  }

  return {
    MAX_RECIPIENTS: MAX_RECIPIENTS,
    decodeValue: decodeValue, decodeDoc: decodeDoc, jstDate: jstDate, slotMatches: slotMatches, statusOf: statusOf,
    plan: plan, studentMail: studentMail, teacherTestMail: teacherTestMail, teacherLiveSummary: teacherLiveSummary, tooManyMail: tooManyMail,
  };
})();

if (typeof module !== 'undefined') module.exports = Reminder;
