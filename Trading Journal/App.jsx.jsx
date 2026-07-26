import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";

/* ---------------------------------------------------------------- */
/*  Storage helpers                                                  */
/* ---------------------------------------------------------------- */

const IDS_KEY = "trade-ids";
const tradeKey = (id) => `trade:${id}`;

async function loadAllTrades() {
  try {
    const idsRes = await window.storage.get(IDS_KEY, false);
    const ids = idsRes ? JSON.parse(idsRes.value) : [];
    if (!ids.length) return [];
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          const r = await window.storage.get(tradeKey(id), false);
          return r ? JSON.parse(r.value) : null;
        } catch {
          return null;
        }
      })
    );
    return results.filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

async function persistTrade(trade) {
  await window.storage.set(tradeKey(trade.id), JSON.stringify(trade), false);
}

async function persistIds(ids) {
  await window.storage.set(IDS_KEY, JSON.stringify(ids), false);
}

async function removeTrade(id) {
  try {
    await window.storage.delete(tradeKey(id), false);
  } catch {}
}

const dayNoteKey = (date) => `daynote:${date}`;

async function loadDayNote(date) {
  try {
    const r = await window.storage.get(dayNoteKey(date), false);
    return r ? JSON.parse(r.value).text || "" : "";
  } catch {
    return "";
  }
}

async function saveDayNote(date, text) {
  if (!text.trim()) {
    try {
      await window.storage.delete(dayNoteKey(date), false);
    } catch {}
    return;
  }
  await window.storage.set(dayNoteKey(date), JSON.stringify({ text }), false);
}

const TABS_KEY = "custom-tabs";

async function loadCustomTabs() {
  try {
    const r = await window.storage.get(TABS_KEY, false);
    return r ? JSON.parse(r.value) : [];
  } catch {
    return [];
  }
}

async function persistCustomTabs(tabs) {
  await window.storage.set(TABS_KEY, JSON.stringify(tabs), false);
}

/* ---------------------------------------------------------------- */
/*  Date helpers (no external date lib)                              */
/* ---------------------------------------------------------------- */

const DAY_MS = 86400000;
const pad2 = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseISO = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

function fmtMoney(n) {
  const sign = n < 0 ? "-" : "+";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}
function fmtMoneyPlain(n) {
  return `$${n.toFixed(2)}`;
}

/* ---------------------------------------------------------------- */
/*  Stats                                                            */
/* ---------------------------------------------------------------- */

function computeStats(trades) {
  const count = trades.length;
  if (!count) {
    return { count: 0, totalPnl: 0, winRate: 0, wins: 0, losses: 0, avgWin: 0, avgLoss: 0, profitFactor: 0, best: null, worst: null };
  }
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const best = trades.reduce((a, b) => (b.pnl > (a?.pnl ?? -Infinity) ? b : a), null);
  const worst = trades.reduce((a, b) => (b.pnl < (a?.pnl ?? Infinity) ? b : a), null);
  const withRR = trades.filter((t) => t.rr != null && !Number.isNaN(t.rr));
  const avgRR = withRR.length ? withRR.reduce((s, t) => s + t.rr, 0) / withRR.length : null;
  return {
    count,
    totalPnl,
    winRate: (wins.length / count) * 100,
    wins: wins.length,
    losses: losses.length,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    profitFactor: grossLoss ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    best,
    worst,
    avgRR,
  };
}

function inRange(trade, start, end) {
  const t = parseISO(trade.date).getTime();
  return t >= start.getTime() && t < end.getTime();
}

/* ---------------------------------------------------------------- */
/*  Image resize                                                     */
/* ---------------------------------------------------------------- */

