import * as THREE from 'three';
import { FURNITURE_CATALOG } from '../furniture/catalog';
import { rbox, cushion, cylY, strut, tubePath, makePart, type FurniturePartDef } from './furniturePrimitives';

export function buildQueenBed(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['queen-bed'].colors;
  // W=61.6 (-30.8..30.8), L=81 (-40.5..40.5; head at z=-40.5, foot at z=+40.5), top height <= 29.0"
  const legH = 2.6;
  const fh = 14.0;
  const top = 24.0;

  const legs: THREE.BufferGeometry[] = [];
  for (const lx of [-26.8, 26.8]) {
    for (const lz of [-36.5, 0, 36.5]) {
      legs.push(rbox(lx - 1.4, 0, lz - 1.4, lx + 1.4, legH + 0.3, lz + 1.4, 0.35));
    }
  }

  // Upholstered low platform frame
  const frame = [rbox(-30.5, legH, -40.5, 30.5, fh, 40.5, 1.05)];

  // Lofty linen duvet + folded top sheet collar + mattress
  const bedding = [
    rbox(-30.2, fh - 1.6, -40.0, 30.2, top - 0.4, 40.0, 1.8),
    cushion(-30.1, fh + 1.8, -24.5, 30.1, top + 0.15, 40.0, 2.1, 0.55),
    cushion(-30.35, top - 2.0, -25.8, 30.35, top + 0.55, -18.2, 0.95, 0.25),
    rbox(-29.8, fh - 1.0, -40.0, 29.8, top - 0.55, -24.5, 1.2),
  ];

  // Four layered pillows: two flat sleeping pillows + two reclined sham pillows (capped <= 29.0")
  const pillows: THREE.BufferGeometry[] = [];
  for (const px of [-14.2, 14.2]) {
    pillows.push(cushion(px - 12.6, top - 0.7, -38.4, px + 12.6, top + 2.5, -23.8, 1.6, 0.55));
    const sham = cushion(px - 11.8, 0, -2.4, px + 11.8, 8.8, 2.4, 1.5, 0.5);
    sham.rotateX(-0.98);
    sham.translate(0, top + 0.2, -31.2);
    pillows.push(sham);
  }

  // Draped sage knit throw across the foot of the bed
  const throwBlanket = [
    cushion(-30.8, top - 0.5, 13.5, 30.8, top + 0.65, 35.5, 0.55, 0.2),
    rbox(-30.8, fh + 1.8, 13.7, -29.6, top + 0.5, 35.3, 0.48),
    rbox(29.6, fh + 1.8, 13.7, 30.8, top + 0.5, 35.3, 0.48),
  ];

  return [
    makePart(frame, c.frame, 'linen', true),
    makePart(legs, c.legs, 'walnut', false),
    makePart(bedding, c.bedding, 'linen', true),
    makePart(pillows, c.pillows, 'fabric', false),
    makePart(throwBlanket, c.throw, 'knit', false),
  ];
}

