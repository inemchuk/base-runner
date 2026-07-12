# Game VFX System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified, material-aware VFX system for grass, sand, snow, roads, water, shadows, weather, vehicles, player feedback, hazards, and cosmetics while preserving gameplay and mobile performance.

**Architecture:** Add a pure `GameVfx` configuration/resolution module inside the existing single-file game runtime, immediately before `Renderer`. `Renderer` remains responsible for Canvas drawing, but all effects consume the same resolved surface context, priority tier, cached sprites, and quality budget. A standalone Node test extracts the pure module from `game.js`, verifies its contracts, and adds source-level integration assertions for renderer-only behavior.

**Tech Stack:** Vanilla JavaScript, Canvas 2D, the existing Next.js 16 shell, Node.js `node:assert/strict`, and `node:vm`; no new runtime or test dependencies.

## Global Constraints

- Do not start `npm run dev` unless Ivan explicitly asks; visual QA uses an already-running user server or waits for permission.
- Do not deploy.
- Preserve current movement, collision, world generation, score, economy, quests, ownership, and onchain behavior.
- Do not edit paymaster, NFT, check-in, transaction, or economy authority code.
- Do not add npm dependencies or generated raster assets in this pass.
- Keep the polished semi-realistic 2D arcade direction; do not introduce photorealistic, 3D, or pixel-art defaults.
- Do not use per-frame `ctx.filter = 'blur(...)'`; cache soft masks, glows, and texture tiles on offscreen canvases.
- Gameplay-critical feedback survives quality degradation; ambient weather and cosmetic particles degrade first.
- The worktree is already dirty. Never revert, overwrite, stage, or commit unrelated user changes. Inspect staged hunks before every commit.
- After each completed task, check every completed step in this file and record the task commit hash in the Phase Ledger.

## File Map

- Create `scripts/test-game-vfx.mjs`: pure surface/preset/pool tests plus source-level renderer integration assertions.
- Modify `public/game/game.js:1986-1991`: emit a landing event with row identity instead of a row-type-only trail.
- Modify `public/game/game.js:2278-5496`: add `GameVfx`, cached material textures, unified shadows, surface contacts, layered weather/light, feedback, collision, cosmetics, budgets, diagnostics, and cleanup.
- Modify `public/game/game.js:9488-9512`: preserve train as a distinct visual death cause and pass impact direction.
- Modify this plan file: check completed boxes and update the Phase Ledger after every task.

## Resume Protocol

1. Read `docs/superpowers/specs/2026-07-12-game-vfx-system-design.md` and this plan.
2. Run `git status --short` and `git diff --cached --name-only`; preserve all unrelated dirty files.
3. Read the Phase Ledger and continue at the first unchecked task.
4. Run `node scripts/test-game-vfx.mjs` and `node --check public/game/game.js` before making the next change.
5. Complete one task, verify it, mark its boxes, and make its isolated commit before starting the next task.
6. If a pre-existing dirty hunk overlaps a VFX hunk, do not stage the whole file. Stage only the VFX hunk with `git add -p public/game/game.js`, inspect `git diff --cached`, and leave unrelated lines unstaged.

## Phase Ledger

- [x] Phase 1 — Foundation and materials: Tasks 1-3. Commit: `0e314fa`
- [x] Phase 2 — Physical interactions: Task 4. Commit: `b26b182`
- [ ] Phase 3 — Weather and lighting: Task 5. Commit: `not-started`
- [ ] Phase 4 — Gameplay and cosmetics: Tasks 6-8. Commit: `not-started`
- [ ] Phase 5 — Performance and verification: Task 9. Commit: `not-started`

---

## Phase 1 — Foundation and materials

### Task 1: Pure surface context, presets, priorities, and pool

**Files:**
- Create: `scripts/test-game-vfx.mjs`
- Modify: `public/game/game.js:2278` immediately before `/* ===== renderer.js ===== */`

**Interfaces:**
- Produces: `GameVfx.resolveSurface(input) -> SurfaceContext`
- Produces: `GameVfx.getSurface(id) -> SurfacePreset`
- Produces: `GameVfx.getLanding(id) -> LandingPreset`
- Produces: `GameVfx.createPool(limit) -> { items, spawn, releaseAt, clear, stats }`
- Produces: `GameVfx.priorityOf(name) -> number`
- `SurfaceContext` is `{ id, biome, wet, reflective }`.

- [x] **Step 1: Write the failing pure-module tests**

Create `scripts/test-game-vfx.mjs` with:

```js
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const gameRuntime = readFileSync(new URL('../public/game/game.js', import.meta.url), 'utf8');
const moduleStart = gameRuntime.indexOf('const GameVfx = (() => {');
const rendererStart = gameRuntime.indexOf('/* ===== renderer.js ===== */');

assert.notEqual(moduleStart, -1, 'GameVfx module should exist');
assert.ok(rendererStart > moduleStart, 'GameVfx should load before Renderer');

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  `${gameRuntime.slice(moduleStart, rendererStart)}\nthis.__GAME_VFX__ = GameVfx;`,
  sandbox,
);

const vfx = sandbox.__GAME_VFX__;
assert.ok(vfx, 'GameVfx should be extractable without DOM globals');

const surfaceCases = [
  [{ rowType: 'grass', biome: 'default', weatherState: 0, weatherRatio: 0 }, 'grass'],
  [{ rowType: 'grass', biome: 'desert', weatherState: 0, weatherRatio: 0 }, 'sand'],
  [{ rowType: 'grass', biome: 'snow', weatherState: 0, weatherRatio: 0 }, 'snow'],
  [{ rowType: 'road', biome: 'default', weatherState: 0, weatherRatio: 0 }, 'dryRoad'],
  [{ rowType: 'road', biome: 'default', weatherState: 1, weatherRatio: 0.8 }, 'wetRoad'],
  [{ rowType: 'road', biome: 'desert', weatherState: 3, weatherRatio: 1 }, 'dryRoad'],
  [{ rowType: 'water', biome: 'snow', weatherState: 0, weatherRatio: 0 }, 'water'],
  [{ rowType: 'train', biome: 'default', weatherState: 0, weatherRatio: 0 }, 'railBed'],
];

for (const [input, expected] of surfaceCases) {
  assert.equal(vfx.resolveSurface(input).id, expected, JSON.stringify(input));
}

assert.equal(vfx.getLanding('snow').kind, 'snow');
assert.equal(vfx.getLanding('wetRoad').kind, 'splash');
assert.equal(vfx.getSurface('missing').id, 'neutral');
assert.ok(vfx.priorityOf('impact') > vfx.priorityOf('ambient'));

const pool = vfx.createPool(2);
assert.ok(pool.spawn({ id: 'rain' }, 'ambient'));
assert.ok(pool.spawn({ id: 'dust' }, 'contact'));
assert.equal(pool.spawn({ id: 'extra' }, 'ambient'), null, 'low priority should be dropped');
assert.ok(pool.spawn({ id: 'hit' }, 'impact'), 'impact should replace a lower priority item');
assert.equal(pool.stats().active, 2);
pool.releaseAt(0);
assert.equal(pool.stats().active, 1);
pool.clear();
assert.equal(pool.stats().active, 0);

console.log('game VFX assertions passed');
```

- [x] **Step 2: Run the test and verify the module is missing**

Run:

```bash
node scripts/test-game-vfx.mjs
```

Expected: FAIL with `GameVfx module should exist`.

- [x] **Step 3: Add the pure `GameVfx` module**

Insert this block immediately before `/* ===== renderer.js ===== */` in `public/game/game.js`:

