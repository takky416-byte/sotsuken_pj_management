import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { openDb } from './db.js';
import { createApp } from './app.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH ?? path.join(here, '..', 'data.db');
const secretFile = `${dbPath}.secret`;

// JWT_SECRET 未指定ならデータベース横に生成して使い回す
let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  jwtSecret = fs.readFileSync(secretFile, 'utf8');
}

const db = openDb(dbPath);
const app = createApp(db, { jwtSecret });

const dist = path.join(here, '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  const code = db.prepare("SELECT value FROM settings WHERE key='invite_code'").get().value;
  console.log(`http://localhost:${port}  (学生用招待コード: ${code})`);
});
