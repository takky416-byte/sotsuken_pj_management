/**
 * ミーティング録音 → 要旨の下書き (純粋な関数だけ。Apps Script にも Node にも依存しない)。
 * Node のテストでは、require して使う。Apps Script では、グローバルの MeetingSummary として使う。
 */
var MeetingSummary = (function () {
  var MAX_BYTES = 15 * 1024 * 1024; // Gemini の1回のリクエストは 20MB まで。base64 にすると約 1.33 倍になる
  var LIMITS = { summary: 1200, item: 200, items: 12 };
  var AUDIO_EXT = { m4a: 'audio/mp4', mp4: 'audio/mp4', mp3: 'audio/mp3', wav: 'audio/wav', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac', aiff: 'audio/aiff' };

  /**
   * ファイル名 (例: A_2026-10-28.m4a / A 2026-10-28 録音.mp3 / B_20261028.wav) から、チームと日付を取り出す。
   * 日付がなければ、fallbackDate (ファイルを作った日) を使う。チームが分からなければ null。
   */
  function parseRecordingName(name, fallbackDate) {
    var m = /^\s*([A-Ha-h])(?:[\s_\-]+(\d{4})[-_]?(\d{2})[-_]?(\d{2}))?(?![A-Za-z0-9])/.exec(String(name || ''));
    if (!m) return null;
    var date = m[2] ? m[2] + '-' + m[3] + '-' + m[4] : fallbackDate;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date + 'T00:00:00Z'))) return null;
    return { teamId: m[1].toUpperCase(), date: date };
  }

  /** 音声として扱えるか。使う mimeType (Gemini に渡す形) を返す。扱えなければ null。 */
  function audioMime(fileName, mimeType) {
    var ext = (/\.([A-Za-z0-9]+)$/.exec(String(fileName || '')) || [])[1];
    ext = ext ? ext.toLowerCase() : '';
    if (AUDIO_EXT[ext]) return AUDIO_EXT[ext];
    var t = String(mimeType || '').toLowerCase();
    if (t === 'audio/x-m4a' || t === 'audio/m4a') return 'audio/mp4';
    if (t === 'audio/mpeg') return 'audio/mp3';
    if (t === 'audio/x-wav' || t === 'audio/wave') return 'audio/wav';
    return t.indexOf('audio/') === 0 ? t : null;
  }

  function buildPrompt(teamId, date, memberNames) {
    return [
      'これは、大学・専門学校の卒業研究の「進捗確認ミーティング」(1チーム約10分)の録音です。',
      'チーム: ' + teamId + ' / 日付: ' + date + (memberNames && memberNames.length ? ' / メンバー(苗字): ' + memberNames.join('、') : ''),
      '',
      '録音の内容から、チームの学生が読み返せる「要旨」を、日本語で作ってください。',
      '- 録音で実際に話されたことだけを書く。話されていないこと・推測は書かない。',
      '- 人を評価したり、責めたり、成績に触れたりする書き方をしない。事実と、決まったことを、落ち着いた言い方で。',
      '- 個人的な事情(健康・家庭など)や、雑談は入れない。',
      '- 聞き取れなかった所、誰の発言か分からない所、自信がない所は、要旨に入れず、unclear に書く。',
      '- summary: 全体の要旨を、3〜5文 (400字以内)。',
      '- decided: 決まったこと。短い文で、最大8項目。',
      '- actions: 次の1週間でやること。担当が分かるときは、先頭に「苗字: 」を付ける。最大8項目。',
      '- concerns: 詰まっていること・気になること。最大5項目。なければ空の配列。',
      '- unclear: 聞き取れなかった・自信がなかった点。最大5項目。なければ空の配列。',
    ].join('\n');
  }

  /** Gemini に渡す、出力の形 (JSON スキーマ) */
  var RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
      summary: { type: 'STRING' },
      decided: { type: 'ARRAY', items: { type: 'STRING' } },
      actions: { type: 'ARRAY', items: { type: 'STRING' } },
      concerns: { type: 'ARRAY', items: { type: 'STRING' } },
      unclear: { type: 'ARRAY', items: { type: 'STRING' } },
    },
    required: ['summary', 'decided', 'actions', 'concerns', 'unclear'],
  };

  function clipList(v) {
    if (!Array.isArray(v)) return [];
    return v.map(function (x) { return String(x == null ? '' : x).trim(); }).filter(Boolean).slice(0, LIMITS.items).map(function (x) { return x.slice(0, LIMITS.item); });
  }

  /** モデルの返事 (JSON の文字列) を、下書きの項目にする。形が違えば、例外。 */
  function parseModelText(text) {
    var t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    var j;
    try { j = JSON.parse(t); } catch (e) { throw new Error('AIの返事を読み取れませんでした'); }
    if (!j || typeof j.summary !== 'string' || !j.summary.trim()) throw new Error('AIの返事に、要旨がありませんでした');
    return {
      summary: j.summary.trim().slice(0, LIMITS.summary),
      decided: clipList(j.decided), actions: clipList(j.actions), concerns: clipList(j.concerns), unclear: clipList(j.unclear),
    };
  }

  /** Gemini の返事 (generateContent の JSON) から、本文を取り出す。 */
  function textOf(response) {
    var c = response && response.candidates && response.candidates[0];
    var parts = c && c.content && c.content.parts;
    if (!parts || !parts.length) {
      var why = (response && response.promptFeedback && response.promptFeedback.blockReason) || (c && c.finishReason) || '空の返事';
      throw new Error('AIから要旨が返りませんでした (' + why + ')');
    }
    return parts.map(function (p) { return p.text || ''; }).join('');
  }

  /** 下書きのドキュメント (アプリの MeetingDraft と同じ形)。 */
  function draftDoc(parsed, meta) {
    return {
      date: meta.date, summary: parsed.summary, decided: parsed.decided, actions: parsed.actions, concerns: parsed.concerns,
      unclear: parsed.unclear, source: 'recording', file: String(meta.file || '').slice(0, 200),
      createdAt: meta.now, updatedAt: meta.now,
    };
  }

  // ---- Firestore REST の書き込み用の値 ----
  function encodeValue(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (typeof v === 'string') return { stringValue: v };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Math.floor(v) === v ? { integerValue: String(v) } : { doubleValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
    return { mapValue: { fields: encodeFields(v) } };
  }
  function encodeFields(o) {
    var out = {};
    Object.keys(o).forEach(function (k) { out[k] = encodeValue(o[k]); });
    return out;
  }

  return {
    MAX_BYTES: MAX_BYTES, LIMITS: LIMITS, RESPONSE_SCHEMA: RESPONSE_SCHEMA,
    parseRecordingName: parseRecordingName, audioMime: audioMime, buildPrompt: buildPrompt,
    parseModelText: parseModelText, textOf: textOf, draftDoc: draftDoc, encodeValue: encodeValue, encodeFields: encodeFields,
  };
})();

if (typeof module !== 'undefined') module.exports = MeetingSummary;
