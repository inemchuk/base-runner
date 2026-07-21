@AGENTS.md

# Base Runner Project Map

Last updated: 2026-07-16.

Base Runner is a Base/Farcaster mini game. The playable game is a vanilla
canvas runner loaded by a Next.js app. React owns wallet/API/onchain bridges;
`public/game/game.js` owns most gameplay, UI state, shop, quests, spin, XP, and
canvas rendering.

## Critical Rules

- This is Next.js 16.2.0. Before writing Next.js code, read the relevant guide
  in `node_modules/next/dist/docs/`.
- Do not start the local dev server unless Ivan explicitly asks. Recent server
  starts can lag the Mac. User often checks via their own browser/screenshots.
- Do not deploy unless explicitly asked. Current work is local-only.
- Do not edit `.claude/*` unless explicitly asked.
- Do not revert dirty files you did not change. This repo often has active
  user/Codex edits.
- Be careful around onchain check-in, paymaster, NFT mint, and transaction
  hooks. Do not refactor these while doing gameplay/art/economy UI work.
- Keep gameplay fast on mobile. Avoid heavy per-frame DOM work, expensive blur,
  and repaint-heavy CSS animation in hot paths.
- Gameplay stays offchain. Onchain is for check-in, claims, ownership, seasons,
  receipts, and later verified rewards.

## Commands

- Dev: `npm run dev` (only when explicitly requested)
- Build: `npm run build`
- Lint: `npm run lint`
- Quick vanilla JS check: `node --check public/game/game.js`
- Whitespace check: `git diff --check`

## Tech Stack

- Next.js 16.2.0 App Router, React 19.2.4
- Tailwind CSS 4 through `@tailwindcss/postcss`
- wagmi 3, viem 2, `@base-org/account`, Coinbase OnchainKit
- Upstash Redis / Vercel KV style persistence through REST APIs
- Solidity contracts in `contracts/`

## Key Files

- `AGENTS.md`: required Next.js agent rule.
- `CLAUDE.md` / `claude.md`: same inode; this project map.
- `src/app/globals.css`: game shell and overlay CSS.
- `src/components/Game.tsx`: canvas shell, scripts, wallet/API bridges.
- `public/game/game.js`: main game engine and most game UI.
- `src/lib/economy/*`: economy config, levels, reward math.
- `public/game/*`: runtime assets.

## React/Bridge Notes

- React renders the shell and exposes `window.__BASE_*` bridges for wallet,
  leaderboard, coin sync/claim, shop sync, quest sync, spin, check-in, NFT mint.
- `useCheckIn` and `useNftMint` include paymaster/transaction paths. Treat them
  as sensitive; avoid touching during art/gameplay changes.

## Game Engine Sections

`public/game/game.js` is large and module-shaped:

- `save.js`: localStorage, best scores, coins, check-in fallback.
- `checkin.js`: onchain/local check-in UI adapter.
- `leaderboard.js`: personal/global/coins leaderboards.
- `sound.js`, `music.js`: SFX/music.
- `world.js`: rows, biomes, difficulty, cars, trains, logs, coins.
- `player.js`: movement, jump, score, pickups, shield/revive, death.
- `collision.js`: car, train, water/log collisions.
- `renderer.js`: canvas render loop, camera, weather, particles, vehicles,
  water/logs, trails, death effects, player drawing.
- `ui.js`: screens, score, game over, check-in, leaderboard, coin HUD.
- `shop.js`: skins, boosters, trails, death effects, NFT claim UI.
- `quests.js`: quest progress/rewards.
- `daily-spin.js`: wheel UI and prize application.
- `xp.js`: XP, levels, level rewards.

## Gameplay Notes

- Grid runner with 9 columns and generated rows.
- Row types include grass, road, water, train.
- Biomes rotate through default, desert, snow.
- Weather states include clear, rain, fog, storm, windy.
- Boosters are charges: magnet, double coins, second chance shield. In-run
  booster feedback exists (`UI.triggerRunBoosterFeedback`).
