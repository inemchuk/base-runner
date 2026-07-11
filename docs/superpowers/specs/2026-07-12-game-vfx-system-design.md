# Game VFX System Design

## Goal

Bring Base Runner's shadows, material interactions, weather, gameplay feedback,
and cosmetic effects into one polished semi-realistic arcade visual language.
Effects should make surfaces and impacts feel physical, keep hazards readable,
and reserve the strongest visual response for meaningful gameplay events.

The design applies to the vanilla Canvas renderer in `public/game/game.js`.
It does not change movement, collision rules, world generation, economy values,
ownership, quest progress, or onchain behavior.

## Current-state findings

The renderer already contains a broad set of effects: animated water, rain,
snow, sandstorms, fog, wind, lightning, wet-road reflections, trails, booster
feedback, death packs, screen shake, coin pickup text, and score feedback. The
main problem is not missing quantity; it is inconsistent visual language and
fragmented context.

- Shadows are separate hard-coded ellipses with different offsets and alpha.
  The player sprite and procedural fallback duplicate shadow logic.
- Default landing trails know only `grass`, `road`, or `water`, so desert and
  snow rows inherit effects intended for green grass.
- Physical weather effects coexist with comic, pixel, emoji-like, and generic
  geometric effects without a shared hierarchy.
- Night tint is applied after most world effects, so it dims headlights,
  reward glows, and other emissive elements that should remain luminous.
- Some ordinary events are more visually prominent than important feedback.
  Repeated row-score text, jump rings, and full-row train warning flashes add
  noise without improving material response.
- Many effects allocate or draw independent primitives instead of sharing
  cached sprites, presets, lifetimes, and particle budgets.

## Approved visual direction

The target is **polished semi-realistic arcade**.

- Surface response, shadows, weather, and impacts follow understandable
  physical rules.
- Gameplay-critical feedback remains immediate and readable.
- Rewards, boosters, and equipped premium cosmetics may be brighter and more
  expressive than ambient effects.
- The game remains stylized 2D, not photorealistic, cinematic, or 3D.
- Effects support the art instead of covering sprites or navigation space.

One global light direction comes from the upper-left. Cast shadows extend
toward the lower-right, highlights face the light, and directional impacts
respect the source of motion.

## Effect hierarchy

Every effect belongs to one of three semantic groups and one of four intensity
tiers.

### Semantic groups

1. **Physical:** shadows, footprints, dust, snow powder, water splashes,
   wheel spray, foliage motion, and log wakes.
2. **Gameplay:** hazard warnings, collisions, shield absorption, magnet pull,
   revival, and other state changes the player must understand.
3. **Reward:** coins, records, levels, quest completion, and equipped cosmetic
   accents.

### Intensity tiers

- `ambient`: persistent low-contrast motion such as water, fog, or wind.
- `contact`: short surface response from a step, landing, wheel, or log.
- `feedback`: clear confirmation of pickup, shield activation, or warning.
- `impact`: the strongest response, reserved for collision, revival, record,
  level-up, or similarly rare moments.

An ordinary step must never compete visually with a collision or rare reward.

## Render composition

The renderer uses an explicit visual stack:

1. terrain material and its embedded texture;
2. directional cast shadows;
3. tight contact shadows and surface contact effects;
4. world objects, vehicles, logs, and the player;
5. world-space gameplay and reward effects;
6. night and atmospheric lighting;
7. emissive lights, reflections, lightning response, boosters, and rewards;
8. near-screen precipitation;
9. interface.

This separates reflected or emitted light from the night tint. Headlights,
coin glints, shield energy, and lightning therefore remain luminous without
making the underlying sprites unnaturally bright.

## Surface context

Effects use a resolved surface descriptor instead of inferring appearance from
row type alone.

The descriptor distinguishes:

- `grass`;
- `sand`;
- `snow`;
- `dryRoad`;
- `wetRoad`;
- `water`;
- `railBed` where a train-specific response is required.

