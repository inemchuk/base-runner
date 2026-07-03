# Critical Gameplay + VFX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the top-priority bugs from the 2026-07-02 gameplay/graphics review: frame-locked animation timing, missing retina support, weather fade-out snap, wrong moon color, continue-after-water-death coin burn, shield booster wasted at run start, localStorage in the hot path, and the train warning that never fires.

**Architecture:** All changes are in `public/game/game.js` (vanilla IIFE modules: Renderer, Player, World, Save, Loadout). No API/server changes. Each task is independent and separately committable; Task 1 (real dt) must land before Task 3 (weather fade) because the fade rate becomes time-based.

**Tech Stack:** Vanilla canvas JS (no bundler for game.js), Next.js 16 shell. No unit-test harness exists for game.js (browser-global IIFE, canvas-bound) — verification is `node --check` for syntax plus scripted browser checks through the preview tools using debug handles exposed in Task 0.

**Testing convention:** After every edit run `node --check public/game/game.js` (syntax gate), then verify behavior in the running preview (server `dev` on port 3000, hard-reload to bust cached game.js). Debug handles from Task 0 (`window.__GAME_DBG`) let preview_eval reach module internals.

---

### Task 0: Expose debug handles for verification

**Files:**
- Modify: `public/game/game.js` (~line 8978, next to `window.Save = Save;`)

- [ ] **Step 1: Add debug exposure**

Find (near line 8978):

```js
  window.Save = Save;
  window.Shop = Shop;
```

Replace with:

```js
  window.Save = Save;
  window.Shop = Shop;
  // Debug/verification handles (client is trust-light anyway; used by preview checks)
  window.__GAME_DBG = { Renderer, World, Player, Loadout };
```

- [ ] **Step 2: Syntax check**

Run: `node --check public/game/game.js`
Expected: no output (exit 0)

- [ ] **Step 3: Verify in preview**

Hard-reload the preview page, then eval `typeof window.__GAME_DBG.Renderer.draw` → `"function"`.

- [ ] **Step 4: Commit**

```bash
git add public/game/game.js
git commit -m "chore: expose __GAME_DBG handles for preview verification"
```

---

### Task 1: Pass real dt into Renderer.draw() (fix frame-locked animation)

All render-side timers currently advance by a hardcoded `dt_approx = 0.016` per frame (game.js:2666) — 2x speed on 120Hz screens, half speed at 30fps. The real `dt` already exists in both callers.

**Files:**
- Modify: `public/game/game.js:2659-2758` (draw), `:8480` (gameLoop), `:8365` (menuLoop)

- [ ] **Step 1: Change draw() signature and dt source**

Find (line 2659-2666):

```js
  function draw() {
    if (!canvas) return;
    const W = canvas.width;
    const H = canvas.height;
    _now = Date.now(); // single timestamp for all animations this frame

    // Advance water animation
    const dt_approx = 0.016;
```

Replace with:

```js
  function draw(dt) {
    if (!canvas) return;
    const W = canvas.width;
    const H = canvas.height;
    _now = Date.now(); // single timestamp for all animations this frame

    // Real frame delta from the game loop; clamped, with a fallback for stray calls
    const dt_approx = (typeof dt === 'number' && dt > 0) ? Math.min(dt, 0.05) : 0.016;
```

Keeping the local name `dt_approx` means every existing use inside draw() (waterTime, sirenPhase, walkTime, rain/wind particles, lightning, trails, deathTimer, shake, squash, ring) picks up the real dt with zero further edits.

- [ ] **Step 2: Make the weather blend ramp time-based**

Find (line 2674-2677):

```js
    // Advance weather blend (slower for smoother transitions)
    const targetRatio = weatherState > 0 ? 1 : 0;
    weatherRatio += (targetRatio - weatherRatio) * 0.012;
    if (weatherRatio < 0.005) weatherRatio = 0; // snap to zero — stop residual work
```

Replace with:

```js
    // Advance weather blend (slower for smoother transitions; 0.012/frame @60fps ≈ 0.72/s)
    const targetRatio = weatherState > 0 ? 1 : 0;
    weatherRatio += (targetRatio - weatherRatio) * Math.min(1, dt_approx * 0.72);
    if (weatherRatio < 0.005) weatherRatio = 0; // snap to zero — stop residual work
```

