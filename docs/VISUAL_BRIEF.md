# Visual brief

The bar for the apartment showcase, adapted from the process behind the Claude Fable 5 three.js demos
(`Braffolk/fable5-world-demo`): a written bar, composed shots, and an automated screenshot loop.

## Reference

Judge renders against real interior photography of the Loden walkthrough and contemporary arch-viz
(light oak floors, white plaster, black window mullions, soft north daylight). "Pretty good for a
browser" is not the bar.

## Pillars

1. **Light transport.** Shadows carry color (warm bounce, cool sky); never flat gray or crushed black.
   Window walls shade the room so daylight reads directional.
2. **Real surfaces.** Large surfaces use CC0 photoscans (Poly Haven / ambientCG) at true physical
   scale; procedural canvas textures are the offline fallback.
3. **Grounded objects.** Every floor piece has contact shadow + AO; PCSS hardens shadows at contact.
4. **Composed views.** Showcase shots are authored (`?shot=1..6`), not found.
5. **Motion is feedback.** Camera damping, eased zoom/fit (≤ 380 ms), drag lift, settle on add.
   Keyboard actions stay instant. Everything honors `prefers-reduced-motion`.

## Banned outcomes

- Gray, chroma-less shadows; flat exposure with mean luma ≈ 0.8 (the pre-upgrade look).
- Jaggies on mullions/monitors (SMAA is on in the high preset).
- Visible texture tiling on the floor at shot distance.
- Animations on initial page load or on keyboard nudges.

## Floors (checked by `pnpm run qa`)

| Metric | Floor |
|---|---|
| Crushed blacks (luma < 0.03) | ≤ 4 % of pixels |
| Clipped whites | ≤ 4 % of pixels |
| Shadow chroma (mean max−min over luma 0.06–0.32) | ≥ 0.035 |
| Change vs. accepted baseline | ≤ 2 % unless intentional (`--update`) |

## Loop

1. `pnpm run dev`, then `pnpm run qa` → `qa/out/` (shots, `contact-sheet.jpg`, `report.md`).
2. Compare the contact sheet to the references; list the biggest visual differences, fix the top three.
3. Re-run; accept with `pnpm run qa -- --update` when the change is intended.

## URL parameters

`?shot=N`, `?cam=px,py,pz,tx,ty,tz`, `?preset=low|high`, `?tm=neutral|agx|aces`,
`?hdri=kloofendal_48d_partly_cloudy_puresky|lebombo`.

## Assets

All third-party assets are CC0 — see [ASSETS.md](ASSETS.md).
