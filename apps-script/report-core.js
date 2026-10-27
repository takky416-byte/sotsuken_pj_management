// 自動生成: app/src/lib/gasReportCore.ts から `npm run build:gas` で作る。直接は編集しない。
"use strict";
var ReportCore = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/lib/gasReportCore.ts
  var gasReportCore_exports = {};
  __export(gasReportCore_exports, {
    buildTeamReport: () => buildTeamReport,
    jstDate: () => jstDate,
    mdLabel: () => mdLabel,
    overlapsWeek: () => overlapsWeek
  });

  // src/lib/wbs.ts
  var isLive = (t) => !t.deleted;
  function childrenOf(tasks, parentId) {
    return tasks.filter((t) => isLive(t) && t.parentId === parentId).sort((a, b) => a.order - b.order);
  }
  function descendantsOf(tasks, id) {
    const out = [];
    const walk = (pid) => {
      for (const c of tasks.filter((t) => t.parentId === pid)) {
        out.push(c);
        walk(c.id);
      }
    };
    walk(id);
    return out;
  }
  function rollupStatus(children) {
    const active = children.filter((s) => s !== "hold");
    if (active.length === 0) return "hold";
    if (active.every((s) => s === "done")) return "done";
    if (active.every((s) => s === "todo")) return "todo";
    return "doing";
  }
  function effectiveStatuses(tasks) {
    const out = /* @__PURE__ */ new Map();
    const visit = (t) => {
      const known = out.get(t.id);
      if (known) return known;
      const kids = tasks.filter((c) => isLive(c) && c.parentId === t.id);
      const s = kids.length === 0 ? t.status : rollupStatus(kids.map(visit));
      out.set(t.id, s);
      return s;
    };
    for (const t of tasks) if (isLive(t)) visit(t);
    return out;
  }
  function periodOf(tasks, t) {
    var _a, _b;
    if (t.startDate || t.endDate) return { start: t.startDate, end: t.endDate, derived: false };
    const ds = descendantsOf(tasks.filter((x) => !x.deleted), t.id);
    const starts = ds.map((d) => {
      var _a2;
      return (_a2 = d.startDate) != null ? _a2 : d.endDate;
    }).filter((d) => !!d).sort();
    const ends = ds.map((d) => {
      var _a2;
      return (_a2 = d.endDate) != null ? _a2 : d.startDate;
    }).filter((d) => !!d).sort();
    return { start: (_a = starts[0]) != null ? _a : null, end: (_b = ends.at(-1)) != null ? _b : null, derived: starts.length > 0 };
  }

  // src/lib/adhoc.ts
  var ADHOC_ROOT_ID = "adhoc-root";

  // src/lib/dates.ts
  var JST_OFFSET_MS = 9 * 3600 * 1e3;
  function jstDate(now = /* @__PURE__ */ new Date()) {
    return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
  }
  function addDays(date, n) {
    return new Date(Date.parse(`${date}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
  }

  // src/lib/gantt.ts
  var dayNum = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / 864e5);
  var daysBetween = (a, b) => dayNum(b) - dayNum(a);

  // src/lib/template.ts
  var TEMPLATE_NODES = [
    { depth: 1, title: "\u4F01\u753B\u306E\u5177\u4F53\u5316", detail: "\u4F55\u3092\u4F5C\u308B\u304B\u3001\u8AB0\u306E\u3069\u3093\u306A\u56F0\u308A\u3054\u3068\u3092\u89E3\u6C7A\u3059\u308B\u304B\u3092\u6C7A\u3081\u308B\u3002\u76EE\u7684\u30FB\u60F3\u5B9A\u30E6\u30FC\u30B6\u30FC\u30FB\u4E3B\u306A\u6A5F\u80FD\u30FB\u4F7F\u3046\u6280\u8853\u3092\u305D\u308D\u3048\u308B\u3002" },
    { depth: 1, title: "\u8981\u4EF6\u5B9A\u7FA9", detail: "\u4F5C\u308B\u3082\u306E\u306E\u6A5F\u80FD\u3068\u3001\u5B88\u308B\u3079\u304D\u6761\u4EF6(\u6027\u80FD\u30FB\u5B89\u5168\u30FB\u8CBB\u7528\u30FB\u671F\u9650)\u3092\u6C7A\u3081\u308B\u3002" },
    { depth: 1, title: "\u5916\u90E8\u8A2D\u8A08", detail: "\u5229\u7528\u8005\u304B\u3089\u898B\u305F\u59FF(\u753B\u9762\u30FB\u64CD\u4F5C\u30FB\u52D5\u304D\u30FB\u5916\u89B3)\u3092\u8A2D\u8A08\u3059\u308B\u3002\u4E2D\u9593\u5831\u544A\u306B\u5411\u3051\u3066\u3001\u8A2D\u8A08\u66F8\u985E\u306B\u307E\u3068\u3081\u308B\u3002" },
    { depth: 1, title: "\u5185\u90E8\u8A2D\u8A08\u30FB\u5B9F\u88C5", detail: "\u4E2D\u8EAB\u306E\u4ED5\u7D44\u307F(\u30C7\u30FC\u30BF\u30FB\u51E6\u7406\u30FB\u69CB\u9020)\u3092\u8A2D\u8A08\u3057\u3066\u4F5C\u308B\u3002\u30CF\u30FC\u30C9\u30A6\u30A7\u30A2\u306E\u5834\u5408\u306F\u90E8\u54C1\u306E\u9078\u5B9A\u30FB\u767A\u6CE8\u30FB\u7D44\u307F\u7ACB\u3066\u3082\u542B\u3080\u3002" },
    { depth: 1, title: "\u52D5\u4F5C\u78BA\u8A8D\u30FB\u6539\u5584", detail: "\u4F5C\u3063\u305F\u3082\u306E\u3092\u52D5\u304B\u3057\u3066\u8A66\u3057\u3001\u4F7F\u3063\u3066\u3082\u3089\u3063\u3066\u3001\u76F4\u3059\u3002\u4F5C\u3063\u3066\u306F\u76F4\u3059\u3092\u3001\u5C0F\u3055\u304F\u7E70\u308A\u8FD4\u3059\u3002" },
    { depth: 1, title: "\u767A\u8868\u30FB\u5C55\u793A\u6E96\u5099", detail: "\u6700\u7D42\u767A\u8868\u30FB\u52D5\u753B\u30FB\u63D0\u51FA\u7269\u30FB\u5352\u5C55\u306B\u5411\u3051\u3066\u3001\u898B\u305B\u65B9\u3092\u6574\u3048\u3066\u6E96\u5099\u3059\u308B\u3002" }
  ];

  // src/lib/meetingView.ts
  var TEMPLATE_TITLES = new Set(TEMPLATE_NODES.map((n) => n.title));
  var isPlaceholder = (tasks, t) => t.depth === 1 && t.createdBy === "teacher" && TEMPLATE_TITLES.has(t.title) && t.status === "todo" && t.assignees.length === 0 && t.startDate === null && t.endDate === null && isLeaf(tasks, t);
  var isLeaf = (tasks, t) => !tasks.some((c) => !c.deleted && c.parentId === t.id);

  // src/lib/analysis.ts
  var pct = (a, b) => b === 0 ? 0 : Math.round(a / b * 100);
  var dayOf = (ms) => Number.isFinite(ms) ? jstDate(new Date(ms)) : "";
  function analyze(tasks, milestones, members, today) {
    const live = tasks.filter((t) => !t.deleted);
    const eff = effectiveStatuses(live);
    const leaves = live.filter((t) => isLeaf(live, t) && !isPlaceholder(live, t) && t.id !== ADHOC_ROOT_ID);
    const by = (s) => leaves.filter((t) => t.status === s);
    const total = leaves.length;
    const done = by("done").length;
    const doing = by("doing").length;
    const todo = by("todo").length;
    const hold = by("hold").length;
    const counted = total - hold;
    const progressPct = pct(done, counted);
    const due = leaves.filter((t) => {
      var _a, _b;
      return t.status !== "hold" && ((_a = t.endDate) != null ? _a : t.startDate) !== null && ((_b = t.endDate) != null ? _b : t.startDate) <= today;
    }).length;
    const plannedPct = pct(due, counted);
    const open = leaves.filter((t) => t.status !== "done" && t.status !== "hold");
    const overdue = open.filter((t) => t.endDate !== null && t.endDate < today).sort((a, b) => {
      var _a, _b;
      return ((_a = a.endDate) != null ? _a : "").localeCompare((_b = b.endDate) != null ? _b : "");
    });
    const undated = open.filter((t) => !t.startDate && !t.endDate).length;
    const unassigned = open.filter((t) => {
      var _a;
      return ((_a = t.assignees) != null ? _a : []).length === 0;
    }).length;
    const adhocTasks = live.filter((t) => t.source === "adhoc" && t.id !== ADHOC_ROOT_ID && isLeaf(live, t));
    const phases = childrenOf(live, null).filter((t) => !isPlaceholder(live, t) && t.id !== ADHOC_ROOT_ID).map((t) => {
      var _a;
      const sub = leaves.filter((l) => l.id === t.id || isUnder(live, l, t.id));
      const d = sub.filter((l) => l.status === "done").length;
      const p = periodOf(live, t);
      return { id: t.id, title: t.title, done: d, total: sub.length, pct: pct(d, sub.filter((l) => l.status !== "hold").length), start: p.start, end: p.end, status: (_a = eff.get(t.id)) != null ? _a : t.status };
    });
    const load = members.map((m) => {
      const mine = leaves.filter((t) => {
        var _a;
        return ((_a = t.assignees) != null ? _a : []).includes(m.sid);
      });
      return {
        sid: m.sid,
        name: m.name,
        assigned: mine.length,
        open: mine.filter((t) => t.status !== "done" && t.status !== "hold").length,
        doing: mine.filter((t) => t.status === "doing").length,
        done: mine.filter((t) => t.status === "done").length,
        overdue: mine.filter((t) => t.status !== "done" && t.status !== "hold" && t.endDate !== null && t.endDate < today).length
      };
    });
    const opens = load.map((l) => l.open);
    const skewed = members.length >= 2 && Math.max(...opens) - Math.min(...opens) >= 3 && Math.max(...opens) >= 2 * Math.max(1, Math.min(...opens));
    const next = [...milestones].filter((m) => {
      var _a;
      return ((_a = m.endDate) != null ? _a : m.date) >= today;
    }).sort((a, b) => a.date.localeCompare(b.date))[0];
    let milestone = null;
    if (next) {
      const daysLeft = Math.max(0, daysBetween(today, next.date));
      const remaining = open.filter((t) => {
        var _a, _b;
        return ((_b = (_a = t.endDate) != null ? _a : t.startDate) != null ? _b : "9999") <= next.date;
      }).length;
      const recent = leaves.filter((t) => t.status === "done" && dayOf(t.updatedAt) >= addDays(today, -14)).length;
      const weeks = Math.max(1, daysLeft) / 7;
      milestone = {
        title: next.title,
        date: next.date,
        daysLeft,
        remaining,
        needPerWeek: Math.round(remaining / weeks * 10) / 10,
        recentPerWeek: Math.round(recent / 2 * 10) / 10
      };
    }
    const findings = [];
    const gap = progressPct - plannedPct;
    if (counted > 0) {
      if (gap <= -15) findings.push({ level: "warn", text: `\u4E88\u5B9A\u3088\u308A\u9032\u307F\u304C\u9045\u308C\u3066\u3044\u307E\u3059(\u4E88\u5B9A ${plannedPct}% / \u5B9F\u7E3E ${progressPct}%)\u3002` });
      else if (gap < -5) findings.push({ level: "info", text: `\u4E88\u5B9A\u3088\u308A\u3084\u3084\u9045\u308C\u6C17\u5473\u3067\u3059(\u4E88\u5B9A ${plannedPct}% / \u5B9F\u7E3E ${progressPct}%)\u3002` });
      else findings.push({ level: "good", text: `\u307B\u307C\u4E88\u5B9A\u3069\u304A\u308A\u3067\u3059(\u4E88\u5B9A ${plannedPct}% / \u5B9F\u7E3E ${progressPct}%)\u3002` });
    }
    if (overdue.length > 0) findings.push({ level: "warn", text: `\u671F\u9650\u3092\u904E\u304E\u305F\u30BF\u30B9\u30AF\u304C${overdue.length}\u4EF6: ${overdue.slice(0, 3).map((t) => `\u300C${t.title}\u300D`).join("")}${overdue.length > 3 ? " \u307B\u304B" : ""}` });
    if (undated > 0) findings.push({ level: "info", text: `\u671F\u9593\u304C\u5165\u3063\u3066\u3044\u306A\u3044\u30BF\u30B9\u30AF\u304C${undated}\u4EF6\u3042\u308A\u307E\u3059\u3002\u4E88\u5B9A\u304C\u898B\u3048\u306A\u3044\u306E\u3067\u3001\u671F\u9593\u3092\u5165\u308C\u307E\u3057\u3087\u3046\u3002` });
    if (unassigned > 0) findings.push({ level: "info", text: `\u62C5\u5F53\u304C\u3044\u306A\u3044\u30BF\u30B9\u30AF\u304C${unassigned}\u4EF6\u3042\u308A\u307E\u3059\u3002` });
    if (skewed) {
      const hi = load.reduce((a, b) => b.open > a.open ? b : a);
      const lo = load.reduce((a, b) => b.open < a.open ? b : a);
      findings.push({ level: "warn", text: `\u62C5\u5F53\u306E\u6570\u306B\u504F\u308A\u304C\u3042\u308A\u307E\u3059(${hi.name} ${hi.open}\u4EF6 / ${lo.name} ${lo.open}\u4EF6)\u3002\u5206\u62C5\u3092\u8A71\u3057\u5408\u3044\u307E\u3057\u3087\u3046\u3002` });
    }
    if (adhocTasks.length > 0) {
      const share = pct(adhocTasks.length, total);
      findings.push({ level: share >= 20 ? "warn" : "info", text: `WBS\u306B\u306A\u3044\u4F5C\u696D\u304C${adhocTasks.length}\u4EF6\u3042\u308A\u307E\u3057\u305F(\u5168\u4F53\u306E${share}%)\u3002${share >= 20 ? "WBS\u306E\u898B\u7A4D\u3082\u308A\u304C\u8DB3\u308A\u3066\u3044\u306A\u3044\u53EF\u80FD\u6027\u304C\u3042\u308A\u307E\u3059\u3002\u8A08\u753B\u3092\u898B\u76F4\u3057\u307E\u3057\u3087\u3046\u3002" : "WBS\u306B\u53D6\u308A\u8FBC\u307E\u308C\u3066\u3044\u307E\u3059\u3002\u6B63\u3057\u3044\u5834\u6240\u306B\u6574\u7406\u3057\u307E\u3057\u3087\u3046\u3002"}` });
    }
    if (milestone && milestone.remaining > 0) {
      const tight = milestone.needPerWeek > Math.max(1, milestone.recentPerWeek) * 1.2;
      findings.push({
        level: tight ? "warn" : "info",
        text: `\u6B21\u306E\u30DE\u30A4\u30EB\u30B9\u30C8\u30FC\u30F3\u300C${milestone.title}\u300D(${milestone.date.slice(5).replace("-", "/")})\u307E\u3067${milestone.daysLeft}\u65E5\u3002\u671F\u9650\u304C\u9593\u306B\u5408\u3046\u6B8B\u308A\u306F${milestone.remaining}\u4EF6\u3067\u3001\u9031${milestone.needPerWeek}\u4EF6\u306E\u30DA\u30FC\u30B9\u304C\u5FC5\u8981\u3067\u3059(\u6700\u8FD12\u9031\u9593\u306F\u9031${milestone.recentPerWeek}\u4EF6)\u3002${tight ? " \u30DA\u30FC\u30B9\u3092\u4E0A\u3052\u308B\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059\u3002" : ""}`
      });
    }
    if (counted > 0 && doing === 0 && todo > 0) findings.push({ level: "info", text: "\u9032\u884C\u4E2D\u306E\u30BF\u30B9\u30AF\u304C\u3042\u308A\u307E\u305B\u3093\u3002\u6B21\u306B\u7740\u624B\u3059\u308B\u30BF\u30B9\u30AF\u3092\u6C7A\u3081\u307E\u3057\u3087\u3046\u3002" });
    return { total, done, doing, todo, hold, progressPct, plannedPct, gap, overdue, undated, unassigned, adhoc: { count: adhocTasks.length, sharePct: pct(adhocTasks.length, total) }, phases, members: load, skewed, milestone, findings };
  }
  function isUnder(live, t, ancestorId) {
    var _a, _b;
    let p = t.parentId;
    for (let i = 0; i < 4 && p; i++) {
      if (p === ancestorId) return true;
      p = (_b = (_a = live.find((x) => x.id === p)) == null ? void 0 : _a.parentId) != null ? _b : null;
    }
    return false;
  }

  // src/lib/companyReport.ts
  var RECENT_DAYS = 14;
  var UPCOMING_DAYS = 28;
  var MAX_LIST = 10;
  var REPORT_TITLE = "\u5352\u696D\u7814\u7A76\u5236\u4F5C \u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u9032\u6357\u5831\u544A\u66F8";
  function buildCompanyReport(team, tasks, milestones, notes, today = jstDate()) {
    const live = tasks.filter((t) => !t.deleted);
    const a = analyze(tasks, milestones, team.members, today);
    const byId = new Map(live.map((t) => [t.id, t]));
    const phaseOf = (t) => {
      var _a;
      let cur = t;
      for (let i = 0; i < 4 && (cur == null ? void 0 : cur.parentId); i++) cur = byId.get(cur.parentId);
      return (_a = cur == null ? void 0 : cur.title) != null ? _a : "";
    };
    const leaves = live.filter((t) => isLeaf(live, t) && !isPlaceholder(live, t) && t.id !== ADHOC_ROOT_ID);
    const open = leaves.filter((t) => t.status !== "done" && t.status !== "hold");
    const dayOf2 = (ms) => Number.isFinite(ms) ? jstDate(new Date(ms)) : "";
    const judgement = a.total - a.hold <= 0 ? "\u96C6\u8A08\u4E2D" : a.gap <= -15 ? "\u9045\u308C" : a.gap < -5 ? "\u3084\u3084\u9045\u308C" : "\u9806\u8ABF";
    const recent = leaves.filter((t) => t.status === "done" && dayOf2(t.updatedAt) >= addDays(today, -RECENT_DAYS)).sort((x, y) => y.updatedAt - x.updatedAt).slice(0, MAX_LIST).map((t) => ({ title: t.title, phase: phaseOf(t) }));
    const horizon = addDays(today, UPCOMING_DAYS);
    const upcoming = open.filter((t) => {
      var _a, _b, _c;
      return ((_a = t.startDate) != null ? _a : t.endDate) !== null && ((_b = t.startDate) != null ? _b : t.endDate) <= horizon && ((_c = t.endDate) != null ? _c : t.startDate) >= today;
    }).sort((x, y) => {
      var _a, _b, _c, _d;
      return ((_b = (_a = x.endDate) != null ? _a : x.startDate) != null ? _b : "").localeCompare((_d = (_c = y.endDate) != null ? _c : y.startDate) != null ? _d : "");
    }).slice(0, MAX_LIST).map((t) => ({ title: t.title, phase: phaseOf(t), start: t.startDate, end: t.endDate }));
    const overdue = a.overdue.slice(0, MAX_LIST).map((t) => ({ title: t.title, phase: phaseOf(t), end: t.endDate }));
    const phaseState = (done, total, doing) => total > 0 && done === total ? "\u5B8C\u4E86" : done > 0 || doing ? "\u9032\u884C\u4E2D" : "\u672A\u7740\u624B";
    const phases = a.phases.map((p) => ({
      title: p.title,
      start: p.start,
      end: p.end,
      done: p.done,
      total: p.total,
      pct: p.pct,
      state: phaseState(p.done, p.total, p.status === "doing")
    }));
    const text = (s) => (s != null ? s : "").trim();
    const dateOf = (n, k) => {
      var _a;
      const ms = (_a = n == null ? void 0 : n[`${k}At`]) != null ? _a : n == null ? void 0 : n.at;
      return text(n == null ? void 0 : n[k]) && ms !== void 0 && Number.isFinite(ms) ? jstDate(new Date(ms)) : "";
    };
    const missing = ["summary", "issues"].filter((k) => !text(notes == null ? void 0 : notes[k]));
    return {
      title: REPORT_TITLE,
      teamId: team.id,
      projectName: team.projectName,
      members: team.members.map((m) => m.name),
      today,
      from: team.kickoffAt ? jstDate(new Date(team.kickoffAt)) : null,
      summary: text(notes == null ? void 0 : notes.summary),
      summaryDate: dateOf(notes, "summary"),
      issuesDate: dateOf(notes, "issues") || dateOf(notes, "next"),
      judgement,
      plannedPct: a.plannedPct,
      actualPct: a.progressPct,
      counts: { total: a.total, done: a.done, doing: a.doing, todo: a.todo, hold: a.hold },
      phases,
      recent,
      overdue,
      issuesText: [text(notes == null ? void 0 : notes.issues), text(notes == null ? void 0 : notes.next)].filter(Boolean).join("\n"),
      upcoming,
      missing
    };
  }

  // src/types.ts
  var STATUS_LABEL = {
    todo: "\u672A\u7740\u624B",
    doing: "\u9032\u884C\u4E2D",
    done: "\u5B8C\u4E86",
    hold: "\u4FDD\u7559"
  };

  // src/lib/report.ts
  function wbsRows(tasks, nameOf) {
    const live = tasks.filter((t) => !t.deleted);
    const eff = effectiveStatuses(live);
    const out = [];
    const leavesOf = (id) => {
      const kids = childrenOf(live, id);
      return kids.length === 0 ? [live.find((t) => t.id === id)] : kids.flatMap((k) => leavesOf(k.id));
    };
    const walk = (parentId, prefix) => {
      childrenOf(live, parentId).forEach((t, i) => {
        var _a, _b, _c;
        const no = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
        const kids = childrenOf(live, t.id);
        const p = periodOf(live, t);
        const leaves = kids.length === 0 ? [t] : leavesOf(t.id);
        const active = leaves.filter((l) => l.status !== "hold");
        const status = (_a = eff.get(t.id)) != null ? _a : t.status;
        out.push({
          id: t.id,
          no,
          depth: t.depth,
          title: t.title,
          assignees: kids.length === 0 ? ((_b = t.assignees) != null ? _b : []).map(nameOf).join("\u30FB") : "",
          status,
          statusLabel: STATUS_LABEL[status],
          start: p.start,
          end: p.end,
          derived: p.derived,
          progress: active.length === 0 ? 0 : Math.round(active.filter((l) => l.status === "done").length / active.length * 100),
          detail: (_c = t.detail) != null ? _c : "",
          leaf: kids.length === 0
        });
        walk(t.id, no);
      });
    };
    walk(null, "");
    return out;
  }
  function weekColumns(rows, milestones, today) {
    const dates = [today, ...rows.flatMap((r) => [r.start, r.end]), ...milestones.map((m) => m.date)].filter((d) => !!d).sort();
    if (dates.length === 0) return [];
    const mondayOf = (d) => addDays(d, -(((/* @__PURE__ */ new Date(`${d}T00:00:00Z`)).getUTCDay() + 6) % 7));
    const out = [];
    for (let d = mondayOf(dates[0]); d <= dates[dates.length - 1]; d = addDays(d, 7)) out.push(d);
    return out;
  }
  var overlapsWeek = (start, end, w) => !!start && !!end && start <= addDays(w, 6) && end >= w;
  var mdLabel = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

  // src/lib/gasReportCore.ts
  function buildTeamReport(team, tasks, milestones, today = jstDate()) {
    var _a;
    const nameOf = (sid) => {
      var _a2, _b;
      return (_b = (_a2 = team.members.find((m) => m.sid === sid)) == null ? void 0 : _a2.name) != null ? _b : sid;
    };
    const company = buildCompanyReport(team, tasks, milestones, (_a = team.reportNotes) != null ? _a : null, today);
    const rows = wbsRows(tasks, nameOf);
    const weeks = weekColumns(rows, [], today);
    return { company, rows, weeks, analysis: analyze(tasks, milestones, team.members, today) };
  }
  return __toCommonJS(gasReportCore_exports);
})();
