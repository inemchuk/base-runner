# Gameplay Feel + VFX Wave 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the remaining high-value items from the 2026-07-02 review: input buffering + swipe chaining, river/train re-queue balance, XP new-player penalty removal, rush-lane double-penalty decoupling, water glint/ripple fixes, car/log shadows + log bob, lightning double-flash + bolt + thunder, and row viewport culling.

**Architecture:** Mostly `public/game/game.js` (Player, World, Renderer, Sound IIFEs). Task 3 also touches `src/lib/economy/levels.ts` — the XP formula is duplicated client/server and must change in both places identically.

**Deliberately skipped (bigger design work, separate pass):** difficulty stall at 250, camera/zoom pull-back, fog world-space rendering, weather-out-of-renderer refactor, biome-specific particles, gradient caching. Tree sway in wind already exists (game.js:3082-3093).

**Testing:** `node --check public/game/game.js` after each edit; behavioral checks via preview + `window.__GAME_DBG`; `npm run build` at the end (covers levels.ts type-check). Reload the preview page after every game.js edit before eval.

---

### Task 1: Input buffer + swipe chaining

A tap during the 0.16s jump animation is silently dropped (`move()` returns false while `state.jumping`), and a second swipe without lifting the finger is ignored (`touchMoved` latches until touchend).

**Files:**
- Modify: `public/game/game.js:1651-1653` (move), `:1769-1778` (landing in update), Player init/kill, `:8775-8787` (touchmove)

- [ ] **Step 1: Buffer the move during jump**

In the Player IIFE, next to `let state = {};` add:

```js
  let _bufferedMove = null; // tap during jump animation — applied on landing
```

In `move()` replace:

```js
    if (state.jumping) return false;   // нельзя начать новый шаг во время анимации
```

with:

```js
    if (state.jumping) {
      _bufferedMove = { dRow, dCol }; // запомним тап — применим в момент приземления
      return false;
    }
```

- [ ] **Step 2: Apply the buffer on landing**

In `update()`, inside the `if (t >= 1) { ... }` landing block, after the footprint (`Renderer.addTrail(...)` closing brace), add:

```js
        // Apply buffered input from the jump window
        if (_bufferedMove) {
          const m = _bufferedMove;
          _bufferedMove = null;
          move(m.dRow, m.dCol);
        }
```

- [ ] **Step 3: Clear the buffer on init and death**

In `init()` add `_bufferedMove = null;` (next to `resetShield()`).
In `kill()` add `_bufferedMove = null;` right after `state.alive = false;`.

- [ ] **Step 4: Swipe chaining — re-anchor after each swipe**

Replace the `touchmove` body (game.js:8775-8787):

```js
  document.addEventListener('touchmove', (e) => {
    if (!_isCanvas(e.target)) return;
    e.preventDefault();

    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;

    // Каждый раз при превышении порога — свайп + новая точка отсчёта,
    // чтобы можно было "рулить" не отрывая палец
    if (Math.abs(dx) > SWIPE_MIN || Math.abs(dy) > SWIPE_MIN) {
      touchMoved = true;
      handleSwipe(dx, dy);
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  }, { passive: false });
```

- [ ] **Step 5: Verify**

`node --check public/game/game.js`. Preview: reload, start a run, eval a double-move burst:
`(() => { const P = window.__GAME_DBG.Player; P.moveForward(); P.moveForward(); return new Promise(r => setTimeout(() => r({ row: P.getState().row }), 500)); })()`
Expected `row` advanced by **2** (second tap buffered), previously 1.

- [ ] **Step 6: Commit** `fix(input): buffer one move during jump animation + chainable swipes`

---

### Task 2: Type-specific re-queue gaps (rivers stop thinning out, trains stop back-to-back passes)

`processRow`'s re-queue (game.js:1487-1492) uses the road 2-5-cell formula for every row type: rivers become twice as sparse as `makeWaterRow` designed (1-2 cells), and trains re-cross every ~2s.

**Files:**
- Modify: `public/game/game.js:1487-1492` (re-queue block in processRow)

- [ ] **Step 1: Branch by row type**

Replace:

