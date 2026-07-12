@AGENTS.md

# Base Runner Project Map

Last updated: 2026-07-10.

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
- Boosters are charges: magnet, double coins, second chance shield.
- Loadout exists and should become the strategic pre-run layer.
- Score is max forward row reached.
- Game over submits score, syncs coins, updates quests, and awards XP.
- Zoom exists around high score ranges to preserve reaction/readability.

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

## Current Verification Habit

- For JS-only changes run `node --check public/game/game.js`.
- Always run `git diff --check` before claiming done.
- Do not run the dev server unless Ivan asks.

## Product Priorities

1. Finish current skin/frame-set rework and test in game.
2. Polish gear/loadout/profile/shop sync after art settles.
3. Continue economy V1 server authority for fragments/craft/rewards.
4. Improve session feel: booster HUD/effects and pre-run strategy.
5. Difficulty generator work after economy V1 lands cleanly.

Defer ERC-20 token, fully onchain gameplay, and trading economy until retention is proven.
