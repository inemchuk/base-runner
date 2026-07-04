# Camera/Zoom Dynamic Scaling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Camera zoom eases from 1.25x to 1.0x as score grows 100→300, giving full 9-column visibility at high speed (spec: `docs/superpowers/specs/2026-07-04-camera-zoom-design.md`).

**Architecture:** All changes live in the Renderer IIFE module of `public/game/game.js`. A new `getViewScale()` becomes the single scale source, replacing three duplicated `Math.min(1, base * 1.25)` formulas. Zoom state is fed by the existing per-frame `setScore()` call and eased in `updateCamera(dt)`.

**Tech Stack:** Vanilla JS canvas (non-module `<script>`), no test framework — verification is `node --check` plus a manual browser checklist via a new `_dbgZoom` debug hook.

**Important:** Line numbers below are as of commit `9122e95` and drift as you edit — always match on the quoted code, not the number. This game has no unit-test infrastructure; do NOT introduce one for this change. The TDD substitute here is: syntax-check after every task, manual checklist at the end.

---

### Task 1: Zoom state, curve, and getViewScale — wired into setScore and updateCamera

**Files:**
- Modify: `public/game/game.js` (Renderer module: `setScore` ~2355, `updateCamera` ~2757)

- [ ] **Step 1: Add zoom state + curve + getViewScale above `updateCamera`**

Find `function updateCamera(dt) {` (~line 2757). Insert immediately BEFORE it:

```js
  // ── Dynamic camera zoom ───────────────────────────────────
  // 1.25x close-up below score 100, smoothstep out to 1.0x by score 300.
  // Curve is deliberately independent of World's difficulty smoothProgress
  // so camera tuning never shifts silently with balance changes.
  let _camScore     = 0;    // raw score, fed every frame via setScore()
  let _zoomCur      = 1.25; // eased zoom factor, advanced once per frame
  let _dbgZoomForce = null; // debug: non-null pins the curve to this score

  function _zoomTarget() {
    const t = Math.min(Math.max((_camScore - 100) / 200, 0), 1);
    const s = t * t * (3 - 2 * t); // smoothstep
    return 1.25 - 0.25 * s;
  }

  // Single source of truth for the world scale. The min(1,…) clamp keeps
  // desktop unchanged and never pulls back wider than the 9-column field.
  function getViewScale() {
    const worldW = COLS * CELL;
    return Math.min(1, ((_viewW || canvas.width) / worldW) * _zoomCur);
  }
```

- [ ] **Step 2: Feed `_camScore` in setScore, before the night-debug early return**

Find (~line 2355):

```js
  function setScore(score) {
    if (_dbgNightForce !== null) return; // debug override active
```

Replace with:

```js
  function setScore(score) {
    _camScore = _dbgZoomForce !== null ? _dbgZoomForce : score;
    if (_dbgNightForce !== null) return; // debug override active
```

(Ordering matters: the night debug override must not starve the camera of score updates — spec "Data feed".)

- [ ] **Step 3: Ease `_zoomCur` and consume getViewScale in updateCamera**

Find in `updateCamera` (~2760):

```js
    const worldW = COLS * CELL;
    const scale = Math.min(1, ((_viewW || canvas.width) / worldW) * 1.25);
    const visibleH = (_viewH || canvas.height) / scale;
```

Replace with:

```js
    // Ease zoom toward its score target; steps in-run are ~0.1%, the ease
    // exists for run restarts (300→0 reads as a ~1.5s dive back in)
    _zoomCur += (_zoomTarget() - _zoomCur) * Math.min(1, dt * 2);
    const scale = getViewScale();
    const visibleH = (_viewH || canvas.height) / scale;
```

(Note: the removed `const worldW` line is only used by the removed formula — `getViewScale()` computes its own.)

- [ ] **Step 4: Syntax check**

Run: `node --check public/game/game.js`
Expected: exit 0, no output.

- [ ] **Step 5: Commit**

```bash
git add public/game/game.js
git commit -m "feat(renderer): zoom state + curve + getViewScale, eased in updateCamera"
```

---

### Task 2: Replace the remaining two duplicated scale formulas

**Files:**
- Modify: `public/game/game.js` (`draw()` ~2935, `drawRows()` ~3024)

- [ ] **Step 1: draw() world transform**

Find (~2932):

```js
    const worldW = COLS * CELL;
    // Zoom: on narrow screens, scale up 25% for closer camera (crops sides slightly)
    const baseScale = W / worldW;
    const scale = Math.min(1, baseScale * 1.25);
    const scaledW = worldW * scale;
```

Replace with:

