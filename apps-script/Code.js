/**
 * 作業ログのリマインド (Apps Script)。あなたの Google アカウントで動き、Gmail から送る。
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
var TEAM_SUBCOLLECTIONS = ['tasks', 'dailyReports', 'meetings', 'comments', 'thanks', 'taskLogs', 'meetingDrafts', 'meetingSummaries', 'evaluationsPublished'];

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

// ---- ミーティング録音 → 要旨の下書き ----
// ドライブの「ミーティング録音」フォルダ (ID は、スクリプト プロパティ MEETING_AUDIO_FOLDER_ID) に、録音ファイル
// (名前は「A_2026-10-28.m4a」のように、チーム_日付) を入れると、30 分おきに、Gemini で要旨の下書きを作って、アプリに入れる。
// 下書きは、先生だけが見られる (teams/チーム/meetingDrafts)。先生がアプリで確認して公開すると、学生のホームに出る。
// 処理した録音は、フォルダの中の「処理済み」に移す (消さない。先生だけが見られる)。
// スクリプト プロパティ: MEETING_AUDIO_FOLDER_ID (必須) / GEMINI_API_KEY (必須) / GEMINI_MODEL (既定 gemini-2.5-flash) / GEMINI_BASE (試験用)
var GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';
var PROCESSED_FOLDER_NAME = '処理済み';
var FAILED_MARK = '[要旨づくり失敗]';
var DONE_MARK = '[要旨づくり済み]';

/** 初回の設定: 30 分おきに summarizeRecordings を動かすトリガーを作る。何度実行しても重複しない。 */
function setupMeetingSummary() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'summarizeRecordings') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('summarizeRecordings').timeBased().everyMinutes(30).create();
  Logger.log('要旨づくりのトリガーを作りました (30 分おき)。いま 1 回、実行します。');
  summarizeRecordings();
}

/** フォルダの録音を、1 件ずつ、要旨の下書きにする。 */
function summarizeRecordings() {
  var props = PropertiesService.getScriptProperties();
  var me = Session.getEffectiveUser().getEmail();
  var folder = meetingAudioFolder_();
  var key = props.getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('スクリプト プロパティ GEMINI_API_KEY がありません (README の「ミーティング録音」を見てください)');
  var teams = null;
  var done = 0;
  var it = folder.getFiles();
  while (it.hasNext()) {
    var file = it.next();
    var note = String(file.getDescription() || '');
    if (note.indexOf(FAILED_MARK) === 0 || note.indexOf(DONE_MARK) === 0) continue; // 失敗は、1 回だけ知らせて、そのままにする
    var name = file.getName();
    var mime = MeetingSummary.audioMime(name, file.getMimeType());
    if (!mime) continue;
    try {
      var info = MeetingSummary.parseRecordingName(name, Reminder.jstDate(file.getDateCreated().getTime()));
      if (!info) throw new Error('ファイル名からチームが分かりません。「A_2026-10-28.m4a」のように、チーム_日付 の名前にしてください');
      if (file.getSize() > MeetingSummary.MAX_BYTES) throw new Error('ファイルが大きすぎます (' + Math.round(file.getSize() / 1048576) + 'MB。上限 15MB)。10 分ほどの m4a か mp3 にしてください');
      teams = teams || listDocs_('teams');
      var team = teams.filter(function (t) { return t.id === info.teamId; })[0];
      if (!team) throw new Error('チーム ' + info.teamId + ' がありません');
      var base = 'teams/' + info.teamId;
      if (getDoc_(base + '/meetingDrafts/' + info.date) || getDoc_(base + '/meetingSummaries/' + info.date)) {
        throw new Error(info.teamId + ' チームの ' + info.date + ' の要旨は、もうあります (上書きしません。先に、アプリで削除してください)');
      }
      var names = (team.members || []).map(function (m) { return m.name; });
      var text = callGemini_(key, MeetingSummary.buildPrompt(info.teamId, info.date, names), mime, file.getBlob());
      var parsed = MeetingSummary.parseModelText(text);
      var doc = MeetingSummary.draftDoc(parsed, { date: info.date, file: name, now: Date.now() });
      writeDoc_(base + '/meetingDrafts/' + info.date, doc);
      file.setDescription(DONE_MARK + ' ' + info.teamId + ' ' + info.date);
      processedFolder_(folder).addFile(file);
      folder.removeFile(file);
      done++;
      Logger.log('要旨の下書きを作りました: ' + name + ' → ' + info.teamId + ' ' + info.date);
      try {
        MailApp.sendEmail({ to: me, subject: '[卒研PJ管理] 要旨の下書きができました (' + info.teamId + ' ' + info.date + ')', body: 'アプリの「チーム」→ ' + info.teamId + ' →「ミーティング記録」で、内容を確認して「学生に公開」を押してください。\n公開するまで、学生には見えません。', name: '卒研PJ管理(自動送信)' });
      } catch (e2) { /* メールが送れなくても、下書きはできている */ }
    } catch (e) {
      Logger.log('要旨づくりに失敗: ' + name + ' ' + e);
      file.setDescription(FAILED_MARK + ' ' + String(e).slice(0, 200));
      try {
        MailApp.sendEmail({ to: me, subject: '[卒研PJ管理] 録音の要旨づくりに失敗しました (' + name + ')', body: String(e) + '\n\nファイルは、そのまま残しています。直して、ファイルの「説明」(詳細パネル)を空にすると、もう一度試します。', name: '卒研PJ管理(自動送信)' });
      } catch (e2) { /* 実行ログだけ */ }
    }
  }
  Logger.log('要旨の下書き: ' + done + ' 件');
  return done;
}