Resolution considers row type, dominant biome, current weather, and day/night
lighting. A biome blend chooses the material actually presented by that row;
an effect does not change material halfway through its lifetime.

Each surface preset supplies at least:

- shadow tint and contact opacity;
- landing and footprint preset;
- particle palette and gravity/drift;
- weather response;
- reflection or wetness behavior;
- lifetime and maximum particle count.

## Material responses

### Grass

- A landing briefly compresses a small patch and releases three to five short
  blade or soil particles.
- Paired dark-green impressions fade in roughly one second.
- Wind causes restrained grass and foliage motion; rocks and other rigid props
  do not sway.
- Contact shadows use a green-grey tint rather than neutral black.

### Sand

- A landing releases a compact warm dust puff and a few granular particles in
  the direction opposite motion.
- Footprints are shallow, warm-brown, and last approximately 0.7-1 second.
- Wind creates low ground-hugging streams and sparse airborne grains instead
  of filling the whole screen with long lines.
- Props receive a small sand ridge at their base, and shadows are warm brown.

### Snow

- A landing creates a depressed cool-blue footprint, a soft powder puff, and a
  few uneven snow fragments.
- Footprints persist for approximately 2-3 seconds, longer than other surface
  marks but still bounded by the global trail cap.
- Wind produces restrained drifting powder near the ground.
- Props receive a small snow skirt at their base. Shadows use a cool blue
  tint and never read as black paint on white terrain.

### Road

- Ordinary steps on dry asphalt produce almost no particle effect. Only a hard
  landing may create a small grey dust response.
- Moving vehicle contact remains subtle on dry asphalt.
- Rain replaces dust with short wheel spray and small player splashes.
- Wet reflections are elongated and low-alpha; they do not mirror entire
  sprites or reduce obstacle readability.

### Water

- Contact produces a compact splash, a small number of droplets, and two
  elliptical ripple rings.
- Logs add a bow wave and a short wake whose strength follows log movement and
  bobbing.
- Rain ripples share the same palette and perspective as landing ripples.
- Water shadows are dark navy contact shapes combined with a light wake edge,
  not generic black ground ellipses.

### Rail bed

- An approaching or passing train can produce subtle ballast dust, rail
  vibration, and rare small wheel sparks.
- Effects remain beneath the train and never obscure its silhouette or travel
  direction.

## Unified shadows

All ground shadows use one cached shadow renderer with material-aware tint,
soft falloff, global light direction, object height, and lift.

- The player receives a tight contact shadow. During a jump it becomes smaller
  and lighter while remaining anchored to the landing plane.
- Cars receive a wide low shadow under the body with denser wheel contact.
- Trains receive a long soft shadow with restrained opacity.
- Logs receive a water contact shadow plus wake rather than a land shadow.
- Rocks, bushes, stumps, and snowmen receive short shadows.
- Trees, pines, and cacti receive longer offset shadows appropriate to height.

The duplicate player shadow branches are replaced by the same preset. Cached
soft ellipses or radial sprites provide falloff; per-frame canvas blur is not
used.

## Weather and atmosphere

Weather affects materials and light, not only the screen overlay.

### Rain and storm

- Rain uses far, middle, and sparse near layers with different length and
  opacity.
- Grass receives occasional dark contact marks, roads and vehicles receive
  spray, and water receives ripples.
- Storm combines rain, wind, active water, lightning, and darker atmosphere,
  but each subsystem has an intensity cap.

### Snow

- Snow uses smaller distant flakes and fewer larger near flakes.
- Blizzard drift and ground powder respond to wind.
- The player and the next two relevant rows remain readable through the
  precipitation.

### Sandstorm

- Most movement stays close to the terrain, with sparse grains and a warm haze.
- Sand does not create rain splashes, wet roads, or water-like streaks.

### Fog

