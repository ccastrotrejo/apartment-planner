import { useMemo } from 'react';
import * as THREE from 'three';

import { kelvinToColor, WARM_WHITE_K } from './lightColor';

/** Recessed 4″ downlight positions on the 90″ ceiling, plan inches [x, z]. */
const DOWNLIGHTS: ReadonlyArray<readonly [number, number]> = [
  // Living / office
  [30, 45],
  [85, 45],
  [35, 115],
  [90, 115],
  // Bedroom
  [178, 40],
  [214, 88],
  // Kitchen run
  [88, 232],
  [88, 292],
  // Bath and entry hall
  [168, 276],
  [100, 352],
];

const CEILING_Y = 88;

/**
 * Evening interior: 2700 K recessed downlights as shadowed spotlights. Shadows keep each cone
 * from leaking through walls into the next room (three.js lights ignore occluders otherwise).
 */
export function EveningDownlights() {
  const warm = useMemo(() => kelvinToColor(WARM_WHITE_K), []);
  const lights = useMemo(
    () =>
      DOWNLIGHTS.map(([x, z]) => {
        const light = new THREE.SpotLight(warm, 11000, 210, 1.0, 0.8, 2);
        light.position.set(x, CEILING_Y, z);
        light.target.position.set(x, 0, z);
        light.castShadow = true;
        light.shadow.mapSize.set(512, 512);
        light.shadow.bias = -0.0006;
        light.shadow.normalBias = 0.6;
        light.shadow.camera.near = 4;
        light.shadow.camera.far = 200;
        return light;
      }),
    [warm],
  );

  return (
    <>
      {lights.map((l, i) => (
        <group key={i}>
          <primitive object={l} />
          <primitive object={l.target} />
        </group>
      ))}
    </>
  );
}