(Task 3 modifies `targetRatio` again — if executing out of order, reconcile there.)

- [ ] **Step 3: Make the night transition time-based**

Find (line 2755-2758):

```js
    // Smoothly advance nightRatio toward target (slower for cinematic feel)
    const NIGHT_SPEED = 0.005;
    if (nightRatio < nightTarget) nightRatio = Math.min(nightRatio + NIGHT_SPEED, nightTarget);
    if (nightRatio > nightTarget) nightRatio = Math.max(nightRatio - NIGHT_SPEED, nightTarget);
```

Replace with:

```js
    // Smoothly advance nightRatio toward target (0.005/frame @60fps = 0.3/s)
    const NIGHT_STEP = 0.3 * dt_approx;
    if (nightRatio < nightTarget) nightRatio = Math.min(nightRatio + NIGHT_STEP, nightTarget);
    if (nightRatio > nightTarget) nightRatio = Math.max(nightRatio - NIGHT_STEP, nightTarget);
```

- [ ] **Step 4: Pass dt from both callers**

Line 8480 (gameLoop): `Renderer.draw();` → `Renderer.draw(dt);`
Line 8365 (menuLoop): `Renderer.draw();` → `Renderer.draw(dt);`

Confirm there are no other callers: `grep -n "Renderer.draw" public/game/game.js` must show exactly these two.

- [ ] **Step 5: Syntax check + preview verify**

Run: `node --check public/game/game.js` → exit 0.
Preview: hard reload, start a run, confirm rain/waves/walk animation look normal at 60Hz (no speed change expected on a 60Hz screen — the fix only shows on 120Hz/30fps devices; the verification here is "nothing regressed").

- [ ] **Step 6: Commit**

```bash
git add public/game/game.js
git commit -m "fix(renderer): drive all draw-side animation with real dt instead of hardcoded 0.016"
```

---

### Task 2: devicePixelRatio support in resize()

Canvas renders in CSS px (soft on retina). Scale the backing store by dpr (capped at 2 for mobile perf) and normalize all consumers of `canvas.width/height` to CSS-px view size.

**Files:**
- Modify: `public/game/game.js:2627-2639` (resize), `:2641-2657` (updateCamera), `:2659-2663` (draw W/H)

- [ ] **Step 1: Add view-size module vars**

Immediately above `function resize() {` (line 2627) add:

```js
  // CSS-px view size + device pixel ratio (backing store is scaled by _dpr)
  let _viewW = 0, _viewH = 0, _dpr = 1;
```

- [ ] **Step 2: Rewrite resize()**

Replace the whole function (lines 2627-2639):

```js
  function resize() {
    if (!canvas) return;
    // Use game-container bounds on desktop, fallback to window
    const container = document.getElementById('game-container');
    const rect = container
      ? container.getBoundingClientRect()
      : { width: window.innerWidth, height: window.innerHeight };
    _dpr   = Math.min(window.devicePixelRatio || 1, 2); // cap: retina sharpness without 3x fill cost
    _viewW = rect.width;
    _viewH = rect.height;
    canvas.width  = Math.round(_viewW * _dpr);
    canvas.height = Math.round(_viewH * _dpr);
    canvas.style.width  = _viewW + 'px';
    canvas.style.height = _viewH + 'px';
  }
```

- [ ] **Step 3: Normalize consumers to CSS px**

In `draw()` (lines 2661-2662):

```js
    const W = canvas.width;
    const H = canvas.height;
```

→

```js
    const W = _viewW || canvas.width;
    const H = _viewH || canvas.height;
```

And right before `ctx.clearRect(0, 0, W, H);` (line 2760) add:

```js
    ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0); // all draw code below works in CSS px
```

In `updateCamera()` (lines 2647-2648) replace `canvas.width` → `(_viewW || canvas.width)` and `canvas.height` → `(_viewH || canvas.height)`.

- [ ] **Step 4: Audit remaining canvas.width/height uses inside Renderer**

