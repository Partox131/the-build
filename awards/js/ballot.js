import { getStore, StoreError } from "./store.js";
import { EVENT, CATEGORIES, MAX_POINTS } from "./data.js";
import { $, $$, esc, TIERS, fmtLock, countdown, demoBanner, tick } from "./common.js";
import { standings } from "./scoring.js";

const app = $("#app");
const TOTAL = CATEGORIES.length;

let store;
let config = { lockAt: Date.parse(EVENT.defaultLockAt), tiebreakAnswer: null, exists: false };
let results = {};
let players = [];
let allBallots = null;          // only readable after lock
let unwatchBallots = null;
let me = null;                  // { ballotId }
let ballot = { picks: {}, tiebreak: null };
let saveTimer = null, inflight = null, pending = false;
let renderedOpen = null;

const isOpen = () => Date.now() < config.lockAt;
const myName = () => players.find((p) => p.id === me?.ballotId)?.name || "";

/* ───────── boot ───────── */
(async function boot() {
  $("#legend").innerHTML = TIERS.map((t) =>
    `<span class="pts" data-p="${t.points}">${t.points} pt${t.points > 1 ? "s" : ""} · ${esc(t.title)}</span>`).join("")
    + `<span class="pts">Max ${MAX_POINTS} pts</span>`;

  try {
    store = await getStore();
  } catch (e) {
    app.innerHTML = `<div class="card join"><p class="err">Couldn't connect. Check your internet and reload.</p></div>`;
    throw e;
  }
  demoBanner(store);

  store.watchConfig((c) => { config = c; maybeRerender(true); });
  store.watchResults((r) => { results = r; if (me && !isOpen()) render(); });
  store.watchPlayers((p) => { players = p; const n = $("#who-name"); if (n) n.textContent = myName(); if (me && !isOpen()) renderSummary(); });

  tick(() => { updateLockLine(); maybeRerender(false); });

  const s = await store.session().catch(() => null);
  if (s) enter(s.ballotId); else renderJoin();
})();

function updateLockLine() {
  const el = $("#lockline");
  if (isOpen()) {
    el.innerHTML = `Picks lock <strong>${esc(fmtLock(config.lockAt))}</strong> · in ${countdown(config.lockAt - Date.now())}`;
  } else {
    el.innerHTML = `<strong>Picks are locked.</strong> Results update live as awards are given.`;
  }
}

function maybeRerender(force) {
  const open = isOpen();
  if (open === renderedOpen && !force) return;
  if (!open) watchAllBallots();
  if (me) render();
  else if (renderedOpen !== null && open !== renderedOpen) renderJoin();
  renderedOpen = open;
}

function watchAllBallots() {
  if (unwatchBallots) return;
  unwatchBallots = store.watchBallots(
    (b) => { allBallots = b; if (me) renderSummary(); },
    () => { unwatchBallots = null; setTimeout(() => !isOpen() && watchAllBallots(), 10000); } // clock skew: retry
  );
}

/* ───────── join ───────── */
function renderJoin() {
  me = null;
  const open = isOpen();
  app.innerHTML = `
    <form class="card join" id="join" autocomplete="off">
      <h2>${open ? "Make your picks" : "Look up your picks"}</h2>
      <p class="note">${open
        ? "New here? Enter your name and choose any 4-digit PIN. Use the same name and PIN to come back and change your picks — on any device — until they lock."
        : "Picks are locked. Enter your name and PIN to see how your ballot is doing."}</p>
      <div class="field"><label for="name">Your name</label>
        <input class="input" id="name" maxlength="24" required placeholder="e.g. Sam" autocapitalize="words"></div>
      <div class="field"><label for="pin">4-digit PIN</label>
        <input class="input pin" id="pin" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required placeholder="••••"></div>
      <p class="err" id="err"></p>
      <button class="btn" style="width:100%" id="go">${open ? "Start picking →" : "Show my ballot →"}</button>
    </form>`;
  const form = $("#join");
  $("#pin").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#go"); btn.disabled = true; $("#err").textContent = "";
    try {
      const { ballotId } = await store.join($("#name").value, $("#pin").value);
      await enter(ballotId);
    } catch (err) {
      $("#err").textContent = err instanceof StoreError ? err.message : "Something went wrong — try again.";
      if (!(err instanceof StoreError)) console.error(err);
      btn.disabled = false;
    }
  });
}