```js
        // Re-queue: зазор соответствует типу ряда.
        // Дороги: 2–4 клетки (сохраняем плотность). Реки: 2–4 клетки.
        const rp = smoothProgress(currentScore, 0, 250);
        const reqMin = _lerp(3, 2, rp);
        const reqMax = _lerp(5, 3, rp);
        const requeueDist = (reqMin + Math.random() * (reqMax - reqMin)) * CELL;
```

with:

```js
        // Re-queue: зазор соответствует типу ряда
        const rp = smoothProgress(currentScore, 0, 250);
        let requeueDist;
        if (row.type === 'water') {
          // Реки: те же 1–2 клетки, что и в makeWaterRow — иначе ряд редеет вдвое
          const gapMax = Math.round(_lerp(2, 1, rp));
          requeueDist = (1 + Math.random() * Math.max(0, gapMax - 1)) * CELL;
        } else if (row.type === 'train') {
          // Поезда: пауза 3.5–6 с между проходами (gap в px = скорость × секунды)
          requeueDist = spd * (3.5 + Math.random() * 2.5);
        } else {
          // Дороги: 2–5 клеток, плотнее с ростом сложности
          const reqMin = _lerp(3, 2, rp);
          const reqMax = _lerp(5, 3, rp);
          requeueDist = (reqMin + Math.random() * (reqMax - reqMin)) * CELL;
        }
```

(`spd` is already defined at the top of `processRow`.)

- [ ] **Step 2: Verify**

`node --check`. Preview: reload, then poll a water row for ~30s and confirm obstacle count stays ≥ pre-drift levels (no thinning):
`(() => { const W = window.__GAME_DBG.World; const w = W.getRows().find(r => r.type==='water'); const n0 = w.obstacles.length; return new Promise(r => setTimeout(() => r({ n0, n30: w.obstacles.length }), 30000)); })()`
Expected: `n30 >= n0 - 1` (previously rivers thinned as logs re-queued with double gaps).

- [ ] **Step 3: Commit** `fix(world): type-specific re-queue gaps — rivers keep density, trains pause 3.5-6s`

---

### Task 3: XP multiplier — stop punishing new players

`multi = 0.5×` below score 30 double-punishes exactly the retention-critical window. Formula is duplicated client (game.js `_calculateLocalRunXp`) and server (`src/lib/economy/levels.ts:81`) — change both identically. **Note:** slightly increases XP payout for low scores; levels gate cosmetics only.

**Files:**
- Modify: `public/game/game.js` (`_calculateLocalRunXp`), `src/lib/economy/levels.ts:81`

- [ ] **Step 1: Client**

```js
  const multi         = score >= 150 ? 1.2 : score >= 75 ? 1.1 : 1.0;
```

- [ ] **Step 2: Server (identical)**

```ts
  const multi = score >= 150 ? 1.2 : score >= 75 ? 1.1 : 1.0;
```

- [ ] **Step 3: Verify**

`node --check public/game/game.js` + `npx tsc --noEmit` (or rely on final `npm run build`). Grep both files for `0.7 : 0.5` — zero hits.

- [ ] **Step 4: Commit** `fix(xp): floor run multiplier at 1.0 — no penalty for low-score (new) players`

---

### Task 4: Rush lane — drop the distance double-penalty

Rush stacks ×1.6 speed AND ×0.75 gaps (game.js:873-888). Keep it fast and +1 car, but with normal gaps.

**Files:**
- Modify: `public/game/game.js:873-877`

- [ ] **Step 1: Remove the ×0.75 multipliers**

```js
    } else if (personality === 'rush') {
      carCount   = Math.min(7, carCount + 1);
      // rush = скорость ×1.6; дистанции обычные (раньше ×0.75 — двойной штраф)
      return {
```

(delete the two `carDistMin/Max *= 0.75;` lines; the `return` block itself is unchanged.)

- [ ] **Step 2: Verify + Commit**

`node --check`. Commit: `fix(world): rush lanes keep normal gaps — speed x1.6 was stacking with x0.75 density`

---

### Task 5: Water glints salted per row + rain ripples form in place

Glint x-positions are identical for every water row → vertical sparkle columns (game.js:3573-3577). Rain ripples slide sideways (`rx = wt*40 + ...`) instead of appearing/expanding/fading (game.js:3607-3615).

