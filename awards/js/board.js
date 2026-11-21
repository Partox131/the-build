import { getStore } from "./store.js";
import { EVENT, CATEGORIES, CAT_BY_ID, MAX_POINTS } from "./data.js";
import { $, esc, fmtLock, countdown, phase, demoBanner, tick } from "./common.js";
import { standings, pickSplit } from "./scoring.js";

let store;
let config = { lockAt: Date.parse(EVENT.defaultLockAt), tiebreakAnswer: null, exists: false };
let results = {}, players = [], ballots = null;
let unwatchBallots = null;
let prevPoints = null;          // id → points at last render (for "+N" pops)
let lastLatest = null;
let lastPhase = null;

const nomOf = (catId, nomId) => CAT_BY_ID[catId]?.nominees.find((n) => n.id === nomId);

(async function boot() {
  store = await getStore();
  demoBanner(store);
  store.watchConfig((c) => { config = c; render(); });
  store.watchResults((r) => { results = r; render(); });
  store.watchPlayers((p) => { players = p; render(); });
  tick(() => {
    const ph = phase(config, results);
    if (ph !== lastPhase) render();
    const cd = $("#cd");
    if (cd) cd.textContent = countdown(config.lockAt - Date.now());
  });
})();

function watchBallots() {
  if (unwatchBallots) return;
  unwatchBallots = store.watchBallots(
    (b) => { ballots = b; render(); },
    () => { unwatchBallots = null; setTimeout(watchBallots, 10000); } // server clock may lag a few seconds
  );
}

function render() {
  const ph = phase(config, results);
  lastPhase = ph;
  if (ph !== "open") watchBallots();

  const pill = $("#pill");
  pill.className = `pill ${ph}`;
  pill.textContent = ph === "open" ? "Picks open" : ph === "live" ? "Live" : "Final";

  const awardedCats = CATEGORIES.filter((c) => results[c.id]);
  const left = CATEGORIES.length - awardedCats.length;
  $("#meter").innerHTML = ph === "open"
    ? `<b>${players.length}</b> player${players.length === 1 ? "" : "s"} in`
    : `<b>${awardedCats.length}</b>/${CATEGORIES.length} awarded · <b>${left}</b> to go`;

  if (ph === "open" || !ballots) renderPreLock(ph);
  else renderLive(ph, awardedCats);
}

/* ───────── before lock: who's in ───────── */
function renderPreLock(ph) {
  const lb = $("#lb");
  const rows = [...players].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  lb.innerHTML = rows.length ? rows.map((p) => {
    const done = p.count >= CATEGORIES.length;
    return `
      <div class="lb-row" data-id="${esc(p.id)}">
        <i class="fill" style="width:${(p.count / CATEGORIES.length) * 100}%"></i>
        <div class="rk">${done ? "✓" : "…"}</div>
        <div><div class="nm">${esc(p.name)}</div>
          <div class="sub">${done ? "Ballot complete" : `${p.count}/${CATEGORIES.length} picked`}</div></div>
        <div class="sc" style="font-size:clamp(14px,1.2vw,18px);color:var(--muted)">picks hidden</div>
      </div>`;
  }).join("") : `<div class="lb-empty">Nobody's in yet. Share the ballot link!</div>`;

  const url = new URL("index.html", location.href).href;
  $("#side").innerHTML = ph === "open" ? `
    <div class="card countdown-big">
      <span class="eyebrow">Picks lock in</span>
      <div class="t" id="cd">${countdown(config.lockAt - Date.now())}</div>
      <p class="note">${esc(fmtLock(config.lockAt))}</p>
    </div>
    <div class="card">
      <span class="eyebrow">Make your picks</span>
      <p style="font-size:clamp(15px,1.3vw,20px);word-break:break-all;margin:10px 0 0"><a href="${esc(url)}">${esc(url.replace(/^https?:\/\//, "").replace(/index\.html$/, ""))}</a></p>
      <p class="note">${CATEGORIES.length} categories · up to ${MAX_POINTS} points · Game of the Year is worth 5.</p>
    </div>` : `
    <div class="card countdown-big"><span class="eyebrow">Picks locked</span>
      <div class="t" style="font-size:clamp(24px,2.4vw,36px)">Revealing ballots…</div></div>`;
  prevPoints = null;
  lastLatest = null;
}