Run: `grep -n "canvas\.width\|canvas\.height" public/game/game.js`
For every hit **inside the Renderer IIFE** that treats the value as view size (not backing-store size), replace with `_viewW`/`_viewH`. Hits outside Renderer (e.g. a separate menu/wheel canvas in DailySpin) are different canvases — leave them alone.

- [ ] **Step 5: Syntax check + preview verify**

`node --check public/game/game.js` → exit 0.
Preview eval after hard reload:
`(() => { const c = document.querySelector('#game-canvas') || document.querySelector('canvas'); return { attr: [c.width, c.height], css: [c.clientWidth, c.clientHeight], dpr: window.devicePixelRatio }; })()`
Expected: `attr ≈ css × min(dpr, 2)`. Take a screenshot — layout must be identical to before (no zoomed/cropped world), sprites sharper on retina.

- [ ] **Step 6: Commit**

```bash
git add public/game/game.js
git commit -m "feat(renderer): render at devicePixelRatio (capped 2x) for retina sharpness"
```

---

### Task 3: Two-phase weather transitions (fix one-frame fade-out snap)

`setWeather()` resets `weatherRatio = 0` the instant the state re-rolls (game.js:2080-2085), so fade-out never happens — fog/rain vanish in one frame. Fix: fade the old weather out first, then swap state and fade in.

**Files:**
- Modify: `public/game/game.js:2048-2086` (setWeather), `:2674-2677` (draw blend), `:4884-4886` (resetWeather/_dbgWeather)

- [ ] **Step 1: Add pending-state var and swap helper**

`setWeather` lives in the Renderer near other weather vars. Add above `function setWeather(score)` (line 2048):

```js
  // Two-phase weather change: fade current weather out, then swap in the new one
  let pendingWeather = null;

  function _applyWeatherState(state) {
    weatherState   = state;
    pendingWeather = null;
    if (state === 3)      { rainInitDone = false; initRain(STORM_RAIN_COUNT); }
    else if (state === 1) { rainInitDone = false; initRain(RAIN_COUNT); }
  }
```

- [ ] **Step 2: Rework the tail of setWeather()**

Replace lines 2053-2085 (from `const prevState = weatherState;` through the end of the `if (weatherState !== prevState) {...}` block) with:

```js
    const prevState = weatherState;
    let next;

    if (score < 30) {
      next = 0;
    } else {
      // Взвешенный рандом в зависимости от score
      const r = Math.random();
      if (score < 80) {
        // clear 50%, rain 25%, fog 15%, windy 10%
        if      (r < 0.50) next = 0;
        else if (r < 0.75) next = 1;
        else if (r < 0.90) next = 2;
        else                next = 4;
      } else {
        // clear 30%, rain 25%, fog 15%, storm 15%, windy 15%
        if      (r < 0.30) next = 0;
        else if (r < 0.55) next = 1;
        else if (r < 0.70) next = 2;
        else if (r < 0.85) next = 3;
        else                next = 4;
      }
      // Не повторять ту же погоду подряд (кроме clear)
      if (next !== 0 && next === prevState) next = 0;
    }

    if (next === prevState) {
      pendingWeather = null; // re-rolled the current weather — cancel any pending swap
    } else if (prevState === 0 || weatherRatio < 0.05) {
      _applyWeatherState(next); // nothing visible to fade out — switch immediately
    } else {
      pendingWeather = next; // draw() fades the current weather to 0, then swaps
    }
```

- [ ] **Step 3: Teach the draw() blend about the pending state**

Replace the blend block from Task 1 Step 2 with:

```js
    // Advance weather blend; a pending swap first fades the current weather to zero
    const targetRatio = pendingWeather !== null ? 0 : (weatherState > 0 ? 1 : 0);
    weatherRatio += (targetRatio - weatherRatio) * Math.min(1, dt_approx * 0.72);
    if (weatherRatio < 0.005) weatherRatio = 0; // snap to zero — stop residual work
    if (pendingWeather !== null && weatherRatio === 0) _applyWeatherState(pendingWeather);
```

- [ ] **Step 4: Reset pending state in resetWeather and _dbgWeather**

Line 4884: add `pendingWeather = null;` inside `resetWeather()`.
Line 4886: add `pendingWeather = null;` at the start of `_dbgWeather(state)`.

