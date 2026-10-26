/**
 * 毎日の進捗報告 (Excel・PDF) を、Google ドライブに保存する (Apps Script)。バックアップとは別のフォルダ。
 * 報告書の中身 (判定・工程ごとの進捗・遅れ・今後の予定・WBS・ガントチャート) は、アプリの「PJ分析」と同じロジック
 * (report-core.js。app/src/lib/companyReport.ts から `npm run build:gas` で作る)。見た目は、Google スプレッドシートで組んで、
 * xlsx と PDF に書き出す (アプリがブラウザで作る Excel と、列や色は同じだが、細部は少し違う)。
 *
 * スクリプトのプロパティ (すべて任意):
 *   PROGRESS_FOLDER_ID          保存先のフォルダの ID。空なら「卒研PJ 進捗報告(日次)」を自動で作る
 *   PROGRESS_KEEP               日付ごとのフォルダを残す日数 (既定 60)
 *   PROGRESS_SHOW_ASSIGNEES     'false' にすると、WBS・ガントチャートに担当者名を載せない (既定は載せる)
 *   PROGRESS_FOLDER_ID_AUTO     自動で作ったフォルダの ID (自動)
 *   LAST_PROGRESS               最後に保存した日 (自動)
 */

var PROGRESS_FOLDER_NAME = '卒研PJ 進捗報告(日次)';
var PROGRESS_STATUS_FILL = { todo: '#9aa0b5', doing: '#6c4cff', done: '#22b573', hold: '#d9dce8' };
var PROGRESS_HEAD = '#3b2e7e';

/** 初回の設定: 毎日 21 時ごろに exportProgressDaily を動かすトリガーを作る。何度実行しても重複しない。いま 1 回、実行する。 */
function setupProgressExport() {
  deleteProgressTriggers_();
  ScriptApp.newTrigger('exportProgressDaily').timeBased().inTimezone('Asia/Tokyo').atHour(21).nearMinute(0).everyDays(1).create();
  Logger.log('進捗報告のトリガーを作りました (毎日 21 時ごろ)。いま 1 回、実行します。');
  return exportProgressDaily();
}

/** 毎日の進捗報告を止める (トリガーを削除する。保存済みのファイルは、そのまま残る) */
function stopProgressExport() {
  deleteProgressTriggers_();
  Logger.log('進捗報告のトリガーを削除しました。');
}

function deleteProgressTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'exportProgressDaily') ScriptApp.deleteTrigger(t);
  });
}

/** キックオフ済み (active) の全チームの進捗報告を、Excel と PDF にして、ドライブに保存する。 */
function exportProgressDaily() {
  var props = PropertiesService.getScriptProperties();
  var me = Session.getEffectiveUser().getEmail();
  var failed = [];
  try {
    var today = Reminder.jstDate(Date.now());
    var teams = listDocs_('teams').filter(function (t) { return t.status === 'active'; })
      .sort(function (a, b) { return a.id < b.id ? -1 : 1; });
    if (teams.length === 0) { Logger.log('キックオフ済みのチームがありません。保存しません。'); return { teams: 0 }; }
    var milestones = listDocs_('milestones');
    var root = progressFolder_();
    var day = subFolder_(root, today);
    var latest = subFolder_(root, '最新');
    var showAssignees = props.getProperty('PROGRESS_SHOW_ASSIGNEES') !== 'false';
    var saved = [];

    teams.forEach(function (team) {
      var tempId = null;
      try {
        var tasks = listDocs_('teams/' + team.id + '/tasks');
        var data = ReportCore.buildTeamReport(team, tasks, milestones, today);
        var ss = SpreadsheetApp.create('進捗報告 ' + team.id + ' ' + today);
        tempId = ss.getId();
        writeReportSheets_(ss, data, showAssignees);
        SpreadsheetApp.flush();
        var base = team.id + 'チーム_進捗報告_' + today;
        var xlsx = exportBlob_(tempId, 'xlsx');
        var pdf = exportBlob_(tempId, 'pdf');
        [day, latest].forEach(function (folder) {
          var tag = folder === latest ? team.id + 'チーム_進捗報告(最新)' : base;
          saveFile_(folder, tag + '.xlsx', xlsx);
          saveFile_(folder, tag + '.pdf', pdf);
        });
        saved.push(team.id);
      } catch (e) {
        failed.push(team.id + ': ' + e);
        Logger.log('進捗報告に失敗 (' + team.id + '): ' + e);
      } finally {
        if (tempId) { try { DriveApp.getFileById(tempId).setTrashed(true); } catch (e2) { /* 作業用のファイルを消せなくても続ける */ } }
      }
    });

    var removed = pruneProgressFolders_(root, Number(props.getProperty('PROGRESS_KEEP')) || 60);
    if (saved.length > 0) props.setProperty('LAST_PROGRESS', today);
    Logger.log('進捗報告を保存しました: ' + today + ' / ' + saved.join('・') + (failed.length ? ' / 失敗 ' + failed.length + '件' : '')
      + '。古い日付のフォルダを ' + removed + ' 件、ごみ箱に移しました。保存先: ' + root.getUrl());
    if (failed.length > 0) throw new Error(failed.join('\n'));
    return { teams: saved.length, folder: root.getUrl() };
  } catch (e) {
    try {
      MailApp.sendEmail({
        to: me, subject: '[卒研PJ管理] 毎日の進捗報告の保存に失敗しました',
        body: String(e) + '\n\nApps Script の「実行数」でログを確認してください。', name: '卒研PJ管理(自動送信)',
      });
    } catch (e2) { /* メールも送れないときは、実行ログだけ */ }
    throw e;
  }
}

