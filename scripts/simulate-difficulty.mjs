// Read-only difficulty simulator. Mirrors constants from public/game/game.js:
// getDifficulty() (speed curve 60->100 over score 0-250, rush = min(base*1.4, 150))
// and updateSirenEvent() (siren = min(|lane.speed| * 2.0, 330)).
// If getDifficulty() is retuned, update this file by hand — nothing enforces it.

const scores = [0, 40, 80, 100, 150, 250, 300, 450, 650];

// Max per-lane speed variance a siren lane can carry (rush lanes: carSpeedVar 10).
const RUSH_SPEED_VAR = 10;

function smoothProgress(score, start, end) {
  const t = Math.max(0, Math.min(1, (score - start) / (end - start)));
  return t * (2 - t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function stage(score) {
  if (score < 40) return 'onboarding';
  if (score < 100) return 'baseline';
  if (score < 150) return 'transition';
  if (score < 300) return 'skill';
  return 'mastery';
}

for (const score of scores) {
  const p = smoothProgress(score, 0, 250);
  const base = lerp(60, 100, p);
  // Rush cap 150 is a future-guard: base*1.4 maxes at 140 with the current curve.
  const rush = Math.min(base * 1.4, 150);
  // Fastest possible siren: doubled top rush lane speed, capped at 330 (also a
  // future-guard — with the current curve the observed max is ~300).
  const sirenMax = Math.min((rush + RUSH_SPEED_VAR) * 2.0, 330);
  console.log(JSON.stringify({
    score,
    stage: stage(score),
    baseSpeed: Math.round(base),
    rushSpeed: Math.round(rush),
    sirenSpeedMax: Math.round(sirenMax),
  }));
}
