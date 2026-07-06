// Read-only economy runway estimate. Mirrors XP constants from
// src/lib/economy/rating.ts (multipliers, dailyQualityXp) and levels.ts
// (baseXp = score + coins*2, xpNeeded = 100 * level, so level 1..35 ~= 59500 xp).
// If those change, update here by hand.

const playerTypes = [
  { name: 'casual', runsPerDay: 4, avgScore: 55, avgCoins: 6, rating: 'good' },
  { name: 'active', runsPerDay: 10, avgScore: 110, avgCoins: 14, rating: 'great' },
  { name: 'skilled', runsPerDay: 15, avgScore: 240, avgCoins: 25, rating: 'elite' },
  { name: 'master', runsPerDay: 20, avgScore: 330, avgCoins: 34, rating: 'master' },
];

const multipliers = { good: 1.05, great: 1.12, elite: 1.2, master: 1.28 };
const dailyBonus = { good: 25, great: 50, elite: 100, master: 150 };

for (const player of playerTypes) {
  const baseRunXp = Math.round((player.avgScore + player.avgCoins * 2) * multipliers[player.rating]);
  const dailyXp = baseRunXp * player.runsPerDay + dailyBonus[player.rating];
  const daysToLevel35Approx = Math.ceil(59500 / dailyXp);
  console.log(JSON.stringify({ ...player, baseRunXp, dailyXp, daysToLevel35Approx }));
}
