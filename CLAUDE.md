@AGENTS.md

# Base Runner Project Map

Purpose: Base Runner is a Base/Farcaster mini game. The playable game is a
vanilla canvas runner loaded by a Next.js app. React owns wallet, API, and
onchain bridges; `public/game/game.js` owns most gameplay and UI state.

## Critical Rules

- This is Next.js 16.2.0. Before writing Next.js code, read the relevant guide
  in `node_modules/next/dist/docs/`.
- Do not edit `.claude/*` unless explicitly asked. Local Claude settings may be
  dirty and are not game source.
- Current safety checkpoint before gameplay experiments:
  `codex/checkpoint-before-gameplay-changes-2026-06-29` at `5734b27`.
- Keep gameplay fast on mobile. Avoid heavy per-frame DOM work, expensive blur,
  and repaint-heavy CSS animation in hot paths.
- Do not put every game action onchain. Gameplay is offchain; proofs, claims,
  ownership, and seasons can be onchain.

## Commands

- Dev: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`

## Tech Stack

- Next.js 16.2.0 App Router
- React 19.2.4
- Tailwind CSS 4 through `@tailwindcss/postcss`
- wagmi 3, viem 2, `@base-org/account`, Coinbase OnchainKit
- Upstash Redis / Vercel KV style persistence through REST APIs
- Solidity contracts in `contracts/`

## Top-Level Files

- `AGENTS.md`: required agent rule about this Next.js version.
- `CLAUDE.md`: this project map.
- `package.json`: scripts and dependencies.
- `next.config.ts`: Next config.
- `src/app/globals.css`: all game shell and overlay CSS.
- `public/game/game.js`: main game engine, UI, shop, quests, spin, renderer.

## App Shell

- `src/app/layout.tsx`
  - Metadata, OG image, Base app id.
- `src/app/page.tsx`
  - Renders the game and attempts wallet auto-connect.
- `src/components/Providers.tsx`
  - Wagmi and React Query providers.
- `src/components/Game.tsx`
  - DOM shell for canvas and screens.
  - Loads `/game/game.js`.
  - Mounts wallet/API/onchain hooks that expose `window.__BASE_*` bridges.

## Game Engine: `public/game/game.js`

The file is large and module-shaped. Important internal sections:

- `save.js`: localStorage save state, best scores, coins, check-in fallback.
- `checkin.js`: UI adapter for onchain/local check-in state.
- `leaderboard.js`: personal/global/coins leaderboard rendering.
- `sound.js`, `music.js`: SFX and music.
- `world.js`: rows, biomes, difficulty, cars, trains, logs, coins.
- `player.js`: movement, jump, score, pickups, shield/revive, death.
- `collision.js`: car, train, water/log collision checks.
- `renderer.js`: canvas render loop, camera, weather, night, particles,
  cars, water, logs, trails, death effects, player drawing.
- `ui.js`: screens, score, game over, check-in, leaderboard, coin HUD.
- `nft-utils.js`: NFT claimed state and mint buttons.
- `shop.js`: skins, boosters, trails, death effects, NFT claim UI.
- `quests.js`: cumulative quest progress and rewards.
- `daily-spin.js`: wheel UI and prize application.
- `xp.js`: XP, levels, level rewards.
- bottom bindings: event listeners and startup flow.

## Main Gameplay Notes

- Grid runner with 9 columns and generated rows.
- Row types include grass, road, water, train.
- Biomes rotate through default, desert, snow.
- Weather states include clear, rain, fog, storm, windy.
- Coins spawn on grass rows and can be pulled by magnet.
- Boosters exist as charges: magnet, double coins, second chance shield.
- Current booster behavior is mostly automatic at run start.
- Score is max forward row reached.
- Game over submits score, syncs coins, updates quests, and awards XP.

## React Hooks And Window Bridges

- `src/hooks/usePlayer.ts`
  - Exposes connected wallet as `window.__BASE_WALLET`.
- `src/hooks/useLeaderboard.ts`
  - `__BASE_SESSION_START`, `__BASE_SUBMIT_SCORE`,
    `__BASE_FETCH_SCORE_LB`, `__BASE_LEADERBOARD`.
- `src/hooks/useCoinLeaderboard.ts`
  - `__BASE_FETCH_COIN_LB`, `__BASE_COIN_LB_ENTRIES`.
- `src/hooks/useCoinClaim.ts`
  - `__BASE_SYNC_COINS`, `__BASE_CLAIM_COINS`, `__BASE_COIN_CLAIM`.
- `src/hooks/useShopSync.ts`
  - `__BASE_SHOP_SYNC`.
- `src/hooks/useQuestSync.ts`
  - `__BASE_QUEST_SYNC`.
- `src/hooks/useDailySpin.ts`
  - Calls `/api/spin` for server-decided prizes.
- `src/hooks/useCheckIn.ts`
  - Onchain check-in, with paymaster support through `wallet_sendCalls`.
- `src/hooks/useNftMint.ts`
  - ERC-1155 claim/mint, with paymaster support and fallback tx.

## API Routes

- `src/app/api/score/session/route.ts`
  - Creates anti-cheat session token.
- `src/app/api/score/submit/route.ts`
  - Validates score/session token, stores leaderboards in Redis.
- `src/app/api/score/leaderboard/route.ts`
  - Reads score leaderboard and resolves names/avatars.
- `src/app/api/coins/sync/route.ts`
  - Stores current and peak coin balances. Trust-heavy today.
- `src/app/api/coins/leaderboard/route.ts`
  - Reads coin leaderboard and resolves names/avatars.
- `src/app/api/shop/route.ts`
  - Persists owned/equipped skins, boosters, trails, death effects.
- `src/app/api/quests/route.ts`
  - Persists quest state.
- `src/app/api/spin/route.ts`
  - Server-side spin pricing, prize choice, and reward application.
- `src/app/api/nft/sign/route.ts`
  - Signs ERC-1155 item claims after Redis ownership check.
- `src/app/api/resolve-names/route.ts`
  - Name/address helper.

## Config

- `src/config/wagmi.ts`
  - Base chain, injected connector, Base Account connector, RPC fallbacks.
- `src/config/checkin-contract.ts`
  - Deployed check-in contract address and ABI.
- `src/config/spin-contract.ts`
  - Deployed spin contract address and ABI.
- `src/config/nft-contract.ts`
  - `NEXT_PUBLIC_NFT_CONTRACT` and item id to ERC-1155 token id mapping.

## Contracts

- `contracts/BaseRunnerCheckIn.sol`
  - Daily UTC check-in, streak, total, `CheckedIn` event.
- `contracts/BaseRunnerCoins.sol`
  - Onchain coin claim/top list idea. Not the current main coin path.
- `contracts/BaseRunnerLeaderboard.sol`
  - Onchain score leaderboard idea. Redis is current main leaderboard path.
- `contracts/BaseRunnerSpin.sol`
  - Emits spin events; current game prize logic is server/Redis.
- `contracts/BaseRunnerItems.sol`
  - ERC-1155 cosmetics/items with backend signature claims.

## Public Assets

- `public/.well-known/farcaster.json`
  - Farcaster/Mini App manifest.
- `public/icon.png`, `public/splash.png`, `public/og-image.png`
  - App and sharing assets.
- `public/game/chars/*`
  - Character skin sprites.
- `public/game/env/*`
  - Environment sprites.
- `public/game/boosters/*`
  - Booster sprites.
- `public/game/coin.png`
  - Main coin visual.
- `public/nft/*.json`
  - ERC-1155 metadata.
- `public/nft/images/*`
  - Trail NFT images.

## Environment Variables

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `ANTI_CHEAT_SECRET`
- `NEXT_PUBLIC_PAYMASTER_URL`
- `NEXT_PUBLIC_NFT_CONTRACT`
- `NFT_SIGNER_KEY`

## Product Priorities

1. Daily challenge with shared seed and daily leaderboard.
2. Farcaster/Base share result card.
3. Pre-run booster loadout.
4. Visible booster effects around the player.
5. Lane/HUD readability polish.
6. Server-verified rewards before serious onchain economy.
7. Run receipt or season badge NFT after score verification is stronger.

Defer: ERC-20 token, fully onchain gameplay, and trading economy until
anti-cheat, retention, and reward sinks are proven.
