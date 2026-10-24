/**
 * 作業レポートのリマインド (Apps Script)。あなたの Google アカウントで動き、Gmail から送る。
 * 設定・手順は README.md。判定のロジックは core.js (Reminder)。
 *
 * スクリプトのプロパティ:
 *   MODE          'test' (既定: 先生にだけ送る) / 'live' (学生に送る)
 *   PROJECT_ID    Firebase のプロジェクト ID (既定 'sotsuken-pj')
 *   DATE_OVERRIDE 予行演習用の日付 (YYYY-MM-DD)。空なら今日。設定されていると、必ず試験モード (先生宛だけ)。
 *   LAST_SENT     二重送信の防止 (自動で設定される)
 *   BACKUP_KEEP   バックアップを残す日数 (既定 60)
 *   LAST_BACKUP   最後にバックアップした日 (自動)
 */

var SLOT_LABEL = { morning: '午前 (木曜 1-2限)', afternoon: '午後 (火・水 3-4限)' };

// ---- トリガーから呼ばれる ----
function remindMorning() { return runReminder_('morning', {}); }
function remindAfternoon() { return runReminder_('afternoon', {}); }

// ---- 手動で実行する ----
/** 送らずに、いま送るとしたら誰に送るかを、ログに出す。DATE_OVERRIDE で日付を変えて試せる。 */
function dryRunMorning() { return runReminder_('morning', { dryRun: true, force: true }); }
function dryRunAfternoon() { return runReminder_('afternoon', { dryRun: true, force: true }); }

/** 初回の設定: トリガーを作る。何度実行しても、トリガーは重複しない。 */
function setup() {
  var handlers = ['remindMorning', 'remindAfternoon'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (handlers.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  // 時刻は「その時刻の前後 15 分以内」に実行される (Apps Script の仕様)
  ScriptApp.newTrigger('remindMorning').timeBased().inTimezone('Asia/Tokyo').atHour(10).nearMinute(45).everyDays(1).create();
  ScriptApp.newTrigger('remindAfternoon').timeBased().inTimezone('Asia/Tokyo').atHour(16).nearMinute(30).everyDays(1).create();
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('MODE')) props.setProperty('MODE', 'test');
  Logger.log('トリガーを作りました。MODE=' + props.getProperty('MODE'));
}
function goLive() { PropertiesService.getScriptProperties().setProperty('MODE', 'live'); Logger.log('本番モードにしました。学生にメールが届きます。'); }
function goTest() { PropertiesService.getScriptProperties().setProperty('MODE', 'test'); Logger.log('試験モードにしました。先生にだけ送ります。'); }

// ---- 毎日のバックアップ (あなたの Google ドライブ「卒研PJ バックアップ」フォルダに、JSON を保存する) ----
// 保存先は、ドライブの「バックアップ」フォルダ (ID は、フォルダの URL の末尾)。スクリプト プロパティ BACKUP_FOLDER_ID で変えられる。
var BACKUP_FOLDER_ID = '1hTPJorv8aCJbtXjj5hrR2TPgj4GU4ksP';
var TOP_COLLECTIONS = ['roster', 'teams', 'config', 'milestones', 'teacherNotes', 'followups', 'evaluationsRaw', 'accessLogs'];
var TEAM_SUBCOLLECTIONS = ['tasks', 'dailyReports', 'meetings', 'comments', 'thanks', 'evaluationsPublished'];

/** 初回の設定: 毎日 3 時ごろに backupDaily を動かすトリガーを作る。何度実行しても重複しない。 */
function setupBackup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'backupDaily') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupDaily').timeBased().inTimezone('Asia/Tokyo').atHour(3).nearMinute(0).everyDays(1).create();
  Logger.log('バックアップのトリガーを作りました (毎日 3 時ごろ)。いま 1 回、実行します。');
  backupDaily();
}