**Files:**
- Modify: `public/game/game.js:2995` (call site), `:3530` (drawWaterEffect signature), `:3569-3617` (glints + ripples)

- [ ] **Step 1: Pass row.idx in**

`drawWaterEffect(y)` → `drawWaterEffect(y, row.idx)` (call site in drawRows), signature → `function drawWaterEffect(rowY, rowIdx)`. At the top of the function add:

```js
    const salt = ((rowIdx || 0) * 137) % (COLS * CELL); // per-row offset — no vertical columns
```

- [ ] **Step 2: Salt the glints**

In both glint loops replace the drawn x with a salted, wrapped value:
`ctx.fillRect(((g.x + salt) % W), rowY + g.yo, 2, 2);` and for moonGlints `ctx.fillRect(((mg.x + salt) % W), rowY + mg.yo, 3, 1.5);` (flicker phase uses `g.x + salt` too so rows desync).

- [ ] **Step 3: Ripples appear in place, expand, fade**

Replace the ripple loop body:

```js
      for (let i = 0; i < rippleCount; i++) {
        const cycle = wt * 0.9 + i / rippleCount + (rowIdx || 0) * 0.37;
        const phase = cycle % 1;                       // 0→1 жизненный цикл
        const seed  = Math.floor(cycle);               // новая позиция на каждый цикл
        const hx = Math.abs(Math.sin(seed * 12.9898 + i * 78.233)) % 1;
        const hy = Math.abs(Math.sin(seed * 39.3468 + i * 11.135)) % 1;
        const rx = hx * W;
        const ry = rowY + 10 + hy * 45;
        const rr = 1 + phase * 6;                      // расширяется
        ctx.globalAlpha = ripAlpha * (1 - phase);      // и тает
        ctx.beginPath();
        ctx.ellipse(rx, ry, rr * 1.6, rr * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
```

- [ ] **Step 4: Verify + Commit**

`node --check`; preview: `_dbgWeather(1)`, screenshot — sparkles no longer align vertically across rivers; ripples read as expanding rings. Commit: `fix(renderer): per-row water glint offsets + rain ripples form in place`

---

### Task 6: Car shadows + log bob & water shadow

Cars have zero shadows (train has one); logs are static rects glued to the water.

**Files:**
- Modify: `public/game/game.js:3334-3338` (drawCars), `:3620-3627` (drawLogs)

- [ ] **Step 1: Car shadow before sprite**

In `drawCars`, right after `const y = rowY + (CELL - car.height) / 2;` add:

```js
      // Soft ground shadow — grounds the sprite on the road
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(x + car.width / 2, y + car.height * 0.92, car.width * 0.46, car.height * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
```

- [ ] **Step 2: Log bob + water shadow**

In `drawLogs`, replace the first lines of the loop:

```js
    for (const log of row.obstacles) {
      const x = log.x;
      // Лёгкое покачивание на воде + тень — бревно "сидит" в воде, а не парит
      const bob = Math.sin(waterTime * 2 + log.x * 0.01) * 1.5;
      const y = rowY + (CELL - log.height) / 2 + bob;
      ctx.fillStyle = 'rgba(0,20,60,0.25)';
      ctx.beginPath();
      ctx.ellipse(x + log.width / 2, rowY + CELL * 0.8, log.width * 0.48, 5, 0, 0, Math.PI * 2);
      ctx.fill();
```

(the rest of the loop — sprite branch and fallback — unchanged; they use `x`/`y`.)

- [ ] **Step 3: Verify + Commit**

`node --check`; preview screenshot of a road + river: cars have soft ellipses, logs bob subtly with a dark waterline shadow. Commit: `feat(renderer): car ground shadows, log bob + waterline shadow`

---

### Task 7: Lightning double-flash + bolt + thunder sound

`drawLightning` is a flat white rect; no thunder exists in the Sound module (`playTone`/`playNoise` synth helpers are there).

**Files:**
- Modify: `public/game/game.js` Sound module (~:566-588), lightning trigger in draw() (~:2787-2797), `drawLightning` (~:3719)

- [ ] **Step 1: Sound.thunder**

