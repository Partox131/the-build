// Data layer. Two interchangeable backends with the same API:
//   • live  — Firebase (Firestore + Auth), used when config.js has an apiKey
//   • demo  — localStorage in this browser only (synced across tabs)
//
// Normalized shapes handed to pages:
//   config   { lockAt: ms, tiebreakAnswer: number|null, exists: bool }
//   players  [{ id, name, count }]
//   ballots  { [id]: { picks: {catId: nomineeId}, tiebreak: number|null } }
//   results  { [catId]: { winner: nomineeId, at: ms } }

import { FIREBASE_CONFIG } from "./config.js";
import { EVENT, CATEGORIES, slug } from "./data.js";

const DEFAULT_LOCK = Date.parse(EVENT.defaultLockAt);
export const nameToId = (name) => slug(name).slice(0, 32);

// ?preview → in-memory fake show (fake players, half the awards given), never touches Firebase.
export const PREVIEW = new URLSearchParams(location.search).has("preview");

let storePromise;
export function getStore() {
  if (!storePromise) {
    storePromise = PREVIEW ? Promise.resolve(demoStore({ memory: makePreviewState() }))
      : FIREBASE_CONFIG.apiKey ? liveStore() : Promise.resolve(demoStore());
  }
  return storePromise;
}

const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

function makePreviewState() {
  const names = ["Alex", "Jordan", "Sam", "Priya", "Marco", "Lena", "Kai", "Noor"];
  const players = {}, ballots = {}, secrets = {}, results = {};
  for (const name of names) {
    const id = nameToId(name), picks = {};
    for (const c of CATEGORIES) picks[c.id] = pickOne(c.nominees).id;
    players[id] = { name, count: CATEGORIES.length };
    ballots[id] = { picks, tiebreak: Math.floor(Math.random() * (EVENT.tiebreak.max + 1)) };
    secrets[id] = "0000";
  }
  // About 40% of the show done, given 4 minutes apart. Game of the Year always comes last.
  const pool = CATEGORIES.filter((c) => c.points < 5).sort(() => Math.random() - 0.5).slice(0, 12);
  const now = Date.now();
  pool.forEach((c, i) => { results[c.id] = { winner: pickOne(c.nominees).id, at: now - (pool.length - i) * 240000 }; });
  return { config: { lockAt: now - 2 * 3600000, tiebreakAnswer: null }, players, ballots, secrets, results };
}

export class StoreError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/* ───────────────────────── DEMO (localStorage) ───────────────────────── */

