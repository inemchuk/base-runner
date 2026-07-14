# Sahara sand effect

## Goal

Replace the Sahara sandstorm's long diagonal strokes, which read as flying sticks, with a granular sand effect that stays readable over gameplay.

## Chosen direction

Each existing desert weather particle will render as a small cluster of round sand grains rather than a line. A restrained warm haze will unify the particles into a wind-driven sandstorm without obscuring the runner or hazards.

## Scope

- Keep the existing weather states, particle pool, timing, and wind direction.
- Update both desert precipitation and desert wind rendering so no Sahara weather mode draws stick-like streaks.
- Reuse the existing two depth layers: near grains are slightly larger and more opaque than far grains.
- Keep per-particle work bounded and avoid allocating particles during rendering.

## Visual behavior

- Grains use a warm sand palette that adapts to night mode.
- Each particle becomes one to three tiny circles with a subtle horizontal offset, suggesting a drifting cluster rather than rain.
- A low-alpha horizontal haze sits behind the grains only in the Sahara.
- Motion remains primarily left-to-right with a small downward drift, preserving the sense of wind.

## Acceptance criteria

- The Sahara's rain/storm and windy weather paths contain no long `lineTo` particle strokes.
- Sand is visibly granular and directional at both depth layers.
- Non-desert rain, snow, and wind rendering remains unchanged.
- Existing gameplay and visual checks pass, along with JavaScript syntax validation and production build.