function resizeImage(file, maxW = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------------------------------------------------------------- */
/*  Style sheet                                                      */
/* ---------------------------------------------------------------- */

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');

:root {
  --bg: #0a0d11;
  --panel: #12161c;
  --panel-alt: #181e26;
  --border: #232a34;
  --text: #e7eaee;
  --text-dim: #7d8896;
  --text-faint: #4b5563;
  --green: #16c784;
  --green-dim: rgba(22,199,132,0.14);
  --green-line: rgba(22,199,132,0.35);
  --red: #ea3943;
  --red-dim: rgba(234,57,67,0.14);
  --red-line: rgba(234,57,67,0.35);
  --gold: #f0b90b;
  --gold-dim: rgba(240,185,11,0.12);
}
.tj-root * { box-sizing: border-box; }
.tj-root {
  background: var(--bg);
  color: var(--text);
  font-family: 'Inter', sans-serif;
  min-height: 100vh;
  width: 100%;
}
.tj-mono { font-family: 'IBM Plex Mono', monospace; }

/* Ticker strip */
.tj-ticker {
  display: flex;
  overflow: hidden;
  background: #000;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
.tj-ticker-track {
  display: flex;
  gap: 40px;
  padding: 8px 20px;
  animation: tj-scroll 22s linear infinite;
}
.tj-root:hover .tj-ticker-track { animation-play-state: paused; }
@keyframes tj-scroll {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
.tj-ticker-item {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
  letter-spacing: 0.03em;
  color: var(--text-dim);
  display: flex;
  gap: 6px;
  align-items: baseline;
}
.tj-ticker-item b { color: var(--text); font-weight: 600; }
.tj-up { color: var(--green); }
.tj-down { color: var(--red); }

/* Header */
.tj-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 28px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
  gap: 14px;
}
.tj-brand {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.tj-brand-mark {
  width: 9px; height: 9px; border-radius: 2px;
  background: var(--gold);
  transform: rotate(45deg);
}
.tj-brand-name {
  font-family: 'IBM Plex Mono', monospace;
  font-weight: 700;
  font-size: 17px;
  letter-spacing: 0.02em;
}
.tj-brand-sub { color: var(--text-faint); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; }

.tj-nav { display: flex; gap: 4px; background: var(--panel); padding: 4px; border-radius: 10px; border: 1px solid var(--border); overflow-x: auto; max-width: 100%; }
.tj-nav button {
  background: transparent; border: none; color: var(--text-dim);
  font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 600;
  padding: 8px 16px; border-radius: 7px; cursor: pointer; transition: all .15s ease;
  white-space: nowrap; flex-shrink: 0;
}
.tj-nav button:hover { color: var(--text); }
.tj-nav button.active { background: var(--panel-alt); color: var(--gold); }
.tj-nav-divider { width: 1px; background: var(--border); margin: 4px 2px; flex-shrink: 0; }
.tj-tab-pill {
  display: flex; align-items: center; gap: 6px;
  background: transparent; border: none; color: var(--text-dim);
  font-family: 'IBM Plex Mono', monospace; font-size: 12px; font-weight: 600;
  padding: 8px 10px 8px 14px; border-radius: 7px; cursor: pointer;
  white-space: nowrap; flex-shrink: 0;
}
.tj-tab-pill:hover { color: var(--text); }
.tj-tab-pill.active { background: var(--panel-alt); color: var(--gold); }
.tj-tab-close {
  display: flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; border-radius: 4px; font-size: 12px; line-height: 1;
  color: var(--text-faint); opacity: 0; transition: opacity .1s ease, background .1s ease, color .1s ease;
}
.tj-tab-pill:hover .tj-tab-close { opacity: 1; }
.tj-tab-close:hover { background: var(--red-dim); color: var(--red); }
.tj-tab-add {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 7px; flex-shrink: 0;
  background: transparent; border: none; color: var(--text-faint); font-size: 16px; cursor: pointer;
}
.tj-tab-add:hover { color: var(--gold); background: var(--gold-dim); }
.tj-add-tab-modal { max-width: 340px; }
.tj-tab-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 18px; }
.tj-tab-header-title { font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 18px; }
.tj-tab-header-sub { color: var(--text-faint); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 2px; }

.tj-btn-primary {
  background: var(--gold); color: #0a0d11; border: none;
  font-family: 'Inter', sans-serif; font-weight: 700; font-size: 13px;
  padding: 10px 18px; border-radius: 8px; cursor: pointer;
  display: flex; align-items: center; gap: 6px;
  transition: transform .12s ease, box-shadow .12s ease;
}
.tj-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(240,185,11,0.25); }
.tj-btn-secondary {
  background: transparent; color: var(--text-dim); border: 1px solid var(--border);
  font-family: 'Inter', sans-serif; font-weight: 600; font-size: 13px;
  padding: 9px 16px; border-radius: 8px; cursor: pointer;
}
.tj-btn-secondary:hover { color: var(--text); border-color: var(--text-faint); }
.tj-btn-danger { color: var(--red); border-color: var(--red-line); }

.tj-main { padding: 26px 28px 60px; max-width: 1180px; margin: 0 auto; }

/* Cards */
.tj-card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
}
.tj-card-label {
  font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--text-faint); font-weight: 600; margin-bottom: 10px;
}
.tj-card-value {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 26px; font-weight: 600; line-height: 1;
}
.tj-card-foot { margin-top: 8px; font-size: 12px; color: var(--text-dim); }

.tj-stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 22px; }
@media (max-width: 900px) { .tj-stat-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 480px) { .tj-stat-grid { grid-template-columns: 1fr; } }

.tj-rr-badge {
  font-family: 'IBM Plex Mono', monospace; font-size: 11px; font-weight: 600;
  color: var(--gold); text-align: center;
}

.tj-section-title {
  font-size: 13px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--text-dim); margin: 30px 0 14px;
}

/* Equity chart card */
.tj-chart-card { padding: 20px 8px 12px 0; margin-bottom: 22px; }
.tj-chart-card .tj-card-label { padding-left: 20px; }

/* Trade list */
.tj-trade-row {
  display: grid;
  grid-template-columns: 90px 1fr 70px 110px 40px;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background .12s ease;
}
.tj-trade-row:hover { background: var(--panel-alt); }
.tj-trade-row:last-child { border-bottom: none; }
.tj-sym { font-weight: 700; font-size: 13.5px; }
.tj-dir { font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; padding: 2px 7px; border-radius: 5px; width: fit-content; }
.tj-dir-long { color: var(--green); background: var(--green-dim); }
.tj-dir-short { color: var(--red); background: var(--red-dim); }
.tj-pnl { font-family: 'IBM Plex Mono', monospace; font-weight: 600; font-size: 13.5px; text-align: right; }
.tj-date-cell { color: var(--text-dim); font-size: 12px; font-family: 'IBM Plex Mono', monospace; }
.tj-thumb-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-faint); }
.tj-thumb-dot.has { background: var(--gold); }