/** 全データを読み込んで、ドライブに JSON で保存する。アプリの「書き出し」のバックアップと同じ形式。 */
function backupDaily() {
  var props = PropertiesService.getScriptProperties();
  var me = Session.getEffectiveUser().getEmail();
  try {
    var today = Reminder.jstDate(Date.now());
    var collections = {};
    TOP_COLLECTIONS.forEach(function (p) { collections[p] = listDocs_(p); });
    collections.teams.forEach(function (t) {
      TEAM_SUBCOLLECTIONS.forEach(function (sub) { collections['teams/' + t.id + '/' + sub] = listDocs_('teams/' + t.id + '/' + sub); });
    });
    var backup = {
      meta: { app: 'sotsuken-pj', version: 1, exportedAt: new Date().toISOString(), includesTeacherNotes: true },
      collections: collections,
    };
    var folder = backupFolder_();
    var name = 'sotsuken-backup-' + today + '.json';
    var content = JSON.stringify(backup);
    var same = folder.getFilesByName(name);
    if (same.hasNext()) same.next().setContent(content);
    else folder.createFile(name, content, 'application/json');
    var removed = pruneBackups_(folder, Number(props.getProperty('BACKUP_KEEP')) || 60);
    props.setProperty('LAST_BACKUP', today);
    var n = Object.keys(collections).reduce(function (a, k) { return a + collections[k].length; }, 0);
    Logger.log('バックアップしました: ' + name + ' (' + n + '件)。古いバックアップを ' + removed + ' 件、ごみ箱に移しました。');
    return { name: name, docs: n };
  } catch (e) {
    Logger.log('バックアップに失敗: ' + e);
    try {
      MailApp.sendEmail({ to: me, subject: '[卒研PJ管理] 毎日のバックアップに失敗しました', body: String(e) + '\n\nApps Script の「実行数」でログを確認してください。', name: '卒研PJ管理(自動送信)' });
    } catch (e2) { /* メールも送れないときは、実行ログだけ */ }
    throw e;
  }
}

function backupFolder_() {
  var id = PropertiesService.getScriptProperties().getProperty('BACKUP_FOLDER_ID') || BACKUP_FOLDER_ID;
  var folder = DriveApp.getFolderById(id);
  // バックアップには、学生のメールアドレスと教員メモが入る。リンクを知っている人や、学校のドメインの全員
  // (学生を含む) に見えるフォルダには、保存しない。
  var access = String(folder.getSharingAccess());
  if (access !== 'PRIVATE' && PropertiesService.getScriptProperties().getProperty('BACKUP_ALLOW_SHARED') !== 'true') {
    throw new Error('バックアップ先のフォルダが、共有されています (' + access + ')。ドライブでフォルダの「一般的なアクセス」を「制限付き」に変えてください。');
  }
  return folder;
}

/** 名前 (sotsuken-backup-日付.json) が新しいものから keep 件を残し、古いものをごみ箱へ。返り値は、ごみ箱に移した数。 */
function pruneBackups_(folder, keep) {
  var files = [];
  var it = folder.getFiles();
  while (it.hasNext()) { var f = it.next(); if (/^sotsuken-backup-\d{4}-\d{2}-\d{2}\.json$/.test(f.getName())) files.push(f); }
  files.sort(function (a, b) { return a.getName() < b.getName() ? 1 : -1; });
  files.slice(keep).forEach(function (f) { f.setTrashed(true); });
  return Math.max(0, files.length - keep);
}

