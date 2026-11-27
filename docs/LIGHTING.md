# Lighting research: warm interior (evening) mode

How to make the apartment read as lived-in at night with warm light, and what the planner implements.

## What makes warm interiors look real

1. **Color temperature, not orange tint.** Household bulbs are 2700 K (living, bedroom) and
   3000 K (task/under-cabinet). Colors come from a blackbody fit (`kelvinToColor`) instead of
   hand-picked hexes, so every source agrees.
2. **Layered light.** Real rooms mix *ambient* (recessed downlights), *task* (under-cabinet,
   vanity), and *accent/practical* (floor lamps you can see). One big light reads like a showroom.
3. **Pools, not fill.** Downlights make bright pools on the floor with darker gaps between them;
   that contrast is what reads as "evening". Keep global fill (hemisphere/IBL) very low.
4. **Visible sources glow.** Lamp shades and bulbs need emissive values above the bloom
   threshold so the light has a believable origin.
5. **Warm bounce.** Light off oak floors tints shadows amber. Without GI this is faked with a
   low hemisphere light whose ground color is warm brown.
6. **Cool outside.** A dim blue moonlight through the windows makes the interior warmth pop
   (warm/cool contrast).
7. **Walls must block light.** three.js lights ignore occluders unless they cast shadows, so an
   unshadowed ceiling light leaks into the next room. Downlights are shadowed spotlights; the
   remaining point lights use short `distance` cutoffs.

## Units caveat

three.js uses physical light units (candela for point/spot lights, inverse-square decay),
but this scene is modelled in **inches**, so real-world values (800 lm ≈ 64 cd) can't be used
directly. Light ratios are tuned by eye and checked with `pnpm run qa -- --url=...?mood=evening`.
Moving the scene to metres would allow real lumen values, but that is a large refactor.

## What's implemented

| Layer | Source | Notes |
|---|---|---|
| Ambient | 10 recessed 2700 K downlights (`EveningLights.tsx`) | Shadowed spotlights at 88″, 512² maps, static shadow cache |
| Task | Kitchen under-cabinet (3000 K), bath vanity (2700 K) | Point lights, distance-limited |
| Practical | Torchiere + tripod lamps | Brighter warm point lights; shades/bulbs emissive → bloom |
| Bounce | Hemisphere 0.16, warm ground | Fakes amber floor bounce |
| Outside | Moonlight 0.1, blue | Sun off; IBL at 0.14 for faint reflections |

Toggle with **Day / Evening** in the header (3D view) or `?mood=evening`.

## Further improvements (not done)

- **Baked lightmaps** of the evening setup (Blender or the three.js baker) for real bounce and
  soft occlusion at no runtime cost.
- **IES profiles** (`IESSpotLight`) for realistic beam shapes on walls ("scallops").
- **Visible fixtures**: recessed trims and pendants (the ceiling is cut away today).
- **Dimmer slider** / color-temperature slider (2200–4000 K).
- Path-traced photo mode in evening: works today, and gives true GI for stills.
