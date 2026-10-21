import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';

async function setup() {
  const db = openDb(':memory:');
  const server = createApp(db, { jwtSecret: 't' }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, token) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
      body: body && JSON.stringify(body),
    });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
  const code = db.prepare("SELECT value FROM settings WHERE key='invite_code'").get().value;
  const teacher = (await call('POST', '/api/register', { name: '先生', email: 't@x.jp', password: 'password1' })).body;
  const mk = async (n) =>
    (await call('POST', '/api/register', { name: n, email: `${n}@x.jp`, password: 'password1', inviteCode: code })).body;
  return { call, code, teacher, mk, close: () => server.close() };
}

test('first user is teacher, students need invite code', async () => {
  const { call, teacher, mk, close } = await setup();
  assert.equal(teacher.user.role, 'teacher');
  const r = await call('POST', '/api/register', { name: 'a', email: 'a@x.jp', password: 'password1', inviteCode: 'bad' });
  assert.equal(r.status, 403);
  assert.equal((await mk('s1')).user.role, 'student');
  close();
});

test('students are isolated; teacher can read but not edit tasks', async () => {
  const { call, teacher, mk, close } = await setup();
  const s1 = await mk('s1');
  const s2 = await mk('s2');
  const t = await call('POST', '/api/users/me/tasks', { title: '文献調査', due_date: '2026-11-01' }, s1.token);
  assert.equal(t.status, 201);
  assert.equal((await call('GET', `/api/users/${s1.user.id}/tasks`, null, s2.token)).status, 403);
  assert.equal((await call('GET', `/api/users/${s1.user.id}/tasks`, null, teacher.token)).body.length, 1);
  assert.equal((await call('POST', `/api/users/${s1.user.id}/tasks`, { title: 'x' }, teacher.token)).status, 403);
  const moved = await call('PUT', `/api/users/me/tasks/${t.body.id}`, { status: 'doing' }, s1.token);
  assert.equal(moved.body.status, 'doing');
  assert.equal(moved.body.title, '文献調査');
  assert.equal((await call('GET', '/api/students', null, s1.token)).status, 403);
  close();
});

test('validation, milestones by teacher, log comments, dashboard', async () => {
  const { call, teacher, mk, close } = await setup();
  const s = await mk('s1');
  assert.equal((await call('POST', '/api/users/me/tasks', { title: 'x', status: 'bogus' }, s.token)).status, 400);
  assert.equal((await call('POST', '/api/users/me/tasks', { title: 'x', due_date: '2026-13-99' }, s.token)).status, 400);
  const ms = await call('POST', `/api/users/${s.user.id}/milestones`,
    { title: '中間発表', start_date: '2026-11-01', end_date: '2026-12-01' }, teacher.token);
  assert.equal(ms.status, 201);
  const log = await call('POST', '/api/users/me/logs', { week_of: '2026-10-19', done_text: '実験' }, s.token);
  const dash1 = await call('GET', '/api/students', null, teacher.token);
  assert.equal(dash1.body[0].unanswered_logs, 1);
  assert.equal(dash1.body[0].next_milestone.title, '中間発表');
  const c = await call('POST', `/api/users/${s.user.id}/logs/${log.body.id}/comments`, { body: 'いいね' }, teacher.token);
  assert.equal(c.status, 201);
  const logs = await call('GET', '/api/users/me/logs', null, s.token);
  assert.equal(logs.body[0].comments[0].author, '先生');
  assert.equal((await call('GET', '/api/students', null, teacher.token)).body[0].unanswered_logs, 0);
  close();
});
