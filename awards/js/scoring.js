import { CATEGORIES } from "./data.js";

const FAR = 1e9;

// Rank players. Ties on points are broken by closest tiebreak guess once the host enters the answer.
export function standings(players, ballots, results, config) {
  const ans = config.tiebreakAnswer;
  const awarded = CATEGORIES.filter((c) => results[c.id]);
  const remaining = CATEGORIES.filter((c) => !results[c.id]).reduce((s, c) => s + c.points, 0);

  const rows = players.map((p) => {
    const b = ballots?.[p.id];
    let points = 0, correct = 0, potential = 0;
    if (b) {
      for (const c of CATEGORIES) {
        const pick = b.picks[c.id];
        const r = results[c.id];
        if (r) { if (pick === r.winner) { points += c.points; correct++; } }
        else if (pick) potential += c.points;
      }
    }
    const tiebreak = b?.tiebreak ?? null;
    const dist = ans != null && tiebreak != null ? Math.abs(tiebreak - ans) : null;
    return { ...p, points, correct, tiebreak, dist, potential: points + potential, hasBallot: !!b };
  });

  rows.sort((a, b) =>
    b.points - a.points || (a.dist ?? FAR) - (b.dist ?? FAR) || a.name.localeCompare(b.name));

  let rank = 0;
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    const tied = prev && prev.points === r.points && (ans == null || (prev.dist ?? FAR) === (r.dist ?? FAR));
    if (!tied) rank = i + 1;
    r.rank = rank;
  });

  const lead = rows[0]?.points ?? 0;
  rows.forEach((r) => { r.alive = r.potential >= lead; });

  return { rows, awarded: awarded.length, remaining };
}

// Who picked what in one category: { nomineeId: [playerId…] }
export function pickSplit(catId, ballots) {
  const out = {};
  for (const [pid, b] of Object.entries(ballots || {})) {
    const n = b.picks?.[catId];
    if (n) (out[n] ||= []).push(pid);
  }
  return out;
}