export function buildNightstand(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG.nightstand.colors;
  // W=19.7 (-9.85..9.85), D=15.7 (-7.85..7.85, front at +7.85), H=24
  const hw = 9.85;
  const hd = 7.85;
  const lh = 4.8;
  const wt = 0.72;
  const cubbyLo = 16.4;

  const wood: THREE.BufferGeometry[] = [
    // Top, bottom, back, left/right side walls, and middle shelf
    rbox(-hw, 24 - wt, -hd, hw, 24, hd, 0.14),
    rbox(-hw, lh, -hd, hw, lh + wt, hd, 0.14),
    rbox(-hw, lh, -hd, hw, 24, -hd + wt, 0.12),
    rbox(-hw, lh, -hd, -hw + wt, 24, hd, 0.14),
    rbox(hw - wt, lh, -hd, hw, 24, hd, 0.14),
    rbox(-hw + wt, cubbyLo - wt, -hd + wt, hw - wt, cubbyLo, hd - 0.15, 0.08),
  ];

  // Two inset walnut drawers + brass pulls
  const drLo = lh + wt;
  const drHi = cubbyLo - wt;
  const gap = 0.16;
  const dh = (drHi - drLo - 3 * gap) / 2;
  const pulls: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 2; i++) {
    const y0 = drLo + gap + i * (dh + gap);
    const y1 = y0 + dh;
    wood.push(rbox(-hw + wt + gap, y0, hd - 0.75, hw - wt - gap, y1, hd - 0.06, 0.1));
    const ym = (y0 + y1) / 2;
    pulls.push(
      tubePath(
        [
          [-1.5, ym, hd - 0.1],
          [-1.5, ym, hd + 0.42],
          [1.5, ym, hd + 0.42],
          [1.5, ym, hd - 0.1],
        ],
        0.14,
        10,
      ),
    );
  }

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x0 = sx * (hw - 1.8);
      const z0 = sz * (hd - 1.8);
      wood.push(strut([x0, lh + 0.2, z0], [x0 + sx * 0.6, 0, z0 + sz * 0.5], 0.62, 0.36, 16));
    }
  }

  // Bedside books inside the open cubby + ceramic carafe & hardcover book on top
  const books = [
    rbox(-hw + wt + 0.8, cubbyLo, -3.2, -1.2, cubbyLo + 1.05, 5.2, 0.1),
    rbox(-hw + wt + 1.1, cubbyLo + 1.05, -2.8, -1.8, cubbyLo + 1.95, 4.8, 0.1),
    rbox(-6.8, 24.0, -3.5, 0.5, 24.85, 4.2, 0.1),
  ];
  const ceramic = [
    cylY(4.8, -1.2, 24.0, 27.2, 1.55, 1.15, 20),
    cylY(4.8, -1.2, 27.1, 28.4, 0.85, 0.95, 18),
  ];

  return [
    makePart(wood, c.wood, 'walnut', true),
    makePart(pulls, c.pulls, 'brass', false),
    makePart(books, '#dcd5c7', 'linen', false),
    makePart(ceramic, '#efeae0', 'ceramic', false),
  ];
}

export function buildTripodLamp(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['tripod-lamp'].colors;
  const H = 60.0;
  const hd = 11.0;
  const rd = 8.0;
  const sp = 9.0;
  const apex = H - hd * 0.78;

  const legs: THREE.BufferGeometry[] = [];
  for (const deg of [90, 210, 330]) {
    const rad = (deg * Math.PI) / 180;
    const bx = sp * Math.cos(rad);
    const bz = -sp * Math.sin(rad);
    legs.push(strut([bx, 0, bz], [0, apex, 0], 0.34, 0.42, 16));
  }

  const brass: THREE.BufferGeometry[] = [
    cylY(0, 0, apex - 0.6, apex + 0.8, 0.84, 0.74, 22),
    cylY(0, 0, apex + 0.75, H - 0.8, 0.26, 0.26, 18),
  ];
  for (const deg of [0, 120, 240]) {
    const rad = (deg * Math.PI) / 180;
    brass.push(strut([0, H - 0.9, 0], [(rd - 0.2) * Math.cos(rad), H - 0.9, (rd - 0.2) * Math.sin(rad)], 0.08, 0.08, 8));
  }

  const drumPts = [
    new THREE.Vector2(rd, H - hd),
    new THREE.Vector2(rd, H),
    new THREE.Vector2(rd - 0.24, H),
    new THREE.Vector2(rd - 0.24, H - hd),
  ];
  const shade = [new THREE.LatheGeometry(drumPts, 40)];
  const bulb = new THREE.SphereGeometry(1.45, 18, 14);
  bulb.scale(1, 1.2, 1);
  bulb.translate(0, H - hd * 0.52, 0);

  return [
    makePart(legs, c.legs, 'darkMetal', false),
    makePart(brass, c.brass, 'brass', false),
    makePart(shade, c.shade, 'shade', true),
    makePart([bulb], c.bulb, 'bulb', false),
  ];
}

