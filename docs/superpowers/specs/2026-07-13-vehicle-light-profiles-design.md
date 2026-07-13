# Vehicle Light Profiles Design

## Goal

Make night traffic lighting read as part of each vehicle sprite rather than a
generic effect placed at the vehicle bounds. Headlights must originate at the
actual lamps, taillights at the actual rear lamps, and the forward light must
remain readable without washing out the road or sprite.

## Scope

- Cover every active traffic sprite in `CAR_SPRITE_SRCS`.
- Keep the existing day/night threshold and vehicle movement direction.
- Keep police and emergency sirens as a separate effect layer.
- Do not change vehicle physics, collision boxes, traffic spawning, sprites,
  or on-chain/economy code.

## Data Model

Replace the current mixed half-resolution coordinates with one normalized
profile per sprite:

- `front` and `rear`: two lamp coordinates in `0..1` sprite space.
- `beam`: per-vehicle-class length, width, forward offset, intensity, and
  optional warm tint.
- `halo`: compact per-lamp headlight and taillight glow scale.

Normalized coordinates use the actual image dimensions, so sedan, van, and
long-vehicle sprites scale consistently without width-specific conversion
branches. Reversing movement mirrors the whole profile before drawing.

## Rendering

1. Draw one soft, tapered, warm beam from just beyond the midpoint of the two
   actual front lamps. The beam stays in front of the vehicle and uses a
   restrained screen blend rather than an over-bright additive wedge.
2. Draw a small white core and halo at each front lamp.
3. Draw compact red cores and halos at each rear lamp. They never project a
   forward cone.
4. On wet roads, add a short, low-alpha reflected streak below each front
   lamp; dry roads receive no reflection.
5. Draw police/ambulance emergency lights after the normal lights so sirens
   remain clearly distinct from headlights and brake lights.

## Visual Targets

- Sedans/taxis: short, broad, low-intensity beam.
- Vans/pickups: slightly longer beam and narrower lamp spacing where the
  sprite requires it.
- Truck, bus, and firetruck: beam starts at the cab/front, not at the body
  midpoint; rear lamps stay on the trailer/body edge.
- No large white or red "balls" around a vehicle.
- The player can still immediately see vehicle direction at night.

## Performance and Verification

- Reuse pre-rendered light sprites; do not allocate gradients per frame.
- Extend the existing source-contract coverage to require a complete profile
  for every active traffic sprite and no legacy coordinate map.
- Verify JavaScript syntax, the vehicle-light contract, existing game checks,
  lint, and whitespace before completion.