- Loadout exists and should become the strategic pre-run layer. It already
  shows "Today's goals" (daily quest summary) before the run.
- Score is max forward row reached. Player can never move below row 1
  (`Player.move` rejects `newRow < 1`), so rows <= 0 are visual-only.
- Tap during jump is buffered and applied on landing (`_bufferedMove`).
- Train rows have a warning flash + horn ~1.2s before each pass.
- Game over submits score, syncs coins, updates quests, and awards XP.
- Zoom exists around high score ranges to preserve reaction/readability.

## Run Start Presentation (added 2026-07-16)

- Start line: checkered strip + "START" ground paint on row 1
  (`drawStartLine` in renderer; pure ground paint, no collision).
- Runner camp on rows 0..-8: `START_CAMP_LAYOUT` in `world.js` section places
  tents/campfire/crates/flags/billboard. These rows are unreachable, so camp
  decorations never affect movement collision.
- Camp props load as sprites from `public/game/env/start-camp/*` via
  `_ENV_SPRITE_SRCS`; renderer keeps vector fallbacks (`drawTent`,
  `drawCampfire`, `drawCrate`, `drawCampFlag`, `drawBillboard`).
- Approved composition (2026-07-16): campfire row -2 center with stateless
  smoke + night emissive glow, billboard row -3 col 2, trampled path on
  col 4 rows 1..-1, camp decorations support `flip`/`scale` variants.
- Shadow rule for camp PNGs: shadow width must equal the sprite's opaque
  footprint measured from the alpha channel (not wider — objects look
  airborne), tucked with `shadowLift`; `noShadow: true` in `_ENV_SPRITE_CFG`
  exists for future sprites with baked-in shadows.
- Pending art from Ivan: bunting garland, lantern (night emissive),
  sleeping bag / backpack props for the campfire circle.
- 3-2-1-GO countdown: `RunCountdown` module near `initGame`. Starts only from
  `initGame` (not on continue/revive), locks movement via a gate at the top of
  `Player.move`, first input skips straight to GO, overlay drawn at the end of
  `Renderer.draw`. Tunables: `STEP_T`, `GO_T`.

## UI Gotchas

- Run-complete card (`#run-complete-result`) lives inside the flex column
  `#loadout-scroll` and has `overflow: hidden`, so it needs `flex-shrink: 0`
  or flex will crush it and clip RECORD/claim rows. Fixed 2026-07-16; keep the
  rule when restyling.
- Rows inside the run-complete card default to `display: none` in CSS; JS must
  set an explicit visible value (`'flex'`), not `''`, when showing them.
- RUN COMPLETE uses two-tier compact styling under `.loadout-run-complete`:
  comfortable base sizes (fits ~760px+ heights without scroll), plus an
  aggressive `@media (max-height: 700px)` tier for short screens. XP row sits
  right of RECORD (explicit grid-row 2 / column 2 in the result card).
- Hub screens with pending onchain claims use `.claim-action` styling; the
  RUN COMPLETE claim button is `#btn-claim-score` driven by
  `renderRunComplete` snapshot state (idle/claiming/confirming/claimed).
- Menu hero shows Best/Rank stats (`#menu-best`, `#menu-rank`); daily spin and
  check-in banners render as a compact two-column row.
- Quest groups show per-scope ready counters (`#quest-daily-ready` etc.);
  leaderboards have empty states with a PLAY NOW shortcut and highlight the
  current wallet's row.
- Daily spin wheel (reworked 2026-07-20): segment disc is pre-rendered into an
  offscreen cache (`_wheelCache` in `DailySpin`); anything changing segment
  visuals (icons loading, resize, DISPLAY_POOL colors) must set
  `_wheelCacheDirty = true`, not draw directly. Phases now include
  'celebrate' (winner highlight + confetti before the prize card) — busy
  checks must treat it like spinning. Peg ticks drive `Sound.spinTick` +
  pointer kick (DOM transform on `.spin-pointer`). Epic/legendary results
  toggle `spin-rays-epic`/`spin-rays-legendary` on `.spin-wheel-wrap`
  (CSS conic-gradient rays); cleared in `doSpin`/`show`. Keep the
  no-shadowBlur-in-RAF rule — glow only when static, in the cache build.