export function buildCoatRack(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['coat-rack'].colors;
  const wood: THREE.BufferGeometry[] = [
    rbox(-7, 0, -7, 7, 1.4, 7, 0.55),
    cylY(0, 0, 1.2, 67.1, 0.98, 0.72, 24),
  ];
  const finial = new THREE.SphereGeometry(0.84, 18, 14);
  finial.translate(0, 67.2, 0);
  wood.push(finial);

  const metal = [
    cylY(0, 0, 1.35, 1.9, 1.85, 1.35, 24),
    cylY(0, 0, 34.0, 34.55, 0.92, 0.92, 22),
  ];

  const hooks: ReadonlyArray<readonly [number, number]> = [
    [40, 0],
    [40, 180],
    [49, 90],
    [49, 270],
    [57, 45],
    [57, 225],
    [63.5, 135],
    [63.5, 315],
  ];
  for (const [hy, deg] of hooks) {
    const rad = (deg * Math.PI) / 180;
    const tip: [number, number, number] = [Math.cos(rad) * 4.95, hy + 2.9, -Math.sin(rad) * 4.95];
    wood.push(strut([0, hy, 0], tip, 0.44, 0.3, 14));
    const ball = new THREE.SphereGeometry(0.54, 14, 12);
    ball.translate(tip[0], tip[1], tip[2]);
    wood.push(ball);
  }

  return [
    makePart(wood, c.wood, 'walnut', true),
    makePart(metal, c.metal, 'darkMetal', false),
  ];
}

export function buildShoeCabinet(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['shoe-cabinet'].colors;
  // W=31.5 (-15.75..15.75), D=9.5 (-4.75..4.75, front at +4.75), H=47
  const hw = 15.75;
  const hd = 4.75;
  const lh = 4.2;
  const t = 0.75;

  const wood: THREE.BufferGeometry[] = [
    rbox(-hw, lh, -hd, hw, 46.25, hd - 0.65, 0.16),
    rbox(-hw - 0.05, 46.2, -hd, hw + 0.05, 47.0, hd, 0.14),
  ];
  const cane: THREE.BufferGeometry[] = [];
  const metal: THREE.BufferGeometry[] = [];

  const gap = 0.22;
  const dh = (46.2 - lh - 2 * t - 4 * gap) / 3;
  const fw = 1.55;
  for (let i = 0; i < 3; i++) {
    const y0 = lh + t + gap + i * (dh + gap);
    const y1 = y0 + dh;
    // 4 walnut rails framing the recessed woven rattan cane insert
    wood.push(rbox(-hw + t + gap, y0, hd - 0.68, -hw + t + gap + fw, y1, hd - 0.06, 0.08));
    wood.push(rbox(hw - t - gap - fw, y0, hd - 0.68, hw - t - gap, y1, hd - 0.06, 0.08));
    wood.push(rbox(-hw + t + gap, y0, hd - 0.68, hw - t - gap, y0 + fw * 0.9, hd - 0.06, 0.08));
    wood.push(rbox(-hw + t + gap, y1 - fw * 0.9, hd - 0.68, hw - t - gap, y1, hd - 0.06, 0.08));
    cane.push(rbox(-hw + t + gap + fw - 0.1, y0 + fw * 0.85, hd - 0.45, hw - t - gap - fw + 0.1, y1 - fw * 0.85, hd - 0.22, 0.04));
    metal.push(rbox(-2.2, y1 - 0.4, hd - 0.2, 2.2, y1 - 0.05, hd + 0.18, 0.05));
  }

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x0 = sx * (hw - 1.2);
      const z0 = sz * (hd - 1.2);
      metal.push(strut([x0, lh + 0.2, z0], [x0 + sx * 0.3, 0, z0 + sz * 0.2], 0.44, 0.28, 14));
    }
    metal.push(strut([sx * (hw - 1.2), lh * 0.72, -hd + 1.2], [sx * (hw - 1.2), lh * 0.72, hd - 1.2], 0.2, 0.2, 10));
  }

  return [
    makePart(wood, c.wood, 'walnut', true),
    makePart(cane, c.cane, 'rattan', false),
    makePart(metal, c.metal, 'darkMetal', false),
  ];
}

