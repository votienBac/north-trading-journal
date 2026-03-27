// ═══════════════════════════════════════════════════════
//  TRADING JOURNAL — Google Apps Script Backend
//  v2 — fixed ContentService, CORS, doPost parsing
// ═══════════════════════════════════════════════════════

const SHEET_NAME = "trades";
const ACCOUNTS_SHEET  = "accounts";
const ROUNDS_SHEET    = "rounds";
const ANALYSIS_SHEET  = "market_analysis";
const BLOG_SHEET      = "blog";

const ACCOUNTS_HEADERS = ["id", "name", "firm", "balance", "color", "createdAt"];
const ROUNDS_HEADERS   = ["id", "accountId", "name", "phase", "startDate",
                           "initialBalance", "targetPct", "maxDD", "status", "review", "createdAt"];
const ANALYSIS_HEADERS = ["id", "date", "asset", "timeframes", "overallNotes", "createdAt"];
const BLOG_HEADERS     = ["id", "date", "title", "tags", "content", "createdAt"];

const HEADERS = [
  "id", "date", "pair", "strategy", "tf", "session", "direction",
  "entry", "sl", "tp", "exitPrice", "lot", "risk",
  "rrPlan", "rrActual", "result", "pnl", "score",
  "conditions", "errors", "reason", "lesson", "updatedAt",
  "accountId", "roundId", "emotionNotes"
];

// ── JSON output ──────────────────────────────────────────
// Apps Script Web App tự xử lý CORS khi deploy "Anyone"
// KHÔNG dùng .setHeader() — ContentService không có method đó
function jsonOut(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Get or create sheet ──────────────────────────────────
function getSheet()         { return _getOrCreate(SHEET_NAME,     HEADERS);          }
function getAccountsSheet() { return _getOrCreate(ACCOUNTS_SHEET, ACCOUNTS_HEADERS); }
function getRoundsSheet()   { return _getOrCreate(ROUNDS_SHEET,   ROUNDS_HEADERS);   }
function getAnalysisSheet() { return _getOrCreate(ANALYSIS_SHEET, ANALYSIS_HEADERS); }
function getBlogSheet()     { return _getOrCreate(BLOG_SHEET,     BLOG_HEADERS);     }

function _getOrCreate(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let ws = ss.getSheetByName(name);
  if (!ws) {
    ws = ss.insertSheet(name);
    ws.appendRow(headers);
    const h = ws.getRange(1, 1, 1, headers.length);
    h.setFontWeight("bold");
    h.setBackground("#1a1a2e");
    h.setFontColor("#a594ff");
    ws.setFrozenRows(1);
  }
  return ws;
}

// ── Read all trades ──────────────────────────────────────
function getAllTrades() {
  const ws = getSheet();
  const lastRow = ws.getLastRow();
  if (lastRow <= 1) return [];

  const data = ws.getRange(1, 1, lastRow, HEADERS.length).getValues();

  return data.slice(1)
    .filter(row => row[0] !== "" && row[0] !== null)
    .map(row => {
      const obj = {};
      HEADERS.forEach((h, i) => {
        let v = row[i];

        if (v instanceof Date) {
          // Preserve time component if non-zero (datetime-local fields)
          if (v.getUTCHours() || v.getUTCMinutes() || v.getUTCSeconds()) {
            v = Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
          } else {
            v = Utilities.formatDate(v, "UTC", "yyyy-MM-dd");
          }
        }

        if ((h === "conditions" || h === "errors" || h === "emotionNotes") && typeof v === "string" && v !== "") {
          if (v.startsWith("[")) {
            try { v = JSON.parse(v); }
            catch(e) { v = v.split(";").map(x => x.trim()).filter(Boolean); }
          } else {
            v = v.split(";").map(x => x.trim()).filter(Boolean);
          }
        }

        const numFields = ["entry","sl","tp","exitPrice","lot","risk","rrPlan","rrActual","pnl","score"];
        if (numFields.includes(h)) {
          v = (v === "" || v === null) ? null : Number(v);
        }

        obj[h] = v;
      });
      return obj;
    });
}

// ── Find row by id ───────────────────────────────────────
function findRowById(ws, id) {
  const lastRow = ws.getLastRow();
  if (lastRow < 2) return -1;
  const ids = ws.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  const idx = ids.findIndex(v => String(v) === String(id));
  return idx >= 0 ? idx + 2 : -1;
}

// ── Trade object → row array ─────────────────────────────
function tradeToRow(t) {
  return HEADERS.map(h => {
    let v = t[h] ?? "";
    if (Array.isArray(v)) v = JSON.stringify(v);
    return v;
  });
}

// ── Accounts ─────────────────────────────────────────────
function getAllAccounts() {
  const ws = getAccountsSheet();
  const lastRow = ws.getLastRow();
  if (lastRow <= 1) return [];
  const data = ws.getRange(1, 1, lastRow, ACCOUNTS_HEADERS.length).getValues();
  const headers = data[0];
  return data.slice(1)
    .filter(row => row[0] !== "" && row[0] !== null)
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        let v = row[i];
        if (v instanceof Date) v = Utilities.formatDate(v, "UTC", "yyyy-MM-dd");
        if (h === "balance") v = (v === "" || v === null) ? 0 : Number(v);
        obj[h] = v;
      });
      return obj;
    });
}