```js
    const worldW = COLS * CELL;
    // Dynamic zoom: close-up early game, pulls back to full field by score 300
    const scale = getViewScale();
    const scaledW = worldW * scale;
```

(`W` here equals `_viewW || canvas.width`, so `getViewScale()` is exactly equivalent at `_zoomCur = 1.25`. `baseScale` has no other uses in this function — verify with a search before deleting.)

- [ ] **Step 2: drawRows() culling**

Find (~3022):

```js
    const worldW = COLS * CELL;
    const scale  = Math.min(1, ((_viewW || canvas.width) / worldW) * 1.25);
    const visTop = cameraY - CELL;
```

Replace with:

```js
    const scale  = getViewScale();
    const visTop = cameraY - CELL;
```

(Check first that `worldW` is not referenced later in `drawRows` — it is currently only used by the formula being removed. If it is referenced, keep the `const worldW` line.)

- [ ] **Step 3: Verify no stray 1.25 formula remains**

Run: `grep -n "1.25" public/game/game.js | grep -i scale`
Expected: no output (the only remaining `1.25` literals are the zoom constants inside `_zoomTarget`/`_zoomCur` initializer, which don't mention "scale" on the line).

- [ ] **Step 4: Syntax check**

Run: `node --check public/game/game.js`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add public/game/game.js
git commit -m "refactor(renderer): draw + culling consume getViewScale (dedupe 1.25 formula)"
```

---

### Task 3: `_dbgZoom` debug hook + export

**Files:**
- Modify: `public/game/game.js` (debug hooks ~5057, Renderer `return {…}` ~5060)

- [ ] **Step 1: Add the hook next to `_dbgNight`**

Find:

```js
  function _dbgNight(on) { _dbgNightForce = on; nightTarget = on ? 1 : 0; _nightOn = on; }
```

Insert after it:

```js
  // Pin the zoom curve to an arbitrary "score" (null = back to real score)
  function _dbgZoom(score) { _dbgZoomForce = (typeof score === 'number') ? score : null; }
```

- [ ] **Step 2: Export it**

In the Renderer `return {` line, add `_dbgZoom` after `_dbgNight`:

```js
  return { init, resize, updateCamera, draw, setScore, setWeather, triggerDeath, triggerShake, isDying, deathDone, stopDeath, resetWeather, addTrail, addCoinEffect, addScoreEffect, addMagnetCoin, addShieldBurst, reloadPlayerSprite, _dbgWeather, _dbgNight, _dbgZoom };
```

- [ ] **Step 3: Syntax check**

Run: `node --check public/game/game.js`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add public/game/game.js
git commit -m "feat(renderer): _dbgZoom hook to pin camera zoom to any score"
```

---

### Task 4: Manual verification checklist (user-run; do NOT use preview_eval)

**Files:** none (verification only)

The user has asked the agent NOT to drive the browser via preview_eval. Run the dev server (`npm run dev`) if not already running, then hand this checklist to the user to run in the browser console at a phone-width viewport (~390px), during a run:

- [ ] **Step 1: Baseline** — `__GAME_DBG.Renderer._dbgZoom(0)` → framing identical to before this change (1.25x crop).
- [ ] **Step 2: Mid curve** — `_dbgZoom(200)` → noticeably wider (~1.125x), no dark voids at the side edges, HUD unchanged.
- [ ] **Step 3: Full pull-back** — `_dbgZoom(300)` → all 9 columns visible; cars visible right at field entry; no missing rows at top/bottom (culling).
- [ ] **Step 4: Freeze on death** — `_dbgZoom(null)`, die, watch the continue overlay → framing does not drift underneath.
- [ ] **Step 5: Restart dive** — after a 150+ score run, restart → smooth ~1.5s zoom-in to close-up, no snap.
- [ ] **Step 6: Desktop clamp** — widen the viewport → rendering identical to pre-change (scale clamped at 1.0).

Expected for all: PASS. Any FAIL → debug before merging; the likely suspects are a missed formula replacement (steps drift between updateCamera/draw/drawRows produce parallax-like row misalignment) or `_camScore` not being fed (zoom stuck at 1.25).

---

## Self-review notes

- Spec coverage: single source of truth (T1/T2), curve+state (T1), data feed incl. night-debug ordering (T1S2), death freeze (by construction — verified T4S4), debug hook (T3), all six spec verification points (T4). No gaps.
- Type consistency: `_camScore`/`_zoomCur`/`_dbgZoomForce`/`_zoomTarget`/`getViewScale` names match across tasks.
- `resize()` needs no change: it sets `_viewW/_viewH`, which `getViewScale()` reads live.