export function buildArchedMirror(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['arched-mirror'].colors;
  // W=22 (-11..11), H=65, T=1.2, leaned 5 deg backward (bottom forward at +Z, top leaning back toward -Z)
  const W = 22;
  const H = 65;
  const r = W / 2;
  const b = 0.75;

  const makeArchShape = (hw: number, hh: number): THREE.Shape => {
    const s = new THREE.Shape();
    s.moveTo(-hw, 0);
    s.lineTo(hw, 0);
    s.lineTo(hw, hh - hw);
    s.absarc(0, hh - hw, hw, 0, Math.PI, false);
    s.lineTo(-hw, 0);
    return s;
  };

  const rimShape = makeArchShape(r, H);
  const holePath = new THREE.Path();
  const ir = r - b;
  const ih = H - b;
  holePath.moveTo(-ir, b);
  holePath.lineTo(ir, b);
  holePath.lineTo(ir, ih - ir);
  holePath.absarc(0, ih - ir, ir, 0, Math.PI, false);
  holePath.lineTo(-ir, b);
  rimShape.holes.push(holePath);

  const rim = new THREE.ExtrudeGeometry(rimShape, { depth: 1.15, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, curveSegments: 28 });
  const glassShape = makeArchShape(ir + 0.04, ih);
  const glass = new THREE.ExtrudeGeometry(glassShape, { depth: 0.22, bevelEnabled: false, curveSegments: 28 });
  glass.translate(0, b * 0.5, 0.68);
  const back = new THREE.ExtrudeGeometry(makeArchShape(r - 0.15, H - 0.15), { depth: 0.45, bevelEnabled: false, curveSegments: 24 });
  back.translate(0, 0.08, 0.15);

  const leanRad = (-5 * Math.PI) / 180;
  for (const g of [rim, glass, back]) {
    g.rotateX(leanRad);
    g.translate(0, 0.12, 2.3);
  }

  return [
    makePart([rim], c.frame, 'darkMetal', true),
    makePart([glass], c.glass, 'mirror', false),
    makePart([back], c.backing, 'walnut', false),
  ];
}

export function buildHallCabinet(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['hall-cabinet'].colors;
  // W=31.5 (-15.75..15.75), D=15.7 (-7.85..7.85), H=31.5, rounded vertical corners r=3
  const hw = 15.75;
  const hd = 7.85;
  const r = 3.0;

  const makeRoundedRect = (w2: number, d2: number, rad: number): THREE.Shape => {
    const s = new THREE.Shape();
    s.moveTo(-w2 + rad, -d2);
    s.lineTo(w2 - rad, -d2);
    s.quadraticCurveTo(w2, -d2, w2, -d2 + rad);
    s.lineTo(w2, d2 - rad);
    s.quadraticCurveTo(w2, d2, w2 - rad, d2);
    s.lineTo(-w2 + rad, d2);
    s.quadraticCurveTo(-w2, d2, -w2, d2 - rad);
    s.lineTo(-w2, -d2 + rad);
    s.quadraticCurveTo(-w2, -d2, -w2 + rad, -d2);
    return s;
  };

  const extrudeUp = (shape: THREE.Shape, y0: number, y1: number, bevel = 0) => {
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: y1 - y0,
      bevelEnabled: bevel > 0,
      bevelSize: bevel,
      bevelThickness: bevel,
      curveSegments: 20,
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, y0, 0);
    return g;
  };

  const plinth = [extrudeUp(makeRoundedRect(hw - 0.9, hd - 0.9, r - 0.6), 0, 2.3)];
  // Split left & right doors with vertical reeded walnut slats + styled ceramic vase & tray on top
  const body = [
    extrudeUp(makeRoundedRect(hw, hd - 0.35, r), 2.2, 30.65),
    rbox(-hw + r * 0.7, 3.0, hd - 0.4, -0.1, 30.3, hd - 0.08, 0.1),
    rbox(0.1, 3.0, hd - 0.4, hw - r * 0.7, 30.3, hd - 0.08, 0.1),
    extrudeUp(makeRoundedRect(hw + 0.08, hd + 0.05, r), 30.65, 31.5, 0.08),
  ];
  for (let rx = -hw + r * 0.85; rx <= hw - r * 0.85; rx += 1.05) {
    if (Math.abs(rx) < 0.35) continue;
    body.push(cylY(rx, hd - 0.06, 3.15, 30.15, 0.24, 0.24, 10));
  }

  const pulls: THREE.BufferGeometry[] = [];
  for (const px of [-1.45, 1.45]) {
    pulls.push(cylY(px, hd + 0.52, 15.8, 24.0, 0.22, 0.22, 16));
    pulls.push(strut([px, 16.6, hd], [px, 16.6, hd + 0.52], 0.15, 0.15, 12));
    pulls.push(strut([px, 23.2, hd], [px, 23.2, hd + 0.52], 0.15, 0.15, 12));
  }

  return [
    makePart(body, c.wood, 'walnut', true),
    makePart(plinth, c.base, 'walnut', false),
    makePart(pulls, c.pulls, 'brass', false),
  ];
}