```js
/* ===== vfx-system.js ===== */
const GameVfx = (() => {
  const PRIORITY = Object.freeze({ ambient: 0, contact: 1, feedback: 2, impact: 3 });

  const SURFACES = Object.freeze({
    neutral: Object.freeze({ id: 'neutral', shadowRgb: '30,36,46', shadowAlpha: 0.18, mark: '#596170' }),
    grass: Object.freeze({ id: 'grass', shadowRgb: '18,47,26', shadowAlpha: 0.22, mark: '#315D2E' }),
    sand: Object.freeze({ id: 'sand', shadowRgb: '91,61,24', shadowAlpha: 0.20, mark: '#9B7138' }),
    snow: Object.freeze({ id: 'snow', shadowRgb: '50,82,125', shadowAlpha: 0.18, mark: '#A9BDD8' }),
    dryRoad: Object.freeze({ id: 'dryRoad', shadowRgb: '20,23,31', shadowAlpha: 0.24, mark: '#777D86' }),
    wetRoad: Object.freeze({ id: 'wetRoad', shadowRgb: '12,22,38', shadowAlpha: 0.22, mark: '#91ABC5' }),
    water: Object.freeze({ id: 'water', shadowRgb: '0,30,67', shadowAlpha: 0.24, mark: '#C9EDFF' }),
    railBed: Object.freeze({ id: 'railBed', shadowRgb: '29,27,31', shadowAlpha: 0.24, mark: '#8D8277' }),
  });

  const LANDING = Object.freeze({
    neutral: Object.freeze({ kind: 'dust', life: 0.55, count: 3 }),
    grass: Object.freeze({ kind: 'grass', life: 1.0, count: 5 }),
    sand: Object.freeze({ kind: 'sand', life: 0.85, count: 6 }),
    snow: Object.freeze({ kind: 'snow', life: 2.5, count: 6 }),
    dryRoad: Object.freeze({ kind: 'roadDust', life: 0.45, count: 3 }),
    wetRoad: Object.freeze({ kind: 'splash', life: 0.65, count: 5 }),
    water: Object.freeze({ kind: 'ripple', life: 0.9, count: 6 }),
    railBed: Object.freeze({ kind: 'ballast', life: 0.55, count: 4 }),
  });

  function getSurface(id) {
    return SURFACES[id] || SURFACES.neutral;
  }

  function getLanding(id) {
    return LANDING[id] || LANDING.neutral;
  }

  function resolveSurface({ rowType, biome = 'default', weatherState = 0, weatherRatio = 0 }) {
    let id = 'neutral';
    if (rowType === 'water') id = 'water';
    else if (rowType === 'train') id = 'railBed';
    else if (rowType === 'road') {
      const rain = (weatherState === 1 || weatherState === 3) && weatherRatio > 0.2;
      id = rain && biome !== 'desert' ? 'wetRoad' : 'dryRoad';
    } else if (rowType === 'grass') {
      id = biome === 'desert' ? 'sand' : biome === 'snow' ? 'snow' : 'grass';
    }
    return Object.freeze({
      id,
      biome,
      wet: id === 'wetRoad' || id === 'water',
      reflective: id === 'wetRoad' || id === 'water',
    });
  }

  function priorityOf(name) {
    return PRIORITY[name] ?? PRIORITY.ambient;
  }

  function createPool(limit = 160) {
    const items = [];
    const free = [];

    function releaseAt(index) {
      if (index < 0 || index >= items.length) return;
      const item = items[index];
      items.splice(index, 1);
      for (const key of Object.keys(item)) delete item[key];
      free.push(item);
    }

    function spawn(data, priority = 'ambient') {
      const nextPriority = priorityOf(priority);
      if (items.length >= limit) {
        let replaceIndex = -1;
        let replacePriority = nextPriority;
        for (let i = 0; i < items.length; i++) {
          const current = items[i]._priority ?? 0;
          if (current < replacePriority) {
            replacePriority = current;
            replaceIndex = i;
          }
        }
        if (replaceIndex === -1) return null;
        releaseAt(replaceIndex);
      }
      const item = free.pop() || {};
      Object.assign(item, data, { _priority: nextPriority });
      items.push(item);
      return item;
    }

    function clear() {
      while (items.length) releaseAt(items.length - 1);
    }

    function stats() {
      return { active: items.length, free: free.length, limit };
    }

    return { items, spawn, releaseAt, clear, stats };
  }

  return { resolveSurface, getSurface, getLanding, createPool, priorityOf };
})();
```

- [x] **Step 4: Run the test and syntax check**

Run:

```bash
node scripts/test-game-vfx.mjs
node --check public/game/game.js
```

Expected: `game VFX assertions passed`, followed by a zero-exit syntax check.

- [x] **Step 5: Isolate and commit Task 1** — completed in `abcca48`.

Run:

```bash
git add scripts/test-game-vfx.mjs
git add -p public/game/game.js
git diff --cached --check
git diff --cached --name-only
git commit -m "feat(game): add material-aware VFX core"
```

Expected staged paths: only `scripts/test-game-vfx.mjs`, the Task 1 hunk of `public/game/game.js`, and this plan if its checkboxes are updated.

### Task 2: Cached grass, sand, and snow material tiles

**Files:**
- Modify: `scripts/test-game-vfx.mjs`
- Modify: `public/game/game.js:2710-2750`
- Modify: `public/game/game.js:3390-3410`

**Interfaces:**
- Consumes: `GameVfx.resolveSurface(input)` from Task 1.
- Produces: `_surfaceForRow(row) -> SurfaceContext` inside `Renderer`.
- Produces: `_buildSurfaceTile(surfaceId) -> HTMLCanvasElement` and `_drawSurfaceTexture(row, y)`.

- [x] **Step 1: Add failing source-contract assertions**

Append before the final `console.log` in `scripts/test-game-vfx.mjs`:

```js
assert.match(gameRuntime, /function _surfaceForRow\(row\)/);
assert.match(gameRuntime, /function _buildSurfaceTile\(surfaceId\)/);
assert.match(gameRuntime, /function _drawSurfaceTexture\(row, y\)/);
assert.match(gameRuntime, /_drawSurfaceTexture\(row, y\);/);
assert.doesNotMatch(gameRuntime, /ctx\.filter\s*=\s*['"]blur/);
```

- [x] **Step 2: Run and verify failure**

Run `node scripts/test-game-vfx.mjs`.

Expected: FAIL on `function _surfaceForRow(row)`.

- [x] **Step 3: Implement deterministic cached surface tiles**

Inside `Renderer`, near the existing grass texture cache, add:

```js
  let _surfaceTiles = null;

  function _dominantBiome(bi) {
    return bi && bi.blendT > 0.5 && bi.nextBiome ? bi.nextBiome : (bi && bi.biome) || 'default';
  }

  function _surfaceForRow(row) {
    const bi = World.getBiomeForRow(row && Number.isFinite(row.idx) ? row.idx : Player.getState().row);
    return GameVfx.resolveSurface({
      rowType: row ? row.type : 'grass',
      biome: _dominantBiome(bi),
      weatherState,
      weatherRatio,
    });
  }

  function _tileRand(index, salt) {
    return Math.abs(Math.sin(index * 91.731 + salt * 17.117)) % 1;
  }

  function _buildSurfaceTile(surfaceId) {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);

    if (surfaceId === 'grass') {
      for (let i = 0; i < 34; i++) {
        const x = _tileRand(i, 1) * 96;
        const y = _tileRand(i, 2) * 96;
        const h = 2 + _tileRand(i, 3) * 4;
        g.strokeStyle = i % 3 === 0 ? 'rgba(205,235,170,0.12)' : 'rgba(20,75,34,0.16)';
        g.lineWidth = 0.7;
        g.beginPath();
        g.moveTo(x, y + h);
        g.lineTo(x + (_tileRand(i, 4) - 0.5) * 2, y);
        g.stroke();
      }
    } else if (surfaceId === 'sand') {
      for (let i = 0; i < 42; i++) {
        const x = _tileRand(i, 5) * 96;
        const y = _tileRand(i, 6) * 96;
        const r = 0.35 + _tileRand(i, 7) * 0.8;
        g.fillStyle = i % 4 === 0 ? 'rgba(255,238,184,0.20)' : 'rgba(114,76,31,0.12)';
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
    } else if (surfaceId === 'snow') {
      for (let i = 0; i < 24; i++) {
        const x = _tileRand(i, 8) * 96;
        const y = _tileRand(i, 9) * 96;
        const rx = 2 + _tileRand(i, 10) * 5;
        g.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.20)' : 'rgba(95,125,170,0.10)';
        g.beginPath();
        g.ellipse(x, y, rx, rx * 0.28, -0.25, 0, Math.PI * 2);
        g.fill();
      }
    }
    return c;
  }

  function _drawSurfaceTexture(row, y) {
    const surfaceId = _surfaceForRow(row).id;
    if (surfaceId !== 'grass' && surfaceId !== 'sand' && surfaceId !== 'snow') return;
    if (!_surfaceTiles) {
      _surfaceTiles = {
        grass: _buildSurfaceTile('grass'),
        sand: _buildSurfaceTile('sand'),
        snow: _buildSurfaceTile('snow'),
      };
    }
    const tile = _surfaceTiles[surfaceId];
    ctx.save();
    ctx.globalAlpha = surfaceId === 'snow' ? 0.65 : 0.78;
    for (let x = 0; x < COLS * CELL; x += tile.width) {
      ctx.drawImage(tile, x, y, tile.width, CELL);
    }
    ctx.restore();
  }
```

Call `_drawSurfaceTexture(row, y);` in `drawGrassRow` immediately after its base `fillRect` and before the top/bottom depth strips.

- [x] **Step 4: Verify tests and syntax**

Run:

```bash
node scripts/test-game-vfx.mjs
node --check public/game/game.js
git diff --check
```

Expected: all commands exit zero.

- [x] **Step 5: Commit Task 2** — completed in `287aa58`.

```bash
git add -p public/game/game.js scripts/test-game-vfx.mjs
git diff --cached --check
git commit -m "feat(game): add cached biome surface texture"
```

### Task 3: Unified material-aware ground shadows

**Files:**
- Modify: `scripts/test-game-vfx.mjs`
- Modify: `public/game/game.js:2787-2822`
- Modify: `public/game/game.js:3480-3695`
- Modify: `public/game/game.js:3706-3720`
- Modify: `public/game/game.js:3999-4012`
- Modify: `public/game/game.js:4631-4648`
- Modify: `public/game/game.js:5205-5335`

**Interfaces:**
- Consumes: `GameVfx.getSurface(id)` and `_surfaceForRow(row)`.
- Produces: `drawGroundShadow(x, y, width, height, options)`.
- `options` is `{ surfaceId, alpha, offsetX, offsetY, lift, contact }`.

- [x] **Step 1: Add failing shadow integration assertions**

Append before the final log in `scripts/test-game-vfx.mjs`:

```js
assert.match(gameRuntime, /function drawGroundShadow\(x, y, width, height, options = \{\}\)/);
assert.match(gameRuntime, /const _shadowSpriteCache = new Map\(\)/);
assert.ok((gameRuntime.match(/drawGroundShadow\(/g) || []).length >= 10, 'major object classes should share the shadow helper');

const playerBody = gameRuntime.slice(
  gameRuntime.indexOf('function drawPlayer()'),
  gameRuntime.indexOf('function roundRect(', gameRuntime.indexOf('function drawPlayer()')),
);
assert.equal((playerBody.match(/drawGroundShadow\(/g) || []).length, 1, 'player uses one shadow path');
```

