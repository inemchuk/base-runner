# Sahara Sand Effect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Sahara weather streaks with granular, wind-driven sand that remains lightweight and readable during play.

**Architecture:** Keep the existing weather particle pool and motion code intact. Add one canvas helper that paints a tiny cluster of sand grains without allocation, then route the desert precipitation and wind paths through it. The non-desert rendering branches keep their current line and snowflake behavior.

**Tech Stack:** JavaScript Canvas 2D renderer, Node.js assertion scripts, Next.js production build.

## Global Constraints

- Keep weather states, particle pooling, timing, and movement unchanged.
- The Sahara rain/storm and wind paths must not draw long `lineTo` strokes for particles.
- Do not change rain, snow, or wind rendering outside the desert branch.
- Do not allocate per-particle objects while rendering.

---

### Task 1: Render Sahara weather as grain clusters

**Files:**
- Modify: `scripts/test-game-vfx.mjs`
- Modify: `public/game/game.js:3630-3669`, `public/game/game.js:4646-4675`

**Interfaces:**
- Consumes: `rainParticles`, `windParticles`, `_precipBiome()`, `weatherRatio`, `nightRatio`, and the shared Canvas 2D `ctx`.
- Produces: `drawSandGrainCluster(x, y, size, alpha, seed)`, used by both Sahara weather rendering paths.

- [ ] **Step 1: Write the failing regression assertions**

  Add this block after the weather rendering assertions in `scripts/test-game-vfx.mjs`:

  ```js
  const precipitationStart = gameRuntime.indexOf('function drawPrecipitationLayer(W, H, layer)');
  const windStart = gameRuntime.indexOf('function drawWind(W, H)');
  const precipitationBody = gameRuntime.slice(precipitationStart, windStart);
  const desertPrecipitation = precipitationBody.slice(
    precipitationBody.indexOf("if (mode === 'desert')"),
    precipitationBody.indexOf("} else if (mode === 'snow')"),
  );
  const windEnd = gameRuntime.indexOf('// ── Landing Trails', windStart);
  const windBody = gameRuntime.slice(windStart, windEnd);

  assert.match(gameRuntime, /function drawSandGrainCluster\(x, y, size, alpha, seed\)/);
  assert.match(desertPrecipitation, /drawSandGrainCluster\(/);
  assert.doesNotMatch(desertPrecipitation, /ctx\.lineTo\(/);
  assert.match(windBody, /const isDesert = _precipBiome\(\) === 'desert';/);
  assert.match(windBody, /if \(isDesert\) \{[\s\S]*?drawSandGrainCluster\(/);
  ```

- [ ] **Step 2: Run the VFX test to verify it fails**

  Run: `node scripts/test-game-vfx.mjs`

  Expected: assertion failure because `drawSandGrainCluster` does not exist and the current desert precipitation path still uses `ctx.lineTo`.

- [ ] **Step 3: Implement the minimal granular renderer**

  In `public/game/game.js`, add the helper immediately before `drawPrecipitationLayer`:

  ```js
  function drawSandGrainCluster(x, y, size, alpha, seed) {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, size * 0.72, 0, Math.PI * 2);
    ctx.arc(x - size * (1.35 + (seed % 0.45)), y + size * 0.22, size * 0.42, 0, Math.PI * 2);
    ctx.arc(x + size * 0.95, y - size * 0.28, size * 0.30, 0, Math.PI * 2);
    ctx.fill();
  }
  ```

  Make `drawPrecipitationLayer` branch on `mode === 'desert'` before snow: set a warm night-aware `fillStyle`, paint a low-alpha pair of horizontal haze ellipses for the near layer, and call `drawSandGrainCluster` for each existing rain particle. Keep the snow branch and the existing line-based non-desert precipitation branch unchanged.

  In `drawWind`, introduce `const isDesert = _precipBiome() === 'desert';`. For `isDesert`, set the existing warm fill color and call `drawSandGrainCluster` for each wind particle; keep the current line-based wind loop inside the non-desert branch.

- [ ] **Step 4: Run the focused test and syntax check**

  Run: `node scripts/test-game-vfx.mjs && node --check public/game/game.js`

  Expected: `game VFX assertions passed` and exit code 0.

- [ ] **Step 5: Run regression checks**

  Run: `node scripts/test-run-complete-ui.mjs && node scripts/test-run-complete-runtime.mjs && npm run build`

  Expected: all scripts pass and the production build exits 0.

- [ ] **Step 6: Commit the implementation**

  ```bash
  git add public/game/game.js scripts/test-game-vfx.mjs
  git commit -m "feat: refine sahara sand effect"
  ```
