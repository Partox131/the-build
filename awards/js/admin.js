import { getStore } from "./store.js";
import { EVENT, CATEGORIES, CAT_BY_ID } from "./data.js";
import { $, $$, esc, fmtLock, countdown, phase, demoBanner, tick } from "./common.js";
import { standings, pickSplit } from "./scoring.js";

const app = $("#app");
let store;
let config = { lockAt: Date.parse(EVENT.defaultLockAt), tiebreakAnswer: null, exists: false };
let results = {}, players = [], ballots = {};
let started = false;
let filter = { q: "", hideDone: false };

const SAMPLE_NAMES = ["Alex", "Jordan", "Sam", "Priya", "Marco", "Lena", "Kai"];

(async function boot() {
  store = await getStore();
  demoBanner(store);
  store.admin.onChange((s) => {
    if (!s.signedIn) return renderSignIn();
    if (!s.isAdmin) return renderNotAdmin(s);
    startAdmin();
  });
})();

function renderSignIn() {
  app.innerHTML = `
    <div class="card join">
      <h2>Host sign-in</h2>
      <p class="note">Only the host can enter winners. Sign in with the Google account you registered as admin.</p>
      <p class="err" id="err"></p>
      <button class="btn" style="width:100%" id="si">Sign in with Google</button>
    </div>`;
  $("#si").onclick = async () => {
    try { await store.admin.signIn(); }
    catch (e) { $("#err").textContent = e.message || "Sign-in failed."; }
  };
}

function renderNotAdmin(s) {
  app.innerHTML = `
    <div class="card join">
      <h2>Not an admin yet</h2>
      <p class="note">You're signed in${s.email ? ` as <b>${esc(s.email)}</b>` : ""}, but this account isn't registered as host.
      In the Firebase console → Firestore → create collection <code>admins</code> with a document whose ID is:</p>
      <p><code style="user-select:all;font-size:14px">${esc(s.uid)}</code></p>
      <p class="note">(no fields needed — add any field like <code>ok = true</code> if the console insists), then reload this page.</p>
      <button class="btn ghost" id="so">Sign out</button>
    </div>`;
  $("#so").onclick = () => store.admin.signOut();
}

function startAdmin() {
  if (started) return;
  started = true;
  app.innerHTML = `
    <div class="admin-grid">
      <div class="card" id="settings"></div>
      <div class="card">
        <div class="cat-head"><h3>Awards</h3><span class="note" id="progress"></span></div>
        <div class="tools">
          <input class="input" id="q" type="search" placeholder="Find category… (e.g. narrative)">
          <label class="note" style="display:flex;gap:6px;align-items:center;cursor:pointer">
            <input type="checkbox" id="hide"> Hide awarded</label>
        </div>
        <p class="note" style="margin:6px 0 12px">Tap the winner as it's announced. Tap it again to undo. Numbers show how many players picked each nominee.</p>
      </div>
      <div class="admin-grid" id="awards"></div>
      <div class="card" id="players"></div>
      ${store.mode === "demo" ? `<div class="card" id="demo"></div>` : ""}
      <p class="footer-links"><a href="index.html">Ballot</a> · <a href="board.html" target="_blank">Scoreboard ↗</a>
        ${store.mode === "live" ? ` · <a href="#" id="signout">Sign out</a>` : ""}</p>
    </div>`;

  $("#q").addEventListener("input", (e) => { filter.q = e.target.value.trim().toLowerCase(); renderAwards(); });
  $("#hide").addEventListener("change", (e) => { filter.hideDone = e.target.checked; renderAwards(); });
  $("#awards").addEventListener("click", onAwardClick);
  $("#signout")?.addEventListener("click", (e) => { e.preventDefault(); store.admin.signOut().then(() => location.reload()); });
  if (store.mode === "demo") renderDemo();

  store.watchConfig((c) => { config = c; renderSettings(); renderPlayers(); });
  store.watchResults((r) => { results = r; renderAwards(); renderPlayers(); renderSettings(); });
  store.watchPlayers((p) => { players = p; renderPlayers(); renderAwards(); });
  store.watchBallots((b) => { ballots = b; renderPlayers(); renderAwards(); }, (e) => console.warn("ballots", e));
  tick(renderPhaseChip);
}