## API And Persistence

- Score/session, score leaderboard, coins sync/leaderboard, shop, quests, spin,
  NFT signing, and name/avatar resolution live in `src/app/api/*`.
- `coins/sync`, `shop`, and older quest paths are trust-heavy today. Be careful
  before treating client-written values as collectible authority.

## Contracts And Config

- `src/config/checkin-contract.ts`: deployed check-in contract + ABI.
- `src/config/spin-contract.ts`: spin contract + ABI.
- `src/config/nft-contract.ts`: ERC-1155 item id to token id mapping.
- `contracts/BaseRunnerCheckIn.sol`: daily UTC check-in.
- `contracts/BaseRunnerItems.sol`: ERC-1155 cosmetics/items.
- `contracts/BaseRunnerCoins.sol`, `BaseRunnerLeaderboard.sol`,
  `BaseRunnerSpin.sol`: ideas/events; Redis/server is current main path.
- Key env vars: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`,
  `ANTI_CHEAT_SECRET`, `NEXT_PUBLIC_PAYMASTER_URL`,
  `NEXT_PUBLIC_NFT_CONTRACT`, `NFT_SIGNER_KEY`.

## Economy State

- Economy design moved toward fragment-first cosmetics, richer check-in/spin,
  crates, level rewards, and coin sinks.
- Do not reset existing players' coins/shop/quest data. New schemas must
  migrate or preserve old local/server state.
- Onchain check-in/paymaster should not be touched during economy UI changes.
- Server authority for fragments/craft and full reward sources is still not
  fully done. Avoid deploying collectible fragments as client-trusted value.
- Legendary cosmetics should not be cheaply bypassed by direct coins; prefer
  fragment-only or milestone crate logic.
- Current open economy work: finish server-authoritative fragments/craft,
  reward containers, telemetry, daily chest/top-up details, and pacing tests.

## Difficulty Design State

- Goal: after speed cap/readability ceiling, difficulty grows through route
  composition, hazard archetypes, commitment, and limited relief, not infinite
  vehicle speed.
- Risk routes should feed coins/XP/quests indirectly, not direct fragments.
- Rating should initially be server-derived from score only; coin-aware rating
  can be cheated while session coins are only capped, not verified.
- Future generator work must coordinate existing siren timer and train spacing
  with any section-budget system to avoid double-spending danger.

## Current Art Direction

- Moving away from pixel art toward polished semi-realistic 2D arcade sprites.
- Keep the game model shape: front-facing chibi runner, same readable skeleton,
  not photorealistic and not 3D.
- Use chroma workflow for generated assets: flat `#00ff00` source, then
  `$HOME/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py`.
- Do not overwrite existing assets without approval; keep backups for swaps.

## Skin Names And Meaning

- `skin_cryptokid`: Genesis Runner.
- `skin_street_runner`: City Runner.
- `skin_2`: Justin Sun.
- `skin_default`: Base Builder.
- `skin_3`: Night Operator.
- `skin_4`: Satoshi Nakamoto.
- `skin_5`: Anatoly Yakovenko.
- `skin_6`: Doctor.
- `skin_7`: Bitcoin Maxi.
- `skin_founder`: Vitalik Buterin.
- `skin_8`: Brian Armstrong.
- `skin_9`: Firefighter.
- `skin_10`: Police Officer.
- `skin_11`: Ape Holder, based on real ape NFT vibe, not a human costume.
- `skin_base_king`: Base King, Jesse Pollak inspired; keep crown.
- `skin_1` was removed from active client inventory and sanitized from owned
  state/focus/fragments locally. Keep server/contract compatibility unless a
  deliberate migration is planned.