- [ ] **Step 5: Syntax check + preview verify**

`node --check public/game/game.js` → exit 0.
Preview after hard reload (menu screen renders weather too):
1. `window.__GAME_DBG.Renderer._dbgWeather(2)` → fog fades in over a few seconds.
2. Wait until fog is fully visible, then `window.__GAME_DBG.Renderer.setWeather(60)` won't work directly (threshold logic) — instead simulate the swap: eval `window.__GAME_DBG.Renderer._dbgWeather(1)` still snaps (debug bypass, expected). Real check: play a run past score 30-60 and watch a weather change — the old weather must visibly thin out before the new one starts (~1.5-3s each way), no single-frame vanish.

- [ ] **Step 6: Commit**

```bash
git add public/game/game.js
git commit -m "fix(renderer): fade weather out before swapping states instead of snapping"
```

---

### Task 4: Moon crescent uses the blended sky color

**Files:**
- Modify: `public/game/game.js:2793-2796` (call site), `:2864-2885` (drawMoon)

- [ ] **Step 1: Pass the blended sky color**

Line 2795: `drawMoon(W, H);` → `drawMoon(W, H, skyColor);` (`skyColor` is computed at lines 2763-2783, above the call).

- [ ] **Step 2: Use it for the crescent shadow**

Line 2864: `function drawMoon(W, H) {` → `function drawMoon(W, H, skyColor) {`
Line 2881: `ctx.fillStyle = dc('sky');` → `ctx.fillStyle = skyColor || dc('sky');`

- [ ] **Step 3: Syntax check + preview verify**

`node --check public/game/game.js` → exit 0.
Preview: `window.__GAME_DBG.Renderer._dbgNight(1)` (or equivalent — check its signature at game.js:4887) plus `_dbgWeather(3)`; screenshot: the moon's crescent cutout must match the storm-dark sky, not the bright clear-sky color.

- [ ] **Step 4: Commit**

```bash
git add public/game/game.js
git commit -m "fix(renderer): moon crescent uses weather-blended sky color"
```

---

### Task 5: Continue after water death respawns on the nearest safe row

`Player.revive()` (game.js:1793) leaves the player standing on the water row with no log — next frame `checkWater()` kills them again (water ignores invincibility), burning the 100-coin continue for nothing.

**Files:**
- Modify: `public/game/game.js:1793-1799` (revive)

- [ ] **Step 1: Rewrite revive() with safe-row relocation**

Replace the whole function:

```js
  function revive() {
    // Water/train rows are lethal even with invincibility (water ignores it,
    // trains cross too fast) — relocate to the nearest grass row behind the player.
    const cur = World.getRow(state.row);
    if (!cur || cur.type === 'water' || cur.type === 'train') {
      let grassRow = null, roadRow = null;
      for (let r = state.row; r >= state.row - 15 && r >= 0; r--) {
        const cand = World.getRow(r);
        if (!cand) continue;
        if (cand.type === 'grass') { grassRow = r; break; }
        if (roadRow === null && cand.type === 'road') roadRow = r;
      }
      const safeIdx = grassRow !== null ? grassRow : (roadRow !== null ? roadRow : state.row);
      const safe    = World.getRow(safeIdx);
      state.row = safeIdx;

      // Clamp col back onto the field, then step sideways off blocked cells
      let col = Math.min(COLS - 1, Math.max(0, state.col));
      for (let off = 0; off < COLS; off++) {
        const free = [col + off, col - off].find(
          c => c >= 0 && c < COLS && !Collision.isCellBlocked(safe, c)
        );
        if (free !== undefined) { col = free; break; }
      }
      state.col = col;

      state.visualX  = state.col * CELL + CELL / 2;
      state.visualY  = World.rowToY(state.row) + CELL / 2;
      state.jumpFrom = { x: state.visualX, y: state.visualY };
      state.jumpTo   = { x: state.visualX, y: state.visualY };
    }

    state.alive      = true;
    state.jumping    = false;
    state.onLog      = null;
    _shieldUsed      = false;
    _invincibleTimer = 2.5;  // 2.5s invincibility so player isn't immediately killed
  }
```