export function buildRoadBike(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['bike-black'].colors;
  // W=66.8 (-33.4..33.4), D=18.0 (-8.98..8.98; wall plate at z=-8.98, outer handlebar at z=+8.52), Y=30..67.5
  const lift = 30.0;
  const r = 13.6;
  const tire = 1.2;
  const zBike = 0.25; // bike centerline relative to rack depth
  const R0: [number, number, number] = [-19.8, lift + r, zBike];
  const F0: [number, number, number] = [19.8, lift + r, zBike];
  const bb: [number, number, number] = [R0[0] + 16.5, R0[1] - 2.8, zBike];
  const stTop: [number, number, number] = [
    bb[0] - 21.0 * Math.cos((73.5 * Math.PI) / 180),
    bb[1] + 21.0 * Math.sin((73.5 * Math.PI) / 180),
    zBike,
  ];
  const htTop: [number, number, number] = [bb[0] + 15.2, bb[1] + 21.8, zBike];
  const htBot: [number, number, number] = [
    htTop[0] + 5.5 * Math.cos((72 * Math.PI) / 180),
    htTop[1] - 5.5 * Math.sin((72 * Math.PI) / 180),
    zBike,
  ];
  const saddle: [number, number, number] = [stTop[0] - 2.5, lift + 37.5, zBike];
  const bar: [number, number, number] = [htTop[0] + 3.8, htTop[1] + 1.2, zBike];

  const frame: THREE.BufferGeometry[] = [
    strut(stTop, htTop, 0.58, 0.66, 16),
    strut(bb, htBot, 0.78, 0.85, 16),
    strut(bb, stTop, 0.64, 0.56, 16),
    strut(htBot, htTop, 0.74, 0.74, 16),
  ];
  for (const sz of [-1, 1]) {
    frame.push(strut([htBot[0], htBot[1] - 0.3, zBike + sz * 0.85], [F0[0], F0[1], zBike + sz * 1.45], 0.5, 0.32, 14));
    frame.push(strut([bb[0], bb[1], zBike + sz * 0.7], [R0[0], R0[1], zBike + sz * 1.65], 0.44, 0.3, 14));
    frame.push(strut([stTop[0] - 0.3, stTop[1] - 1.4, zBike], [R0[0], R0[1], zBike + sz * 1.65], 0.34, 0.26, 14));
  }

  const tires: THREE.BufferGeometry[] = [];
  const sidewalls: THREE.BufferGeometry[] = [];
  const kit: THREE.BufferGeometry[] = [];
  const metal: THREE.BufferGeometry[] = [];

  for (let idx = 0; idx < 2; idx++) {
    const wc = idx === 0 ? R0 : F0;
    const tGeo = new THREE.TorusGeometry(r - tire * 0.45, tire * 0.46, 14, 56);
    tGeo.translate(wc[0], wc[1], wc[2]);
    tires.push(tGeo);

    // Classic pro tan-wall tire sidewalls (Continental GP5000 cream/amber band)
    const swGeo = new THREE.TorusGeometry(r - tire * 0.78, tire * 0.34, 12, 52);
    swGeo.scale(1, 1, 1.32);
    swGeo.translate(wc[0], wc[1], wc[2]);
    sidewalls.push(swGeo);

    const rimGeo = new THREE.TorusGeometry(r - tire - 0.5, 0.55, 14, 48);
    rimGeo.scale(1, 1, 0.42);
    rimGeo.translate(wc[0], wc[1], wc[2]);
    kit.push(rimGeo);

    metal.push(strut([wc[0], wc[1], wc[2] - 1.9], [wc[0], wc[1], wc[2] + 1.9], 0.46, 0.46, 14));
    const rotor = new THREE.CylinderGeometry(2.7, 2.7, 0.1, 24);
    rotor.rotateX(Math.PI / 2);
    rotor.translate(wc[0], wc[1], wc[2] + 1.35);
    metal.push(rotor);

    for (let s = 0; s < 12; s++) {
      const ang = ((s * 30 + idx * 15) * Math.PI) / 180;
      metal.push(
        strut(
          [wc[0], wc[1], wc[2] + (s % 2 === 0 ? 1.1 : -1.1)],
          [wc[0] + (r - tire - 0.85) * Math.cos(ang), wc[1] + (r - tire - 0.85) * Math.sin(ang), wc[2]],
          0.075,
          0.075,
          8,
        ),
      );
    }
  }

  // Seatpost, sculpted saddle, stem, drop bars, brake levers, and crankset
  const bw = 8.25;
  kit.push(strut(stTop, [saddle[0] + 2.2, saddle[1] - 0.5, zBike], 0.44, 0.44, 14));
  kit.push(cushion(saddle[0] - 5.4, saddle[1] - 0.75, zBike - 2.6, saddle[0] - 0.4, saddle[1], zBike + 2.6, 0.4, 0.15));
  kit.push(rbox(saddle[0] - 0.6, saddle[1] - 0.6, zBike - 0.9, saddle[0] + 4.8, saddle[1] - 0.05, zBike + 0.9, 0.35));
  kit.push(strut(htTop, bar, 0.48, 0.48, 14));
  kit.push(strut([bar[0], bar[1], zBike - bw], [bar[0], bar[1], zBike + bw], 0.44, 0.44, 14));

  for (const sz of [-1, 1]) {
    const zb = zBike + sz * bw;
    kit.push(
      tubePath(
        [
          [bar[0], bar[1], zb],
          [bar[0] + 3.5, bar[1] - 1.9, zb],
          [bar[0] + 1.6, bar[1] - 4.9, zb],
          [bar[0] - 1.0, bar[1] - 4.9, zb],
        ],
        0.42,
        12,
      ),
    );
    kit.push(rbox(bar[0] + 2.4, bar[1] - 2.2, zb - 0.45, bar[0] + 4.2, bar[1] - 0.4, zb + 0.45, 0.28));
    metal.push(strut([bar[0] + 3.9, bar[1] - 2.1, zb], [bar[0] + 3.5, bar[1] - 4.3, zb], 0.11, 0.11, 8));
  }

  const chainring = new THREE.CylinderGeometry(3.85, 3.85, 0.24, 32);
  chainring.rotateX(Math.PI / 2);
  chainring.translate(bb[0], bb[1], zBike - 2.1);
  kit.push(chainring);
  for (const [sz, deg] of [
    [-1, 25],
    [1, 205],
  ] as const) {
    const rad = (deg * Math.PI) / 180;
    const pe: [number, number, number] = [bb[0] + 6.4 * Math.cos(rad), bb[1] + 6.4 * Math.sin(rad), zBike + sz * 2.4];
    kit.push(strut([bb[0], bb[1], zBike + sz * 1.9], pe, 0.34, 0.3, 12));
    kit.push(rbox(pe[0] - 1.2, pe[1] - 0.26, pe[2] + (sz < 0 ? -2.0 : 0.1), pe[0] + 1.2, pe[1] + 0.26, pe[2] + (sz < 0 ? -0.1 : 2.0), 0.12));
  }

  // Water bottle in downtube cage + silver drive chain
  const bcPos: [number, number, number] = [bb[0] * 0.56 + htBot[0] * 0.44 - 0.8, bb[1] * 0.56 + htBot[1] * 0.44 + 1.8, zBike];
  const bottle = strut(
    [bcPos[0] - 1.8, bcPos[1] - 1.6, zBike],
    [bcPos[0] + 2.2, bcPos[1] + 2.0, zBike],
    1.25,
    1.18,
    16,
  );
  kit.push(bottle);
  metal.push(strut([R0[0], R0[1] + 1.2, zBike - 1.9], [bb[0], bb[1] + 3.4, zBike - 2.1], 0.1, 0.1, 8));
  metal.push(strut([R0[0], R0[1] - 1.2, zBike - 1.9], [bb[0], bb[1] - 3.4, zBike - 2.1], 0.1, 0.1, 8));

  // Sculpted walnut wall rack reaching z = -8.98 (against wall)
  const mx = (stTop[0] + htTop[0]) / 2;
  const ry = (stTop[1] + htTop[1]) / 2 - 0.6;
  const rack = [
    rbox(mx - 5.2, ry - 2.6, -8.98, mx + 5.2, ry + 0.1, zBike + 2.2, 0.32),
    rbox(mx - 5.2, ry - 2.6, zBike + 1.4, mx + 5.2, ry + 1.35, zBike + 2.4, 0.28),
    rbox(mx - 6.0, ry - 7.8, -8.98, mx + 6.0, ry + 2.2, -8.1, 0.25),
  ];

  return [
    makePart(frame, c.frame, 'paint', true),
    makePart(tires, c.tires, 'rubber', false),
    makePart(sidewalls, '#c79c63', 'tanwall', false),
    makePart(kit, c.kit, 'darkMetal', false),
    makePart(metal, c.metal, 'chrome', false),
    makePart(rack, c.rack, 'walnut', true),
  ];
}

