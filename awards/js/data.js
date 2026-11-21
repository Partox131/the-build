// ─────────────────────────────────────────────────────────────
//  The Game Awards 2026 — categories, nominees and point values.
//  Edit points here. Nominee ids are derived from names, so avoid
//  renaming nominees once friends have started picking.
// ─────────────────────────────────────────────────────────────

export const EVENT = {
  title: "The Game Awards 2026",
  short: "TGA 2026",
  dateLabel: "Dec 10, 2026",
  // Default lock time (used until the admin saves one). 22:00 UTC = 5pm Toronto / 2pm LA.
  // Confirm the show's official start time and adjust it from the admin page.
  defaultLockAt: "2026-12-10T22:00:00Z",
  tiebreak: {
    question: "How many awards will Grand Theft Auto VI win tonight?",
    hint: "It's up for 8. Closest guess breaks any tie.",
    max: 8,
  },
};

const slug = (s) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
   .replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// n: "Game" or ["Name", "context line"]
const cat = (name, points, nominees) => ({
  id: slug(name),
  name,
  points,
  nominees: nominees.map((n) =>
    Array.isArray(n)
      ? { id: slug(n[0] + " " + n[1]), name: n[0], sub: n[1] }
      : { id: slug(n), name: n }
  ),
});

export const CATEGORIES = [
  // ★ 5 points
  cat("Game of the Year", 5, [
    "007 First Light", "Control Resonant", "Grand Theft Auto VI",
    "The Legend of Zelda: Ocarina of Time", "Phantom Blade Zero", "Resident Evil Requiem",
  ]),

  // ★ 3 points — the headline craft awards
  cat("Best Game Direction", 3, [
    "Control Resonant", "Grand Theft Auto VI", "Phantom Blade Zero", "Pragmata", "Resident Evil Requiem",
  ]),
  cat("Best Narrative", 3, [
    "007 First Light", "The Blood of Dawnwalker", "Control Resonant", "Grand Theft Auto VI", "Resident Evil Requiem",
  ]),
  cat("Best Art Direction", 3, [
    "Control Resonant", "Grand Theft Auto VI", "Mouse: P.I. for Hire",
    "The Legend of Zelda: Ocarina of Time", "Phantom Blade Zero",
  ]),
  cat("Best Performance", 3, [
    ["Angela Sant'Albano", "Resident Evil Requiem"],
    ["Liam McIntyre", "Marvel's Wolverine"],
    ["Manni L. Perez", "Grand Theft Auto VI"],
    ["Patrick Gibson", "007 First Light"],
    ["Rahul Kohli", "Saros"],
  ]),
  cat("Best Score and Music", 3, [
    "Ace Combat 8: Wings of Theve", "Grand Theft Auto VI", "Mixtape",
    "The Legend of Zelda: Ocarina of Time", "Phantom Blade Zero",
  ]),
  cat("Best Action / Adventure", 3, [
    "007 First Light", "Control Resonant", "Grand Theft Auto VI", "Pragmata",
    "Resident Evil Requiem", "The Legend of Zelda: Ocarina of Time",
  ]),
  cat("Best Independent Game", 3, [
    "Big Walk", "Cairn", "Denshattack!", "Mewgenics", "Mina the Hollower",
  ]),

  // ★ 2 points — genre awards & crowd favourites
  cat("Most Anticipated Game", 2, [
    "Fable", "Final Fantasy VII Revelation", "God of War Laufey", "Resident Evil Veronica", "The Witcher IV",
  ]),
  cat("Best Action Game", 2, [
    "Ace Combat 8: Wings of Theve", "Gears of War: E-Day", "Onimusha: Way of the Sword", "Phantom Blade Zero", "Saros",
  ]),
  cat("Best Role-Playing Game", 2, [
    "The Blood of Dawnwalker", "Final Fantasy Resonance", "Fire Emblem: Fortune's Weave",
    "Monster Hunter Stories 3: Twisted Reflection", "Trails in the Sky 2nd Chapter",
  ]),
  cat("Best Multiplayer", 2, [
    "Big Walk", "Call of Duty: Modern Warfare 4", "Gears of War: E-Day", "Marathon", "Meccha Chameleon", "Orbitals",
  ]),
  cat("Best Ongoing Game", 2, [
    "ARC Raiders", "Final Fantasy XIV", "Fortnite", "No Man's Sky", "The Witcher 3: Wild Hunt",
  ]),
  cat("Best Debut Indie Game", 2, [
    "Dressmaker", "Esoteric Ebb", "Orbitals", "Replaced", "Silver Pines",
  ]),
  cat("Best Fighting Game", 2, [
    "2XKO", "Avatar Legends: The Fighting Game", "Invincible VS",
    "Marvel Tōkon: Fighting Souls", "My Hero Academia: All's Justice",
  ]),
  cat("Best Family Game", 2, [
    "Big Walk", "LEGO Batman: Legacy of the Dark Knight", "Nintendo Switch Sports Resort",
    "Pokémon Pokopia", "Yoshi and the Mysterious Book",
  ]),
  cat("Best Sim / Strategy Game", 2, [
    "Mewgenics", "Planet Zoo 2", "Pokémon Pokopia", "Slay the Spire 2", "Star Wars Zero Company",
  ]),
  cat("Best Sports / Racing Game", 2, [
    "EA Sports FC 27", "Forza Horizon 6", "Nintendo Switch Sports Resort", "Screamer", "Star Wars: Galactic Racer",
  ]),
  cat("Best Audio Design", 2, [
    "Ace Combat 8: Wings of Theve", "Control Resonant", "Grand Theft Auto VI",
    "Resident Evil Requiem", "Star Wars: Galactic Racer",
  ]),
  cat("Best Adaptation", 2, [
    "Cyberpunk: Edgerunners 2", "Fallout (Season 2)", "Mortal Kombat II", "Resident Evil", "The Super Mario Galaxy Movie",
  ]),
  cat("Content Creator of the Year", 2, [
    "CDawg", "Cellbit", "iShowSpeed", "LilSimsie", "OhnePixel",
  ]),

  // ★ 1 point — the deep cuts
  cat("Best Community Support", 1, [
    "Crimson Desert", "Helldivers 2", "No Man's Sky", "The Witcher 3: Wild Hunt", "Warframe",
  ]),
  cat("Games for Impact", 1, [
    "Big Walk", "Cairn", "Forever Ago", "Life is Strange: Reunion", "Lily's World XD", "Mixtape",
  ]),
  cat("Innovation in Accessibility", 1, [
    "Assassin's Creed Black Flag Resynced", "Forza Horizon 6", "Gears of War: E-Day",
    "Marvel's Wolverine", "Rhythm Heaven Groove",
  ]),
  cat("Best Mobile Game", 1, [
    "Arknights: Endfield", "Monster Hunter Outlanders", "Neverness to Everness", "Pokémon Champions", "Where Winds Meet",
  ]),
  cat("Best VR / AR Game", 1, [
    "Forefront", "Into the Radius 2", "Little Nightmares VR: Altered Echoes",
    "Teenage Mutant Ninja Turtles: Empire City", "Thief VR: Legacy of Shadow",
  ]),
  cat("Best User Creation", 1, [
    ["A Dream of Silence: Revamped", "for Baldur's Gate III"],
    ["Create Aeronautics", "for Minecraft"],
    ["Nopixel V", "for Grand Theft Auto Online"],
    ["Star Wars Droid Tycoon", "for Fortnite"],
    ["TTK", "for Roblox"],
  ]),
  cat("Best Esports Game", 1, [
    "Counter-Strike 2", "Dota 2", "League of Legends", "Mobile Legends: Bang Bang", "Valorant",
  ]),
  cat("Best Esports Athlete", 1, [
    ["Chovy", "Gen.G"], ["Donk", "Team Spirit"], ["Erde", "LOUD"], ["Yatoro", "Team Spirit"], ["ZywOo", "Team Vitality"],
  ]),
  cat("Best Esports Team", 1, [
    ["Gen.G", "League of Legends"], ["LOUD", "Valorant"], ["Team Falcons", "Counter-Strike 2"],
    ["Team Falcons", "Rocket League"], ["Team Spirit", "Dota 2"], ["Team Vitality", "Counter-Strike 2"],
  ]),
];

export const CAT_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const MAX_POINTS = CATEGORIES.reduce((s, c) => s + c.points, 0);

export function nomineeName(catId, nomId) {
  const n = CAT_BY_ID[catId]?.nominees.find((x) => x.id === nomId);
  return n ? n.name : "";
}

export { slug };