- [x] **Step 2: Verify failure**

Run `node scripts/test-game-vfx.mjs`.

Expected: FAIL because `drawGroundShadow` does not exist.

- [x] **Step 3: Add a cached soft shadow mask and helper**

Inside `Renderer`, add:

```js
  const _shadowSpriteCache = new Map();

  function _shadowSprite(surfaceId) {
    if (_shadowSpriteCache.has(surfaceId)) return _shadowSpriteCache.get(surfaceId);
    const style = GameVfx.getSurface(surfaceId);
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 6, 64, 64, 64);
    grd.addColorStop(0, `rgba(${style.shadowRgb},1)`);
    grd.addColorStop(0.52, `rgba(${style.shadowRgb},0.68)`);
    grd.addColorStop(1, `rgba(${style.shadowRgb},0)`);
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    _shadowSpriteCache.set(surfaceId, c);
    return c;
  }

  function drawGroundShadow(x, y, width, height, options = {}) {
    const surfaceId = options.surfaceId || 'neutral';
    const style = GameVfx.getSurface(surfaceId);
    const lift = Math.max(0, Math.min(1, options.lift || 0));
    const lightningFade = 1 - Math.min(lightningFlash, 1) * 0.45;
    const alpha = (options.alpha ?? style.shadowAlpha) * (1 - lift * 0.48) * lightningFade;
    const offsetX = options.offsetX ?? width * 0.08;
    const offsetY = options.offsetY ?? height * 0.16;
    const sprite = _shadowSprite(surfaceId);

    ctx.save();
    ctx.globalAlpha = alpha * 0.55;
    ctx.drawImage(sprite, x - width * 0.5 + offsetX, y - height * 0.5 + offsetY, width, height);
    if (options.contact !== false) {
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, x - width * 0.34, y - height * 0.24, width * 0.68, height * 0.48);
    }
    ctx.restore();
  }
```

- [x] **Step 4: Migrate every caster to the helper**

Use these exact role mappings and delete each replaced hard-coded black ellipse:

```js
// Environment sprite and procedural decoration fallbacks.
// drawGrassRow resolves this once and passes it to drawEnvSprite/fallbacks.
const decorationSurfaceId = _surfaceForRow(row).id;
drawGroundShadow(cx, shadowY, CELL * cfg.sw * 2.15, CELL * cfg.sh * 2.7, {
  surfaceId: decorationSurfaceId,
  offsetX: CELL * 0.06,
  offsetY: CELL * 0.025,
});

// Car
drawGroundShadow(x + car.width / 2, y + car.height * 0.91, car.width * 0.94, car.height * 0.40, {
  surfaceId: _surfaceForRow(row).id,
  offsetX: car.width * 0.035,
  offsetY: car.height * 0.025,
});

// Log
drawGroundShadow(x + log.width / 2, rowY + CELL * 0.79, log.width * 0.96, CELL * 0.18, {
  surfaceId: 'water',
  alpha: 0.22,
  offsetX: log.speed > 0 ? 3 : -3,
  offsetY: 1,
});

// Train
drawGroundShadow(centerX, centerY + drawH * 0.14, drawW * 0.98, drawH * 0.56, {
  surfaceId: 'railBed',
  offsetX: dir * CELL * 0.05,
  offsetY: CELL * 0.02,
});
```

In `drawPlayer`, calculate one jump lift before the sprite/fallback branch and draw one shadow:

```js
    const playerJumpT = ps.jumping ? Math.min(ps.jumpTimer / 0.16, 1) : 0;
    const playerLift = ps.jumping ? Math.sin(Math.PI * playerJumpT) : 0;
    const playerRow = World.getRow(ps.row);
    drawGroundShadow(x, y + CELL * 0.22, CELL * (0.58 - playerLift * 0.18), CELL * (0.20 - playerLift * 0.05), {
      surfaceId: _surfaceForRow(playerRow).id,
      lift: playerLift,
      offsetX: CELL * 0.04,
      offsetY: CELL * 0.015,
    });
```

Change `drawEnvSprite` to `drawEnvSprite(type, cx, cy, surfaceId)` and each fallback to `(cx, cy, bi, surfaceId)`. Resolve `const decorationSurfaceId = _surfaceForRow(row).id` once in `drawGrassRow` and pass it through both paths. Use the same helper in `drawBush`, `drawTree`, `drawRock`, `drawCactus`, `drawTumbleweed`, `drawPine`, and `drawSnowman`. Keep `offsetX: CELL * 0.10` for `tree`, `pine`, and `cactus`; use `offsetX: CELL * 0.04` for rocks, bushes, stumps, and snowmen.

- [x] **Step 5: Verify and mark the Phase 1 checkpoint**

Run:

```bash
node scripts/test-game-vfx.mjs
node --check public/game/game.js
git diff --check
```

Expected: all zero exit. Update Phase 1 in the ledger with the Task 3 commit hash.

- [x] **Step 6: Commit Task 3** — completed in `0e314fa`.

```bash
git add -p public/game/game.js scripts/test-game-vfx.mjs docs/superpowers/plans/2026-07-12-game-vfx-system.md
git diff --cached --check
git diff --cached
git commit -m "feat(game): unify material-aware ground shadows"
```

---

## Phase 2 — Physical interactions

### Task 4: Surface-specific landing, prop contact, log wake, and water response

**Files:**
- Modify: `scripts/test-game-vfx.mjs`
- Modify: `public/game/game.js:1986-1991`
- Modify: `public/game/game.js:2390-2425`
- Modify: `public/game/game.js:3907-4032`
- Modify: `public/game/game.js:4275-4460`
- Modify: `public/game/game.js:5488-5496`

**Interfaces:**
- Consumes: `_surfaceForRow(row)` and `GameVfx.getLanding(surfaceId)`.
- Produces: `Renderer.addLandingEffect(x, y, rowIdx)`.
- Produces: `drawPhysicalTrails()` and `drawLogWake(log, rowY)`.
- Keeps: `Renderer.addTrail` as a temporary compatibility alias until Task 8.

- [x] **Step 1: Add failing surface-contact assertions**

Append:

```js
assert.match(gameRuntime, /function addLandingEffect\(x, y, rowIdx\)/);
assert.match(gameRuntime, /Renderer\.addLandingEffect\(state\.visualX, state\.visualY, state\.row\)/);
assert.match(gameRuntime, /function drawLogWake\(log, rowY\)/);
assert.match(gameRuntime, /function drawPropContact\(type, cx, baseY, surfaceId\)/);
assert.match(gameRuntime, /function drawVehicleContact\(row, rowY, car\)/);
assert.match(gameRuntime, /function drawTrainContact\(train, rowY, dir\)/);
assert.doesNotMatch(gameRuntime, /Renderer\.addTrail\(state\.visualX, state\.visualY, row \? row\.type/);
```

- [x] **Step 2: Verify failure**

Run `node scripts/test-game-vfx.mjs`.

Expected: FAIL at `addLandingEffect`.

- [x] **Step 3: Emit landing by row identity**

Replace the current landing call in `Player.update` with:

```js
        if (typeof Renderer !== 'undefined' && Renderer.addLandingEffect) {
          Renderer.addLandingEffect(state.visualX, state.visualY, state.row);
        }
```

Inside `Renderer`, create one physical effect pool and the landing entry point:

```js
  const physicalFxPool = GameVfx.createPool(96);

  function addLandingEffect(x, y, rowIdx) {
    const row = World.getRow(rowIdx);
    const surface = _surfaceForRow(row || { idx: rowIdx, type: 'grass' });
    const preset = GameVfx.getLanding(surface.id);
    physicalFxPool.spawn({
      event: 'land',
      surfaceId: surface.id,
      kind: preset.kind,
      x,
      y,
      age: 0,
      life: preset.life,
      count: preset.count,
      seed: Math.random(),
    }, 'contact');
  }

  function addTrail(x, y, rowType) {
    const row = World.getRow(Player.getState().row);
    addLandingEffect(x, y, row ? row.idx : Player.getState().row);
  }
```

- [x] **Step 4: Draw the approved material responses**

Add `drawPhysicalTrails` and call it after `drawRows()` but before `drawPlayer()`:

```js
  function drawPhysicalTrails() {
    const items = physicalFxPool.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const fx = items[i];
      fx.age += _frameDt;
      if (fx.age >= fx.life) {
        physicalFxPool.releaseAt(i);
        continue;
      }
      const t = fx.age / fx.life;
      const fade = 1 - t;
      const surface = GameVfx.getSurface(fx.surfaceId);
      ctx.save();

      if (fx.kind === 'grass') {
        ctx.globalAlpha = fade * 0.34;
        ctx.fillStyle = surface.mark;
        ctx.beginPath();
        ctx.ellipse(fx.x - CELL * 0.09, fx.y + CELL * 0.07, CELL * 0.055, CELL * 0.11, 0.28, 0, Math.PI * 2);
        ctx.ellipse(fx.x + CELL * 0.09, fx.y - CELL * 0.06, CELL * 0.055, CELL * 0.11, -0.28, 0, Math.PI * 2);
        ctx.fill();
      } else if (fx.kind === 'sand' || fx.kind === 'roadDust' || fx.kind === 'ballast') {
        ctx.globalAlpha = fade * (fx.kind === 'sand' ? 0.42 : 0.25);
        ctx.fillStyle = surface.mark;
        for (let p = 0; p < fx.count; p++) {
          const angle = fx.seed * 8 + p * 2.399;
          const dist = CELL * t * (0.08 + p * 0.012);
          const radius = CELL * (0.025 + (p % 3) * 0.008) * fade;
          ctx.beginPath();
          ctx.arc(fx.x + Math.cos(angle) * dist, fx.y + Math.sin(angle) * dist * 0.42 - t * CELL * 0.06, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (fx.kind === 'snow') {
        ctx.globalAlpha = Math.min(0.38, fade * 0.52);
        ctx.fillStyle = surface.mark;
        ctx.beginPath();
        ctx.ellipse(fx.x, fx.y + CELL * 0.05, CELL * 0.14, CELL * 0.055, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(245,250,255,0.9)';
        for (let p = 0; p < fx.count; p++) {
          const angle = fx.seed * 6 + p * 2.1;
          const dist = CELL * t * (0.08 + p * 0.01);
          ctx.beginPath();
          ctx.arc(fx.x + Math.cos(angle) * dist, fx.y + Math.sin(angle) * dist * 0.35 - t * CELL * 0.08, CELL * 0.018 * fade, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (fx.kind === 'splash' || fx.kind === 'ripple') {
        ctx.strokeStyle = fx.surfaceId === 'water' ? 'rgba(215,244,255,0.9)' : 'rgba(190,220,240,0.8)';
        ctx.lineWidth = Math.max(0.8, 2 * fade);
        for (let ring = 0; ring < 2; ring++) {
          const rt = Math.max(0, t - ring * 0.16);
          if (rt === 0) continue;
          const rx = CELL * (0.12 + rt * 0.42);
          ctx.globalAlpha = fade * (ring === 0 ? 0.65 : 0.35);
          ctx.beginPath();
          ctx.ellipse(fx.x, fx.y + CELL * 0.05, rx, rx * 0.42, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }
```

- [x] **Step 5: Add log wakes and prop-base contact**

Add and call these before drawing their corresponding sprite:

```js
  function drawLogWake(log, rowY) {
    const dir = Math.sign(log.speed || 1);
    const centerX = log.x + log.width / 2;
    const waterY = rowY + CELL * 0.53;
    const pulse = 0.85 + Math.sin(waterTime * 2 + log.x * 0.01) * 0.15;
    ctx.save();
    ctx.strokeStyle = 'rgba(210,242,255,0.34)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(centerX + dir * log.width * 0.34, waterY, CELL * 0.13 * pulse, CELL * 0.045, 0, -Math.PI * 0.55, Math.PI * 0.55);
    ctx.stroke();
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.moveTo(centerX - dir * log.width * 0.38, waterY - CELL * 0.05);
    ctx.lineTo(centerX - dir * log.width * 0.62, waterY);
    ctx.lineTo(centerX - dir * log.width * 0.38, waterY + CELL * 0.05);
    ctx.stroke();
    ctx.restore();
  }

  function drawPropContact(type, cx, baseY, surfaceId) {
    ctx.save();
    if (surfaceId === 'snow') {
      ctx.fillStyle = 'rgba(246,250,255,0.76)';
      ctx.beginPath();
      ctx.ellipse(cx, baseY, CELL * 0.20, CELL * 0.045, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (surfaceId === 'sand') {
      ctx.strokeStyle = 'rgba(118,79,35,0.25)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(cx, baseY, CELL * 0.18, CELL * 0.04, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (surfaceId === 'grass' && type !== 'rock') {
      ctx.strokeStyle = 'rgba(27,78,35,0.35)';
      ctx.lineWidth = 1;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * CELL * 0.045, baseY);
        ctx.lineTo(cx + i * CELL * 0.04, baseY - CELL * (0.035 + Math.abs(i) * 0.004));
        ctx.stroke();
      }
    }
    ctx.restore();
  }
```

Call `drawLogWake(log, rowY)` before each log. Call `drawPropContact` after each decoration shadow and before its sprite. Preserve the existing water waves, but remove the old single dark log ellipse after the new water shadow and wake are active.

Add vehicle and passing-train contact helpers:

```js
  function drawVehicleContact(row, rowY, car) {
    const surfaceId = _surfaceForRow(row).id;
    if (surfaceId !== 'wetRoad') return;
    const direction = Math.sign(car.speed || 1);
    const rearX = direction > 0 ? car.x + car.width * 0.18 : car.x + car.width * 0.82;
    const wheelY = rowY + CELL * 0.68;
    ctx.save();
    ctx.strokeStyle = 'rgba(175,210,232,0.26)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const spread = CELL * (0.04 + i * 0.025);
      ctx.globalAlpha = 0.28 - i * 0.06;
      ctx.beginPath();
      ctx.moveTo(rearX, wheelY + (i - 1) * CELL * 0.06);
      ctx.lineTo(rearX - direction * CELL * 0.30, wheelY + (i - 1) * spread);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTrainContact(train, rowY, dir) {
    const phase = Math.sin(_now * 0.035 + train.x * 0.02);
    const contactY = rowY + CELL * 0.74;
    ctx.save();
    ctx.strokeStyle = 'rgba(205,190,170,0.20)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(train.x, contactY + phase);
    ctx.lineTo(train.x + train.width, contactY - phase);
    ctx.stroke();
    if (Math.abs(phase) > 0.96) {
      const sparkX = dir > 0 ? train.x + train.width * 0.78 : train.x + train.width * 0.22;
      ctx.strokeStyle = 'rgba(255,208,120,0.52)';
      ctx.beginPath();
      ctx.moveTo(sparkX, contactY);
      ctx.lineTo(sparkX - dir * CELL * 0.10, contactY - CELL * 0.08);
      ctx.stroke();
    }
    ctx.restore();
  }
```

Call `drawVehicleContact(row, rowY, car)` after the car shadow and before the car body. Call `drawTrainContact(train, rowY, dir)` after the train shadow and before the train sprite. Dry roads draw no continuous wheel smoke.

- [x] **Step 6: Verify, clean up, and commit Phase 2** — completed in `b26b182`.

Run:

```bash
node scripts/test-game-vfx.mjs
node --check public/game/game.js
git diff --check
```

Update the Phase 2 ledger, then commit only Task 4 hunks:

```bash
git add -p public/game/game.js scripts/test-game-vfx.mjs docs/superpowers/plans/2026-07-12-game-vfx-system.md
git diff --cached --check
git commit -m "feat(game): add surface-aware contact effects"
```

---

## Phase 3 — Weather and lighting

### Task 5: Layer precipitation, preserve emissive effects, and couple lightning to the world

**Files:**
- Modify: `scripts/test-game-vfx.mjs`
- Modify: `public/game/game.js:3044-3248`
- Modify: `public/game/game.js:3706-3893`
- Modify: `public/game/game.js:3907-4268`

**Interfaces:**
- Consumes: `_surfaceForRow`, `nightRatio`, `weatherState`, `weatherRatio`, and `lightningFlash`.
- Produces: `drawWeatherFar(W, H)`, `drawWeatherNear(W, H)`, `drawWorldEmissive()`, and `drawCarLights(row, rowY, car)`.

- [ ] **Step 1: Add failing render-order and weather assertions**

Append:

```js
assert.match(gameRuntime, /function drawWeatherFar\(W, H\)/);
assert.match(gameRuntime, /function drawWeatherNear\(W, H\)/);
assert.match(gameRuntime, /function drawWorldEmissive\(\)/);
assert.match(gameRuntime, /function drawCarLights\(row, rowY, car\)/);

const drawStart = gameRuntime.indexOf('function draw(dt)');
const drawEnd = gameRuntime.indexOf('// ── Stars', drawStart);
const drawBody = gameRuntime.slice(drawStart, drawEnd);
assert.ok(drawBody.indexOf('drawWeatherFar(W, H)') < drawBody.indexOf('drawRows()'));
assert.ok(drawBody.indexOf('drawWorldEmissive()') > drawBody.indexOf('Night overlay'));
assert.ok(drawBody.indexOf('drawWeatherNear(W, H)') > drawBody.indexOf('drawWorldEmissive()'));
```

- [ ] **Step 2: Run and verify failure**

Run `node scripts/test-game-vfx.mjs`.

Expected: FAIL on `drawWeatherFar`.

- [ ] **Step 3: Split precipitation into far and near layers**

Add:

```js
  function drawWeatherFar(W, H) {
    if (weatherRatio <= 0.01) return;
    if (weatherState === 2) return;
    if (weatherState !== 1 && weatherState !== 3) return;
    drawPrecipitationLayer(W, H, 'far');
  }

  function drawWeatherNear(W, H) {
    if (weatherRatio <= 0.01) return;
    if (weatherState === 2) drawFog(W, H);
    else if (weatherState === 1) drawPrecipitationLayer(W, H, 'near');
    else if (weatherState === 3) {
      drawPrecipitationLayer(W, H, 'near');
      drawLightning(W, H);
    } else if (weatherState === 4) drawWind(W, H);
  }

  function drawPrecipitationLayer(W, H, layer) {
    const intensity = Math.min(weatherRatio * 1.5, 1);
    const mode = _precipBiome();
    const start = layer === 'far' ? 0 : Math.floor(rainParticles.length * 0.68);
    const end = layer === 'far' ? Math.floor(rainParticles.length * 0.68) : rainParticles.length;
    ctx.save();
    for (let i = start; i < end; i++) {
      const p = rainParticles[i];
      const px = p.x * W;
      const py = p.y * H;
      const nearScale = layer === 'near' ? 1.35 : 0.72;
      ctx.globalAlpha = p.alpha * intensity * (layer === 'near' ? 0.72 : 0.40);
      if (mode === 'snow') {
        ctx.fillStyle = 'rgb(240,248,255)';
        ctx.beginPath();
        ctx.arc(px, py, (p.width || 1) * nearScale, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const sand = mode === 'desert';
        const len = p.len * H * nearScale;
        ctx.strokeStyle = sand ? 'rgb(214,178,110)' : 'rgb(185,215,255)';
        ctx.lineWidth = (p.width || 1) * nearScale;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - len * (sand ? 2.4 : weatherState === 3 ? 0.45 : 0.2), py + len);
        ctx.stroke();
      }
    }
    if (layer === 'near' && mode !== 'snow' && mode !== 'desert') {
      _drawSplashes(W, H, intensity, weatherState === 3);
    }
    ctx.restore();
  }
```

Keep splash generation in the near rain layer only. Keep sandstorm without splashes. Call `drawWeatherFar(W, H)` after sky/stars/moon and before the world transform. Replace the old weather dispatch after world rendering with `drawWeatherNear(W, H)`.

- [ ] **Step 4: Move emissive work after the night overlay**

Add one cached right-facing beam to `_fxS()` so `drawCarLights` does not allocate gradients per car per frame:

```js
    const beamCanvas = document.createElement('canvas');
    beamCanvas.width = 192;
    beamCanvas.height = 96;
    const beamCtx = beamCanvas.getContext('2d');
    const beamGradient = beamCtx.createLinearGradient(0, 48, 192, 48);
    beamGradient.addColorStop(0, 'rgba(255,240,190,0.20)');
    beamGradient.addColorStop(0.45, 'rgba(255,240,190,0.07)');
    beamGradient.addColorStop(1, 'rgba(255,240,190,0)');
    beamCtx.fillStyle = beamGradient;
    beamCtx.beginPath();
    beamCtx.moveTo(0, 40);
    beamCtx.lineTo(192, 4);
    beamCtx.lineTo(192, 92);
    beamCtx.lineTo(0, 56);
    beamCtx.closePath();
    beamCtx.fill();
```

Expose it as `hlBeam: beamCanvas` in the cached sprite object. Extract the existing headlight, taillight, siren glow, and wet-reflection responsibilities from `drawCars` into this complete body-only-light function:

```js
  function drawCarLights(row, rowY, car) {
    const isSiren = car.isSirenCar === true;
    if (nightRatio <= 0.15 && !isSiren) return;

    const x = car.x;
    const y = rowY + (CELL - car.height) / 2;
    const spriteName = isSiren
      ? 'police_siren'
      : (car.spriteKey || getSpriteName(row.idx * 7 + (car.spriteSlot || 0)));
    const imageKey = spriteName === 'police_siren' ? 'police' : spriteName;
    const nativeW = spriteName === 'truck' || spriteName === 'firetruck' || spriteName === 'bus'
      ? 192
      : spriteName === 'ambulance' ? 128 : 96;
    const sx = car.width / nativeW;
    const sy = car.height / 46;
    const facingRight = car.speed > 0;
    const direction = facingRight ? 1 : -1;
    const lights = _CAR_LIGHT_MAP[imageKey] || _CAR_LIGHT_MAP.taxi;
    const fxs = _fxS();
    const alpha = Math.max(nightRatio * 0.85, isSiren ? 0.35 : 0);

    const toCanvas = (lx, ly) => ({
      x: facingRight ? x + lx * sx : x + (nativeW - lx) * sx,
      y: y + ly * sy,
    });

    if (nightRatio > 0.15 && lights.front.length >= 2) {
      const first = toCanvas(lights.front[0].x, lights.front[0].y);
      const second = toCanvas(lights.front[1].x, lights.front[1].y);
      const midX = (first.x + second.x) / 2;
      const midY = (first.y + second.y) / 2;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(midX, midY);
      ctx.scale(direction, 1);
      ctx.drawImage(fxs.hlBeam, 0, -CELL * 0.50, CELL * 1.65, CELL);
      ctx.restore();

      for (const light of lights.front) {
        const point = toCanvas(light.x, light.y);
        const glowR = CELL * 0.50;
        const dotR = Math.max(2, 4.5 * sx);
        ctx.globalAlpha = alpha;
        ctx.drawImage(fxs.hlGlow, point.x - glowR, point.y - glowR, glowR * 2, glowR * 2);
        ctx.drawImage(fxs.hlDot, point.x - dotR, point.y - dotR, dotR * 2, dotR * 2);
      }

      if (_surfaceForRow(row).id === 'wetRoad') {
        ctx.fillStyle = 'rgb(255,240,190)';
        for (const light of lights.front) {
          const point = toCanvas(light.x, light.y);
          ctx.globalAlpha = alpha * 0.08 * Math.min(weatherRatio, 1);
          ctx.beginPath();
          ctx.ellipse(point.x, point.y + CELL * 0.10, CELL * 0.025, CELL * 0.10, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    if (nightRatio > 0.15) {
      for (const light of lights.rear) {
        const point = toCanvas(light.x, light.y);
        const glowR = CELL * 0.22;
        ctx.globalAlpha = alpha;
        ctx.drawImage(fxs.tlGlow, point.x - glowR, point.y - glowR, glowR * 2, glowR * 2);
      }
    }

    if (isSiren) {
      const blink = Math.sin(sirenPhase * Math.PI * 6) > 0;
      const lightX = x + car.width * (facingRight ? 0.42 : 0.58);
      const redY = y + car.height * 0.35;
      const blueY = y + car.height * 0.65;
      ctx.fillStyle = blink ? 'rgba(255,35,35,0.92)' : 'rgba(35,105,255,0.92)';
      ctx.beginPath();
      ctx.arc(lightX, blink ? redY : blueY, CELL * 0.055, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
```

Delete the moved light/siren block from `drawCars`; that function must draw the shadow, wheel contact, and vehicle body only.

Add:

```js
  function _applyWorldTransform(W) {
    const worldW = COLS * CELL;
    const scale = getViewScale();
    const offsetX = (W - worldW * scale) / 2;
    ctx.translate(offsetX, 0);
    ctx.scale(scale, scale);
    ctx.translate(0, -cameraY);
  }

  function drawWorldEmissive() {
    const rows = World.getRows();
    for (const row of rows) {
      const y = World.rowToY(row.idx);
      if (row.type === 'road') {
        for (const car of row.obstacles) drawCarLights(row, y, car);
      }
    }
    drawShieldBursts(_frameDt);
    drawCoinEffects(_frameDt);
    drawScoreEffects(_frameDt);
  }
```

In `draw(dt)`, draw physical world content first. After restoring the world and drawing the existing night overlay, re-enter the transform and draw emissive content:

```js
    ctx.save();
    _applyWorldTransform(W);
    drawWorldEmissive();
    ctx.restore();
    drawWeatherNear(W, H);
```

Remove `drawShieldBursts`, `drawCoinEffects`, and `drawScoreEffects` from the pre-night world pass so they update and draw exactly once.

- [ ] **Step 5: Couple lightning to world response**

Use the existing `lightningFlash` in `drawGroundShadow` to reduce shadow alpha. In `drawWorldEmissive`, add a restrained world-space highlight when `lightningFlash > 0`:

```js
    if (lightningFlash > 0) {
      const flash = Math.min(lightningFlash, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = flash * 0.12;
      ctx.fillStyle = '#C9D8FF';
      ctx.fillRect(0, cameraY, COLS * CELL, (_viewH || canvas.height) / getViewScale());
      ctx.restore();
    }
```

Keep the existing delayed thunder. Do not add repeated full-white frames.

- [ ] **Step 6: Verify and commit Phase 3**

```bash
node scripts/test-game-vfx.mjs
node --check public/game/game.js
git diff --check
git add -p public/game/game.js scripts/test-game-vfx.mjs docs/superpowers/plans/2026-07-12-game-vfx-system.md
git diff --cached --check
git commit -m "feat(game): layer weather and emissive lighting"
```

Update Phase 3 with the commit hash.

---

## Phase 4 — Gameplay and cosmetics

### Task 6: Coin, score, magnet, shield, and Second Chance feedback

**Files:**
- Modify: `scripts/test-game-vfx.mjs`
- Modify: `public/game/game.js:2389-2402`
- Modify: `public/game/game.js:5074-5203`

**Interfaces:**
- Produces: `emitGameEffect(event, payload)` as the renderer's semantic entry point.
- Preserves wrappers: `addCoinEffect`, `addScoreEffect`, `addMagnetCoin`, and `addShieldBurst`.

- [ ] **Step 1: Add failing semantic-feedback assertions**

Append:

