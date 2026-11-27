import { CATEGORIES } from "./data.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export const TIERS = [
  { points: 5, title: "The Big One" },
  { points: 3, title: "Headliners" },
  { points: 2, title: "Genre & Fan Favourites" },
  { points: 1, title: "Deep Cuts" },
];

export function fmtLock(ms) {
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export function countdown(ms) {
  let s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

// "open" → picks editable; "live" → locked, awards in progress; "final" → every category awarded
export function phase(config, results) {
  if (Date.now() < config.lockAt) return "open";
  return CATEGORIES.every((c) => results[c.id]) ? "final" : "live";
}

export function demoBanner(store) {
  if (store.mode !== "demo" && store.mode !== "preview") return;
  const b = document.createElement("div");
  b.className = "demo-banner";
  b.innerHTML = store.mode === "preview"
    ? `<strong>Preview</strong> — fake players and results, nothing is saved. <span id="pv-status"></span>
       <button type="button" id="pv-next">Next award</button>
       <button type="button" id="pv-pause">Pause</button>
       <a href="${esc(location.pathname)}?preview">Restart</a>
       <a href="${esc(location.pathname)}">Exit preview</a>`
    : `<strong>Demo mode</strong> — data lives in this browser only. Add your Firebase config in <code>js/config.js</code> to go live.`;
  document.body.prepend(b);
}

// Re-render on an interval (for countdowns); returns stop fn
export function tick(fn, ms = 1000) {
  fn();
  const t = setInterval(fn, ms);
  return () => clearInterval(t);
}