// ---- 本体 ----
function runReminder_(slot, opts) {
  var props = PropertiesService.getScriptProperties();
  // DATE_OVERRIDE があるときは予行演習。MODE にかかわらず、必ず試験モード (先生宛だけ) にし、
  // 「送信済み」の記録も残さない (残すと、本番の同じ日に送られなくなる。消し忘れて学生に送る事故も防ぐ)。
  var rehearsal = !!props.getProperty('DATE_OVERRIDE');
  var mode = !rehearsal && props.getProperty('MODE') === 'live' ? 'live' : 'test';
  var today = props.getProperty('DATE_OVERRIDE') || Reminder.jstDate(Date.now());
  var key = today + ':' + slot;
  if (rehearsal) Logger.log('予行演習です (DATE_OVERRIDE=' + today + ')。学生には送りません。');
  if (!rehearsal && !opts.force && props.getProperty('LAST_SENT') === key) {
    Logger.log('今日のこの時間帯は、送信済みです (' + key + ')');
    return { skip: 'sent' };
  }

  var settings = getDoc_('config/settings') || {};
  var classDaysDoc = getDoc_('config/classDays') || {};
  var teams = listDocs_('teams');
  var students = listDocs_('roster').filter(function (r) { return r.role === 'student'; });

  var dailiesByTeam = {};
  teams.filter(function (t) { return t.status === 'active'; }).forEach(function (t) {
    dailiesByTeam[t.id] = queryDocs_('teams/' + t.id, 'dailyReports', 'date', today);
  });

  var plan = Reminder.plan({
    today: today, slot: slot, dailyStartDate: settings.dailyStartDate || '2026-10-28',
    classDays: classDaysDoc.days || [], teams: teams, students: students, dailiesByTeam: dailiesByTeam,
  });
  if (plan.skip) { Logger.log('送りません: ' + plan.skip); return plan; }

  var me = Session.getEffectiveUser().getEmail();
  Logger.log('[' + mode + (opts.dryRun ? '/予行' : '') + '] ' + today + ' ' + SLOT_LABEL[slot] + ' 対象: ' + plan.recipients.length + '名');
  plan.recipients.forEach(function (r) { Logger.log('  ' + r.teamId + ' ' + r.name + ' <' + r.email + '>'); });
  if (opts.dryRun) return plan;

  if (plan.tooMany) { send_(me, Reminder.tooManyMail(plan)); return plan; }

  if (mode === 'test') {
    send_(me, Reminder.teacherTestMail(plan)); // 0 名でも送る (仕組みが動いていることの確認のため)
  } else {
    if (plan.recipients.length === 0) {
      Logger.log('未提出の学生はいません。メールは送りません。');
      return plan;
    }
    var failed = [];
    plan.recipients.forEach(function (r) {
      try { send_(r.email, Reminder.studentMail(r.name, today)); }
      catch (e) { failed.push(r.name); Logger.log('送信失敗: ' + r.name + ' ' + e); }
    });
    send_(me, Reminder.teacherLiveSummary(plan, failed));
  }
  if (!rehearsal) props.setProperty('LAST_SENT', key);
  return plan;
}

function send_(to, mail) {
  MailApp.sendEmail({ to: to, subject: mail.subject, body: mail.body, name: '卒研PJ管理(自動送信)' });
}

// ---- Firestore REST (あなたの Google アカウントの権限で読む) ----
function projectId_() { return PropertiesService.getScriptProperties().getProperty('PROJECT_ID') || 'sotsuken-pj'; }
function base_() { return PropertiesService.getScriptProperties().getProperty('FIRESTORE_BASE') || 'https://firestore.googleapis.com'; }
function docsRoot_() { return base_() + '/v1/projects/' + projectId_() + '/databases/(default)/documents'; }

function fetchJson_(url, options) {
  options = options || {};
  options.headers = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  options.muteHttpExceptions = true;
  var res = UrlFetchApp.fetch(url, options);
  var code = res.getResponseCode();
  if (code === 404) return null;
  if (code >= 300) throw new Error('Firestore ' + code + ': ' + res.getContentText().slice(0, 300));
  return JSON.parse(res.getContentText());
}

function getDoc_(path) {
  var j = fetchJson_(docsRoot_() + '/' + path);
  return j ? Reminder.decodeDoc(j) : null;
}

function listDocs_(path) {
  var out = [];
  var token = '';
  do {
    var j = fetchJson_(docsRoot_() + '/' + path + '?pageSize=300' + (token ? '&pageToken=' + encodeURIComponent(token) : ''));
    if (!j) break;
    (j.documents || []).forEach(function (d) { out.push(Reminder.decodeDoc(d)); });
    token = j.nextPageToken || '';
  } while (token);
  return out;
}

/** parentPath (例: teams/A) の下の collectionId で、field == value のドキュメント */
function queryDocs_(parentPath, collectionId, field, value) {
  var j = fetchJson_(docsRoot_() + '/' + parentPath + ':runQuery', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collectionId }],
        where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } },
      },
    }),
  });
  return (j || []).filter(function (x) { return x.document; }).map(function (x) { return Reminder.decodeDoc(x.document); });
}