```js
assert.match(gameRuntime, /function emitGameEffect\(event, payload\)/);
assert.match(gameRuntime, /emitGameEffect\('coinPickup'/);
assert.match(gameRuntime, /emitGameEffect\('shieldHit'/);
assert.match(gameRuntime, /const GAME_FX_FONT =/);
assert.match(gameRuntime, /function drawSecondChanceScreen\(W, H\)/);
assert.match(gameRuntime, /secondChanceFx/);
assert.doesNotMatch(gameRuntime, /ctx\.font\s*=\s*`bold \$\{Math\.round\(CELL.*Arial/);
```

- [ ] **Step 2: Run and verify failure**

Run `node scripts/test-game-vfx.mjs`.

Expected: FAIL on `emitGameEffect`.

- [ ] **Step 3: Add the semantic dispatcher and preserve callers**

Add:

```js
  const GAME_FX_FONT = "'Courier New', monospace";
  let secondChanceFx = null;

  function emitGameEffect(event, payload) {
    if (event === 'coinPickup') coinEffects.push({ ...payload, age: 0 });
    else if (event === 'scoreTick') scoreEffects.push({ ...payload, age: 0 });
    else if (event === 'magnetPull') magnetCoins.push({ ...payload, age: 0 });
    else if (event === 'shieldHit') shieldBursts.push({ ...payload, age: 0 });
  }

  function addCoinEffect(x, y, value = 1) {
    emitGameEffect('coinPickup', { x, y, value });
  }

  function addScoreEffect(x, y) {
    emitGameEffect('scoreTick', { x, y });
  }

  function addMagnetCoin(fromX, fromY, toX, toY, col, rowIdx, value = 1) {
    emitGameEffect('magnetPull', { fromX, fromY, toX, toY, col, rowIdx, value });
  }

  function addShieldBurst(x, y) {
    emitGameEffect('shieldHit', { x, y, direction: 0 });
    secondChanceFx = { x, y, age: 0, life: 0.42 };
  }
```

- [ ] **Step 4: Retune each approved effect**

Make these exact behavior changes:

```js
// Coin pickup text
ctx.font = `700 ${Math.round(CELL * (isDouble ? 0.34 : 0.29))}px ${GAME_FX_FONT}`;
ctx.lineWidth = 1.25;

// Score tick
ctx.font = `700 ${Math.round(CELL * 0.23)}px ${GAME_FX_FONT}`;
ctx.globalAlpha = alpha * 0.72;

// Magnet trail
ctx.globalAlpha = 0.42 * (1 - t);
ctx.lineWidth = Math.max(1, CELL * 0.032 * (1 - t * 0.35));

// Shield shell
ctx.strokeStyle = 'rgba(120,164,255,0.82)';
ctx.lineWidth = Math.max(1, CELL * 0.055 * (1 - t));
```

For double coins, add this after the value text:

```js
      if (isDouble && t < 0.45) {
        const arcFade = 1 - t / 0.45;
        ctx.strokeStyle = `rgba(255,224,92,${arcFade * 0.75})`;
        ctx.lineWidth = 1.5;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(e.x + side * CELL * 0.16, e.y - rise, CELL * 0.11, side < 0 ? -1.2 : 1.95, side < 0 ? 1.2 : 4.35);
          ctx.stroke();
        }
      }
```

For shield absorption, skew the shell by `b.direction * CELL * 0.08`, remove the large opaque fill, and draw three deterministic fracture lines:

```js
      const impactX = b.x + (b.direction || 0) * CELL * 0.08;
      for (let fracture = 0; fracture < 3; fracture++) {
        const angle = -0.7 + fracture * 0.7 + (b.direction || 0) * 0.25;
        const length = CELL * (0.18 + fracture * 0.04) * (1 - t);
        ctx.globalAlpha = alpha * 0.68;
        ctx.beginPath();
        ctx.moveTo(impactX, b.y - CELL * 0.08);
        ctx.lineTo(impactX + Math.cos(angle) * length, b.y - CELL * 0.08 + Math.sin(angle) * length);
        ctx.stroke();
      }
```

Add a screen-space Second Chance treatment that changes only visual clocks, never collision or invincibility timing:

```js
  function _visualDt(dt) {
    return secondChanceFx && secondChanceFx.age < 0.18 ? dt * 0.45 : dt;
  }

  function drawSecondChanceScreen(W, H) {
    if (!secondChanceFx) return;
    secondChanceFx.age += _frameDt;
    if (secondChanceFx.age >= secondChanceFx.life) {
      secondChanceFx = null;
      return;
    }
    const t = secondChanceFx.age / secondChanceFx.life;
    const fade = 1 - t;
    ctx.save();
    ctx.fillStyle = `rgba(105,135,205,${fade * 0.10})`;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = `rgba(155,190,255,${fade * 0.55})`;
    ctx.lineWidth = Math.max(1, 3 * fade);
    for (let ring = 0; ring < 2; ring++) {
      const radius = Math.min(W, H) * (0.10 + t * 0.28 + ring * 0.05);
      ctx.beginPath();
      ctx.ellipse(W / 2, H * 0.56, radius, radius * 0.42, 0, Math.PI * 0.15, Math.PI * 1.85);
      ctx.stroke();
    }
    ctx.restore();
  }