function accountToRow(a) {
  return ACCOUNTS_HEADERS.map(h => a[h] ?? "");
}

// ── Rounds ───────────────────────────────────────────────
function getAllRounds() {
  const ws = getRoundsSheet();
  const lastRow = ws.getLastRow();
  if (lastRow <= 1) return [];
  const data = ws.getRange(1, 1, lastRow, ROUNDS_HEADERS.length).getValues();
  const headers = data[0];
  return data.slice(1)
    .filter(row => row[0] !== "" && row[0] !== null)
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        let v = row[i];
        if (v instanceof Date) v = Utilities.formatDate(v, "UTC", "yyyy-MM-dd");
        if (["initialBalance","targetPct","maxDD"].includes(h)) v = (v === "" || v === null) ? 0 : Number(v);
        if (h === "review" && typeof v === "string" && v.startsWith("{")) {
          try { v = JSON.parse(v); } catch(e) {}
        }
        obj[h] = v;
      });
      return obj;
    });
}

function roundToRow(r) {
  return ROUNDS_HEADERS.map(h => {
    let v = r[h] ?? "";
    if (h === "review" && v && typeof v === "object") v = JSON.stringify(v);
    return v;
  });
}

function findRowByIdInSheet(ws, id) {
  const lastRow = ws.getLastRow();
  if (lastRow < 2) return -1;
  const ids = ws.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  const idx = ids.findIndex(v => String(v) === String(id));
  return idx >= 0 ? idx + 2 : -1;
}

function _readSimpleSheet(ws, headers, numFields) {
  const lastRow = ws.getLastRow();
  if (lastRow <= 1) return [];
  const data = ws.getRange(1, 1, lastRow, headers.length).getValues();
  const hdrs = data[0];
  return data.slice(1)
    .filter(row => row[0] !== "" && row[0] !== null)
    .map(row => {
      const obj = {};
      hdrs.forEach((h, i) => {
        let v = row[i];
        if (v instanceof Date) v = Utilities.formatDate(v, "UTC", "yyyy-MM-dd");
        if (numFields && numFields.includes(h)) v = (v === "" || v === null) ? null : Number(v);
        obj[h] = v;
      });
      return obj;
    });
}

// ── Analysis ─────────────────────────────────────────────
function getAllAnalysis() {
  const ws = getAnalysisSheet();
  const lastRow = ws.getLastRow();
  if (lastRow <= 1) return [];
  const data = ws.getRange(1, 1, lastRow, ANALYSIS_HEADERS.length).getValues();
  return data.slice(1)
    .filter(row => row[0] !== "" && row[0] !== null)
    .map(row => {
      const obj = {};
      ANALYSIS_HEADERS.forEach((h, i) => {
        let v = row[i];
        if (v instanceof Date) v = Utilities.formatDate(v, "UTC", "yyyy-MM-dd");
        if (h === "timeframes" && typeof v === "string" && v !== "") {
          try { v = JSON.parse(v); } catch(e) { v = []; }
        }
        obj[h] = v;
      });
      return obj;
    });
}
function analysisToRow(a) {
  return ANALYSIS_HEADERS.map(h => {
    let v = a[h] ?? "";
    if (h === "timeframes" && Array.isArray(v)) v = JSON.stringify(v);
    return v;
  });
}