/* Calendar */
.tj-cal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.tj-cal-nav { display: flex; gap: 8px; align-items: center; }
.tj-cal-nav button {
  background: var(--panel); border: 1px solid var(--border); color: var(--text-dim);
  width: 30px; height: 30px; border-radius: 7px; cursor: pointer; font-size: 14px;
}
.tj-cal-nav button:hover { color: var(--text); }
.tj-cal-title { font-family: 'IBM Plex Mono', monospace; font-weight: 600; font-size: 15px; min-width: 150px; text-align: center; }
.tj-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
.tj-cal-dow { font-size: 10px; color: var(--text-faint); text-align: center; padding-bottom: 4px; letter-spacing: 0.08em; }
.tj-cal-cell {
  aspect-ratio: 1;
  border-radius: 8px;
  border: 1px solid var(--border);
  padding: 6px 7px;
  display: flex; flex-direction: column; justify-content: space-between;
  cursor: pointer;
  transition: transform .1s ease, border-color .1s ease;
  min-height: 62px;
}
.tj-cal-cell:hover { border-color: var(--text-faint); }
.tj-cal-cell.selected { border-color: var(--gold); }
.tj-cal-cell.empty { border-color: transparent; cursor: default; }
.tj-cal-day { font-size: 11px; color: var(--text-dim); font-family: 'IBM Plex Mono', monospace; }
.tj-cal-pnl { font-family: 'IBM Plex Mono', monospace; font-size: 11px; font-weight: 700; }
.tj-cal-today { box-shadow: inset 0 0 0 1.5px var(--gold); }

/* Day detail panel */
.tj-day-panel { margin-top: 18px; }

/* Modal */
.tj-modal-backdrop {
  position: fixed; inset: 0; background: rgba(4,6,9,0.72);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 40px 16px; overflow-y: auto; z-index: 50;
  backdrop-filter: blur(2px);
}
.tj-modal {
  background: var(--panel); border: 1px solid var(--border); border-radius: 14px;
  width: 100%; max-width: 560px; padding: 26px;
}
.tj-modal-title { font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 16px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center; }
.tj-modal-close { background: none; border: none; color: var(--text-faint); font-size: 20px; cursor: pointer; line-height: 1; }
.tj-field { margin-bottom: 14px; }
.tj-field label { display: block; font-size: 11px; color: var(--text-dim); margin-bottom: 6px; letter-spacing: 0.03em; text-transform: uppercase; font-weight: 600; }
.tj-field input, .tj-field select, .tj-field textarea {
  width: 100%; background: var(--panel-alt); border: 1px solid var(--border); color: var(--text);
  padding: 10px 12px; border-radius: 8px; font-family: 'Inter', sans-serif; font-size: 13.5px;
}
.tj-field input:focus, .tj-field select:focus, .tj-field textarea:focus { outline: none; border-color: var(--gold); }
.tj-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.tj-row3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
.tj-dropzone {
  border: 1.5px dashed var(--border); border-radius: 10px; padding: 18px;
  text-align: center; color: var(--text-faint); font-size: 12.5px; cursor: pointer;
  transition: border-color .12s ease;
}
.tj-dropzone:hover { border-color: var(--gold); color: var(--text-dim); }
.tj-dropzone.drag { border-color: var(--gold); background: var(--gold-dim); }
.tj-preview-img { width: 100%; max-height: 220px; object-fit: contain; border-radius: 8px; margin-top: 10px; border: 1px solid var(--border); }
.tj-modal-actions { display: flex; justify-content: space-between; gap: 10px; margin-top: 20px; }
.tj-modal-actions-right { display: flex; gap: 10px; }

.tj-empty { text-align: center; padding: 60px 20px; color: var(--text-faint); }
.tj-empty-title { font-family: 'IBM Plex Mono', monospace; color: var(--text-dim); font-size: 15px; margin-bottom: 6px; }

