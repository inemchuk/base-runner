# Vehicle Light Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attach soft night headlights and taillights to the real lamp positions of every active vehicle sprite, with a beam that fits each vehicle class.

**Architecture:** Replace `_CAR_LIGHT_MAP`'s mixed half-resolution pixel coordinates with normalized light profiles in `public/game/game.js`. Each profile owns two front lamps, two rear lamps, beam dimensions, and compact halo scales. `drawCarLights` transforms those normalized coordinates using the rendered car rectangle and mirrors them when traffic changes direction; a source-contract script ensures every active sprite keeps a profile.

**Tech Stack:** Vanilla Canvas 2D renderer, pre-rendered offscreen canvas FX sprites, Node.js assertion scripts.

## Global Constraints

- Do not start the local dev server.
- Do not alter traffic physics, collision bounds, spawn weights, vehicle sprites, economy, or on-chain code.
- Keep `police_siren` as a distinct emergency-light layer over the ordinary police profile.
- Use cached FX sprites only; do not allocate `CanvasGradient` objects in the per-frame light path.
- Preserve the user-owned untracked directories under `public/game/chars/` and `tmp/`.

---

### Task 1: Define calibrated normalized profiles for every vehicle sprite

**Files:**
- Create: `scripts/test-vehicle-light-profiles.mjs`
- Modify: `public/game/game.js:3258-3280`

**Interfaces:**
- `_CAR_LIGHT_PROFILES[spriteId]` exposes `{ front, rear, beam, halo }`.
- `front` and `rear` are two `[x, y]` normalized coordinates in `0..1`.
- `beam` exposes `{ length, width, offset, alpha }` in world-cell ratios.
- `halo` exposes `{ head, tail, dot }` as compact rendered-size ratios.