function demoStore({ memory } = {}) {
  const KEY = "tga-pool-demo-v1";
  const ME = "tga-pool-demo-me";
  const fresh = () => ({
    config: { lockAt: DEFAULT_LOCK, tiebreakAnswer: null },
    players: {}, ballots: {}, secrets: {}, results: {},
  });
  const load = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch { return fresh(); }
  };
  let state = memory || load();
  const subs = new Set();
  const emit = () => subs.forEach((f) => f());
  const save = () => {
    if (!memory) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }
    emit();
  };
  if (!memory) addEventListener("storage", (e) => { if (e.key === KEY) { state = load(); emit(); } });
  const watch = (select, cb) => {
    const f = () => cb(structuredClone(select()));
    subs.add(f);
    queueMicrotask(f);
    return () => subs.delete(f);
  };
  const isOpen = () => Date.now() < state.config.lockAt;
  const getMe = () => { try { return localStorage.getItem(ME); } catch { return null; } };
  const setMe = (v) => { try { v ? localStorage.setItem(ME, v) : localStorage.removeItem(ME); } catch {} };

  const store = {
    mode: memory ? "preview" : "demo",
    // preview only: announce the next award (random category, random winner; GOTY saved for last)
    previewNext() {
      const left = CATEGORIES.filter((c) => !state.results[c.id]);
      if (!left.length) return false;
      const c = left.find((x) => x.points < 5) ? pickOne(left.filter((x) => x.points < 5)) : left[0];
      state.results[c.id] = { winner: pickOne(c.nominees).id, at: Date.now() };
      if (left.length === 1) state.config.tiebreakAnswer = Math.floor(Math.random() * 4);
      save();
      return true;
    },
    async session() {
      const id = getMe();
      return id && state.players[id] ? { ballotId: id } : null;
    },
    async join(name, pin) {
      name = name.trim();
      const id = nameToId(name);
      if (!id) throw new StoreError("bad-name", "Enter a name.");
      if (!/^\d{4}$/.test(pin)) throw new StoreError("bad-pin", "PIN must be 4 digits.");
      const existing = state.players[id];
      if (existing) {
        if (state.secrets[id] !== pin) throw new StoreError("wrong-pin", `"${existing.name}" is taken and that PIN doesn't match.`);
      } else {
        if (!isOpen()) throw new StoreError("locked", "Picks are locked — no new players.");
        state.players[id] = { name, count: 0 };
        state.secrets[id] = pin;
        state.ballots[id] = { picks: {}, tiebreak: null };
        save();
      }
      setMe(id);
      return { ballotId: id, isNew: !existing };
    },
    async leave() { setMe(null); },
    async getBallot(id) { return structuredClone(state.ballots[id] || { picks: {}, tiebreak: null }); },
    async saveBallot(id, { picks, tiebreak }) {
      if (!isOpen()) throw new StoreError("locked", "Picks are locked.");
      state.ballots[id] = { picks, tiebreak };
      state.players[id].count = Object.keys(picks).length;
      save();
    },
    watchConfig: (cb) => watch(() => ({ ...state.config, exists: true }), cb),
    watchPlayers: (cb) => watch(() => Object.entries(state.players).map(([id, p]) => ({ id, ...p })), cb),
    watchResults: (cb) => watch(() => state.results, cb),
    watchBallots: (cb) => watch(() => state.ballots, cb),

    admin: {
      async onChange(cb) { cb({ signedIn: true, isAdmin: true, uid: "demo" }); },
      async signIn() {}, async signOut() {},
      async setConfig(patch) { Object.assign(state.config, patch); save(); },
      async setResult(catId, winner) {
        if (winner) state.results[catId] = { winner, at: Date.now() };
        else delete state.results[catId];
        save();
      },
      async setPin(id, pin) { state.secrets[id] = pin; save(); },
      async removePlayer(id) {
        delete state.players[id]; delete state.ballots[id]; delete state.secrets[id]; save();
      },
      // demo-only helpers
      async seedPlayers(names) {
        for (const name of names) {
          const id = nameToId(name);
          if (state.players[id]) continue;
          const picks = {};
          for (const c of CATEGORIES) if (Math.random() < 0.95)
            picks[c.id] = c.nominees[Math.floor(Math.random() * c.nominees.length)].id;
          state.players[id] = { name, count: Object.keys(picks).length };
          state.secrets[id] = "0000";
          state.ballots[id] = { picks, tiebreak: Math.floor(Math.random() * (EVENT.tiebreak.max + 1)) };
        }
        save();
      },
      async resetDemo() { state = fresh(); setMe(null); save(); },
    },
  };
  return store;
}

/* ───────────────────────── LIVE (Firebase) ───────────────────────── */