async function enter(ballotId) {
  me = { ballotId };
  try { ballot = await store.getBallot(ballotId); }
  catch { ballot = { picks: {}, tiebreak: null }; }
  renderedOpen = isOpen();
  if (!renderedOpen) watchAllBallots();
  render();
}

/* ───────── ballot ───────── */
function render() {
  const open = isOpen();
  const y = scrollY;
  const count = Object.keys(ballot.picks).length;

  app.innerHTML = `
    <div class="bar">
      <div class="bar-row">
        <span class="who">Hi, <span id="who-name">${esc(myName())}</span>
          <small id="count">${open ? `${count}/${TOTAL} picked` : "Locked"}</small></span>
        <span class="spacer"></span>
        ${open ? `<button class="btn ghost small" id="next" type="button">Next unpicked ↓</button>` : `<a class="btn ghost small" href="board.html">Scoreboard</a>`}
        <span class="status" id="status"></span>
        <button class="btn ghost small" id="leave" type="button" title="Switch player">Not you?</button>
      </div>
      ${open ? `<div class="progress"><i id="prog" style="width:${(count / TOTAL) * 100}%"></i></div>` : ""}
    </div>
    <div id="summary"></div>
    ${TIERS.map((t) => tierHTML(t, open)).join("")}
    ${tiebreakHTML(open)}
    ${open ? `<p class="note" style="text-align:center;margin-top:24px">Picks save automatically. You can change them until they lock.</p>` : ""}
  `;
  renderSummary();
  scrollTo(0, y);

  $("#leave").onclick = async () => { await flush(); await store.leave(); renderJoin(); scrollTo(0, 0); };
  const next = $("#next");
  if (next) next.onclick = () => {
    const c = CATEGORIES.find((c) => !ballot.picks[c.id]);
    if (c) $(`#cat-${c.id}`).scrollIntoView({ behavior: "smooth", block: "start" });
    else $("#tiebreak").scrollIntoView({ behavior: "smooth", block: "center" });
  };
  if (open) bindInputs();
}

function tierHTML(t, open) {
  const cats = CATEGORIES.filter((c) => c.points === t.points);
  if (!cats.length) return "";
  return `
    <div class="tier"><h2>${esc(t.title)}</h2><span class="rule"></span>
      <span class="pts" data-p="${t.points}">${t.points} pt${t.points > 1 ? "s" : ""} each</span></div>
    ${cats.map((c) => catHTML(c, open)).join("")}`;
}

function catHTML(c, open) {
  const mine = ballot.picks[c.id];
  const res = results[c.id];
  let verdict = "";
  if (!open) {
    if (!res) verdict = `<span class="verdict wait">Waiting…</span>`;
    else if (mine === res.winner) verdict = `<span class="verdict good">+${c.points} ✓</span>`;
    else verdict = `<span class="verdict bad">${mine ? "✗ Missed" : "No pick"}</span>`;
  }
  const cls = ["card", "cat", c.points === 5 ? "goty" : "", open && !mine ? "unpicked" : ""].join(" ");
  return `
    <section class="${cls}" id="cat-${c.id}">
      <div class="cat-head"><h3>${esc(c.name)}</h3>
        <div style="display:flex;gap:10px;align-items:center">${verdict}
        <span class="pts" data-p="${c.points}">${c.points} pt${c.points > 1 ? "s" : ""}</span></div></div>
      <div class="noms">
        ${c.nominees.map((n) => {
          const won = res && res.winner === n.id;
          const missed = res && mine === n.id && !won;
          const id = `n-${c.id}-${n.id}`;
          return `<div class="nom${won ? " winner" : ""}${missed ? " missed" : ""}">
            <input type="radio" id="${id}" name="c:${c.id}" value="${n.id}"${mine === n.id ? " checked" : ""}${open ? "" : " disabled"}>
            <label for="${id}"><span class="dot"></span><span class="txt">${esc(n.name)}${n.sub ? `<small>${esc(n.sub)}</small>` : ""}</span></label>
          </div>`;
        }).join("")}
      </div>
    </section>`;
}