// ---- 保存先 ----
function progressFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('PROGRESS_FOLDER_ID') || props.getProperty('PROGRESS_FOLDER_ID_AUTO');
  if (id) return DriveApp.getFolderById(id);
  var folder = DriveApp.createFolder(PROGRESS_FOLDER_NAME);
  props.setProperty('PROGRESS_FOLDER_ID_AUTO', folder.getId());
  Logger.log('保存先のフォルダを作りました: ' + folder.getUrl() + ' (共有は「制限付き」のままにしてください。学生の名前が入ります)');
  return folder;
}

function subFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/** 同じ名前のファイルがあれば、ごみ箱に移して、置き換える */
function saveFile_(folder, name, blob) {
  var it = folder.getFilesByName(name);
  while (it.hasNext()) it.next().setTrashed(true);
  folder.createFile(blob.copyBlob().setName(name));
}

/** 日付の名前 (YYYY-MM-DD) のフォルダを、新しいものから keep 件残し、古いものをごみ箱へ。返り値は、ごみ箱に移した数。 */
function pruneProgressFolders_(root, keep) {
  var days = [];
  var it = root.getFolders();
  while (it.hasNext()) { var f = it.next(); if (/^\d{4}-\d{2}-\d{2}$/.test(f.getName())) days.push(f); }
  days.sort(function (a, b) { return a.getName() < b.getName() ? 1 : -1; });
  days.slice(keep).forEach(function (f) { f.setTrashed(true); });
  return Math.max(0, days.length - keep);
}

/** スプレッドシートを、xlsx または PDF (A4 横・幅に合わせる) として取り出す */
function exportBlob_(id, format) {
  var url = 'https://docs.google.com/spreadsheets/d/' + id + '/export?format=' + format;
  if (format === 'pdf') url += '&size=A4&portrait=false&fitw=true&gridlines=false&sheetnames=false&printtitle=false&pagenum=CENTER';
  var res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (res.getResponseCode() >= 300) throw new Error('書き出し (' + format + ') に失敗: ' + res.getResponseCode());
  return res.getBlob();
}

// ---- シートを組む (アプリの reportExcel.ts と、同じ構成: 報告書 / WBS / ガントチャート) ----
function writeReportSheets_(ss, data, showAssignees) {
  var s1 = ss.getSheets()[0].setName('報告書');
  var s2 = ss.insertSheet('WBS');
  var s3 = ss.insertSheet('ガントチャート');
  writeReportSheet_(s1, data.company);
  writeWbsSheet_(s2, data.rows, showAssignees);
  writeGanttSheet_(s3, data.rows, data.weeks, data.company.today, showAssignees);
}

function range_(st, en) {
  if (st) return ReportCore.mdLabel(st) + (en && en !== st ? '〜' + ReportCore.mdLabel(en) : '');
  return en ? ReportCore.mdLabel(en) : '';
}