Note: `Collision` is referenced at runtime (same pattern as `move()` at game.js:1632) — safe even though Collision is defined later in the file. `state.maxRow` is untouched, so score is preserved.

- [ ] **Step 2: Syntax check + preview verify**

`node --check public/game/game.js` → exit 0.
Preview scenario: start a run, reach a river, deliberately drown (jump into water). When the continue overlay appears (needs ≥100 coins — grant via `window.Save.addCoins(200)` **before the run** if short), click Continue. Expected: player reappears on the nearest grass row behind the river, alive, run continues. Repeat for a car death: continue must revive in place (road row is fine under invincibility).

- [ ] **Step 3: Commit**

```bash
git add public/game/game.js
git commit -m "fix(player): continue after water death respawns on nearest safe row"
```

---

### Task 6: Second Chance shield is spent when it triggers, not at run start

`Loadout.startRun()` (game.js:6997) burns every selected booster's charge upfront; the shield is a trigger-on-hit effect and should only be consumed when it actually saves the player in `Player.kill()` (game.js:1807).

**Files:**
- Modify: `public/game/game.js:6997-7009` (startRun), `:1802-1824` (kill)

- [ ] **Step 1: Don't spend the shield at run start**

Replace the loop inside `startRun()`:

```js
    if (typeof Shop !== 'undefined') {
      for (const id of selected) {
        if (id === 'boost_shield') {
          // Second Chance is consumed in Player.kill() at the moment it saves the player
          if (Shop.getBoosterCount(id) > 0) active[id] = true;
        } else if (Shop.spendBoosterLocal(id)) {
          active[id] = true;
        }
      }
    }
```

- [ ] **Step 2: Spend at trigger time in kill()**

Line 1807, find:

```js
    if (type !== 'water' && !_shieldUsed && typeof Loadout !== 'undefined' && Loadout.isActive('boost_shield')) {
```

Replace with:

```js
    if (type !== 'water' && !_shieldUsed && typeof Loadout !== 'undefined' && Loadout.isActive('boost_shield')
        && typeof Shop !== 'undefined' && Shop.spendBoosterLocal('boost_shield')) {
```

If the charge disappeared mid-run (server reconciliation), the spend fails and death proceeds normally — no free shield.

- [ ] **Step 3: Syntax check + preview verify**

`node --check public/game/game.js` → exit 0.
Preview: give charges via `window.Shop.addBoosterCharges('boost_shield', 2)`, note count (`window.Shop.getBoosterCount('boost_shield')`). Run 1: select shield, finish the run **without** being hit by a car → count unchanged. Run 2: select shield, walk into a car → "Saved" feedback, count decremented by exactly 1.

- [ ] **Step 4: Commit**

```bash
git add public/game/game.js
git commit -m "fix(loadout): consume Second Chance shield on trigger, not at run start"
```

---

### Task 7: In-memory cache + batched writes for the Save module

`Save.load()`/`save()` (game.js:36-52) do a full localStorage + JSON round-trip on every call; `addCoins()` runs per coin pickup — up to ~5 round-trips in one frame with magnet+double. `Shop` already caches (`_shopCache`); give `Save` the same treatment plus write batching.

**Files:**
- Modify: `public/game/game.js:35-52` (load/save inside the Save IIFE)

- [ ] **Step 1: Add cache + batched flush**

Replace `load()` and `save()`:

```js
  // In-memory cache — avoids localStorage + JSON.parse on every call
  // (addCoins runs per coin pickup, several times per frame with magnet+double)
  let _cache = null;
  let _flushTimer = null;

  // Загрузить данные из localStorage
  function load() {
    if (_cache) return _cache;
    try {
      const raw = localStorage.getItem(KEY);
      _cache = raw ? Object.assign(defaults(), JSON.parse(raw)) : defaults();
    } catch (e) {
      _cache = defaults();
    }
    return _cache;
  }

  // Сохранить данные (запись в localStorage батчится, ~1 раз в секунду)
  function save(data) {
    _cache = data;
    if (_flushTimer) return;
    _flushTimer = setTimeout(_flush, 800);
  }

  function _flush() {
    _flushTimer = null;
    if (!_cache) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(_cache));
    } catch (e) {
      console.warn('Не удалось сохранить данные:', e);
    }
  }

  // Не терять несохранённый батч при уходе со страницы/сворачивании
  window.addEventListener('pagehide', _flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') _flush();
  });
```