- Fog keeps depth-based row fading and drifting layers.
- The current row, player, and nearest hazards retain enough contrast for
  direction and landing-cell recognition.

### Wind

- Wind is communicated primarily through grass, foliage, sand, snow, and water.
- Screen-space lines become a secondary accent rather than the main cue.

### Lightning

A lightning flash briefly lights the scene, weakens cast shadows, and creates
cold highlights on water, wet road, vehicles, the player, and prop edges. The
bolt appears only at the first peak; thunder remains delayed. The flash must
respect photosensitivity-safe intensity and avoid repeated full-white frames.

## Object interactions

- Player contact effects fire at the actual landing point and use the resolved
  surface preset. The generic black jump ring is removed.
- Cars use dry tire contact or wet spray according to road state. Continuous
  smoke is avoided.
- Logs produce a bow ripple and trailing wake. Their bob animation modulates
  the water contact subtly without visual jitter.
- Trees, bushes, pines, and cacti sway slightly in strong wind. Rocks,
  stumps, and snowmen remain rigid.
- Props receive material contact at the base: grass blades, sand ridge, snow
  skirt, or water edge as appropriate.
- The train lightly vibrates the rail bed and can emit rare wheel sparks while
  passing.

## Gameplay feedback

### Coins and score

- A picked-up coin compresses slightly, converges on the pickup point, and
  leaves a small gold glint.
- Double-coin feedback adds two short gold arcs and a stronger sound response,
  not persistent particle rain.
- Floating values use the game's interface type treatment with a lighter
  outline than the current generic Arial text.
- Routine row `+1` feedback is subdued. Records, level-ups, and quest
  completion own the stronger feedback tier.

### Magnet

Coins follow a smooth curve with a thin blue-white trail. Arrival creates one
small pulse near the player. The trail remains readable at night without
becoming a permanent beam.

### Shield and Second Chance

- The shield is a translucent blue shell with a slow low-amplitude pulse.
- On impact it deforms toward the collision, shows brief light fractures, and
  dissolves.
- Second Chance briefly slows visual motion, lowers scene saturation, and
  sends a directional light wave toward the chosen safe cell. Gameplay timing
  and relocation rules remain unchanged.

### Train warning

The system font warning symbol and full-row red fill are replaced with signal
lights at the track edges, subtle rail vibration, and a directional warning
from the train's entry side. Sound remains an important cue.

### Collision and death

- Car collision creates a short directional camera impulse, road-dependent
  fragments, and a few sparks. It is not portrayed as an explosion.
- Train collision is heavier, with a directional impulse, metallic sparks,
  and a short motion streak.
- Water death creates a splash, bubbles, expanding ripples, and local darkening
  with little or no camera shake.
- Camera motion follows the impact direction and decays deterministically
  instead of choosing a new unrelated random offset each frame.

## Cosmetic trails and death packs

Physical response always renders first. Equipped cosmetics add an accent on
top and never replace the correct surface or collision response.

- `sparkle`: four to six sharp warm glints with a small bright core;
- `fire`: short flame shapes, embers, and restrained dark motes;
- `hearts`: small custom-drawn dimensional hearts without emoji styling;
- `coins`: miniatures of the actual coin sprite;
- `rainbow`: a brief prismatic ribbon or refracted glints rather than six
  disconnected circles;
- `pixel`: a deliberate pixel overlay on top of the physical base event;
- `comic`: a deliberate graphic accent on top of the physical base event;
- `dramatic`: restrained time, lighting, and larger particles while retaining
  the same collision semantics.

Cosmetics may use reward-level color and brightness, but must stay within the
same perspective, light direction, lifetime discipline, and readability caps.

## Architecture and data flow

The conceptual flow is:

```text
gameplay event
  -> resolve surface, biome, weather, light, and object context
  -> select semantic group and intensity tier
  -> instantiate a preset from the particle pool
  -> update lifetime and physics
  -> draw in its declared render layer
  -> return expired particles to the pool
```

