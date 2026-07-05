const scores = [0, 40, 80, 100, 150, 250, 300, 450, 650];

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
  const rush = Math.min(base * 1.4, 150);
  const siren = 330;
  console.log(JSON.stringify({ score, stage: stage(score), baseSpeed: Math.round(base), rushSpeed: Math.round(rush), sirenSpeed: siren }));
}