- [ ] **Step 2: Audit load() callers for mutate-without-save**

Previously `load()` returned a fresh copy; now it returns the shared cache — a caller that mutates the result without calling `save()` used to silently discard changes, now it would half-persist them.

Run: `grep -n "Save\.load()\|= load()" public/game/game.js`
Inspect each hit inside the Save module and out: every mutation of the returned object must be followed by `save(data)`. (Current callers — `addScore`, `saveCheckin`, `addCoins` — all do; confirm nothing new appeared after the economy work.)

- [ ] **Step 3: Syntax check + preview verify**

`node --check public/game/game.js` → exit 0.
Preview: `window.Save.addCoins(5)` → returns new total; wait ~1s, then eval `JSON.parse(localStorage.getItem('crossy_save_v1')).coins` — must match. Reload the page — coins persist. Play a short run collecting coins — HUD updates per pickup as before.

- [ ] **Step 4: Commit**

```bash
git add public/game/game.js
git commit -m "perf(save): in-memory cache + batched localStorage writes"
```

---

### Task 8: Train warning re-arms before every pass + horn actually plays

The warning flag is set only at row creation (game.js:1214), 22 rows before the player arrives — the flash is long gone on approach, and every re-queued pass has zero warning. `Sound.trainHorn()` (game.js:547) is never called anywhere.

**Files:**
- Modify: `public/game/game.js:1329-1335` (train branch of World.update)

- [ ] **Step 1: Re-arm warning from spawn timing**

Find (lines 1329-1335):

```js
      if (row.type === 'train') {
        processRow(row, dt, CELL);
        if (row.warning) {
          row.warningTimer += dt;
          if (row.warningTimer >= 1.2) row.warning = false;
        }
      }
```

Replace with:

```js
      if (row.type === 'train') {
        processRow(row, dt, CELL);
        // Re-arm the warning ~1.2s before every train pass (spawnTimer advances in px)
        const next = row.spawnQueue[0];
        if (next) {
          const spd = Math.abs(row.speed);
          const timeToSpawn = (next.gap - row.spawnTimer) / spd;
          if (timeToSpawn > 1.6) {
            row.hornArmed = false; // far away again — allow the next warning
          } else if (!row.hornArmed && timeToSpawn <= 1.2 && timeToSpawn > 0) {
            row.warning      = true;
            row.warningTimer = 0;
            row.hornArmed    = true;
            // Horn only for rows near the player (score ≈ max row reached)
            if (Math.abs(row.idx - currentScore) <= 14 && typeof Sound !== 'undefined') {
              Sound.trainHorn();
            }
          }
        }
        if (row.warning) {
          row.warningTimer += dt;
          if (row.warningTimer >= 1.2) row.warning = false;
        }
      }
```

`currentScore` is the World module var already used in `processRow` (game.js:1450). The initial `warning: true` in `makeTrainRow` stays — harmless, expires off-screen.

- [ ] **Step 2: Syntax check + preview verify**

`node --check public/game/game.js` → exit 0.
Preview: play until a train row appears (or eval-scan `window.__GAME_DBG.World.getRows().filter(r => r.type === 'train')` to confirm one exists and watch `warning` flip: poll a few times — it must go `true` for ~1.2s before each train crossing, repeatedly, not just once). With sound on, the horn should be audible right before the train enters when the player is near that row.

- [ ] **Step 3: Commit**

```bash
git add public/game/game.js
git commit -m "fix(world): train warning re-arms before every pass and horn plays"
```

---

### Final verification (after all tasks)

- [ ] `node --check public/game/game.js` → exit 0
- [ ] `npm run lint` → no new errors (game.js is in public/, but the edit set must not break the Next lint run)
- [ ] `npm run build` → succeeds
- [ ] Full preview pass: menu renders, start run, weather cycles smoothly, retina-sharp canvas, water death → continue → survives, shield only spends on trigger, coins persist across reload, train flashes+horn before each pass
- [ ] Update memory: mark fixed items in `gameplay-mechanics-review.md`