```

Use `_visualDt(dt_approx)` only for `waterTime`, `waveTime`, `walkTime`, and VFX animation clocks during the first 0.18 seconds. Call `drawSecondChanceScreen(W, H)` after the night overlay and before `drawWorldEmissive`. Do not change booster duration, Player timers, collision, or invincibility logic.

- [ ] **Step 5: Verify and commit Task 6**

```bash
node scripts/test-game-vfx.mjs
node --check public/game/game.js
git diff --check
git add -p public/game/game.js scripts/test-game-vfx.mjs
git diff --cached --check
git commit -m "feat(game): polish reward and booster feedback"
```

### Task 7: Train warning, collision semantics, physical deaths, and directional shake

**Files:**
- Modify: `scripts/test-game-vfx.mjs`
- Modify: `public/game/game.js:2427-2530`
- Modify: `public/game/game.js:3149-3156`
- Modify: `public/game/game.js:4580-4618`
- Modify: `public/game/game.js:4705-5072`
- Modify: `public/game/game.js:9488-9512`

**Interfaces:**
- Changes: `triggerDeath(x, y, type, direction = 0)`.
- Changes: `triggerShake(magnitude, duration, directionX = 0, directionY = 0.2)`.
- Produces: `drawPhysicalDeath(t)` before optional cosmetic overlay.

- [ ] **Step 1: Add failing hazard assertions**

Append:

```js
assert.match(gameRuntime, /function triggerDeath\(x, y, type, direction = 0\)/);
assert.match(gameRuntime, /function drawPhysicalDeath\(t\)/);
assert.match(gameRuntime, /row\.type === 'train' \? 'train'/);
assert.doesNotMatch(gameRuntime, /fillText\('⚠'/);
assert.match(gameRuntime, /shakeDirectionX/);
assert.match(gameRuntime, /shakeDuration/);
assert.match(gameRuntime, /deathSurfaceId/);
assert.match(gameRuntime, /const deathFxPool = GameVfx\.createPool\(40\)/);
assert.match(gameRuntime, /const isImpactCause = type === 'car' \|\| type === 'train'/);
assert.doesNotMatch(gameRuntime, /Renderer\.triggerShake\(16, 0\.55\)/);
```

- [ ] **Step 2: Verify failure**

Run `node scripts/test-game-vfx.mjs`.

Expected: FAIL on the four-argument `triggerDeath`.

- [ ] **Step 3: Make shake deterministic and directional**

Replace the shake state and update logic with:

```js
  let shakeTimer = 0;
  let shakeDuration = 0;
  let shakePeak = 0;
  let shakeDirectionX = 0;
  let shakeDirectionY = 0.2;
  let shakePhase = 0;

  function triggerShake(magnitude, duration, directionX = 0, directionY = 0.2) {
    shakePeak = Math.max(shakePeak, magnitude || 8);
    shakeDuration = Math.max(shakeDuration, duration || 0.38);
    shakeTimer = Math.max(shakeTimer, shakeDuration);
    shakeDirectionX = Math.max(-1, Math.min(1, directionX));
    shakeDirectionY = Math.max(-1, Math.min(1, directionY));
    shakePhase = 0;
  }
```

During `draw(dt)`, calculate:

```js
    let shakeX = 0;
    let shakeY = 0;
    if (shakeTimer > 0 && shakeDuration > 0) {
      shakePhase += dt_approx * 52;
      const envelope = Math.pow(shakeTimer / shakeDuration, 2);
      const impulse = Math.sin(shakePhase) * shakePeak * envelope;
      shakeX = impulse * (shakeDirectionX || 0.35);
      shakeY = impulse * shakeDirectionY;
    }
```

- [ ] **Step 4: Preserve car, train, and water as distinct visual causes**

Change death dispatch in the main loop to:

```js
        const type = row && row.type === 'water'
          ? 'water'
          : row && row.type === 'train'
            ? 'train'
            : 'car';
        const direction = row && Number.isFinite(row.dir) ? row.dir : 0;
        Renderer.triggerDeath(ps.visualX, ps.visualY, type, direction);
```

Change the renderer entry point to:

```js
  let deathDirection = 0;
  let deathSurfaceId = 'neutral';
  const deathFxPool = GameVfx.createPool(40);
  const deathParticles = deathFxPool.items;

  function triggerDeath(x, y, type, direction = 0) {
    deathActive = true;
    deathTimer = 0;
    deathX = x;
    deathY = y;
    deathType = type || 'car';
    deathDirection = Math.max(-1, Math.min(1, direction));
    deathSurfaceId = _surfaceForRow(World.getRow(Player.getState().row)).id;
    deathFxPool.clear();
    for (const particle of buildParticles(x, y, deathType)) {
      deathFxPool.spawn(particle, 'impact');
    }
    const magnitude = deathType === 'train' ? 14 : deathType === 'water' ? 2 : 9;
    const duration = deathType === 'train' ? 0.52 : deathType === 'water' ? 0.18 : 0.34;
    triggerShake(magnitude, duration, deathDirection, deathType === 'water' ? 0.05 : 0.22);
  }
```

Delete the old train-only `Renderer.triggerShake(16, 0.55)` branch from the main loop; `triggerDeath` now emits the single correctly directed impulse.

At the top of `buildParticles`, add `const isImpactCause = type === 'car' || type === 'train';` and replace every `type === 'car'` count, gravity, vertical speed, and palette branch in that function with `isImpactCause`. Use this train palette where a palette branch is selected:

```js
const impactColors = type === 'train'
  ? ['#FFD8A0', '#B9C0C8', '#8E969F', '#FFF2CC']
  : ['#FFC56B', '#E89A45', '#8E8174', '#FFF0C8'];
```

Also change `stopDeath` in this task, not later, because `deathParticles` is now a pooled constant:

```js
  function stopDeath() {
    deathActive = false;
    deathTimer = 0;
    deathFxPool.clear();
    trails.length = 0;
  }
```

- [ ] **Step 5: Draw physical death before cosmetics**

Add `drawPhysicalDeath(t)` that renders:

```js
  function drawPhysicalDeath(t) {
    if (deathType === 'water') {
      for (let i = 0; i < 3; i++) {
        const rt = Math.max(0, t - i * 0.14);
        if (rt === 0) continue;
        ctx.strokeStyle = `rgba(180,228,255,${Math.max(0, 0.55 - rt * 0.65)})`;
        ctx.lineWidth = Math.max(0.8, 2.4 * (1 - rt));
        ctx.beginPath();
        ctx.ellipse(deathX, deathY, CELL * (0.2 + rt), CELL * (0.07 + rt * 0.34), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      return;
    }

    const train = deathType === 'train';
    const count = train ? 10 : 6;
    const surface = GameVfx.getSurface(deathSurfaceId);
    ctx.fillStyle = train ? '#FFD8A0' : surface.mark;
    for (let i = 0; i < count; i++) {
      const angle = i * 2.399 + deathDirection * 0.45;
      const distance = CELL * t * (train ? 1.15 : 0.72);
      ctx.globalAlpha = Math.max(0, 1 - t * 1.25);
      ctx.beginPath();
      ctx.arc(deathX + Math.cos(angle) * distance + deathDirection * distance * 0.45, deathY + Math.sin(angle) * distance * 0.45, CELL * 0.025, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
```

Replace the dispatch with this order. The default pack uses only the physical event; purchased packs add an overlay:

```js
  function drawDeathAnimation(dt) {
    const t = deathTimer / DEATH_DUR;
    drawPhysicalDeath(t);
    const pack = typeof Shop !== 'undefined' && Shop.getEquippedDeath
      ? Shop.getEquippedDeath()
      : 'default';
    if (pack === 'death_comic') drawDeathComic(dt);
    else if (pack === 'death_pixel') drawDeathPixel(dt);
    else if (pack === 'death_dramatic') drawDeathDramatic(dt);
  }
```

Delete `drawDeathDefault` after moving any generic cleanup it owns into `drawPhysicalDeath`. Remove the orange radial explosion and shockwave for cars. In Task 8, trim comic/pixel/dramatic functions to their cosmetic accents so they do not repeat the physical ripple or collision burst.

- [ ] **Step 6: Replace the train emoji warning**

In `drawTrainRow`, replace the full-row warning fill and `⚠` glyphs with two signal lamps and entry-side chevrons:

```js
      if (blink) {
        const entryX = row.dir > 0 ? CELL * 0.38 : W - CELL * 0.38;
        ctx.fillStyle = 'rgba(255,45,30,0.18)';
        ctx.fillRect(0, y + CELL * 0.16, W, CELL * 0.08);
        ctx.fillRect(0, y + CELL * 0.70, W, CELL * 0.08);
        ctx.fillStyle = '#FF493D';
        ctx.beginPath();
        ctx.arc(entryX, y + CELL * 0.28, CELL * 0.085, 0, Math.PI * 2);
        ctx.arc(entryX, y + CELL * 0.72, CELL * 0.085, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,210,170,0.9)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const x = entryX + row.dir * CELL * (0.18 + i * 0.12);
          ctx.beginPath();
          ctx.moveTo(x - row.dir * CELL * 0.06, y + CELL * 0.40);
          ctx.lineTo(x, y + CELL * 0.50);
          ctx.lineTo(x - row.dir * CELL * 0.06, y + CELL * 0.60);
          ctx.stroke();
        }
      }
```

- [ ] **Step 7: Verify and commit Task 7**

```bash
node scripts/test-game-vfx.mjs
node --check public/game/game.js
git diff --check
git add -p public/game/game.js scripts/test-game-vfx.mjs
git diff --cached --check
git commit -m "feat(game): add physical hazard feedback"
```

### Task 8: Restyle cosmetic trails and make cosmetics additive

**Files:**
- Modify: `scripts/test-game-vfx.mjs`
- Modify: `public/game/game.js:4275-4590`
- Modify: `public/game/game.js:4705-5072`

**Interfaces:**
- Consumes: `addLandingEffect`, `drawPhysicalDeath`, `coinImg`, and `GameVfx` priorities.
- Produces: `addCosmeticTrail(x, y, variant)` and `drawCosmeticTrails()`.

- [ ] **Step 1: Add failing cosmetic composition assertions**

Append:

```js
assert.match(gameRuntime, /function addCosmeticTrail\(x, y, variant\)/);
assert.match(gameRuntime, /function drawCosmeticTrails\(\)/);
assert.match(gameRuntime, /const cosmeticFxPool = GameVfx\.createPool\(48\)/);

const deathDispatchStart = gameRuntime.indexOf('function drawDeathAnimation');
const deathDispatchEnd = gameRuntime.indexOf('function drawDeathComic', deathDispatchStart);
const deathDispatch = gameRuntime.slice(deathDispatchStart, deathDispatchEnd);
assert.ok(deathDispatch.indexOf('drawPhysicalDeath') < deathDispatch.indexOf('drawDeathComic'), 'physical death draws before cosmetic overlay');
const cosmeticStart = gameRuntime.indexOf('function drawCosmeticTrails()');
const cosmeticEnd = gameRuntime.indexOf('// ── Train Row', cosmeticStart);
assert.match(gameRuntime.slice(cosmeticStart, cosmeticEnd), /ctx\.drawImage\(coinImg/);
```

- [ ] **Step 2: Verify failure**

Run `node scripts/test-game-vfx.mjs`.

Expected: FAIL at `addCosmeticTrail`.

- [ ] **Step 3: Split physical and cosmetic landing effects**

After `addLandingEffect` always spawns the physical preset, read the equipped trail and add an overlay:

```js
  const cosmeticFxPool = GameVfx.createPool(48);
  const trails = cosmeticFxPool.items;

  function addCosmeticTrail(x, y, variant) {
    if (!variant || variant === 'default') return;
    const kind = variant.replace(/^trail_/, '');
    cosmeticFxPool.spawn({
      x,
      y,
      age: 0,
      maxAge: TRAIL_LIFE[kind] || 0.8,
      type: kind,
      seed: Math.random(),
      particles: _makeTrailParticles(kind),
    }, 'feedback');
  }
```

Call it from `addLandingEffect` after the physical spawn:

```js
    const variant = typeof Shop !== 'undefined' && Shop.getEquippedTrail
      ? Shop.getEquippedTrail()
      : 'default';
    addCosmeticTrail(x, y, variant);
```

Rename the old custom portion of `drawTrails` to `drawCosmeticTrails`; delete its default grass/dust/ripple branches because those now belong to `drawPhysicalTrails`. Replace the old global age/prune loop with this pool-safe loop:

```js
    for (let i = trails.length - 1; i >= 0; i--) {
      trails[i].age += dt_approx;
      if (trails[i].age >= trails[i].maxAge) cosmeticFxPool.releaseAt(i);
    }
```

Change the Task 7 cleanup line from `trails.length = 0` to `cosmeticFxPool.clear()` so pooled objects are reusable.

- [ ] **Step 4: Apply the approved cosmetic forms**

Use these exact rendering rules:

- `sparkle`: six particles maximum, four-point geometry, warm core, no circular halo.
- `fire`: teardrop flame, one dark ember for every two flames, maximum seven particles.
- `hearts`: four custom Bezier hearts maximum, no text or emoji glyphs.
- `coins`: draw `coinImg` when loaded, horizontally squash it for spin, and use a gold ellipse only as fallback.
- `rainbow`: connect the six particles as one low-alpha prismatic ribbon, then draw small endpoint glints.
- `pixel`, `comic`, and `dramatic`: remain death overlays only; physical collision or water response always appears first.

Trim death packs explicitly:

- `drawDeathComic` keeps the yellow graphic starburst and four spinning stars for impacts, or the five stylized bubbles for water; remove its generic radial flash and duplicate generic particle loop.
- `drawDeathPixel` keeps the square grid and vortex/dissolve geometry; it may recolor pooled death particles but does not add a second physical shockwave.
- `drawDeathDramatic` keeps the restrained lighting/vignette and slower enlarged particles; remove its second water-ripple loop because `drawPhysicalDeath` already owns ripples.

For the coin branch, use:

```js
          if (coinImg) {
            const size = p.size * 2;
            ctx.save();
            ctx.translate(px, py);
            ctx.scale(Math.max(0.12, squash), 1);
            ctx.drawImage(coinImg, -size / 2, -size / 2, size, size);
            ctx.restore();
          } else {
            ctx.fillStyle = '#FFD740';
            ctx.beginPath();
            ctx.ellipse(px, py, Math.max(1, p.size * squash), p.size, 0, 0, Math.PI * 2);
            ctx.fill();
          }
```

- [ ] **Step 5: Verify and commit Phase 4**

```bash
node scripts/test-game-vfx.mjs
node --check public/game/game.js
node scripts/test-reward-labels.mjs
git diff --check
git add -p public/game/game.js scripts/test-game-vfx.mjs docs/superpowers/plans/2026-07-12-game-vfx-system.md
git diff --cached --check
git commit -m "feat(game): unify physical and cosmetic effects"
```

Update Phase 4 with the Task 8 commit hash.

---

## Phase 5 — Performance and verification

### Task 9: Adaptive quality, reduced effects, diagnostics, cleanup, and regression verification

**Files:**
- Modify: `scripts/test-game-vfx.mjs`
- Modify: `public/game/game.js:2288-2535`
- Modify: `public/game/game.js:3044-3148`
- Modify: `public/game/game.js:5488-5496`
- Modify: `public/game/game.js:5496` Renderer exports

**Interfaces:**
- Produces: `_updateFxQuality(dt)`.
- Produces: `_fxCount(base) -> integer`.
- Produces: `Renderer._dbgVfx() -> diagnostics object`.
- Produces: `Renderer._dbgReducedEffects(on)`.

- [ ] **Step 1: Add failing quality and cleanup tests**

Append:

```js
assert.match(gameRuntime, /function _updateFxQuality\(dt\)/);
assert.match(gameRuntime, /function _fxCount\(base\)/);
assert.match(gameRuntime, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
assert.match(gameRuntime, /function _dbgVfx\(\)/);
assert.match(gameRuntime, /physicalFxPool\.clear\(\)/);
assert.match(gameRuntime, /cosmeticFxPool\.clear\(\)/);
assert.match(gameRuntime, /deathFxPool\.clear\(\)/);
assert.match(gameRuntime, /Number\.isFinite\(fx\.x\)/);
assert.match(gameRuntime, /_dbgReducedEffects/);
```

- [ ] **Step 2: Verify failure**

Run `node scripts/test-game-vfx.mjs`.

Expected: FAIL on `_updateFxQuality`.

- [ ] **Step 3: Add a stable adaptive quality controller**

Inside `Renderer`, add:

```js
  const _reducedMotionQuery = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  let _reducedEffectsForce = null;
  let _frameMsAverage = 16.7;
  let _slowFxFrames = 0;
  let _recoveryFxFrames = 0;
  let _fxQuality = 1;

  function _reducedEffects() {
    return _reducedEffectsForce === null
      ? Boolean(_reducedMotionQuery && _reducedMotionQuery.matches)
      : _reducedEffectsForce;
  }

  function _updateFxQuality(dt) {
    const frameMs = Math.min(50, Math.max(1, dt * 1000));
    _frameMsAverage += (frameMs - _frameMsAverage) * 0.04;
    if (_reducedEffects()) {
      _fxQuality = 0.55;
      _slowFxFrames = 0;
      _recoveryFxFrames = 0;
      return;
    }
    if (_frameMsAverage > 22) {
      _slowFxFrames++;
      _recoveryFxFrames = 0;
      if (_slowFxFrames >= 120) _fxQuality = 0.65;
    } else if (_frameMsAverage < 18) {
      _recoveryFxFrames++;
      _slowFxFrames = 0;
      if (_recoveryFxFrames >= 300) _fxQuality = 1;
    } else {
      _slowFxFrames = 0;
      _recoveryFxFrames = 0;
    }
  }

  function _fxCount(base) {
    return Math.max(1, Math.round(base * _fxQuality));
  }
```

Call `_updateFxQuality(dt_approx)` once at the start of `draw(dt)`. Apply `_fxCount` only to ambient rain, snow, sand, wind, fog, grass, and cosmetic particle counts. Do not scale collision sparks, warning lights, shield feedback, or the player shadow below their semantic minimum.

At the top of every pooled physical/cosmetic draw loop, discard invalid data and skip offscreen world-space particles before drawing geometry:

```js
      if (!Number.isFinite(fx.x) || !Number.isFinite(fx.y) || !Number.isFinite(fx.age) || !Number.isFinite(fx.life)) {
        physicalFxPool.releaseAt(i);
        continue;
      }
      const visibleTop = cameraY - CELL * 2;
      const visibleBottom = cameraY + (_viewH || canvas.height) / getViewScale() + CELL * 2;
      if (fx.y < visibleTop || fx.y > visibleBottom) continue;
```

Use the same guard with `cosmeticFxPool.releaseAt(i)` inside `drawCosmeticTrails`. Death particles remain eligible until their short lifetime expires because they are always created near the player.

- [ ] **Step 4: Complete reset and diagnostic hooks**

Extend cleanup:

```js
  function stopDeath() {
    deathActive = false;
    deathTimer = 0;
    deathFxPool.clear();
    cosmeticFxPool.clear();
    physicalFxPool.clear();
    shieldBursts.length = 0;
    magnetCoins.length = 0;
    coinEffects.length = 0;
    scoreEffects.length = 0;
  }

  function _dbgVfx() {
    return {
      quality: _fxQuality,
      frameMsAverage: _frameMsAverage,
      reducedEffects: _reducedEffects(),
      physical: physicalFxPool.stats(),
      cosmetics: cosmeticFxPool.stats(),
      deaths: deathFxPool.stats(),
      rain: rainParticles.length,
      wind: windParticles.length,
      shadows: _shadowSpriteCache.size,
    };
  }

  function _dbgReducedEffects(on) {
    _reducedEffectsForce = typeof on === 'boolean' ? on : null;
  }
```

Export `emitGameEffect`, `addLandingEffect`, `_dbgVfx`, and `_dbgReducedEffects` from `Renderer`. Keep compatibility exports until all existing callers are migrated.

- [ ] **Step 5: Run the complete automated verification set**

Run:

```bash
node scripts/test-game-vfx.mjs
node scripts/test-runner-hub.mjs
node scripts/test-reward-labels.mjs
node scripts/test-quest-icons.mjs
node --check public/game/game.js
npm run lint
git diff --check
```

Expected:

- `game VFX assertions passed`;
- existing runner hub, reward label, and quest icon assertions pass;
- JavaScript syntax check exits zero;
- ESLint exits zero;
- whitespace check prints no errors.

- [ ] **Step 6: Perform the visual matrix without starting a server**

If Ivan already has the app running, use the existing session and these debug calls from the browser console:

```js
__GAME_DBG.Renderer._dbgNight(false);
__GAME_DBG.Renderer._dbgWeather(0);
__GAME_DBG.Renderer._dbgReducedEffects(false);
__GAME_DBG.Renderer._dbgVfx();
```

Repeat with weather `1`, `2`, `3`, and `4`, then night `true`, and finally reduced effects `true`. Check:

- grass, sand, snow, dry road, wet road, water, and rail bed contact;
- player, car, train, log, and decoration shadows;
- headlights and reward glows after night tint;
- rain, snow, sandstorm, fog, wind, and lightning readability;
- car, train, and water deaths;
- default and every owned cosmetic trail/death effect;
- no effect covers the HUD or hides the next two hazard rows.

If no server is already running, stop here and request explicit permission before `npm run dev`.

- [ ] **Step 7: Commit the final phase and mark the ledger complete**

Update all completed task boxes and replace every Phase Ledger `not-started` value with its commit hash. Then run:

```bash
git add -p public/game/game.js scripts/test-game-vfx.mjs docs/superpowers/plans/2026-07-12-game-vfx-system.md
git diff --cached --check
git diff --cached
git commit -m "perf(game): bound and verify VFX rendering"
```

Expected: only VFX implementation, test, and plan-progress hunks are staged. Do not stage unrelated existing modifications.

## Specification Coverage Map

| Specification area | Implementation task |
|---|---|
| Shared surface context, priorities, pooling, safe fallbacks | Task 1 |
| Grass, sand, and snow material texture | Task 2 |
| Player, car, train, log, and decoration shadows | Task 3 |
| Landing marks, dust, snow, splashes, wet wheel spray, prop bases, log wakes, rail contact | Task 4 |
| Rain/snow/sand depth, fog/wind routing, night/emissive order, lightning response | Task 5 |
| Coins, score, magnet, shield, and Second Chance | Task 6 |
| Train warning, directional shake, car/train/water collision semantics | Task 7 |
| Additive cosmetic trails and death packs | Task 8 |
| Reduced effects, adaptive quality, cleanup, diagnostics, regression and visual matrix | Task 9 |

## Completion Criteria

- Every task and Phase Ledger checkbox is complete.
- Every automated command in Task 9 passes.
- Surface identity is correct for grass, desert sand, snow, dry road, wet road, water, and rail bed.
- Player, vehicles, logs, train, and decorations use the unified shadow renderer.
- Physical landing and collision response always renders before cosmetic accents.
- Weather has depth and material response without hiding immediate hazards.
- Emissive lights remain visible after night tint.
- Reduced-effects and low-quality paths retain gameplay-critical feedback.
- No unrelated dirty file is reverted, staged, or committed.