/* ───────── after lock: live standings ───────── */
function renderLive(ph, awardedCats) {
  const lb = $("#lb");
  const { rows } = standings(players, ballots, results, config);
  const awardedPts = awardedCats.reduce((s, c) => s + c.points, 0);

  // FLIP: remember where rows were
  const before = new Map([...lb.querySelectorAll(".lb-row")].map((el) => [el.dataset.id, el.getBoundingClientRect().top]));

  lb.innerHTML = rows.length ? rows.map((r) => {
    const gain = prevPoints && prevPoints[r.id] != null && r.points > prevPoints[r.id] ? r.points - prevPoints[r.id] : 0;
    const cls = ["lb-row", r.rank <= 3 && r.points > 0 ? `r${r.rank}` : "", ph === "live" && !r.alive && awardedCats.length ? "out" : "", gain ? "flash" : ""].join(" ");
    const tb = config.tiebreakAnswer != null && r.tiebreak != null ? ` · tiebreak ${r.tiebreak}` : "";
    return `
      <div class="${cls}" data-id="${esc(r.id)}">
        <i class="fill" style="width:${awardedPts ? (r.points / awardedPts) * 100 : 0}%"></i>
        <div class="rk">${r.rank}</div>
        <div><div class="nm">${esc(r.name)}</div>
          <div class="sub">${r.correct}/${awardedCats.length} correct${tb}</div></div>
        <div class="sc">${r.points}<small>pts</small></div>
        ${gain ? `<span class="gain">+${gain}</span>` : ""}
      </div>`;
  }).join("") : `<div class="lb-empty">No players joined.</div>`;

  for (const el of lb.querySelectorAll(".lb-row")) {
    const old = before.get(el.dataset.id);
    if (old == null) continue;
    const dy = old - el.getBoundingClientRect().top;
    if (Math.abs(dy) > 1) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }],
      { duration: 800, easing: "cubic-bezier(.2,.8,.2,1)" });
  }
  prevPoints = Object.fromEntries(rows.map((r) => [r.id, r.points]));

  renderSide(ph, rows, awardedCats);
}

function renderSide(ph, rows, awardedCats) {
  const side = $("#side");
  const byTime = awardedCats
    .map((c) => ({ c, r: results[c.id] }))
    .sort((a, b) => b.r.at - a.r.at);
  const nameOf = Object.fromEntries(players.map((p) => [p.id, p.name]));

  let html = "";
  if (ph === "final" && rows.length) {
    const champs = rows.filter((r) => r.rank === 1);
    html += `
      <div class="card latest pop" style="border-color:#7a6022;background:linear-gradient(180deg,#2a2210,var(--bg-2))">
        <span class="eyebrow" style="color:var(--gold)">♛ Champion${champs.length > 1 ? "s" : ""}</span>
        <p class="win" style="margin-top:12px">${champs.map((c) => esc(c.name)).join(" & ")}
          <small>${champs[0].points} points · ${champs[0].correct}/${CATEGORIES.length} correct</small></p>
      </div>`;
  }

  const latest = byTime[0];
  if (latest) {
    const key = `${latest.c.id}:${latest.r.winner}`;
    const isNew = lastLatest !== null && key !== lastLatest;
    lastLatest = key;
    const n = nomOf(latest.c.id, latest.r.winner);
    const callers = (pickSplit(latest.c.id, ballots)[latest.r.winner] || []).map((id) => nameOf[id]).filter(Boolean);
    html += `
      <div class="card latest${isNew ? " pop" : ""}">
        <span class="eyebrow">Just announced · ${latest.c.points} pt${latest.c.points > 1 ? "s" : ""}</span>
        <h2>${esc(latest.c.name)}</h2>
        <p class="win">${esc(n?.name || "?")}${n?.sub ? `<small>${esc(n.sub)}</small>` : ""}</p>
        <div class="callers">${callers.length
          ? `<b>${callers.length}</b> of ${rows.length} called it: ${callers.map(esc).join(", ")}`
          : `Nobody called it 😬`}</div>
      </div>`;
  } else {
    html += `<div class="card countdown-big"><span class="eyebrow">Ballots are locked</span>
      <div class="t" style="font-size:clamp(24px,2.4vw,36px)">Waiting for the first award…</div></div>`;
  }

  if (byTime.length > 1) {
    html += `<div class="card recent"><h3>Earlier tonight</h3><ol>
      ${byTime.slice(1, 8).map(({ c, r }) => `<li><span>${esc(c.name)}</span><b>${esc(nomOf(c.id, r.winner)?.name || "?")}</b></li>`).join("")}
    </ol></div>`;
  }
  side.innerHTML = html;
}