async function liveStore() {
  const V = "11.0.2";
  const base = `https://www.gstatic.com/firebasejs/${V}`;
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`),
  ]);
  const app = initializeApp(FIREBASE_CONFIG);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  const d = (...p) => F.doc(db, ...p);

  const authReady = new Promise((res) => { const off = A.onAuthStateChanged(auth, (u) => { off(); res(u); }); });
  async function ensureUser() {
    await authReady;
    if (auth.currentUser) return auth.currentUser;
    return (await A.signInAnonymously(auth)).user;
  }
  const denied = (e) => e && (e.code === "permission-denied" || e.code === "firestore/permission-denied");

  let lastConfig = { lockAt: DEFAULT_LOCK, tiebreakAnswer: null, exists: false };
  const normConfig = (snap) => {
    if (!snap.exists()) return { lockAt: DEFAULT_LOCK, tiebreakAnswer: null, exists: false };
    const c = snap.data();
    return { lockAt: c.lockAt?.toMillis?.() ?? DEFAULT_LOCK, tiebreakAnswer: c.tiebreakAnswer ?? null, exists: true };
  };

  const store = {
    mode: "live",
    async session() {
      const u = await authReady;
      if (!u) return null;
      const s = await F.getDoc(d("claims", u.uid)).catch(() => null);
      return s && s.exists() ? { ballotId: s.data().ballotId } : null;
    },
    async join(name, pin) {
      name = name.trim();
      const id = nameToId(name);
      if (!id) throw new StoreError("bad-name", "Enter a name.");
      if (name.length > 24) throw new StoreError("bad-name", "Keep your name under 24 characters.");
      if (!/^\d{4}$/.test(pin)) throw new StoreError("bad-pin", "PIN must be 4 digits.");
      const u = await ensureUser();
      const pSnap = await F.getDoc(d("players", id));
      const batch = F.writeBatch(db);
      const isNew = !pSnap.exists();
      if (isNew) {
        const cfg = normConfig(await F.getDoc(d("config", "event")));
        if (!cfg.exists) throw new StoreError("not-ready", "The host hasn't opened picks yet.");
        if (Date.now() >= cfg.lockAt) throw new StoreError("locked", "Picks are locked — no new players.");
        batch.set(d("secrets", id), { pin });
        batch.set(d("claims", u.uid), { ballotId: id, pin });
        batch.set(d("players", id), { name, count: 0, createdAt: F.serverTimestamp() });
        batch.set(d("ballots", id), { picks: {}, tiebreak: null, updatedAt: F.serverTimestamp() });
      } else {
        batch.set(d("claims", u.uid), { ballotId: id, pin });
      }
      try {
        await batch.commit();
      } catch (e) {
        if (denied(e)) throw new StoreError(isNew ? "denied" : "wrong-pin",
          isNew ? "Couldn't create your ballot (picks may be locked)." : `"${pSnap.data().name}" is taken and that PIN doesn't match.`);
        throw e;
      }
      return { ballotId: id, isNew };
    },
    async leave() {
      const u = auth.currentUser;
      if (u) await F.deleteDoc(d("claims", u.uid)).catch(() => {});
    },
    async getBallot(id) {
      const s = await F.getDoc(d("ballots", id));
      const b = s.exists() ? s.data() : {};
      return { picks: b.picks || {}, tiebreak: b.tiebreak ?? null };
    },
    async saveBallot(id, { picks, tiebreak }) {
      const batch = F.writeBatch(db);
      batch.update(d("ballots", id), { picks, tiebreak, updatedAt: F.serverTimestamp() });
      batch.update(d("players", id), { count: Object.keys(picks).length });
      try { await batch.commit(); }
      catch (e) { if (denied(e)) throw new StoreError("locked", "Picks are locked."); throw e; }
    },
    watchConfig(cb) {
      return F.onSnapshot(d("config", "event"), (s) => { lastConfig = normConfig(s); cb(lastConfig); }, () => cb(lastConfig));
    },
    watchPlayers(cb) {
      return F.onSnapshot(F.collection(db, "players"),
        (qs) => cb(qs.docs.map((x) => ({ id: x.id, name: x.data().name, count: x.data().count || 0 }))));
    },
    watchResults(cb) {
      return F.onSnapshot(F.collection(db, "results"), (qs) => {
        const r = {};
        qs.docs.forEach((x) => { r[x.id] = { winner: x.data().winner, at: x.data().at?.toMillis?.() ?? Date.now() }; });
        cb(r);
      });
    },
    // Readable by everyone only after lock (or by the admin any time).
    watchBallots(cb, onError) {
      return F.onSnapshot(F.collection(db, "ballots"), (qs) => {
        const b = {};
        qs.docs.forEach((x) => { b[x.id] = { picks: x.data().picks || {}, tiebreak: x.data().tiebreak ?? null }; });
        cb(b);
      }, (e) => onError && onError(e));
    },

    admin: {
      async onChange(cb) {
        A.onAuthStateChanged(auth, async (u) => {
          if (!u || u.isAnonymous) return cb({ signedIn: false });
          const s = await F.getDoc(d("admins", u.uid)).catch(() => null);
          const isAdmin = !!(s && s.exists());
          if (isAdmin) {
            const c = await F.getDoc(d("config", "event"));
            if (!c.exists()) await F.setDoc(d("config", "event"), { lockAt: F.Timestamp.fromMillis(DEFAULT_LOCK), tiebreakAnswer: null });
          }
          cb({ signedIn: true, isAdmin, uid: u.uid, email: u.email });
        });
      },
      async signIn() { await A.signInWithPopup(auth, new A.GoogleAuthProvider()); },
      async signOut() { await A.signOut(auth); },
      async setConfig(patch) {
        const p = { ...patch };
        if ("lockAt" in p) p.lockAt = F.Timestamp.fromMillis(p.lockAt);
        await F.setDoc(d("config", "event"), p, { merge: true });
      },
      async setResult(catId, winner) {
        if (winner) await F.setDoc(d("results", catId), { winner, at: F.serverTimestamp() });
        else await F.deleteDoc(d("results", catId));
      },
      async setPin(id, pin) { await F.setDoc(d("secrets", id), { pin }); },
      async removePlayer(id) {
        const batch = F.writeBatch(db);
        batch.delete(d("players", id)); batch.delete(d("ballots", id)); batch.delete(d("secrets", id));
        await batch.commit();
      },
    },
  };
  return store;
}