After `trainHorn()` in the Sound module add and export:

```js
  // Distant thunder — low rumble after the flash
  function thunder() {
    playNoise({ duration: 1.2, vol: 0.4, attack: 0.15, lowFreq: 30, highFreq: 120 });
    playTone({ freq: 55, freqEnd: 35, type: 'sine', duration: 1.0, vol: 0.22, attack: 0.1 });
  }
```

Add `thunder` to the module's `return {...}`.

- [ ] **Step 2: Trigger — seed the bolt + schedule thunder**

Near the lightning vars add `let _boltSeed = 0;`. In the trigger block in draw():

```js
      if (lightningTimer <= 0) {
        lightningFlash = 1;
        _boltSeed = Math.random() * 1000;
        lightningTimer = 3 + Math.random() * 5; // 3-8 sec
        // Гром с задержкой после вспышки
        if (typeof Sound !== 'undefined' && Sound.thunder) {
          setTimeout(() => Sound.thunder(), 400 + Math.random() * 800);
        }
      }
```

Slow the fade so the double-flash reads: `lightningFlash -= dt_approx * 4;` → `lightningFlash -= dt_approx * 2;` (0.5s total).

- [ ] **Step 3: Double-flash + jagged bolt in drawLightning**

```js
  function drawLightning(W, H) {
    if (lightningFlash <= 0) return;
    ctx.save();
    const t = 1 - lightningFlash; // 0→1 за время вспышки
    // Двойная вспышка: яркий пик → провал → тусклое эхо
    const env = t < 0.22 ? (1 - t / 0.22 * 0.85)
              : t < 0.34 ? 0.15
              : t < 0.75 ? 0.55 * (1 - (t - 0.34) / 0.41)
              : 0;
    if (env > 0.01) {
      ctx.fillStyle = `rgba(220,230,255,${env * 0.3})`;
      ctx.fillRect(0, 0, W, H);
    }
    // Зигзаг молнии — только в первый пик
    if (t < 0.22) {
      const rnd = (i) => Math.abs(Math.sin(_boltSeed + i * 127.1)) % 1;
      let bx = W * (0.2 + rnd(0) * 0.6);
      let by = 0;
      ctx.strokeStyle = `rgba(255,255,255,${(1 - t / 0.22) * 0.9})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      const segs = 6;
      for (let i = 1; i <= segs; i++) {
        bx += (rnd(i) - 0.5) * W * 0.16;
        by = (H * 0.6) * (i / segs);
        ctx.lineTo(bx, by);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
```

- [ ] **Step 4: Verify + Commit**

`node --check`; preview: `_dbgWeather(3)`, wait for a flash, screenshot during the first ~0.1s if catchable (or verify no console errors + storm still renders). Commit: `feat(renderer): lightning double-flash + bolt shape + thunder sound`

---

### Task 8: Row viewport culling in drawRows

All ~36 live rows draw every frame (with per-row gradients) even though ~15 are visible.

**Files:**
- Modify: `public/game/game.js:2974-2977` (drawRows)

- [ ] **Step 1: Skip off-screen rows**

```js
  function drawRows() {
    // Viewport culling — рисуем только видимые ряды (+1 ряд запаса)
    const worldW = COLS * CELL;
    const scale  = Math.min(1, ((_viewW || canvas.width) / worldW) * 1.25);
    const visTop = cameraY - CELL;
    const visBot = cameraY + (_viewH || canvas.height) / scale + CELL;
    const rows = [...World.getRows()].sort((a, b) => b.idx - a.idx);
    for (const row of rows) {
      const y = World.rowToY(row.idx);
      if (y + CELL < visTop || y > visBot) continue;
```

(rest unchanged.)

- [ ] **Step 2: Verify + Commit**

`node --check`; preview: world renders identically (screenshot), no missing rows at top/bottom edges while moving. Commit: `perf(renderer): viewport culling in drawRows`

---

### Final verification

- [ ] `node --check public/game/game.js`
- [ ] `npm run build` (covers levels.ts)
- [ ] Preview full pass: run with buffered double-taps, river density stable, storm flash+thunder, shadows visible, no console errors
- [ ] Update memory: mark wave-2 items fixed