## Sprite Rework Status

- Live idle sprites were replaced for all active skins listed above.
- Old live sprites are backed up in `public/game/chars/backups-before-full-rework/`.
- `public/game/chars/rework/` holds untracked staging art (chroma sources and
  cleaned sprites) for the rework; do not treat it as live game assets.
- `Genesis Runner` is fully connected:
  `public/game/chars/cryptokid-genesis/{idle,walk-a,walk-b}.png`.
- Frame folders exist for all skins:
  `public/game/chars/*-frames/`.
- Completed walk frames: Genesis Runner, City Runner, Justin Sun, Base Builder,
  Night Operator (revised to subtle bounce), Satoshi, Anatoly, Doctor,
  Bitcoin Maxi, Vitalik, Brian, Firefighter.
- Still pending walk frame generation/cleanup: Police Officer, Ape Holder,
  Base King.
- `PLAYER_SPRITE_SETS` in `public/game/game.js` currently only connects
  Genesis Runner. After all frames exist, add entries for every skin path.
- Use subtle in-place walk/bounce for all skins. Avoid sideways/catwalk steps,
  crossed legs, or a visibly different gait between skins.

## Systems That Already Exist (do not re-propose)

Easy to miss when planning new features; verified in code 2026-07-16:

- Input buffering, train warning flash/horn, police siren live event.
- In-run booster feedback HUD hooks.
- Daily fragment chest (`DAILY_FRAGMENT_CHEST_*`), focus chest, fragment
  top-up with per-rarity caps.
- Runner titles by level (`RUNNER_TITLES`), career medals, collection shelf,
  profile runner card.
- Push notification infra: `src/app/api/notify` + `src/lib/baseNotifications.ts`.
- Notification triggers (added 2026-07-19): "you got passed" batch send from
  `score/submit` via `after()` + `src/lib/notificationTriggers.ts` (5 nearest
  overtaken, 6h cooldown `notify_cd:overtake:*`, skips first-ever submits);
  daily `GET /api/notify/cron` (Vercel cron 17:00 UTC in `vercel.json`, auth
  `CRON_SECRET` bearer or `NOTIFY_ADMIN_SECRET`). Each opted-in wallet is
  assigned to ONE segment by priority (one push/day): streak-expiry (active
  streak, not checked in today; no cooldown) → check-in nudge (never checked
  in; 14d `notify_cd:checkin:*`) → first-run onboarding (checked in but no
  `scores` entry; 14d `notify_cd:onboard:*`). `?dryRun=1` returns recipient
  counts without sending. Verified 2026-07-19: 423 opted-in → 10 streak, 328
  check-in, 7 onboarding.
  Base App wallet-address API only (FID/Neynar deprecated 2026-04-09); needs
  `BASE_NOTIFICATIONS_API_KEY`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET` envs.
  Design: `docs/superpowers/specs/2026-07-19-base-notifications-triggers-design.md`.
- Referral program (added 2026-07-19, ships dark behind `REFERRAL_ENABLED`):
  $0.25 to referrer per referee reaching 10 in-app onchain txs. Server:
  `src/lib/referral.ts` + `/api/referral/{bind,tx,status,admin}`; tx counting
  via receipt-log verification (4337-safe, contract whitelist), qualification
  eager in `/tx` + sweep in notify cron. Client: `useReferral` (?ref capture
  + bind), `reportGameTx` wired into useCheckIn/useScoreClaim/useNftMint
  confirmed paths, menu banner `btn-referral-banner`, `screen-referral`,
  profile row. Referee bonus: 100 coins + 1 boost_magnet at bind. Budget
  $100 pilot / cap 20 per referrer / payouts manual weekly from $1 via
  admin route. Design:
  `docs/superpowers/specs/2026-07-19-referral-program-design.md`.
- Onchain achievement badges (added 2026-07-20): 10 categories x 8 tiers,
  token ids 30-109 on BaseRunnerItems (contract `claimed` mapping = minted
  truth). Server: `src/lib/badges.ts`, badge branch in `/api/nft/sign`,
  `GET /api/nft/badges`; `game_tx:{addr}` counter (all verified game txs) in
  `/api/referral/tx`; `bestStreak` added to `economy_checkin`. Client:
  `Badges` module in game.js (10-medal row in profile career + mint modal
  `#badge-modal`), mints via existing `__NFT_MINT`. Metadata/art:
  `public/nft/{30..109}.json` + generated SVGs in `public/nft/images/`
  (swappable for real art, URLs stable).