function writeReportSheet_(sh, c) {
  var COLS = 6;
  var rows = [];
  var marks = []; // { row, kind }
  var add = function (cells, kind) {
    var r = cells.slice(); while (r.length < COLS) r.push('');
    rows.push(r);
    if (kind) marks.push({ row: rows.length, kind: kind });
  };
  var para = function (text, date) { add([date ? text + '\n(記入日: ' + date.replace(/-/g, '/') + ')' : text], 'para'); };
  var title = function (t) { add([]); add([t], 'title'); };

  add([c.title], 'big');
  add(['チーム', c.teamId + 'チーム']);
  add(['企画名', c.projectName]);
  add(['報告日', c.today]);
  add(['報告期間', c.from ? c.from + ' 〜 ' + c.today : c.today]);
  add(['メンバー', c.members.join('・')]);
  title('1. プロジェクトの概要');
  para(c.summary || '(概要・目的を記入してください)', c.summary ? c.summaryDate : '');
  title('2. 進捗状況');
  add(['総合', c.judgement]);
  add(['計画に対する進捗', '計画 ' + c.plannedPct + '% / 実績 ' + c.actualPct + '%']);
  add(['タスク', '全' + c.counts.total + '件(完了 ' + c.counts.done + ' / 進行中 ' + c.counts.doing + ' / 未着手 ' + c.counts.todo + (c.counts.hold > 0 ? ' / 保留 ' + c.counts.hold : '') + ')']);
  add([]);
  add(['工程', '期間', '完了', '全体', '進捗', '状況'], 'head');
  c.phases.forEach(function (p) { add([p.title, range_(p.start, p.end), p.done, p.total, p.pct + '%', p.state]); });
  title('3. ガントチャート / 4. WBS');
  add(['シート「ガントチャート」と、シート「WBS」を参照してください。']);
  title('5. 直近の実績(過去2週間に完了したタスク)');
  if (c.recent.length === 0) add(['(特記事項なし)']);
  c.recent.forEach(function (t) { add([t.title, t.phase]); });
  title('6. 課題と今後の予定');
  if (c.overdue.length > 0) {
    add(['計画より遅れているタスク'], 'bold');
    c.overdue.forEach(function (t) { add([t.title, t.phase, '予定 ' + ReportCore.mdLabel(t.end)]); });
  }
  if (c.upcoming.length > 0) {
    add(['今後4週間の予定'], 'bold');
    add(['タスク', '工程', '期間'], 'head');
    c.upcoming.forEach(function (t) { add([t.title, t.phase, range_(t.start, t.end)]); });
  }
  if (c.issuesText) para(c.issuesText, c.issuesDate);
  else if (c.overdue.length === 0 && c.upcoming.length === 0) add(['(特記事項なし)']);
  else add(['(課題への対応と今後の方針を記入してください)']);

  sh.getRange(1, 1, rows.length, COLS).setValues(rows).setVerticalAlignment('top');
  [210, 170, 110, 100, 100, 210].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  marks.forEach(function (m) {
    var line = sh.getRange(m.row, 1, 1, COLS);
    if (m.kind === 'big') line.setFontSize(16).setFontWeight('bold');
    else if (m.kind === 'bold') line.setFontWeight('bold');
    else if (m.kind === 'title') { line.setFontWeight('bold').setFontSize(12).setBorder(null, null, true, null, null, null, PROGRESS_HEAD, SpreadsheetApp.BorderStyle.SOLID_MEDIUM); }
    else if (m.kind === 'head') line.setFontWeight('bold').setFontColor('#ffffff').setBackground(PROGRESS_HEAD).setHorizontalAlignment('center');
    else if (m.kind === 'para') { line.merge().setWrap(true); sh.setRowHeight(m.row, Math.max(20, Math.ceil(String(rows[m.row - 1][0]).length / 40) * 18 + 6)); }
  });
}