// ── Blog ─────────────────────────────────────────────────
function getAllBlog()  { return _readSimpleSheet(getBlogSheet(), BLOG_HEADERS, []); }
function blogToRow(b) { return BLOG_HEADERS.map(h => b[h] ?? ""); }

// ══════════════════════════════════════════════════════════
//  HTTP HANDLERS
// ══════════════════════════════════════════════════════════

function doGet(e) {
  try {
    const action = e?.parameter?.action ?? "list";

    if (action === "list") {
      return jsonOut({ ok: true, data: getAllTrades() });
    }

    if (action === "listAccounts") {
      return jsonOut({ ok: true, data: getAllAccounts() });
    }

    if (action === "listRounds") {
      return jsonOut({ ok: true, data: getAllRounds() });
    }

    if (action === "listAnalysis") {
      return jsonOut({ ok: true, data: getAllAnalysis() });
    }

    if (action === "listBlog") {
      return jsonOut({ ok: true, data: getAllBlog() });
    }

    if (action === "stats") {
      const trades = getAllTrades();
      const n = trades.length;
      const wins   = trades.filter(t => t.result === "Win").length;
      const losses = trades.filter(t => t.result === "Loss").length;
      const be     = trades.filter(t => t.result === "BE").length;
      const pnl    = trades.reduce((a, t) => a + (Number(t.pnl) || 0), 0);
      const gw     = trades.filter(t => t.result === "Win").reduce((a,t) => a + (Number(t.pnl)||0), 0);
      const gl     = trades.filter(t => t.result === "Loss").reduce((a,t) => a + Math.abs(Number(t.pnl)||0), 0);
      return jsonOut({
        ok: true,
        data: {
          total: n, wins, losses, be,
          winRate:      n > 0 ? wins / n : 0,
          totalPnl:     pnl,
          expectancy:   n > 0 ? pnl / n : 0,
          profitFactor: gl > 0 ? gw / gl : (gw > 0 ? 999 : 0),
          avgScore:     n > 0 ? trades.reduce((a,t) => a + (Number(t.score)||0), 0) / n : 0
        }
      });
    }

    return jsonOut({ ok: false, error: "Unknown action: " + action });

  } catch(err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

function doPost(e) {
  try {
    if (!e?.postData?.contents) {
      return jsonOut({ ok: false, error: "No POST body received" });
    }

    const { action, trade, id, trades, account, round, analysis, blogPost } = JSON.parse(e.postData.contents);
    const ws = getSheet();

    if (action === "add") {
      if (!trade) return jsonOut({ ok: false, error: "Missing trade" });
      ws.appendRow(tradeToRow(trade));
      return jsonOut({ ok: true, id: trade.id });
    }

    if (action === "update") {
      const row = findRowById(ws, id);
      if (row < 0) return jsonOut({ ok: false, error: "Not found: " + id });
      ws.getRange(row, 1, 1, HEADERS.length).setValues([tradeToRow(trade)]);
      return jsonOut({ ok: true });
    }

    if (action === "delete") {
      const row = findRowById(ws, id);
      if (row < 0) return jsonOut({ ok: false, error: "Not found: " + id });
      ws.deleteRow(row);
      return jsonOut({ ok: true });
    }

    if (action === "bulk_add") {
      if (!trades?.length) return jsonOut({ ok: false, error: "No trades" });
      trades.forEach(t => ws.appendRow(tradeToRow(t)));
      return jsonOut({ ok: true, count: trades.length });
    }

    // ── Accounts ──────────────────────────────────────────
    if (action === "add_account") {
      if (!account) return jsonOut({ ok: false, error: "Missing account" });
      getAccountsSheet().appendRow(accountToRow(account));
      return jsonOut({ ok: true });
    }

    if (action === "update_account") {
      if (!account) return jsonOut({ ok: false, error: "Missing account" });
      const aws = getAccountsSheet();
      const row = findRowByIdInSheet(aws, account.id);
      if (row < 0) return jsonOut({ ok: false, error: "Account not found: " + account.id });
      aws.getRange(row, 1, 1, ACCOUNTS_HEADERS.length).setValues([accountToRow(account)]);
      return jsonOut({ ok: true });
    }

    if (action === "delete_account") {
      const aws = getAccountsSheet();
      const row = findRowByIdInSheet(aws, id);
      if (row < 0) return jsonOut({ ok: false, error: "Account not found: " + id });
      aws.deleteRow(row);
      // Also delete all rounds for this account
      const rws = getRoundsSheet();
      const lastRow = rws.getLastRow();
      if (lastRow > 1) {
        const accIds = rws.getRange(2, 2, lastRow - 1, 1).getValues().flat();
        for (let i = accIds.length - 1; i >= 0; i--) {
          if (String(accIds[i]) === String(id)) rws.deleteRow(i + 2);
        }
      }
      return jsonOut({ ok: true });
    }

    // ── Rounds ────────────────────────────────────────────
    if (action === "add_round") {
      if (!round) return jsonOut({ ok: false, error: "Missing round" });
      getRoundsSheet().appendRow(roundToRow(round));
      return jsonOut({ ok: true });
    }

    if (action === "update_round") {
      if (!round) return jsonOut({ ok: false, error: "Missing round" });
      const rws = getRoundsSheet();
      const row = findRowByIdInSheet(rws, round.id);
      if (row < 0) return jsonOut({ ok: false, error: "Round not found: " + round.id });
      rws.getRange(row, 1, 1, ROUNDS_HEADERS.length).setValues([roundToRow(round)]);
      return jsonOut({ ok: true });
    }

    if (action === "delete_round") {
      const rws = getRoundsSheet();
      const row = findRowByIdInSheet(rws, id);
      if (row < 0) return jsonOut({ ok: false, error: "Round not found: " + id });
      rws.deleteRow(row);
      return jsonOut({ ok: true });
    }

    // ── Analysis ──────────────────────────────────────────
    if (action === "add_analysis") {
      if (!analysis) return jsonOut({ ok: false, error: "Missing analysis" });
      getAnalysisSheet().appendRow(analysisToRow(analysis));
      return jsonOut({ ok: true });
    }
    if (action === "update_analysis") {
      if (!analysis) return jsonOut({ ok: false, error: "Missing analysis" });
      const aws = getAnalysisSheet();
      const row = findRowByIdInSheet(aws, analysis.id);
      if (row < 0) return jsonOut({ ok: false, error: "Analysis not found" });
      aws.getRange(row, 1, 1, ANALYSIS_HEADERS.length).setValues([analysisToRow(analysis)]);
      return jsonOut({ ok: true });
    }
    if (action === "delete_analysis") {
      const aws = getAnalysisSheet();
      const row = findRowByIdInSheet(aws, id);
      if (row < 0) return jsonOut({ ok: false, error: "Analysis not found" });
      aws.deleteRow(row);
      return jsonOut({ ok: true });
    }

    // ── Blog ──────────────────────────────────────────────
    if (action === "add_blog") {
      if (!blogPost) return jsonOut({ ok: false, error: "Missing blogPost" });
      getBlogSheet().appendRow(blogToRow(blogPost));
      return jsonOut({ ok: true });
    }
    if (action === "update_blog") {
      if (!blogPost) return jsonOut({ ok: false, error: "Missing blogPost" });
      const bws = getBlogSheet();
      const row = findRowByIdInSheet(bws, blogPost.id);
      if (row < 0) return jsonOut({ ok: false, error: "Blog post not found" });
      bws.getRange(row, 1, 1, BLOG_HEADERS.length).setValues([blogToRow(blogPost)]);
      return jsonOut({ ok: true });
    }
    if (action === "delete_blog") {
      const bws = getBlogSheet();
      const row = findRowByIdInSheet(bws, id);
      if (row < 0) return jsonOut({ ok: false, error: "Blog post not found" });
      bws.deleteRow(row);
      return jsonOut({ ok: true });
    }

    return jsonOut({ ok: false, error: "Unknown action: " + action });

  } catch(err) {
    return jsonOut({ ok: false, error: err.message });
  }
}