- [ ] **Step 1: Write the failing source-contract test**

  Create `scripts/test-vehicle-light-profiles.mjs`:

  ```js
  import assert from 'node:assert/strict';
  import { readFileSync } from 'node:fs';

  const game = readFileSync('public/game/game.js', 'utf8');
  const ids = [
    'taxi', 'yellow_taxi', 'green_taxi', 'orange', 'police',
    'ambulance', 'truck', 'bus', 'firetruck',
    'black_suv', 'blue_hatchback', 'white_panel_van',
    'silver_minivan', 'orange_pickup',
  ];

  assert.match(game, /const _CAR_LIGHT_PROFILES = Object\.freeze\(\{/);
  assert.doesNotMatch(game, /_CAR_LIGHT_MAP/);

  for (const id of ids) {
    assert.match(
      game,
      new RegExp(`\\n\\s{4}${id}:\\s+_lightProfile\\(`),
      `${id} should have a calibrated light profile`,
    );
  }

  assert.match(game, /function _lightPointToCanvas\(point, facingRight, x, y, width, height\)/);
  assert.match(game, /ctx\.globalCompositeOperation = 'screen'/);
  assert.match(game, /profile\.beam\.offset/);
  assert.match(game, /profile\.halo\.head/);
  assert.match(game, /profile\.halo\.tail/);

  console.log('vehicle light profile assertions passed');
  ```

- [ ] **Step 2: Run the test and verify it fails**

  Run:

  ```bash
  node scripts/test-vehicle-light-profiles.mjs
  ```

  Expected: failure on `_CAR_LIGHT_PROFILES`, because the renderer still uses
  `_CAR_LIGHT_MAP`.

- [ ] **Step 3: Replace the legacy map with normalized sprite profiles**

  In `public/game/game.js`, replace `_CAR_LIGHT_MAP` with the following
  helper, class presets, and complete calibrated table. The coordinates are
  normalized against each sprite's real image dimensions, measured from the
  actual light clusters rather than its transparent bounds.

  ```js
  const _lightProfile = (front, rear, beam, halo) => Object.freeze({
    front: Object.freeze(front),
    rear: Object.freeze(rear),
    beam: Object.freeze(beam),
    halo: Object.freeze(halo),
  });
  const _SEDAN_BEAM = Object.freeze({ length: 1.34, width: 0.74, offset: 0.038, alpha: 0.62 });
  const _VAN_BEAM = Object.freeze({ length: 1.48, width: 0.68, offset: 0.042, alpha: 0.64 });
  const _LONG_BEAM = Object.freeze({ length: 1.62, width: 0.64, offset: 0.046, alpha: 0.66 });
  const _COMPACT_HALO = Object.freeze({ head: 0.225, tail: 0.135, dot: 0.060 });
  const _LONG_HALO = Object.freeze({ head: 0.205, tail: 0.125, dot: 0.054 });

  const _CAR_LIGHT_PROFILES = Object.freeze({
    taxi:             _lightProfile([[0.940, 0.225], [0.940, 0.775]], [[0.075, 0.220], [0.075, 0.780]], _SEDAN_BEAM, _COMPACT_HALO),
    yellow_taxi:      _lightProfile([[0.930, 0.220], [0.930, 0.780]], [[0.075, 0.250], [0.075, 0.750]], _SEDAN_BEAM, _COMPACT_HALO),
    green_taxi:       _lightProfile([[0.940, 0.220], [0.940, 0.780]], [[0.055, 0.220], [0.055, 0.780]], _SEDAN_BEAM, _COMPACT_HALO),
    orange:           _lightProfile([[0.925, 0.210], [0.925, 0.790]], [[0.055, 0.290], [0.055, 0.710]], _SEDAN_BEAM, _COMPACT_HALO),
    police:           _lightProfile([[0.950, 0.300], [0.950, 0.700]], [[0.040, 0.200], [0.040, 0.800]], _SEDAN_BEAM, _COMPACT_HALO),
    ambulance:        _lightProfile([[0.900, 0.315], [0.900, 0.680]], [[0.040, 0.205], [0.040, 0.795]], _VAN_BEAM, _COMPACT_HALO),
    truck:            _lightProfile([[0.975, 0.215], [0.975, 0.780]], [[0.020, 0.220], [0.020, 0.780]], _LONG_BEAM, _LONG_HALO),
    bus:              _lightProfile([[0.972, 0.200], [0.972, 0.800]], [[0.022, 0.220], [0.022, 0.780]], _LONG_BEAM, _LONG_HALO),
    firetruck:        _lightProfile([[0.970, 0.255], [0.970, 0.745]], [[0.155, 0.330], [0.155, 0.660]], _LONG_BEAM, _LONG_HALO),
    black_suv:        _lightProfile([[0.890, 0.280], [0.890, 0.690]], [[0.080, 0.220], [0.080, 0.780]], _SEDAN_BEAM, _COMPACT_HALO),
    blue_hatchback:   _lightProfile([[0.860, 0.250], [0.860, 0.750]], [[0.115, 0.240], [0.115, 0.760]], _SEDAN_BEAM, _COMPACT_HALO),
    white_panel_van:  _lightProfile([[0.890, 0.330], [0.890, 0.670]], [[0.045, 0.225], [0.045, 0.775]], _VAN_BEAM, _COMPACT_HALO),
    silver_minivan:   _lightProfile([[0.855, 0.330], [0.855, 0.660]], [[0.090, 0.220], [0.090, 0.780]], _VAN_BEAM, _COMPACT_HALO),
    orange_pickup:    _lightProfile([[0.900, 0.305], [0.900, 0.680]], [[0.090, 0.220], [0.090, 0.780]], _VAN_BEAM, _COMPACT_HALO),
  });
  const _DEFAULT_CAR_LIGHT_PROFILE = _CAR_LIGHT_PROFILES.taxi;
  ```

- [ ] **Step 4: Run the profile contract and syntax check**

  Run:

  ```bash
  node scripts/test-vehicle-light-profiles.mjs
  node --check public/game/game.js
  ```

  Expected: both commands exit zero and the profile test prints
  `vehicle light profile assertions passed`.

- [ ] **Step 5: Commit the profile data and contract**

  ```bash
  git add public/game/game.js scripts/test-vehicle-light-profiles.mjs
  git diff --cached --check
  git commit -m "feat(game): calibrate vehicle light anchors"
  ```

### Task 2: Render restrained per-vehicle beams and lamp cores

**Files:**
- Modify: `public/game/game.js:3824-3847, 4206-4305`
- Modify: `scripts/test-vehicle-light-profiles.mjs`

**Interfaces:**
- `_lightPointToCanvas(point, facingRight, x, y, width, height)` returns a
  mirrored canvas coordinate for one normalized lamp point.
- `drawCarLights(row, rowY, car)` obtains `_CAR_LIGHT_PROFILES[imageKey]` and
  applies that profile's `beam` and `halo` values.

- [ ] **Step 1: Extend the failing contract for the new draw path**

  Add these assertions before the final `console.log` in
  `scripts/test-vehicle-light-profiles.mjs`:

  ```js
  assert.match(game, /const profile = _CAR_LIGHT_PROFILES\[imageKey\] \|\| _DEFAULT_CAR_LIGHT_PROFILE/);
  assert.match(game, /const frontLights = profile\.front\.map\(point => _lightPointToCanvas/);
  assert.match(game, /const rearLights = profile\.rear\.map\(point => _lightPointToCanvas/);
  assert.match(game, /beamOriginX = beamMidX \+ direction \* car\.width \* profile\.beam\.offset/);
  assert.match(game, /const glowR = CELL \* profile\.halo\.head/);
  assert.match(game, /const glowR = CELL \* profile\.halo\.tail/);
  ```

- [ ] **Step 2: Run the test and verify it fails**

  Run:

  ```bash
  node scripts/test-vehicle-light-profiles.mjs
  ```

  Expected: failure on `const profile = ...`, because `drawCarLights` still
  derives lights from `nativeW`, `sx`, and `sy`.

- [ ] **Step 3: Replace generic light conversion and beam rendering**

  Add this helper immediately before `drawCarLights`:

  ```js
  function _lightPointToCanvas(point, facingRight, x, y, width, height) {
    return {
      x: x + (facingRight ? point[0] : 1 - point[0]) * width,
      y: y + point[1] * height,
    };
  }
  ```

  In `drawCarLights`, remove the `nativeW`, `sx`, `sy`, `lights`, and
  `toCanvas` setup and replace it with:

  ```js
  const profile = _CAR_LIGHT_PROFILES[imageKey] || _DEFAULT_CAR_LIGHT_PROFILE;
  const frontLights = profile.front.map(point => _lightPointToCanvas(point, facingRight, x, y, car.width, car.height));
  const rearLights = profile.rear.map(point => _lightPointToCanvas(point, facingRight, x, y, car.width, car.height));
  ```

  Replace the generic beam block with this profile-aware block:

  ```js
  if (nightRatio > 0.15 && frontLights.length >= 2) {
    const beamMidX = (frontLights[0].x + frontLights[1].x) / 2;
    const beamMidY = (frontLights[0].y + frontLights[1].y) / 2;
    const beamOriginX = beamMidX + direction * car.width * profile.beam.offset;
    const beamLength = CELL * profile.beam.length;
    const beamWidth = CELL * profile.beam.width;
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = alpha * profile.beam.alpha;
    ctx.save();
    ctx.translate(beamOriginX, beamMidY);
    ctx.scale(direction, 1);
    ctx.drawImage(fxs.hlBeam, 0, -beamWidth / 2, beamLength, beamWidth);
    ctx.restore();

    ctx.globalAlpha = alpha;
    for (const point of frontLights) {
      const glowR = CELL * profile.halo.head;
      const dotR = Math.max(1.5, car.height * profile.halo.dot);
      ctx.drawImage(fxs.hlGlow, point.x - glowR, point.y - glowR, glowR * 2, glowR * 2);
      ctx.drawImage(fxs.hlDot, point.x - dotR, point.y - dotR, dotR * 2, dotR * 2);
    }
  }
  ```

  Use `rearLights` in the tail-light block, change its composite operation to
  `screen`, and replace its sizes with:

  ```js
  const glowR = CELL * profile.halo.tail;
  const dotR = Math.max(1.2, car.height * profile.halo.dot * 0.58);
  ```

  Keep the existing siren block after the normal lamps. In its `drawLight`
  helper, calculate `sirenSx` and `sirenSy` locally as it does today; it must
  not depend on the removed generic `sx` or `sy` variables.

- [ ] **Step 4: Tune the cached light sprites and wet-road reflection**

  In `_fxS()`, keep the cached `hlBeam` canvas but change its stops to a softer
  warm falloff:

  ```js
  grd.addColorStop(0, 'rgba(255,236,178,0.15)');
  grd.addColorStop(0.30, 'rgba(255,231,164,0.07)');
  grd.addColorStop(1, 'rgba(255,226,150,0)');
  ```

  Replace the wet-road per-lamp ellipse with a compact streak based on the
  profile so reflections do not become a second cone:

  ```js
  if (_surfaceForRow(row).id === 'wetRoad') {
    ctx.fillStyle = 'rgb(255,235,180)';
    ctx.globalAlpha = alpha * 0.055 * Math.min(weatherRatio, 1);
    for (const point of frontLights) {
      ctx.beginPath();
      ctx.ellipse(point.x, point.y + CELL * 0.075, CELL * 0.018, CELL * 0.070, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ```

- [ ] **Step 5: Run the focused visual-rendering regression set**

  Run:

  ```bash
  node scripts/test-vehicle-light-profiles.mjs
  node --check public/game/game.js
  node scripts/test-runner-hub.mjs
  node scripts/test-reward-labels.mjs
  node scripts/test-quest-icons.mjs
  npm run lint
  git diff --check
  ```

  Expected: all assertion and syntax commands pass; lint exits zero with only
  the repository's existing warnings.

- [ ] **Step 6: Commit the renderer upgrade**

  ```bash
  git add public/game/game.js scripts/test-vehicle-light-profiles.mjs
  git diff --cached --check
  git commit -m "feat(game): refine night vehicle lighting"
  ```

## Completion Checklist

- [ ] Every active traffic sprite has a front/rear light profile.
- [ ] Headlights and taillights follow the correct sprite points after traffic reverses.
- [ ] Long vehicles project from the cab/front rather than their body midpoint.
- [ ] Headlight and taillight halos are compact, not circular blobs.
- [ ] Police siren remains separate from ordinary vehicle lights.
- [ ] No development server was started.