/* Trade detail modal */
.tj-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
.tj-detail-item { background: var(--panel-alt); border-radius: 8px; padding: 10px 12px; }
.tj-detail-label { font-size: 10px; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
.tj-detail-value { font-family: 'IBM Plex Mono', monospace; font-size: 14px; font-weight: 600; }
.tj-notes { font-size: 13px; color: var(--text-dim); line-height: 1.5; white-space: pre-wrap; }

/* Daily review modal */
.tj-review-modal { max-width: 620px; }
.tj-review-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 4px; }
.tj-review-date { font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 17px; }
.tj-review-dow { color: var(--text-faint); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
.tj-review-mini-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0 22px; }
@media (max-width: 480px) { .tj-review-mini-grid { grid-template-columns: repeat(2, 1fr); } }
.tj-mini-stat { background: var(--panel-alt); border: 1px solid var(--border); border-radius: 9px; padding: 10px 12px; }
.tj-mini-stat-label { font-size: 9.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-faint); font-weight: 600; margin-bottom: 5px; }
.tj-mini-stat-value { font-family: 'IBM Plex Mono', monospace; font-size: 15px; font-weight: 700; }
.tj-review-note-status { font-size: 11px; color: var(--text-faint); }
.tj-review-note-status.saved { color: var(--green); }
`;

/* ---------------------------------------------------------------- */
/*  Small components                                                 */
/* ---------------------------------------------------------------- */

function PnlText({ value, size }) {
  const cls = value > 0 ? "tj-up" : value < 0 ? "tj-down" : "";
  return <span className={`tj-mono ${cls}`} style={{ fontWeight: 700, fontSize: size }}>{fmtMoney(value)}</span>;
}

function StatCard({ label, value, valueColor, foot }) {
  return (
    <div className="tj-card">
      <div className="tj-card-label">{label}</div>
      <div className="tj-card-value" style={{ color: valueColor || "var(--text)" }}>{value}</div>
      {foot && <div className="tj-card-foot">{foot}</div>}
    </div>
  );
}

function StatsBlock({ trades, title }) {
  const s = computeStats(trades);
  return (
    <>
      <div className="tj-section-title">{title}</div>
      <div className="tj-stat-grid">
        <StatCard
          label="Net P&L"
          value={fmtMoney(s.totalPnl)}
          valueColor={s.totalPnl > 0 ? "var(--green)" : s.totalPnl < 0 ? "var(--red)" : "var(--text)"}
          foot={`${s.count} trade${s.count === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Win Rate"
          value={s.count ? `${s.winRate.toFixed(0)}%` : "—"}
          foot={`${s.wins}W / ${s.losses}L`}
        />
        <StatCard
          label="Profit Factor"
          value={s.count ? (s.profitFactor === Infinity ? "∞" : s.profitFactor.toFixed(2)) : "—"}
          foot={`avg win ${fmtMoneyPlain(s.avgWin)} · avg loss ${fmtMoneyPlain(s.avgLoss)}`}
        />
        <StatCard
          label="Avg Risk:Reward"
          value={s.avgRR != null ? `1:${s.avgRR.toFixed(2)}` : "—"}
          valueColor="var(--gold)"
          foot={s.avgRR != null ? "planned R across logged trades" : "no R:R logged yet"}
        />
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- */
/*  Add / Edit trade modal                                           */
/* ---------------------------------------------------------------- */

function TradeModal({ initial, onClose, onSave, onDelete }) {
  const [date, setDate] = useState(initial?.date || toISO(new Date()));
  const [symbol, setSymbol] = useState(initial?.symbol || "");
  const [direction, setDirection] = useState(initial?.direction || "Long");
  const [entry, setEntry] = useState(initial?.entry ?? "");
  const [exit, setExit] = useState(initial?.exit ?? "");
  const [quantity, setQuantity] = useState(initial?.quantity ?? "");
  const [pnl, setPnl] = useState(initial?.pnl ?? "");
  const [rr, setRr] = useState(initial?.rr ?? "");
  const [tags, setTags] = useState(initial?.tags || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [image, setImage] = useState(initial?.image || null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      const dataUrl = await resizeImage(file);
      setImage(dataUrl);
    } catch {}
  };

  const canSave = symbol.trim() && date && pnl !== "";

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    const trade = {
      id: initial?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date,
      symbol: symbol.trim().toUpperCase(),
      direction,
      entry: entry === "" ? null : Number(entry),
      exit: exit === "" ? null : Number(exit),
      quantity: quantity === "" ? null : Number(quantity),
      pnl: Number(pnl),
      rr: rr === "" ? null : Number(rr),
      tags: tags.trim(),
      notes: notes.trim(),
      image: image || null,
      createdAt: initial?.createdAt || Date.now(),
    };
    await onSave(trade);
    setSaving(false);
  };

  return (
    <div className="tj-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tj-modal">
        <div className="tj-modal-title">
          <span>{initial ? "Edit Trade" : "New Trade"}</span>
          <button className="tj-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="tj-row2">
          <div className="tj-field">
            <label>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="tj-field">
            <label>Symbol</label>
            <input placeholder="EURUSD, AAPL, BTC…" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
          </div>
        </div>

        <div className="tj-row2">
          <div className="tj-field">
            <label>Direction</label>
            <select value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option>Long</option>
              <option>Short</option>
            </select>
          </div>
          <div className="tj-field">
            <label>Net P&amp;L ($)</label>
            <input type="number" step="0.01" placeholder="e.g. 125.50 or -60" value={pnl} onChange={(e) => setPnl(e.target.value)} />
          </div>
        </div>

        <div className="tj-row3">
          <div className="tj-field">
            <label>Entry price</label>
            <input type="number" step="any" value={entry} onChange={(e) => setEntry(e.target.value)} />
          </div>
          <div className="tj-field">
            <label>Exit price</label>
            <input type="number" step="any" value={exit} onChange={(e) => setExit(e.target.value)} />
          </div>
          <div className="tj-field">
            <label>Size / qty</label>
            <input type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
        </div>

        <div className="tj-field">
          <label>Risk : Reward (R)</label>
          <input type="number" step="any" min="0" placeholder="e.g. 2.5 means risked 1 to make 2.5" value={rr} onChange={(e) => setRr(e.target.value)} />
        </div>

        <div className="tj-field">
          <label>Tags</label>
          <input placeholder="breakout, revenge-trade, plan-A…" value={tags} onChange={(e) => setTags(e.target.value)} />
        </div>

        <div className="tj-field">
          <label>Notes</label>
          <textarea rows={3} placeholder="Setup, reasoning, what went right or wrong…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="tj-field">
          <label>Chart screenshot</label>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={(e) => handleFile(e.target.files[0])} />
          <div
            className={`tj-dropzone ${dragging ? "drag" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
          >
            {image ? "Click or drop to replace image" : "Click or drag a screenshot here"}
          </div>
          {image && <img src={image} className="tj-preview-img" alt="trade" />}
          {image && (
            <button className="tj-btn-secondary" style={{ marginTop: 8, fontSize: 11 }} onClick={() => setImage(null)}>
              Remove image
            </button>
          )}
        </div>

        <div className="tj-modal-actions">
          <div>
            {initial && (
              <button className="tj-btn-secondary tj-btn-danger" onClick={() => onDelete(initial.id)}>Delete</button>
            )}
          </div>
          <div className="tj-modal-actions-right">
            <button className="tj-btn-secondary" onClick={onClose}>Cancel</button>
            <button className="tj-btn-primary" disabled={!canSave || saving} style={{ opacity: canSave ? 1 : 0.5 }} onClick={handleSave}>
              {saving ? "Saving…" : "Save Trade"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TradeDetailModal({ trade, onClose, onEdit }) {
  return (
    <div className="tj-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tj-modal">
        <div className="tj-modal-title">
          <span>{trade.symbol} · {trade.date}</span>
          <button className="tj-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="tj-detail-grid">
          <div className="tj-detail-item">
            <div className="tj-detail-label">Direction</div>
            <div className="tj-detail-value">{trade.direction}</div>
          </div>
          <div className="tj-detail-item">
            <div className="tj-detail-label">Net P&amp;L</div>
            <div className="tj-detail-value"><PnlText value={trade.pnl} size={14} /></div>
          </div>
          {trade.entry != null && (
            <div className="tj-detail-item">
              <div className="tj-detail-label">Entry</div>
              <div className="tj-detail-value">{trade.entry}</div>
            </div>
          )}
          {trade.exit != null && (
            <div className="tj-detail-item">
              <div className="tj-detail-label">Exit</div>
              <div className="tj-detail-value">{trade.exit}</div>
            </div>
          )}
          {trade.quantity != null && (
            <div className="tj-detail-item">
              <div className="tj-detail-label">Size</div>
              <div className="tj-detail-value">{trade.quantity}</div>
            </div>
          )}
          {trade.rr != null && (
            <div className="tj-detail-item">
              <div className="tj-detail-label">Risk : Reward</div>
              <div className="tj-detail-value" style={{ color: "var(--gold)" }}>1:{trade.rr}</div>
            </div>
          )}
          {trade.tags && (
            <div className="tj-detail-item">
              <div className="tj-detail-label">Tags</div>
              <div className="tj-detail-value" style={{ fontSize: 12 }}>{trade.tags}</div>
            </div>
          )}
        </div>
        {trade.notes && (
          <div style={{ marginBottom: 14 }}>
            <div className="tj-detail-label" style={{ marginBottom: 6 }}>Notes</div>
            <div className="tj-notes">{trade.notes}</div>
          </div>
        )}
        {trade.image && <img src={trade.image} className="tj-preview-img" alt="trade screenshot" />}
        <div className="tj-modal-actions">
          <div />
          <div className="tj-modal-actions-right">
            <button className="tj-btn-secondary" onClick={onClose}>Close</button>
            <button className="tj-btn-primary" onClick={() => onEdit(trade)}>Edit</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Daily review modal                                               */
/* ---------------------------------------------------------------- */

function DayReviewModal({ date, trades, onClose, onSelectTrade }) {
  const [note, setNote] = useState("");
  const [noteLoaded, setNoteLoaded] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | dirty | saving | saved
  const saveTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setNoteLoaded(false);
    loadDayNote(date).then((text) => {
      if (!cancelled) {
        setNote(text);
        setNoteLoaded(true);
        setStatus("idle");
      }
    });
    return () => { cancelled = true; };
  }, [date]);

  const handleNoteChange = (val) => {
    setNote(val);
    setStatus("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setStatus("saving");
      await saveDayNote(date, val);
      setStatus("saved");
    }, 700);
  };

  const d = parseISO(date);
  const dow = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()];
  const label = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

  const s = computeStats(trades);
  const rrTrades = trades.filter((t) => t.rr != null);
  const avgRR = rrTrades.length ? rrTrades.reduce((sum, t) => sum + t.rr, 0) / rrTrades.length : null;

  return (
    <div className="tj-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tj-modal tj-review-modal">
        <div className="tj-modal-title">
          <div>
            <div className="tj-review-dow">{dow}</div>
            <div className="tj-review-date">{label}</div>
          </div>
          <button className="tj-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="tj-review-mini-grid">
          <div className="tj-mini-stat">
            <div className="tj-mini-stat-label">Net P&amp;L</div>
            <div className="tj-mini-stat-value" style={{ color: s.totalPnl > 0 ? "var(--green)" : s.totalPnl < 0 ? "var(--red)" : "var(--text)" }}>
              {trades.length ? fmtMoney(s.totalPnl) : "—"}
            </div>
          </div>
          <div className="tj-mini-stat">
            <div className="tj-mini-stat-label">Trades</div>
            <div className="tj-mini-stat-value">{s.count}</div>
          </div>
          <div className="tj-mini-stat">
            <div className="tj-mini-stat-label">Win Rate</div>
            <div className="tj-mini-stat-value">{s.count ? `${s.winRate.toFixed(0)}%` : "—"}</div>
          </div>
          <div className="tj-mini-stat">
            <div className="tj-mini-stat-label">Avg R:R</div>
            <div className="tj-mini-stat-value" style={{ color: "var(--gold)" }}>{avgRR != null ? `1:${avgRR.toFixed(2)}` : "—"}</div>
          </div>
        </div>

        <div className="tj-card-label" style={{ marginBottom: 8 }}>Trades this day</div>
        {trades.length === 0 ? (
          <div style={{ color: "var(--text-faint)", fontSize: 13, marginBottom: 20 }}>Nothing logged on this day.</div>
        ) : (
          <div className="tj-card" style={{ padding: 0, marginBottom: 20 }}>
            {trades.map((t) => (
              <div className="tj-trade-row" key={t.id} onClick={() => onSelectTrade(t)}>
                <span className="tj-date-cell">{t.symbol}</span>
                <div>
                  <span className={`tj-dir ${t.direction === "Long" ? "tj-dir-long" : "tj-dir-short"}`}>{t.direction}</span>
                </div>
                <span className="tj-rr-badge">{t.rr != null ? `1:${t.rr}` : ""}</span>
                <span className="tj-pnl" style={{ color: t.pnl >= 0 ? "var(--green)" : "var(--red)" }}>{fmtMoney(t.pnl)}</span>
                <span className={`tj-thumb-dot ${t.image ? "has" : ""}`} />
              </div>
            ))}
          </div>
        )}

        <div className="tj-field">
          <label style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Daily reflection</span>
            <span className={`tj-review-note-status ${status === "saved" ? "saved" : ""}`}>
              {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}
            </span>
          </label>
          <textarea
            rows={4}
            placeholder="How did today go? Did you follow your plan? What will you do differently tomorrow?"
            value={note}
            disabled={!noteLoaded}
            onChange={(e) => handleNoteChange(e.target.value)}
          />
        </div>

        <div className="tj-modal-actions">
          <div />
          <div className="tj-modal-actions-right">
            <button className="tj-btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Calendar view                                                    */
/* ---------------------------------------------------------------- */

function CalendarView({ trades, onSelectTrade, initialCursor }) {
  const [cursor, setCursor] = useState(initialCursor || startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(null);

  const byDay = useMemo(() => {
    const map = {};
    trades.forEach((t) => {
      map[t.date] = map[t.date] || [];
      map[t.date].push(t);
    });
    return map;
  }, [trades]);

  const monthTrades = useMemo(
    () => trades.filter((t) => {
      const d = parseISO(t.date);
      return d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth();
    }),
    [trades, cursor]
  );

  const maxAbs = useMemo(() => {
    const sums = {};
    monthTrades.forEach((t) => { sums[t.date] = (sums[t.date] || 0) + t.pnl; });
    const vals = Object.values(sums).map(Math.abs);
    return vals.length ? Math.max(...vals) : 1;
  }, [monthTrades]);

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    const out = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart.getTime() + i * DAY_MS);
      out.push(d);
      if (i >= 34 && d.getMonth() !== cursor.getMonth() && (i + 1) % 7 === 0) break;
    }
    return out;
  }, [cursor]);

  const todayISO = toISO(new Date());

  const monthStats = computeStats(monthTrades);

  return (
    <div>
      <div className="tj-cal-header">
        <div className="tj-cal-nav">
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>‹</button>
          <div className="tj-cal-title">{MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}</div>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>›</button>
        </div>
        <div className="tj-mono" style={{ fontSize: 13 }}>
          Month total: <PnlText value={monthStats.totalPnl} size={14} />
        </div>
      </div>

      <div className="tj-cal-grid">
        {DOW.map((d) => <div className="tj-cal-dow" key={d}>{d}</div>)}
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const iso = toISO(d);
          const dayTrades = byDay[iso] || [];
          const sum = dayTrades.reduce((s, t) => s + t.pnl, 0);
          if (!inMonth) return <div key={i} className="tj-cal-cell empty" />;
          const intensity = dayTrades.length ? 0.25 + 0.6 * Math.min(1, Math.abs(sum) / maxAbs) : 0;
          const bg = dayTrades.length
            ? sum > 0
              ? `rgba(22,199,132,${intensity})`
              : sum < 0
              ? `rgba(234,57,67,${intensity})`
              : "var(--panel-alt)"
            : "var(--panel)";
          return (
            <div
              key={i}
              className={`tj-cal-cell ${selectedDay === iso ? "selected" : ""} ${iso === todayISO ? "tj-cal-today" : ""}`}
              style={{ background: bg }}
              onClick={() => setSelectedDay(iso)}
            >
              <span className="tj-cal-day">{d.getDate()}</span>
              {dayTrades.length > 0 && (
                <span className="tj-cal-pnl" style={{ color: sum >= 0 ? "var(--green)" : "var(--red)" }}>
                  {sum >= 0 ? "+" : "-"}${Math.abs(sum) >= 1000 ? (Math.abs(sum) / 1000).toFixed(1) + "k" : Math.abs(sum).toFixed(0)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {selectedDay && (
        <DayReviewModal
          date={selectedDay}
          trades={byDay[selectedDay] || []}
          onClose={() => setSelectedDay(null)}
          onSelectTrade={onSelectTrade}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Dashboard view                                                   */
/* ---------------------------------------------------------------- */

function DashboardView({ trades, onSelectTrade }) {
  const now = new Date();
  const wkStart = startOfWeek(now);
  const wkEnd = new Date(wkStart.getTime() + 7 * DAY_MS);
  const moStart = startOfMonth(now);
  const moEnd = new Date(moStart.getFullYear(), moStart.getMonth() + 1, 1);

  const weekTrades = trades.filter((t) => inRange(t, wkStart, wkEnd));
  const monthTrades = trades.filter((t) => inRange(t, moStart, moEnd));

  const equityData = useMemo(() => {
    let running = 0;
    return trades.map((t) => {
      running += t.pnl;
      return { date: t.date.slice(5), equity: Number(running.toFixed(2)) };
    });
  }, [trades]);

  const recent = [...trades].slice(-8).reverse();

  return (
    <div>
      {trades.length > 1 && (
        <div className="tj-card tj-chart-card">
          <div className="tj-card-label">Equity Curve</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={equityData} margin={{ top: 8, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#1b212a" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={{ stroke: "#232a34" }} tickLine={false} />
              <YAxis tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={{ stroke: "#232a34" }} tickLine={false} width={60} />
              <ReferenceLine y={0} stroke="#3a4250" />
              <Tooltip
                contentStyle={{ background: "#181e26", border: "1px solid #232a34", borderRadius: 8, fontSize: 12, fontFamily: "IBM Plex Mono, monospace" }}
                labelStyle={{ color: "#7d8896" }}
                formatter={(v) => [fmtMoneyPlain(v), "Equity"]}
              />
              <Line type="monotone" dataKey="equity" stroke="#f0b90b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <StatsBlock trades={weekTrades} title="This Week" />
      <StatsBlock trades={monthTrades} title="This Month" />
      <StatsBlock trades={trades} title="All Time" />

      <div className="tj-section-title">Recent Trades</div>
      <div className="tj-card" style={{ padding: 0 }}>
        {recent.length === 0 ? (
          <div className="tj-empty">
            <div className="tj-empty-title">No trades yet</div>
            Log your first trade to see it here.
          </div>
        ) : (
          recent.map((t) => (
            <div className="tj-trade-row" key={t.id} onClick={() => onSelectTrade(t)}>
              <span className="tj-date-cell">{t.date.slice(5)}</span>
              <div>
                <div className="tj-sym">{t.symbol}</div>
                <span className={`tj-dir ${t.direction === "Long" ? "tj-dir-long" : "tj-dir-short"}`}>{t.direction}</span>
              </div>
              <span className="tj-rr-badge">{t.rr != null ? `1:${t.rr}` : ""}</span>
              <span className="tj-pnl" style={{ color: t.pnl >= 0 ? "var(--green)" : "var(--red)" }}>{fmtMoney(t.pnl)}</span>
              <span className={`tj-thumb-dot ${t.image ? "has" : ""}`} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Log view                                                         */
/* ---------------------------------------------------------------- */

function LogView({ trades, onSelectTrade }) {
  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    const list = [...trades].reverse();
    if (!filter.trim()) return list;
    const f = filter.trim().toLowerCase();
    return list.filter((t) => t.symbol.toLowerCase().includes(f) || (t.tags || "").toLowerCase().includes(f));
  }, [trades, filter]);

  return (
    <div>
      <div className="tj-field" style={{ maxWidth: 280, marginBottom: 16 }}>
        <input placeholder="Filter by symbol or tag…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <div className="tj-card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <div className="tj-empty">
            <div className="tj-empty-title">Nothing here</div>
            {trades.length ? "No trades match that filter." : "Log your first trade to build your history."}
          </div>
        ) : (
          filtered.map((t) => (
            <div className="tj-trade-row" key={t.id} onClick={() => onSelectTrade(t)}>
              <span className="tj-date-cell">{t.date}</span>
              <div>
                <div className="tj-sym">{t.symbol}</div>
                <span className={`tj-dir ${t.direction === "Long" ? "tj-dir-long" : "tj-dir-short"}`}>{t.direction}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span className="tj-rr-badge" style={{ textAlign: "left" }}>{t.rr != null ? `1:${t.rr}` : ""}</span>
                <span style={{ fontSize: 10.5, color: "var(--text-faint)" }}>{t.tags}</span>
              </div>
              <span className="tj-pnl" style={{ color: t.pnl >= 0 ? "var(--green)" : "var(--red)" }}>{fmtMoney(t.pnl)}</span>
              <span className={`tj-thumb-dot ${t.image ? "has" : ""}`} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Custom trading tabs                                              */
/* ---------------------------------------------------------------- */

function AddTabModal({ onClose, onCreate }) {
  const now = new Date();
  const [label, setLabel] = useState("");
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());

  const defaultLabel = `${MONTH_NAMES[month]} ${year}`;

  const handleCreate = () => {
    onCreate({
      id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: label.trim() || defaultLabel,
      month: Number(month),
      year: Number(year),
    });
  };

  return (
    <div className="tj-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tj-modal tj-add-tab-modal">
        <div className="tj-modal-title">
          <span>New Trading Tab</span>
          <button className="tj-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="tj-row2">
          <div className="tj-field">
            <label>Month</label>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
          </div>
          <div className="tj-field">
            <label>Year</label>
            <input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
        </div>

        <div className="tj-field">
          <label>Tab name</label>
          <input placeholder={defaultLabel} value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>

        <div className="tj-modal-actions">
          <div />
          <div className="tj-modal-actions-right">
            <button className="tj-btn-secondary" onClick={onClose}>Cancel</button>
            <button className="tj-btn-primary" onClick={handleCreate}>Create Tab</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabView({ tab, trades, onSelectTrade }) {
  const tabTrades = useMemo(
    () => trades.filter((t) => {
      const d = parseISO(t.date);
      return d.getFullYear() === tab.year && d.getMonth() === tab.month;
    }),
    [trades, tab]
  );
  const s = computeStats(tabTrades);
  return (
    <div>
      <div className="tj-tab-header">
        <div>
          <div className="tj-tab-header-title">{tab.label}</div>
          <div className="tj-tab-header-sub">{MONTH_NAMES[tab.month]} {tab.year} · pinned tab</div>
        </div>
        <PnlText value={s.totalPnl} size={20} />
      </div>
      <CalendarView
        key={tab.id}
        trades={tabTrades}
        onSelectTrade={onSelectTrade}
        initialCursor={new Date(tab.year, tab.month, 1)}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Root App                                                          */
/* ---------------------------------------------------------------- */

export default function App() {
  const [trades, setTrades] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("dashboard");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const [detailTrade, setDetailTrade] = useState(null);
  const [customTabs, setCustomTabs] = useState([]);
  const [addTabOpen, setAddTabOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const [t, tabs] = await Promise.all([loadAllTrades(), loadCustomTabs()]);
      setTrades(t);
      setCustomTabs(tabs);
      setLoaded(true);
    })();
  }, []);

  const handleCreateTab = useCallback(async (tab) => {
    setCustomTabs((prev) => {
      const next = [...prev, tab];
      persistCustomTabs(next);
      return next;
    });
    setAddTabOpen(false);
    setView(tab.id);
  }, []);

  const handleRemoveTab = useCallback((id, e) => {
    e.stopPropagation();
    setCustomTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      persistCustomTabs(next);
      return next;
    });
    setView((v) => (v === id ? "dashboard" : v));
  }, []);

  const handleSave = useCallback(async (trade) => {
    setTrades((prev) => {
      const exists = prev.some((t) => t.id === trade.id);
      const next = exists ? prev.map((t) => (t.id === trade.id ? trade : t)) : [...prev, trade];
      return next.sort((a, b) => a.date.localeCompare(b.date));
    });
    await persistTrade(trade);
    const idsRes = await window.storage.get(IDS_KEY, false).catch(() => null);
    const ids = idsRes ? JSON.parse(idsRes.value) : [];
    if (!ids.includes(trade.id)) {
      ids.push(trade.id);
      await persistIds(ids);
    }
    setModalOpen(false);
    setEditingTrade(null);
    setDetailTrade(null);
  }, []);

  const handleDelete = useCallback(async (id) => {
    setTrades((prev) => prev.filter((t) => t.id !== id));
    await removeTrade(id);
    const idsRes = await window.storage.get(IDS_KEY, false).catch(() => null);
    const ids = idsRes ? JSON.parse(idsRes.value).filter((x) => x !== id) : [];
    await persistIds(ids);
    setModalOpen(false);
    setEditingTrade(null);
    setDetailTrade(null);
  }, []);

  const stats = computeStats(trades);
  const streakInfo = useMemo(() => {
    if (!trades.length) return "—";
    const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
    let streak = 1;
    let dir = sorted[sorted.length - 1].pnl >= 0 ? "W" : "L";
    for (let i = sorted.length - 2; i >= 0; i--) {
      const isWin = sorted[i].pnl >= 0;
      if ((dir === "W" && isWin) || (dir === "L" && !isWin)) streak++;
      else break;
    }
    return `${dir}${streak}`;
  }, [trades]);

  return (
    <div className="tj-root">
      <style>{STYLES}</style>

      <div className="tj-ticker">
        <div className="tj-ticker-track">
          {[0, 1].map((k) => (
            <React.Fragment key={k}>
              <span className="tj-ticker-item">NET P&amp;L <b className={stats.totalPnl >= 0 ? "tj-up" : "tj-down"}>{fmtMoney(stats.totalPnl)}</b></span>
              <span className="tj-ticker-item">WIN RATE <b>{stats.count ? stats.winRate.toFixed(0) + "%" : "—"}</b></span>
              <span className="tj-ticker-item">TRADES <b>{stats.count}</b></span>
              <span className="tj-ticker-item">STREAK <b className={streakInfo.startsWith("W") ? "tj-up" : "tj-down"}>{streakInfo}</b></span>
              <span className="tj-ticker-item">PROFIT FACTOR <b>{stats.count ? (stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)) : "—"}</b></span>
              <span className="tj-ticker-item">BEST <b className="tj-up">{stats.best ? fmtMoney(stats.best.pnl) : "—"}</b></span>
              <span className="tj-ticker-item">WORST <b className="tj-down">{stats.worst ? fmtMoney(stats.worst.pnl) : "—"}</b></span>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="tj-header">
        <div className="tj-brand">
          <span className="tj-brand-mark" />
          <span className="tj-brand-name">TRADEDESK</span>
          <span className="tj-brand-sub">journal</span>
        </div>
        <div className="tj-nav">
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>Dashboard</button>
          <button className={view === "calendar" ? "active" : ""} onClick={() => setView("calendar")}>Calendar</button>
          <button className={view === "log" ? "active" : ""} onClick={() => setView("log")}>Log</button>
          {customTabs.length > 0 && <div className="tj-nav-divider" />}
          {customTabs.map((tab) => (
            <button
              key={tab.id}
              className={`tj-tab-pill ${view === tab.id ? "active" : ""}`}
              onClick={() => setView(tab.id)}
            >
              {tab.label}
              <span className="tj-tab-close" onClick={(e) => handleRemoveTab(tab.id, e)}>×</span>
            </button>
          ))}
          <button className="tj-tab-add" title="Open a new trading tab" onClick={() => setAddTabOpen(true)}>+</button>
        </div>
        <button className="tj-btn-primary" onClick={() => { setEditingTrade(null); setModalOpen(true); }}>+ New Trade</button>
      </div>

      <div className="tj-main">
        {!loaded ? (
          <div className="tj-empty">Loading your journal…</div>
        ) : view === "dashboard" ? (
          <DashboardView trades={trades} onSelectTrade={setDetailTrade} />
        ) : view === "calendar" ? (
          <CalendarView trades={trades} onSelectTrade={setDetailTrade} />
        ) : view === "log" ? (
          <LogView trades={trades} onSelectTrade={setDetailTrade} />
        ) : (
          (() => {
            const tab = customTabs.find((t) => t.id === view);
            return tab ? (
              <TabView tab={tab} trades={trades} onSelectTrade={setDetailTrade} />
            ) : (
              <DashboardView trades={trades} onSelectTrade={setDetailTrade} />
            );
          })()
        )}
      </div>

      {addTabOpen && (
        <AddTabModal onClose={() => setAddTabOpen(false)} onCreate={handleCreateTab} />
      )}

      {modalOpen && (
        <TradeModal
          initial={editingTrade}
          onClose={() => { setModalOpen(false); setEditingTrade(null); }}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}

      {detailTrade && !modalOpen && (
        <TradeDetailModal
          trade={detailTrade}
          onClose={() => setDetailTrade(null)}
          onEdit={(t) => { setEditingTrade(t); setModalOpen(true); }}
        />
      )}
    </div>
  );
}
