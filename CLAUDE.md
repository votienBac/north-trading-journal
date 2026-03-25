# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

North Trading Journal is a single-file, self-hosted trading journal. It has two files:

- `trading_journal_sheets.html` — the entire frontend (HTML + CSS + JS in one file), runs locally in any browser
- `Code.gs` — Google Apps Script backend, deployed as a Web App on Google Sheets

There is no build step, no package manager, no dependencies. Open the HTML file directly in a browser.

## Architecture

### Frontend (`trading_journal_sheets.html`)
Single-file app. All CSS is in `<style>`, all JS is in `<script>` at the bottom.

**State:** One global array `T` holds all trades in memory (fetched from the Sheet on load). All views re-render from `T`.

**Key JS functions:**
- `syncFromSheet()` — fetches all trades from the Apps Script API into `T`, then calls `renderAll()`
- `renderAll()` — recomputes stats, redraws equity chart, rerenders recent list and journal list
- `saveTrade()` — POSTs a new/edited trade to the API, then re-syncs
- `renderJournal()` — renders the full trade table with filters (result, session, strategy)
- `trow(t, full)` — returns an HTML `<tr>` string for one trade; `full=true` adds TF, Lot, and error columns

**Theme:** CSS variables in `:root` (dark) and `body.light` (light). Toggle via `toggleTheme()`, persisted in `localStorage` as `tj_theme`.

**API URL** is stored in `localStorage` as `tj_sheet_url`.

### Backend (`Code.gs`)
Google Apps Script Web App. Deployed with Execute as: Me, Access: Anyone.

**Sheet structure:** One sheet named `trades` with columns defined in `HEADERS` array (23 columns: id, date, pair, strategy, tf, session, direction, entry, sl, tp, exitPrice, lot, risk, rrPlan, rrActual, result, pnl, score, conditions, errors, reason, lesson, updatedAt).

**API endpoints (GET):**
- `?action=list` — returns all trades
- `?action=stats` — returns aggregated stats

**API endpoints (POST body JSON):**
- `{ action: "add", trade: {...} }` — appends a row
- `{ action: "update", trade: {...} }` — finds by `id`, overwrites row
- `{ action: "delete", id: "..." }` — deletes row by id
- `{ action: "bulk", trades: [...] }` — clears sheet and rewrites all rows

**Important:** Do NOT set Content-Type headers in `fetch()` calls to the Apps Script URL — it triggers a CORS preflight that Apps Script does not handle. The POST body is read from `e.postData.contents`.

## Trade Data Shape

```js
{
  id, date, pair, strategy, tf, session, direction,
  entry, sl, tp, exitPrice, lot, risk,
  rrPlan, rrActual, result,  // result: "Win" | "Loss" | "BE"
  pnl, score,                // pnl in R-multiples, score 0–100
  conditions, errors,        // arrays, stored as JSON strings in Sheet
  reason, lesson, updatedAt
}
```