function writeWbsSheet_(sh, wbs, showAssignees) {
  var head = ['番号', 'タスク'].concat(showAssignees ? ['担当'] : []).concat(['状態', '開始', '終了', '進捗']);
  var grid = [head];
  wbs.forEach(function (r) {
    grid.push([r.no, new Array((r.depth - 1) * 2 + 1).join('　') + r.title].concat(showAssignees ? [r.assignees] : [])
      .concat([r.statusLabel, r.start ? ReportCore.mdLabel(r.start) : '', r.end ? ReportCore.mdLabel(r.end) : '', r.progress / 100]));
  });
  var n = head.length;
  sh.getRange(1, 1, grid.length, n).setValues(grid);
  var widths = [60, 320].concat(showAssignees ? [130] : []).concat([75, 65, 65, 65]);
  widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.getRange(1, 1, 1, n).setFontWeight('bold').setFontColor('#ffffff').setBackground(PROGRESS_HEAD).setHorizontalAlignment('center');
  sh.setFrozenRows(1);
  if (wbs.length === 0) return;
  var stCol = showAssignees ? 4 : 3;
  sh.getRange(2, n, wbs.length, 1).setNumberFormat('0%');
  var fills = wbs.map(function (r) { return [PROGRESS_STATUS_FILL[r.status]]; });
  var fonts = wbs.map(function (r) { return [r.status === 'hold' ? '#2b2340' : '#ffffff']; });
  sh.getRange(2, stCol, wbs.length, 1).setBackgrounds(fills).setFontColors(fonts).setFontWeight('bold').setHorizontalAlignment('center');
  wbs.forEach(function (r, i) { if (!r.leaf && r.depth === 1) sh.getRange(i + 2, 1, 1, n).setFontWeight('bold'); });
}

function writeGanttSheet_(sh, wbs, weeks, today, showAssignees) {
  var W = weeks.length;
  var line1 = ['番号', 'タスク', showAssignees ? '担当' : ''];
  var line2 = ['', '', ''];
  weeks.forEach(function (w) { line1.push(Number(w.slice(5, 7)) + '月'); line2.push(Number(w.slice(8, 10))); });
  var grid = [line1, line2];
  var fills = [];
  var emptyFill = function () { var a = []; for (var i = 0; i < W; i++) a.push(null); return a; };
  wbs.forEach(function (r) {
    grid.push([r.no, new Array((r.depth - 1) * 2 + 1).join('　') + r.title, showAssignees ? r.assignees : ''].concat(new Array(W).fill('')));
    var f = emptyFill();
    weeks.forEach(function (w, i) { if (ReportCore.overlapsWeek(r.start, r.end, w)) f[i] = r.derived ? '#c9c2f5' : PROGRESS_STATUS_FILL[r.status]; });
    fills.push(f);
  });
  var legend = [['', '凡例', ''], ['', '未着手', ''], ['', '進行中', ''], ['', '完了', ''], ['', '保留', ''], ['', '赤い見出し=今日の週 / 薄い紫=中のタスクから求めた期間', '']];
  var all = grid.concat(legend.map(function (l) { return l.concat(new Array(W).fill('')); }));
  sh.getRange(1, 1, all.length, 3 + W).setValues(all);
  sh.setColumnWidth(1, 50); sh.setColumnWidth(2, 260); sh.setColumnWidth(3, 100);
  for (var i = 0; i < W; i++) sh.setColumnWidth(4 + i, 28);
  sh.getRange(1, 1, 2, 3 + W).setFontWeight('bold').setFontColor('#ffffff').setBackground(PROGRESS_HEAD).setHorizontalAlignment('center');
  sh.setFrozenRows(2); sh.setFrozenColumns(3);
  var todayIdx = -1;
  weeks.forEach(function (w, i) {
    var end = new Date(Date.parse(w + 'T00:00:00Z') + 6 * 86400000).toISOString().slice(0, 10);
    if (w <= today && today <= end) todayIdx = i;
  });
  if (todayIdx >= 0) sh.getRange(2, 4 + todayIdx).setBackground('#e5484d');
  if (wbs.length > 0 && W > 0) sh.getRange(3, 4, wbs.length, W).setBackgrounds(fills);
  wbs.forEach(function (r, i) { if (!r.leaf && r.depth === 1) sh.getRange(i + 3, 1, 1, 3).setFontWeight('bold'); });
  var base = 3 + wbs.length;
  sh.getRange(base + 1, 2).setFontWeight('bold');
  ['todo', 'doing', 'done', 'hold'].forEach(function (st, i) { sh.getRange(base + 2 + i, 3).setBackground(PROGRESS_STATUS_FILL[st]); });
}