The renderer exposes a small event entry point equivalent to
`emitGameEffect(event, position, context)`. Callers report semantic events such
as `step`, `land`, `coinPickup`, `shieldHit`, `carImpact`, `trainImpact`,
`waterFall`, `logWake`, or `weatherContact`; they do not choose colors or draw
primitives directly.

A surface resolver equivalent to
`getSurfaceContext(row, biome, weather)` supplies the material preset. Shadow,
trail, collision, and weather systems consume the same resolved context so
their palettes cannot drift independently.

The renderer keeps specialist draw functions for water, fog, lightning,
and other continuous systems, but their colors, intensities, and layering use
the shared context and hierarchy.

## Performance and quality degradation

Mobile performance is a hard constraint.

- Soft particles, shadow masks, and common glows are pre-rendered to small
  offscreen canvases and reused.
- No expensive per-object `ctx.filter = blur(...)` is used in the hot path.
- Short-lived particles are pooled instead of continuously allocating arrays
  of new objects during dense weather.
- Each category has a strict cap. Ambient weather and cosmetics are discarded
  before gameplay-critical feedback.
- A quality controller reduces far weather density and decorative particle
  counts when sustained frame time is high. It does not remove hazards,
  shield feedback, collision feedback, or the player contact shadow.
- Deterministic seeds prevent particle positions and fog shapes from jittering
  between frames.
- Effects outside the visible row range are not drawn and do not continue
  expensive updates when no longer observable.

## Failure handling

- Missing cached sprite: use a simple primitive fallback with the same preset
  color, size, layer, and lifetime.
- Unknown surface: fall back to restrained neutral contact behavior, not grass.
- Unknown cosmetic: render only the physical base effect.
- Invalid particle data: discard that particle without interrupting the frame.
- Pool exhaustion: drop ambient or cosmetic particles first; never alter
  gameplay state.
- Effect errors cannot modify collision, scoring, economy, ownership, or
  onchain state.

## Readability and accessibility

- The player, current row, and next two relevant hazard rows retain contrast in
  all weather and lighting combinations.
- Effects never cover the HUD or intercept input.
- Flash intensity and frequency remain restrained; no rapid full-screen white
  strobing is introduced.
- A reduced-effects path lowers camera impulse, near-screen precipitation,
  cosmetic particle count, and nonessential pulses while keeping semantic
  feedback visible.
- Color is not the sole warning cue: train direction also uses position,
  animation, rail motion, and sound.

## Verification and acceptance criteria

Visual review covers the matrix:

```text
grass / sand / snow / dry road / wet road / water / rail bed
x day / night
x clear / rain / wind / storm / fog where applicable
x landing / vehicle contact / pickup / booster / collision
```

Automated and diagnostic verification covers:

- deterministic surface resolution for every row, biome, and wet-road state;
- correct preset selection for each gameplay event;
- lifetime expiry and pool reuse;
- per-category and total particle caps;
- priority degradation under simulated frame pressure;
- physical base effects remaining present when cosmetics are equipped;
- fallback behavior for missing presets and sprites;
- no retained effects after reset or death cleanup;
- JavaScript syntax and whitespace checks.

Acceptance requires:

- no green-grass footprints on sand or snow;
- no dry dust on wet asphalt;
- no black-looking shadows on snow or bright sand;
- headlights and reward glows remain emissive at night;
- train, car, log, player, and decoration contact reads consistently;
- weather changes the materials without hiding immediate hazards;
- cosmetic effects remain recognizable without replacing physical feedback;
- stable mobile performance at the current gameplay scale.

## Scope boundaries

This design does not add new biomes, hazards, vehicles, shop items, or gameplay
mechanics. It does not regenerate character, vehicle, log, or environment
sprites. It does not change effect ownership or pricing. Sound redesign may be
handled separately; this pass only preserves and synchronizes existing cues
where visual timing changes.