- i18n (added 2026-07-20): `public/game/i18n.js` (EN+RU), loaded
  beforeInteractive ahead of game.js. Static nodes use `data-i18n` keys,
  dynamic strings call `window.t(key)`; language row in Settings
  (`settings-lang-btn`, cycles, persists `localStorage.lang`,
  `lang-changed` event). v1 covers chrome (menu/nav/settings/referral/
  badges); quest/economy names still English. New UI strings must add keys.
- Squads: designed, NOT built (see
  `docs/superpowers/specs/2026-07-20-badges-localization-squads-design.md`).
- XP multipliers and bonus chips (streak/record/daily) via `xpBreakdown`.
- "N STEPS AWAY" near-record badge on RUN COMPLETE (shares the NEW RECORD
  slot in `renderRunComplete`; threshold: missed by <= 20% of best, 5..30).
- Checkpoint fanfares every 100 rows: `CheckpointFx` module (canvas banner
  + `Sound.checkpoint` + light vibration), reset from `initGame`.

## Feature Backlog (candidates, discussed 2026-07-16, not yet decided)

Ordered by recommended sequence; details in that session's design notes.
Shipped 2026-07-16: "N steps to record" badge, checkpoint fanfares.

2. Near-miss detection + Flow combo meter: cosmetic feedback + small capped
   XP bonus only — never coin multipliers (session coins are trust-heavy).
3. Row archetypes: `ROW_DANGER_COST` already prices `dense_slow_road`,
   `fast_sparse_road`, `rush_road`, `short_log_river`, `river_chain`, but
   `PATTERNS` never emits them — wire generation, keep max one cost>=3 row
   per section and coordinate with siren/train spacing.
4. Share-run card to Farcaster cast: signed payload route + OG image +
   composeCast bridge. Requires HMAC signing to prevent fake score cards.
5. Seasons (leaderboard cycle + free reward track + onchain season receipt) —
   separate design doc, after economy V1.
6. Social ladder: referral crate -> "beat my score" deep link -> ghost race
   (ghost needs run recording: seed + input log; consider adding the format
   to `_runSummary` early).
7. Comeback crate and daily quest reroll (small retention/coin-sink items).

Death slow-mo (reuse the `_visualDt` mechanism) remains a cheap polish
candidate alongside any of the above.

## Current Verification Habit

- For JS-only changes run `node --check public/game/game.js`.
- Always run `git diff --check` before claiming done.
- Do not run the dev server unless Ivan asks.
- Before risky visual edits, copy touched files to `tmp/backup-<topic>/` for
  one-command rollback (git revert is unsafe while the tree carries active
  user/Codex edits). Current: `tmp/backup-run-start/`,
  `tmp/backup-spin-visuals/` (game.js, globals.css, Game.tsx before the
  2026-07-20 spin wheel rework).

## Product Priorities

1. Finish current skin/frame-set rework and test in game.
2. Polish gear/loadout/profile/shop sync after art settles.
3. Continue economy V1 server authority for fragments/craft/rewards.
4. Improve session feel: booster HUD/effects and pre-run strategy.
5. Difficulty generator work after economy V1 lands cleanly.

Defer ERC-20 token, fully onchain gameplay, and trading economy until retention is proven.