function tiebreakHTML(open) {
  const v = ballot.tiebreak;
  const ans = config.tiebreakAnswer;
  return `
    <section class="card cat tiebreak" id="tiebreak" style="margin-top:36px">
      <div class="cat-head"><h3>Tiebreaker</h3><span class="pts">0 pts</span></div>
      <p style="margin:0">${esc(EVENT.tiebreak.question)}</p>
      <p class="note" style="margin:4px 0 0">${esc(EVENT.tiebreak.hint)}</p>
      <div class="stepper">
        ${open ? `<button class="btn ghost" type="button" data-step="-1" aria-label="Less">−</button>` : ""}
        <input class="input" id="tb" inputmode="numeric" value="${v ?? ""}" placeholder="?" ${open ? "" : "disabled"} aria-label="Your guess">
        ${open ? `<button class="btn ghost" type="button" data-step="1" aria-label="More">+</button>` : ""}
        ${!open && ans != null ? `<span class="note">Answer: <b style="color:var(--text)">${ans}</b></span>` : ""}
      </div>
    </section>`;
}

function renderSummary() {
  const box = $("#summary");
  if (!box || isOpen() || !me) { if (box) box.innerHTML = ""; return; }
  const ballots = allBallots || { [me.ballotId]: ballot };
  const list = allBallots ? players : players.filter((p) => p.id === me.ballotId);
  const { rows, awarded } = standings(list, ballots, results, config);
  const r = rows.find((x) => x.id === me.ballotId);
  if (!r) { box.innerHTML = ""; return; }
  box.innerHTML = `
    <div class="card summary">
      <div><b>${r.points}</b><span>Points</span></div>
      <div><b>${allBallots ? `#${r.rank}` : "–"}</b><span>of ${allBallots ? rows.length : "?"} players</span></div>
      <div><b>${r.correct}/${awarded}</b><span>Correct so far</span></div>
    </div>`;
}

/* ───────── editing & saving ───────── */
app.addEventListener("change", onPick);

function bindInputs() {
  const tb = $("#tb");
  tb.addEventListener("input", () => setTiebreak(tb.value));
  $$("[data-step]").forEach((b) => b.addEventListener("click", () => {
    setTiebreak(String((ballot.tiebreak ?? 0) + Number(b.dataset.step)));
    tb.value = ballot.tiebreak ?? "";
  }));
}

function onPick(e) {
  const t = e.target;
  if (!t.name?.startsWith("c:") || !isOpen()) return;
  const catId = t.name.slice(2);
  ballot.picks[catId] = t.value;
  $(`#cat-${catId}`)?.classList.remove("unpicked");
  const count = Object.keys(ballot.picks).length;
  $("#count").textContent = `${count}/${TOTAL} picked`;
  $("#prog").style.width = `${(count / TOTAL) * 100}%`;
  queueSave();
}

function setTiebreak(raw) {
  const digits = String(raw).replace(/\D/g, "");
  ballot.tiebreak = digits === "" ? null : Math.max(0, Math.min(EVENT.tiebreak.max, parseInt(digits, 10)));
  queueSave();
}

function status(text, cls = "") {
  const s = $("#status");
  if (s) { s.textContent = text; s.className = `status ${cls}`; }
}

function queueSave() {
  pending = true;
  status("Saving…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 450);
}

async function doSave() {
  if (inflight) { await inflight.catch(() => {}); }
  if (!pending || !me) return;
  pending = false;
  const snapshot = structuredClone(ballot);
  inflight = store.saveBallot(me.ballotId, snapshot);
  try {
    await inflight;
    if (!pending) status("Saved ✓", "ok");
  } catch (e) {
    if (e instanceof StoreError && e.code === "locked") { status("Locked", "bad"); render(); }
    else { console.error(e); pending = true; status("Retrying…", "bad"); saveTimer = setTimeout(doSave, 3000); }
  } finally {
    inflight = null;
  }
}

async function flush() {
  clearTimeout(saveTimer);
  if (pending) await doSave();
  else if (inflight) await inflight.catch(() => {});
}

addEventListener("beforeunload", (e) => {
  if (pending || inflight) { doSave(); e.preventDefault(); e.returnValue = ""; }
});