function meetingAudioFolder_() {
  var id = PropertiesService.getScriptProperties().getProperty('MEETING_AUDIO_FOLDER_ID');
  if (!id) throw new Error('スクリプト プロパティ MEETING_AUDIO_FOLDER_ID (録音フォルダの ID) がありません');
  var folder = DriveApp.getFolderById(id);
  // 録音には、学生の声が入る。リンクを知っている人や、学校のドメインの全員 (学生を含む) に見えるフォルダは、使わない。
  var access = String(folder.getSharingAccess());
  if (access !== 'PRIVATE') {
    throw new Error('録音フォルダが、共有されています (' + access + ')。ドライブでフォルダの「一般的なアクセス」を「制限付き」に変えてください。');
  }
  return folder;
}

function processedFolder_(parent) {
  var it = parent.getFoldersByName(PROCESSED_FOLDER_NAME);
  return it.hasNext() ? it.next() : parent.createFolder(PROCESSED_FOLDER_NAME);
}

/** 音声を渡して、要旨 (JSON の文字列) を返してもらう。 */
function callGemini_(apiKey, prompt, mime, blob) {
  var props = PropertiesService.getScriptProperties();
  var model = props.getProperty('GEMINI_MODEL') || GEMINI_DEFAULT_MODEL;
  var base = props.getProperty('GEMINI_BASE') || 'https://generativelanguage.googleapis.com';
  var res = UrlFetchApp.fetch(base + '/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': apiKey },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: Utilities.base64Encode(blob.getBytes()) } }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: MeetingSummary.RESPONSE_SCHEMA },
    }),
  });
  var code = res.getResponseCode();
  if (code >= 300) throw new Error('Gemini ' + code + ': ' + res.getContentText().slice(0, 300));
  return MeetingSummary.textOf(JSON.parse(res.getContentText()));
}

/** ドキュメントを書く (なければ作る。あれば置き換える)。 */
function writeDoc_(path, obj) {
  fetchJson_(docsRoot_() + '/' + path, { method: 'patch', contentType: 'application/json', payload: JSON.stringify({ fields: MeetingSummary.encodeFields(obj) }) });
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