export function buildGalleryPrints(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['gallery-prints'].colors;
  // Two 19 × 25 frames, 3 in apart, y = 49..74; front face at z = +0.7, wall at z = -0.7
  const fw = 19;
  const fh = 25;
  const y0 = 49;
  const bar = 1.0;
  const zB = -0.7;
  const zF = 0.7;
  const frames: THREE.BufferGeometry[] = [];
  const mats: THREE.BufferGeometry[] = [];
  const art: THREE.BufferGeometry[] = [];
  for (const [i, cx] of [-11, 11].entries()) {
    const x0 = cx - fw / 2;
    const x1 = cx + fw / 2;
    const y1 = y0 + fh;
    frames.push(
      rbox(x0, y0, zB, x1, y0 + bar, zF, 0.12),
      rbox(x0, y1 - bar, zB, x1, y1, zF, 0.12),
      rbox(x0, y0 + bar, zB, x0 + bar, y1 - bar, zF, 0.12),
      rbox(x1 - bar, y0 + bar, zB, x1, y1 - bar, zF, 0.12),
    );
    mats.push(rbox(x0 + bar, y0 + bar, zB, x1 - bar, y1 - bar, zF - 0.12, 0.02));
    // Print window inside a 2.2 in mat; UVs pick the left or right half of the print atlas
    const pw = fw - 2 * bar - 4.4;
    const ph = fh - 2 * bar - 4.4;
    const plane = new THREE.PlaneGeometry(pw, ph);
    const uv = plane.getAttribute('uv');
    for (let k = 0; k < uv.count; k++) uv.setX(k, (uv.getX(k) + i) / 2);
    plane.translate(cx, y0 + fh / 2, zF - 0.1);
    art.push(plane);
  }
  return [
    makePart(frames, c.frame, 'oak', true),
    makePart(mats, c.mat, 'paint', false),
    makePart(art, '#ffffff', 'printArt', false),
  ];
}
