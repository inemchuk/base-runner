# Onchain Badges, Localization, Squads — Design (2026-07-20)

Decisions (Ivan, 2026-07-20): badges mint free (paymaster gas), localization
v1 = EN + RU, squads designed now but built after badges + localization.

## 1. Onchain achievement badges (build now)

Onchain layer over career milestones — no new contract, no new mint flow.
`BaseRunnerItems` (ERC-1155) already prevents double-claims per
(address, tokenId); `/api/nft/sign` already signs
`keccak(address, tokenId, chainId)`; `useNftMint` already mints with
paymaster. Badges are new token ids + a server eligibility branch + profile
UI.

### Badge set v1 (revised per Ivan 2026-07-20): 10 categories x 8 tiers

Reuse the existing career-medal categories (already server-authoritative via
quest state updated in score/submit) + 5 new categories. Tapping a medal in
the profile opens a modal listing its 8 tiers, each mintable when reached.

Token ids 30–109, allocated 8 per category in order:

| Category (itemId prefix) | tokenIds | Server progress source | Tier targets |
|---|---|---|---|
| badge_rows_N | 30–37 | quest `rows.progress` | 100,300,700,1400,2400,4000,7000,12000 |
| badge_coins_N | 38–45 | quest `coins.progress` | 40,120,300,600,1000,1800,3000,5000 |
| badge_games_N | 46–53 | quest `games.progress` | 5,15,35,70,120,200,350,600 |
| badge_record_N | 54–61 | quest `record.progress` | 20,40,80,150,250,400,600,900 |
| badge_elite_N | 62–69 | quest `elite_runs.progress` | 1,3,7,15,30,50,80,120 |
| badge_checkins_N | 70–77 | `economy_checkin.total` | 3,7,15,30,60,100,180,300 |
| badge_streak_N | 78–85 | max(streak, bestStreak) | 3,7,14,21,30,45,60,100 |
| badge_level_N | 86–93 | `levels.level` | 5,10,15,20,25,30,40,50 |
| badge_collection_N | 94–101 | shop owned + trailPacks count | 2,4,6,8,10,12,14,16 |
| badge_txs_N | 102–109 | `game_tx:{addr}` counter | 5,15,30,60,100,200,350,600 |

(N = tier 1..8.)

Supporting changes:
- `economy_checkin` gains `bestStreak` (updated on check-in claim); until it
  accumulates, streak badges use the current streak.
- `/api/referral/tx` now increments a global `game_tx:{addr}` counter for
  EVERY verified reported game tx (not only referral referees) — powers the
  Onchain Txs badge track and future stats; dedupe by hash unchanged.
- Quest-tier rewards (coins/fragments) stay in the quests system untouched;
  minting is a separate, free, purely-onchain layer over the same tiers.

### Server

- `src/lib/badges.ts`: definitions + `getBadgeState(address)` returning
  per-badge `{eligible, claimed}`; claimed read from the contract
  (`claimed(user, tokenId)` multicall via existing viem client).
- `/api/nft/sign`: `badge_*` branch validates the milestone from Redis
  instead of shop ownership. Signature flow unchanged.
- `GET /api/nft/badges?address=` — powers the profile UI.

### Client

- Profile career block: badge grid (9 tiles) with states locked (grey +
  requirement), claimable (glow + MINT button), minted (checkmark). Mint
  goes through the existing `window.__NFT_MINT(itemId)` bridge and the
  `nft-minted` event refreshes the grid.
- Every mint is a sponsored game transaction: counts in Base metrics and in
  the referral tx counter automatically (NFT contract already whitelisted).

### Metadata & art

`public/nft/{30..38}.json` following the existing schema; images
`public/nft/images/badge_*.svg` — clean generated SVG art v1, swappable for
Ivan's art later by overwriting files (URLs stay stable).

## 2. Localization EN + RU (build now)

`game.js` has hundreds of hardcoded strings; full extraction at once is
high-risk. Incremental approach:

- `public/game/i18n.js` (new script, loaded before game.js): `window.I18N`
  dictionaries + `window.t(key, vars?)` helper + `I18N.apply()` that
  translates all `[data-i18n]` DOM nodes. Missing key → English fallback.
- Language pick: `localStorage.lang` if set, else `navigator.language`
  startsWith 'ru' → ru, else en. Settings screen gets a "Language" row
  cycling EN → RU; change applies immediately (re-run `I18N.apply()` +
  re-render dynamic UI), no reload.
- v1 coverage: static chrome via `data-i18n` on Game.tsx markup (menu,
  banners, loadout, settings, check-in, spin, shop tabs, referral screen)
  + the highest-traffic dynamic strings in game.js (run complete labels,
  countdown GO text stays visual). Quest/economy item names from config
  stay English in v1 (phase 2).
- New strings added later must go through `t()` — noted in CLAUDE.md.

## 3. Squads (design approved, build later)

Teams up to 5, weekly competition, crate rewards.

- Create: any player, name (2–20 chars, basic filter) + auto code
  (referral-style). Join via `?squad=CODE` link or code entry. One squad per
  wallet; leave anytime; creator can kick; empty squad garbage-collected.
- Scoring: weekly squad score = **sum of top-3 members' weekly bests** from
  the existing `scores:week:*` zsets (anti-cheat already applied). Small
  squads stay competitive; 3+ active members encouraged.
- Server: `squad:{id}` hash (name, code, creator, members),
  `squad_member:{addr} -> id`, weekly zset `squad_lb:{week}` updated on each
  member's score submit (cheap: <=5 zscore + zadd). Routes:
  `/api/squad/{create,join,leave,kick,status,leaderboard}`.
- UI: 4th tab "Squads" in LEADERS + squad detail screen (members with
  weekly contribution, invite button, join/create flow). No new nav tab.
- Weekly rewards: cron on week rollover grants crates to top-3 squads'
  members (epic/rare/gear) through the existing reward-bundle pipeline;
  push notification "your squad finished #2".
- Push hooks: "squad slipped to #4", "teammate set a new best" (later).
- Synergy: squad invite links reuse the referral capture flow; a new-wallet
  squad joiner can also be a referral.
