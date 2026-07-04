# Camera/Zoom Scaling — Design

Date: 2026-07-04
Status: approved (user), pending implementation
Scope: `public/game/game.js`, Renderer module only (~30 lines)

## Problem

The camera applies a permanent 1.25x zoom-in on narrow screens
(`scale = min(1, (viewW / 576) * 1.25)`), cropping ~0.9 of the 9 columns off
each side on a 390px phone. Cars become visible only after they are already
~58 world-px onto the field. At score 250+ car speeds are maxed and the
missing horizontal reaction room is the dominant fairness complaint. The
scale formula is also duplicated in three places (`updateCamera`, `draw`,
`drawRows` culling), which invites drift.

## Decisions (user-approved 2026-07-04)

1. **Zoom behavior: dynamic by score.** Start at 1.25x (big sprites for new
   players), pull back to 1.0x as score grows. Rejected: static weaker zoom
   (loses both ends), danger-reactive zoom (scale flicker, motion-sickness
   risk, hard to tune).
2. **Vertical anchor: stays at 0.65.** No anchor shift with score. Rejected:
   0.65→0.72 ramp and aggressive 0.78 (thumb-zone occlusion, back-jump
   framing).
3. **Curve: score 100 → 300, smoothstep, independent of difficulty.**
   Below 100: exactly 1.25. Above 300: exactly 1.0. Not tied to
   `smoothProgress` so camera tuning never silently shifts with balance
   changes. Rejected: 0→250 tied to difficulty (moves from step one, couples
   tuning), 150→400 (leaves the 250–400 max-speed window partially cropped).

## Design

### Single source of truth

New `getViewScale()` in Renderer replaces all three duplicated formulas:

```js
function getViewScale() {
  const worldW = COLS * CELL;
  return Math.min(1, ((_viewW || canvas.width) / worldW) * _zoomCur);
}
```

The `min(1, …)` clamp is preserved deliberately:

- wide screens (desktop) already sit at scale 1.0 → zero behavior change;
- the camera never pulls back wider than the field, so the empty spawn
  buffer and visible car spawning are never exposed.

### Zoom state and curve

```js
let _camScore = 0;    // raw score, fed every frame via setScore()
let _zoomCur  = 1.25; // eased zoom factor, advanced once per frame

function _zoomTarget() {
  const t = Math.min(Math.max((_camScore - 100) / 200, 0), 1);
  const s = t * t * (3 - 2 * t); // smoothstep
  return 1.25 - 0.25 * s;
}
```

`_zoomCur` eases toward `_zoomTarget()` in `updateCamera(dt)` at ~2/s
(`_zoomCur += (target - _zoomCur) * min(1, dt * 2)`), same pattern as the
existing `cameraY` follow. In-run steps are microscopic (score increments by
1 → ≤0.1% scale change); the ease exists for the run-restart transition:
score dropping 300→0 produces a ~1.5s smooth "dive back in" to the close-up
framing, which reads as an intentional run-start animation.

### Data feed

`Renderer.setScore(score)` is already called every frame from the game loop
(`Renderer.setScore(Player.getScore())` — currently used for day/night).
Add `_camScore = score;` as its first line, **before** the
`_dbgNightForce` early-return so the debug night override cannot starve the
camera of score updates.

### Death / continue freeze

Free by construction: zoom depends only on score (frozen after death) and
`cameraY` follows the player (not moving). No explicit freeze state.

### Debug hook

`_dbgZoom(scoreOrNull)` exported next to `_dbgWeather`/`_dbgNight`: while
non-null, overrides `_camScore` in `setScore()` so any zoom level can be
inspected without playing to score 300. `null` returns control to the real
score.

## Risks checked

- `LOOK_AHEAD = 22` generated rows ≥ max visible ahead at 1.0x
  (~10.5 rows on a tall phone at 0.65 anchor); 14-row tail behind ≥ ~5.7
  visible behind. No generation changes needed.
- `maxCamY` bottom-edge clamp and `drawRows` culling are already
  parameterized by scale; they just consume `getViewScale()`.
- Weather, fog blobs, rain/splash overlays are screen-space — unaffected.
- Sprite softness when pulled back (54 → 43 CSS px/cell) is mitigated by the
  already-shipped devicePixelRatio backing store (cap 2x).
- Shake (`shakeX/shakeY`) applies outside the scale transform — unaffected.

## Verification

Manual, in the browser console (no automated canvas tests exist):

1. `__GAME_DBG.Renderer._dbgZoom(0)` → framing identical to current build.
2. `_dbgZoom(200)` → mid pull-back (~1.125x), no side voids, HUD untouched.
3. `_dbgZoom(300)` → all 9 columns visible on a phone-width viewport; cars
   visible at field entry; culling shows no missing rows top/bottom.
4. `_dbgZoom(null)` then die + continue → framing frozen under the overlay.
5. Restart after a 300+ run → smooth ~1.5s zoom-in, no snap.
6. Desktop-width viewport → pixel-identical before/after (clamp at 1.0).
