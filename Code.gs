// ═══════════════════════════════════════════════════════
//  TRADING JOURNAL — Google Apps Script Backend
//  v2 — fixed ContentService, CORS, doPost parsing
// ═══════════════════════════════════════════════════════

const SHEET_NAME = "trades";
const HEADERS = [
  "id", "date", "pair", "strategy", "tf", "session", "direction",
  "entry", "sl", "tp", "exitPrice", "lot", "risk",
  "rrPlan", "rrActual", "result", "pnl", "score",
  "conditions", "errors", "reason", "lesson", "updatedAt",
  "accountId", "roundId"
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
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let ws = ss.getSheetByName(SHEET_NAME);
  if (!ws) {
    ws = ss.insertSheet(SHEET_NAME);
    ws.appendRow(HEADERS);
    const h = ws.getRange(1, 1, 1, HEADERS.length);
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
  const headers = data[0];

  return data.slice(1)
    .filter(row => row[0] !== "" && row[0] !== null)
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        let v = row[i];

        if (v instanceof Date) {
          v = Utilities.formatDate(v, "UTC", "yyyy-MM-dd");
        }

        if ((h === "conditions" || h === "errors") && typeof v === "string" && v !== "") {
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

// ══════════════════════════════════════════════════════════
//  HTTP HANDLERS
// ══════════════════════════════════════════════════════════

function doGet(e) {
  try {
    const action = e?.parameter?.action ?? "list";

    if (action === "list") {
      return jsonOut({ ok: true, data: getAllTrades() });
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

    const { action, trade, id, trades } = JSON.parse(e.postData.contents);
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

    return jsonOut({ ok: false, error: "Unknown action: " + action });

  } catch(err) {
    return jsonOut({ ok: false, error: err.message });
  }
}