/* ───────── settings ───────── */
const toLocalInput = (ms) => {
  const d = new Date(ms);
  return new Date(ms - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

// Count of awards won so far by the tiebreak subject (GTA VI) — handy for entering the answer.
function trackedTiebreak() {
  let n = 0;
  for (const [catId, r] of Object.entries(results)) {
    const nom = CAT_BY_ID[catId]?.nominees.find((x) => x.id === r.winner);
    if (nom && /grand theft auto vi$/i.test(nom.sub || nom.name)) n++;
  }
  return n;
}

function renderSettings() {
  const el = $("#settings");
  const a = document.activeElement;
  if (!el || (a?.tagName === "INPUT" && el.contains(a))) return; // don't clobber typing
  const tracked = trackedTiebreak();
  el.innerHTML = `
    <div class="cat-head"><h3>Settings</h3><span class="chip" id="phase"></span></div>
    <div class="row">
      <div class="field"><label for="lock">Picks lock at (your local time)</label>
        <input class="input" type="datetime-local" id="lock" value="${toLocalInput(config.lockAt)}"></div>
      <button class="btn small" id="saveLock">Save</button>
      <button class="btn ghost small" id="lockNow">Lock now</button>
    </div>
    <p class="note" id="lockInfo" style="margin:8px 0 18px"></p>
    <div class="row">
      <div class="field"><label for="tb">Tiebreak answer — ${esc(EVENT.tiebreak.question)}</label>
        <input class="input" id="tb" inputmode="numeric" value="${config.tiebreakAnswer ?? ""}" placeholder="Enter at the end of the show"></div>
      <button class="btn small" id="saveTb">Save</button>
      <button class="btn ghost small" id="useTracked" title="Count from winners entered so far">Use tracked (${tracked})</button>
    </div>`;
  $("#saveLock").onclick = async () => {
    const v = $("#lock").value;
    const ms = v ? new Date(v).getTime() : NaN;
    if (Number.isNaN(ms)) return alert("Pick a date and time.");
    await store.admin.setConfig({ lockAt: ms });
    flash("Lock time saved");
  };
  $("#lockNow").onclick = async () => {
    if (!confirm("Lock picks right now? Nobody will be able to change their ballot.")) return;
    await store.admin.setConfig({ lockAt: Date.now() });
    flash("Picks locked");
  };
  const saveTb = async (val) => {
    const n = val === "" ? null : parseInt(val, 10);
    if (n !== null && Number.isNaN(n)) return alert("Enter a whole number.");
    await store.admin.setConfig({ tiebreakAnswer: n });
    flash("Tiebreak answer saved");
  };
  $("#saveTb").onclick = () => saveTb($("#tb").value.trim());
  $("#useTracked").onclick = () => saveTb(String(trackedTiebreak()));
  renderPhaseChip();
}

function renderPhaseChip() {
  const chip = $("#phase"), info = $("#lockInfo");
  if (!chip) return;
  const ph = phase(config, results);
  chip.className = `chip ${ph}`;
  chip.textContent = ph === "open" ? "Picks open" : ph === "live" ? "Locked · Live" : "Final";
  if (info) info.textContent = ph === "open"
    ? `Locks ${fmtLock(config.lockAt)} — in ${countdown(config.lockAt - Date.now())}. Friends can join and edit until then.`
    : `Locked since ${fmtLock(config.lockAt)}. Ballots are now visible on the scoreboard.`;
}

/* ───────── awards ───────── */
function renderAwards() {
  const box = $("#awards");
  if (!box) return;
  const done = CATEGORIES.filter((c) => results[c.id]).length;
  $("#progress").textContent = `${done}/${CATEGORIES.length} awarded`;
  const nameOf = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const cats = CATEGORIES.filter((c) =>
    (!filter.q || c.name.toLowerCase().includes(filter.q)) && !(filter.hideDone && results[c.id]));
  box.innerHTML = cats.map((c) => {
    const win = results[c.id]?.winner;
    const split = pickSplit(c.id, ballots);
    return `
      <section class="card acat${win ? " done" : ""}">
        <div class="cat-head"><h3>${esc(c.name)}</h3><span class="pts" data-p="${c.points}">${c.points} pt${c.points > 1 ? "s" : ""}</span></div>
        <div class="anoms">
          ${c.nominees.map((n) => {
            const who = (split[n.id] || []).map((id) => nameOf[id] || id);
            return `<button class="anom${win === n.id ? " on" : ""}" data-cat="${c.id}" data-nom="${n.id}"
              title="${esc(who.join(", ") || "Nobody picked this")}">
              ${win === n.id ? "🏆 " : ""}${esc(n.name)}${n.sub ? ` <span class="n">${esc(n.sub)}</span>` : ""}
              <span class="n">${who.length}</span></button>`;
          }).join("")}
        </div>
      </section>`;
  }).join("") || `<p class="note" style="text-align:center">No categories match.</p>`;
}

async function onAwardClick(e) {
  const b = e.target.closest(".anom");
  if (!b) return;
  const { cat, nom } = b.dataset;
  const current = results[cat]?.winner;
  b.disabled = true;
  try {
    await store.admin.setResult(cat, current === nom ? null : nom);
    flash(current === nom ? `Cleared ${CAT_BY_ID[cat].name}` : `🏆 ${CAT_BY_ID[cat].name}`);
  } catch (err) {
    console.error(err); alert("Couldn't save — check your connection.");
  } finally { b.disabled = false; }
}

/* ───────── players ───────── */
function renderPlayers() {
  const el = $("#players");
  if (!el) return;
  const { rows } = standings(players, ballots, results, config);
  el.innerHTML = `
    <div class="cat-head"><h3>Players (${rows.length})</h3></div>
    ${rows.length ? `<table class="players">
      <thead><tr><th>#</th><th>Name</th><th>Picks</th><th>Pts</th><th>Tiebreak</th><th></th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr><td>${r.rank}</td><td>${esc(r.name)}</td><td>${r.count}/${CATEGORIES.length}</td><td>${r.points}</td>
          <td>${r.tiebreak ?? "–"}</td>
          <td><button class="btn ghost small" data-pin="${r.id}">Reset PIN</button>
              <button class="btn danger small" data-rm="${r.id}">Remove</button></td></tr>`).join("")}
      </tbody></table>` : `<p class="note">Nobody has joined yet. Send friends the ballot link.</p>`}`;
  $$("[data-pin]", el).forEach((b) => b.onclick = async () => {
    const pin = prompt("New 4-digit PIN for this player:");
    if (pin == null) return;
    if (!/^\d{4}$/.test(pin)) return alert("PIN must be 4 digits.");
    await store.admin.setPin(b.dataset.pin, pin);
    flash("PIN updated");
  });
  $$("[data-rm]", el).forEach((b) => b.onclick = async () => {
    const p = players.find((x) => x.id === b.dataset.rm);
    if (!confirm(`Remove ${p?.name || "this player"} and their ballot? This can't be undone.`)) return;
    await store.admin.removePlayer(b.dataset.rm);
    flash("Player removed");
  });
}

/* ───────── demo tools ───────── */
function renderDemo() {
  $("#demo").innerHTML = `
    <div class="cat-head"><h3>Demo tools</h3></div>
    <p class="note" style="margin-top:0">Only shown in demo mode. Try: add sample players → Lock now → open the scoreboard in another tab → tap winners here.</p>
    <div class="tools"><button class="btn ghost small" id="seed">Add sample players</button>
      <button class="btn ghost small" id="reopen">Re-open picks (+1 day)</button>
      <button class="btn danger small" id="reset">Reset demo data</button></div>`;
  $("#seed").onclick = () => store.admin.seedPlayers(SAMPLE_NAMES);
  $("#reopen").onclick = () => store.admin.setConfig({ lockAt: Date.now() + 86400000 });
  $("#reset").onclick = () => confirm("Wipe all demo data?") && store.admin.resetDemo();
}

let toastT;
function flash(msg) {
  let t = $(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.append(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 1800);
}
