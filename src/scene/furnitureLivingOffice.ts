import * as THREE from 'three';
import { FURNITURE_CATALOG } from '../furniture/catalog';
import { rbox, cushion, cushionTopY, cylY, strut, tubePath, makePart, type FurniturePartDef } from './furniturePrimitives';

export function buildSectional(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG.sectional.colors;
  // W=100 (-50..50), D=64 (-32..32), back at z=-32, sofa front at z=+6, chaise (-50..-17) front at z=+32
  const lh = 4.0;
  const sh = 18.0;
  const uph: THREE.BufferGeometry[] = [];

  // Upholstered base deck, backrest frame, and right track arm (x = +44..+50)
  uph.push(rbox(-50, lh, -32, -17, lh + 4.4, 32, 1.1));
  uph.push(rbox(-18, lh, -32, 50, lh + 4.4, 6, 1.1));
  uph.push(rbox(-50, lh + 1.0, -32, 50, 30.2, -26.5, 1.15));
  uph.push(rbox(44, lh, -32, 50, 24.0, 6, 1.2));

  // Plump individual crowned seat cushions (chaise + two sofa seats): [x0, z0, x1, z1]
  const seatCrown = 0.55;
  const seats: Array<[number, number, number, number]> = [
    [-49.8, -25.5, -17.15, 32],
    [-16.85, -25.5, 13.4, 6],
    [13.7, -25.5, 44.0, 6],
  ];
  for (const [sx0, sz0, sx1, sz1] of seats) uph.push(cushion(sx0, lh + 4.1, sz0, sx1, sh, sz1, 1.55, seatCrown));

  // Subtle upholstered tuft buttons along the seats
  const buttonProto = new THREE.SphereGeometry(0.38, 10, 8);
  buttonProto.scale(1, 0.35, 1);
  for (const bx of [-41.5, -33.5, -25.5, -9, -1.5, 6, 21.5, 29, 36.5]) {
    for (const bz of [-18, -9, 0, 9, 18, 25]) {
      if (bz <= 1.5 || bx < -18) {
        const seat = seats.find(([sx0, sz0, sx1, sz1]) => bx > sx0 && bx < sx1 && bz > sz0 && bz < sz1);
        if (!seat) continue;
        const btn = buttonProto.clone();
        btn.translate(bx, cushionTopY(...seat, sh, seatCrown, bx, bz) + 0.02, bz);
        uph.push(btn);
      }
    }
  }
  buttonProto.dispose();

  // Three reclined plush back cushions reaching y = 33"
  const backW = 93.6 / 3;
  for (let i = 0; i < 3; i++) {
    const x0 = -49.6 + i * backW + 0.15;
    const x1 = -49.6 + (i + 1) * backW - 0.15;
    const bc = cushion(x0, 0, -2.5, x1, 15.2, 2.5, 1.65, 0.45);
    bc.rotateX(0.11);
    bc.translate(0, sh - 0.4, -24.8);
    uph.push(bc);
  }

  // Piped cylindrical bolster against the right arm
  const bolster = new THREE.CapsuleGeometry(3.4, 15.5, 10, 22);
  bolster.rotateX(Math.PI / 2);
  bolster.translate(40.6, sh + 3.1, -10.5);
  uph.push(bolster);

  // Layered corner throw pillows (sage linen + terracotta bouclé) & casually draped knit chaise throw
  const throwPillow = cushion(-7.5, 0, -2.2, 7.5, 14.5, 2.2, 1.6, 0.55);
  throwPillow.rotateX(0.22);
  throwPillow.rotateY(0.45);
  throwPillow.translate(-40.5, sh - 0.2, -21.2);

  const accentPillow = cushion(-6.2, 0, -2.0, 6.2, 12.2, 2.0, 1.5, 0.55);
  accentPillow.rotateX(0.28);
  accentPillow.rotateY(0.25);
  accentPillow.translate(-34.2, sh - 0.3, -18.4);

  const chaiseThrow = [
    cushion(-49.9, sh - 0.3, 14.5, -17.0, sh + 0.65, 27.5, 0.5, 0.2),
    rbox(-50.0, lh + 2.6, 14.8, -48.9, sh + 0.45, 27.2, 0.45),
  ];

  // Six turned tapered walnut legs
  const legs = [
    [-47.8, -29.8],
    [47.8, -29.8],
    [47.8, 3.8],
    [-14.8, 3.8],
    [-47.8, 29.8],
    [-19.2, 29.8],
  ].map(([lx, lz]) => cylY(lx, lz, 0, lh + 0.4, 0.68, 1.12, 20));

  return [
    makePart(uph, c.upholstery, 'fabric', true),
    makePart([throwPillow], c.pillow, 'linen', false),
    makePart([accentPillow], c.accent ?? '#b96d49', 'velvet', false),
    makePart(chaiseThrow, c.throw ?? '#d8d0c3', 'knit', false),
    makePart(legs, c.legs, 'walnut', false),
  ];
}

export function buildCoffeeTable(lifted: boolean): FurniturePartDef[] {
  const spec = FURNITURE_CATALOG[lifted ? 'coffee-table-open' : 'coffee-table'];
  const c = spec.colors;
  // Closed: W=42 (-21..21), D=21 (-10.5..10.5). Lifted: D=29 (-14.5..14.5); back stays put so box is at z = -14.5..6.5, top at -6.5..14.5
  const boxZ0 = lifted ? -14.5 : -10.5;
  const boxZ1 = lifted ? 6.5 : 10.5;
  const topZ0 = lifted ? -6.5 : -10.5;
  const topZ1 = lifted ? 14.5 : 10.5;
  const topMidZ = (topZ0 + topZ1) / 2;
  const lh = 5.0;
  const caseTop = 17.15;
  const topY1 = lifted ? 25.0 : 18.5;

  const body: THREE.BufferGeometry[] = [];
  if (lifted) {
    // Open storage box walls + bottom + center divider
    const wt = 0.85;
    body.push(rbox(-20.85, lh, boxZ0, 20.85, lh + 0.9, boxZ1, 0.2));
    body.push(rbox(-20.85, lh, boxZ0, 20.85, caseTop, boxZ0 + wt, 0.18));
    body.push(rbox(-20.85, lh, boxZ1 - wt, 20.85, caseTop, boxZ1, 0.18));
    body.push(rbox(-20.85, lh, boxZ0, -20.85 + wt, caseTop, boxZ1, 0.18));
    body.push(rbox(20.85 - wt, lh, boxZ0, 20.85, caseTop, boxZ1, 0.18));
    body.push(rbox(-0.35, lh + 0.8, boxZ0 + wt, 0.35, caseTop - 0.6, boxZ1 - wt, 0.1));
  } else {
    body.push(rbox(-20.85, lh, boxZ0 + 0.1, 20.85, caseTop, boxZ1 - 0.1, 0.28));
  }

  const top = [rbox(-21, topY1 - 1.2, topZ0, 21, topY1, topZ1, 0.24)];

  // Styled tabletop artifacts (hardcover art books + ceramic tray + mug + brass candle) riding with the top
  const books = [
    rbox(-14.5, topY1, topMidZ - 4.8, -3.5, topY1 + 0.95, topMidZ + 4.2, 0.12),
    rbox(-13.8, topY1 + 0.95, topMidZ - 4.1, -4.4, topY1 + 1.72, topMidZ + 3.6, 0.1),
  ];
  const ceramics = [
    cylY(8.5, topMidZ, topY1, topY1 + 0.48, 4.8, 4.95, 28),
    cylY(7.0, topMidZ + 0.8, topY1 + 0.48, topY1 + 3.6, 1.35, 1.45, 20),
  ];

  const brass: THREE.BufferGeometry[] = [
    cylY(10.6, topMidZ - 1.1, topY1 + 0.48, topY1 + 2.8, 1.15, 1.15, 20),
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x0 = sx * 18.4;
      const z0 = (boxZ0 + boxZ1) / 2 + sz * 8.0;
      const x1 = x0 + sx * 1.15;
      const z1 = z0 + sz * 1.05;
      const xm = x0 + (x1 - x0) * 0.78;
      const zm = z0 + (z1 - z0) * 0.78;
      body.push(strut([x0, lh + 0.2, z0], [xm, 1.1, zm], 0.78, 0.48, 18));
      brass.push(strut([xm, 1.12, zm], [x1, 0.0, z1], 0.47, 0.38, 18));
    }
  }

  const metal: THREE.BufferGeometry[] = [rbox(-19.5, caseTop - 0.1, boxZ0 + 1.2, 19.5, caseTop + 0.2, boxZ1 - 1.2, 0.1)];
  if (lifted) {
    for (const sx of [-18.8, 18.8]) {
      metal.push(strut([sx, caseTop - 2.2, boxZ0 + 7.5], [sx, topY1 - 1.15, topZ0 + 7.5], 0.24, 0.22, 12));
      metal.push(strut([sx, caseTop - 2.2, boxZ0 + 13.5], [sx, topY1 - 1.15, topZ0 + 13.5], 0.22, 0.20, 12));
    }
    // Tucked laptop inside the open walnut storage compartment
    metal.push(rbox(3.0, lh + 0.95, boxZ0 + 3.5, 16.0, lh + 1.55, boxZ1 - 3.5, 0.2));
  }

  return [
    makePart(top, c.top, 'walnut', true),
    makePart(body, c.body, 'walnut', true),
    makePart(metal, c.metal, 'darkMetal', false),
    makePart(brass, c.brass, 'brass', false),
    makePart(books, '#dfd8cb', 'linen', false),
    makePart(ceramics, '#f1ede6', 'ceramic', false),
  ];
}

export function buildWallTv(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['tv-stand'].colors;
  // W=57.1 (-28.55..28.55), D=3.4 (-1.7..1.7), Y=27.65..60.35 (soundbar at 27.65..29.4, OLED frame above)
  const hw = 28.55;
  const tvY0 = 30.15;
  const y1 = 60.35;
  const zFront = 1.7;
  const zBack = -1.7;

  const bezel = [
    // Gallery Frame OLED enclosure + slim matte bezel + wall-mounted Dolby Atmos soundbar below
    rbox(-hw, tvY0, zFront - 0.42, hw, y1, zFront, 0.12),
    rbox(-hw * 0.68, tvY0 + 1.4, zFront - 1.45, hw * 0.68, 47.0, zFront - 0.35, 0.3),
    rbox(-19.5, 27.65, zFront - 1.95, 19.5, 29.45, zFront + 0.05, 0.28),
  ];

  // Dedicated 0..1 UV front display quad for Gallery Art mode
  const artQuad = new THREE.PlaneGeometry((hw - 0.48) * 2, y1 - tvY0 - 0.96);
  artQuad.translate(0, (tvY0 + y1) / 2, zFront + 0.03);

  const metal = [
    rbox(-9.5, 40.0, zBack, 9.5, 41.4, zBack + 0.35, 0.08),
    rbox(-9.5, 46.6, zBack, 9.5, 48.0, zBack + 0.35, 0.08),
    rbox(-7.0, 38.8, zFront - 1.75, -5.8, 49.2, zFront - 1.35, 0.08),
    rbox(5.8, 38.8, zFront - 1.75, 7.0, 49.2, zFront - 1.35, 0.08),
    rbox(-12.0, 28.1, zBack, 12.0, 29.0, zFront - 1.85, 0.08),
    strut([0, 46.6, zBack + 0.25], [-3.4, 45.2, zBack + 1.1], 0.34, 0.32, 12),
    strut([-3.4, 45.2, zBack + 1.1], [0, 44.0, zFront - 1.55], 0.32, 0.3, 12),
    strut([0, 41.4, zBack + 0.25], [3.4, 42.8, zBack + 1.1], 0.34, 0.32, 12),
    strut([3.4, 42.8, zBack + 1.1], [0, 44.0, zFront - 1.55], 0.32, 0.3, 12),
  ];

  return [
    makePart(bezel, c.bezel, 'bezel', true),
    makePart([artQuad], '#ffffff', 'tvArt', false),
    makePart(metal, c.metal, 'darkMetal', false),
  ];
}

export function buildTierShelf(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['tier-shelf'].colors;
  // W=16 (-8..8), D=12 (-6..6), H=28
  const posts: THREE.BufferGeometry[] = [];
  for (const sx of [-7.35, 7.35]) {
    for (const sz of [-5.35, 5.35]) {
      posts.push(cylY(sx, sz, 0, 27.5, 0.4, 0.48, 18));
      const finial = new THREE.SphereGeometry(0.48, 14, 12);
      finial.translate(sx, 27.52, sz);
      posts.push(finial);
    }
  }
  const shelves: THREE.BufferGeometry[] = [];
  for (const sy of [3.0, 14.5, 27.4]) {
    shelves.push(rbox(-8, sy - 0.65, -6, 8, sy, 6, 0.18));
    shelves.push(rbox(-7.3, sy - 1.25, -5.7, 7.3, sy - 0.6, -5.25, 0.06));
    shelves.push(rbox(-7.3, sy - 1.25, 5.25, 7.3, sy - 0.6, 5.7, 0.06));
    shelves.push(rbox(-7.7, sy - 1.25, -5.3, -7.25, sy - 0.6, 5.3, 0.06));
    shelves.push(rbox(7.25, sy - 1.25, -5.3, 7.7, sy - 0.6, 5.3, 0.06));
  }

  // Styled shelf books (middle shelf) + woven storage basket (bottom shelf)
  const books = [
    rbox(-5.8, 14.5, -3.8, -4.6, 22.8, 3.8, 0.1),
    rbox(-4.5, 14.5, -3.6, -3.2, 23.4, 3.6, 0.1),
    rbox(-3.1, 14.5, -3.9, -1.9, 22.1, 3.9, 0.1),
  ];
  const basket = [rbox(-5.2, 3.0, -4.2, 5.2, 9.8, 4.2, 0.45)];

  return [
    makePart(shelves, c.wood, 'walnut', true),
    makePart(posts, c.posts, 'walnut', false),
    makePart(books, '#dfd9cd', 'linen', false),
    makePart(basket, '#d5bf98', 'rattan', false),
  ];
}

export function buildTorchiere(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['torchiere-lamp'].colors;
  const metal = [
    cylY(0, 0, 0, 0.85, 5.5, 5.35, 36),
    cylY(0, 0, 0.8, 1.9, 3.4, 0.78, 32),
    cylY(0, 0, 1.8, 64.2, 0.44, 0.44, 22),
    cylY(0, 0, 41.5, 42.7, 0.68, 0.68, 22),
    cylY(0, 0, 63.6, 64.25, 2.6, 2.3, 32),
  ];
  const bowlPts = [
    new THREE.Vector2(2.3, 64.0),
    new THREE.Vector2(5.4, 66.8),
    new THREE.Vector2(7.5, 69.85),
    new THREE.Vector2(7.2, 70.0),
    new THREE.Vector2(5.1, 67.0),
    new THREE.Vector2(2.0, 64.3),
  ];
  const shade = [new THREE.LatheGeometry(bowlPts, 40)];
  const bulb = new THREE.SphereGeometry(1.5, 18, 14);
  bulb.scale(1, 0.75, 1);
  bulb.translate(0, 65.8, 0);

  return [
    makePart(metal, c.metal, 'chrome', false),
    makePart(shade, c.shade, 'shade', true),
    makePart([bulb], c.bulb, 'bulb', false),
  ];
}

export function buildStandingDesk(): FurniturePartDef[] {
  const spec = FURNITURE_CATALOG['standing-desk'];
  const c = spec.colors;
  // Modeled on a 55 × 28 reference top (front at +14), then fit to the catalog size: the top and frame
  // stretch, while monitors, keyboard, mat, laptop, and mug keep their shape and just move with the top.
  const sx = spec.size[0] / 55;
  const sz = spec.size[1] / 28;
  const shiftBy = (geos: THREE.BufferGeometry[], ax: number, az: number) => {
    for (const g of geos) g.translate(ax * (sx - 1), 0, az * (sz - 1));
  };
  const H = 29.0;
  const t = 1.1;
  const top = [rbox(-27.5, H - t, -14, 27.5, H, 14, 0.25)];

  const frame: THREE.BufferGeometry[] = [];
  for (const sx of [-22.1, 22.1]) {
    frame.push(rbox(sx - 1.35, 0.2, -12, sx + 1.35, 1.15, 12, 0.35));
    frame.push(cylY(sx, -10.4, 0, 0.25, 0.85, 0.85, 18));
    frame.push(cylY(sx, 10.4, 0, 0.25, 0.85, 0.85, 18));
    frame.push(rbox(sx - 1.05, 1.0, -0.85, sx + 1.05, 15.8, 0.85, 0.16));
    frame.push(rbox(sx - 1.2, 14.5, -1.0, sx + 1.2, H - t + 0.05, 1.0, 0.18));
    frame.push(rbox(sx - 1.2, H - t - 1.35, -11.5, sx + 1.2, H - t + 0.05, 11.5, 0.15));
  }
  // Crossbeam, cable tray, controller handset, and dual monitor arm post
  frame.push(rbox(-22.1, H - t - 1.75, -1.2, 22.1, H - t + 0.05, 1.2, 0.1));
  frame.push(rbox(-13, H - t - 3.1, -11.8, 13, H - t - 0.4, -7.6, 0.2));
  frame.push(rbox(17.5, H - t - 0.65, 11.2, 21.2, H - t + 0.02, 13.7, 0.12));
  frame.push(rbox(-2.2, H - t - 1.4, -14, 2.2, H + 0.8, -11.6, 0.2));
  frame.push(cylY(0, -12.7, H, H + 11.5, 0.68, 0.68, 22));

  // Desk mat + mechanical keyboard with walnut wrist rest + wireless mouse + vertical laptop dock + coffee mug
  const matGeo = [rbox(-14.5, H, -0.8, 14.5, H + 0.12, 11.4, 0.05)];
  const keycaps = [rbox(-7.5, H + 0.44, 3.6, 4.1, H + 0.62, 7.8, 0.06)];
  const topExtraWalnut = [rbox(-7.8, H + 0.1, 8.15, 4.4, H + 0.48, 10.35, 0.16)];
  const bezels: THREE.BufferGeometry[] = [
    rbox(-7.8, H + 0.1, 3.3, 4.4, H + 0.46, 8.0, 0.12),
    cushion(7.2, H + 0.1, 4.4, 9.6, H + 0.95, 8.2, 0.75, 0.22),
    // Vertical laptop dock + closed aluminum laptop on left side of desk
    rbox(-23.2, H, -6.8, -19.6, H + 1.8, 2.2, 0.22),
  ];
  const laptopSilver = [rbox(-21.75, H + 0.6, -7.8, -21.05, H + 9.4, 3.2, 0.18)];
  const mugCeramic = [cylY(18.2, 5.8, H, H + 3.7, 1.45, 1.55, 20)];
  const screens: THREE.BufferGeometry[] = [];

  for (const m of [
    { dx: -13.2, w: 23.5, h: 13.8, yaw: 0.11, bar: false },
    { dx: 13.2, w: 26.5, h: 15.2, yaw: -0.11, bar: true },
  ]) {
    const mz = -7.8;
    const yBot = 49.0 - m.h;
    const yMid = yBot + m.h * 0.48;
    frame.push(
      tubePath(
        [
          [0, yMid - 1.1, -12.7],
          [m.dx * 0.55, yMid, -11.0],
          [m.dx, yMid, mz - 0.9],
        ],
        0.4,
        12,
      ),
    );
    const housing = rbox(-m.w / 2, -m.h / 2, -0.4, m.w / 2, m.h / 2, 0.3, 0.18);
    housing.rotateY(m.yaw);
    housing.translate(m.dx, yBot + m.h / 2, mz);
    shiftBy([housing], m.dx, mz);
    bezels.push(housing);

    if (m.bar) {
      // Sleek ScreenBar task light perched atop the right 27" monitor (kept <= y=49.0")
      const barCyl = new THREE.CylinderGeometry(0.32, 0.32, 16.5, 14);
      barCyl.rotateZ(Math.PI / 2);
      barCyl.rotateY(m.yaw);
      barCyl.translate(m.dx, 48.72, mz + 0.85);
      shiftBy([barCyl], m.dx, mz);
      bezels.push(barCyl);
    }

    // Native 0..1 UV front display plane for IDE UI texture
    const lcd = new THREE.PlaneGeometry(m.w - 0.64, m.h - 0.76);
    lcd.rotateY(m.yaw);
    lcd.translate(m.dx + Math.sin(m.yaw) * 0.34, yBot + m.h / 2 + 0.06, mz + Math.cos(m.yaw) * 0.34);
    shiftBy([lcd], m.dx, mz);
    screens.push(lcd);
  }

  for (const g of [...top, ...frame]) g.scale(sx, 1, sz);
  shiftBy(matGeo, 0, 5.3);
  shiftBy([...keycaps, ...topExtraWalnut, bezels[0], bezels[1]], 0, 5.7);
  shiftBy([bezels[2], ...laptopSilver], -21.4, -2.3);
  shiftBy(mugCeramic, 18.2, 5.8);

  return [
    makePart([...top, ...topExtraWalnut], c.top, 'walnut', true),
    makePart(frame, c.frame, 'darkMetal', false),
    makePart(matGeo, c.mat, 'leather', false),
    makePart(bezels, c.bezel, 'bezel', true),
    makePart(laptopSilver, '#b8bec4', 'metal', false),
    makePart(keycaps, c.keycaps, 'plastic', false),
    makePart(mugCeramic, '#edeae2', 'ceramic', false),
    makePart(screens, '#ffffff', 'ideScreen', false),
  ];
}

export function buildOfficeChair(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['office-chair'].colors;
  const SH = 18.0;
  const H = 41.0;
  const baseR = 11.4;

  const frame: THREE.BufferGeometry[] = [cylY(0, 0, 2.2, 4.4, 1.45, 1.65, 22)];
  for (let i = 0; i < 5; i++) {
    const a = ((90 + 72 * i) * Math.PI) / 180;
    const x = baseR * Math.cos(a);
    const z = -baseR * Math.sin(a);
    frame.push(
      tubePath(
        [
          [0, 3.4, 0],
          [x * 0.55, 3.05, z * 0.55],
          [x, 2.05, z],
        ],
        0.58,
        12,
      ),
    );
    const wheel = new THREE.CylinderGeometry(1.0, 1.0, 1.35, 18);
    wheel.rotateZ(Math.PI / 2);
    wheel.rotateY(a);
    wheel.translate(x, 1.0, z);
    frame.push(wheel);
    frame.push(rbox(x - 0.85, 1.15, z - 0.85, x + 0.85, 2.2, z + 0.85, 0.35));
  }

  const metal = [
    cylY(0, 0, 3.8, SH - 2.4, 1.05, 1.05, 22),
    strut([3.2, SH - 2.6, 0.5], [7.2, SH - 2.3, 1.2], 0.2, 0.2, 10),
  ];
  frame.push(rbox(-3.6, SH - 3.8, -3.6, 3.6, SH - 1.5, 3.0, 0.6));

  // Contoured waterfall seat rim + pellicle mesh
  const seatRim = new THREE.TorusGeometry(8.8, 0.9, 14, 36);
  seatRim.rotateX(Math.PI / 2);
  seatRim.scale(1.08, 0.8, 0.98);
  seatRim.translate(0, SH - 0.65, 0.8);
  frame.push(seatRim);

  const mesh: THREE.BufferGeometry[] = [cushion(-8.8, SH - 1.05, -7.8, 8.8, SH - 0.2, 9.2, 2.8, 0.15)];

  // Reclined figure-8 Aeron backrest + PostureFit Y-lumbar
  const bh = H - SH - 0.4;
  const backRing = new THREE.TorusGeometry(9.2, 0.82, 14, 38);
  backRing.scale(0.96, (bh / 2) / 9.2, 0.65);
  backRing.translate(0, bh / 2, 0);

  const backMesh = rbox(-8.0, 1.2, -0.22, 8.0, bh - 1.2, 0.22, 2.8);
  const lumbar = [
    rbox(-2.4, bh * 0.24, -1.0, 2.4, bh * 0.44, -0.3, 0.5),
    strut([0, 0.6, -0.75], [0, bh * 0.34, -0.75], 0.52, 0.48, 12),
    strut([-8.2, bh * 0.46, -0.5], [0, bh * 0.34, -0.75], 0.42, 0.42, 12),
    strut([8.2, bh * 0.46, -0.5], [0, bh * 0.34, -0.75], 0.42, 0.42, 12),
  ];

  const tiltBack = (g: THREE.BufferGeometry) => {
    g.rotateX(-0.2);
    g.translate(0, SH + 0.2, -7.6);
    return g;
  };
  frame.push(tiltBack(backRing));
  lumbar.forEach((g) => frame.push(tiltBack(g)));
  mesh.push(tiltBack(backMesh));
  frame.push(strut([0, SH - 2.4, -5.2], [0, SH + 1.4, -7.6], 0.92, 0.85, 14));

  // Sweeping side arms + soft-touch arm pads
  for (const sx of [-1, 1]) {
    const ax = sx * 11.95;
    frame.push(
      tubePath(
        [
          [sx * 8.6, SH - 1.8, -3.5],
          [ax, SH + 2.8, -3.2],
          [ax, SH + 7.6, -1.4],
        ],
        0.56,
        12,
      ),
    );
    frame.push(rbox(ax - 1.65, SH + 7.35, -3.8, ax + 1.65, SH + 8.55, 5.2, 0.55));
  }

  return [
    makePart(frame, c.frame, 'plastic', true),
    makePart(mesh, c.mesh, 'mesh', false),
    makePart(metal, c.metal, 'chrome', false),
  ];
}

export function buildCounterStool(): FurniturePartDef[] {
  const c = FURNITURE_CATALOG['counter-stool'].colors;
  const SH = 25.0;
  // Curved molded shell seat + smoothly swept low wrap-around backrest
  const shell: THREE.BufferGeometry[] = [cushion(-8.5, SH - 1.35, -8.5, 8.5, SH + 0.1, 8.5, 3.8, 0.12)];
  const backArcPts: Array<[number, number, number]> = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const ang = Math.PI + (t - 0.5) * Math.PI * 1.18;
    const rx = 8.1 * Math.sin(ang - Math.PI);
    const rz = -8.1 * Math.cos(ang - Math.PI);
    const lift = Math.pow(Math.cos((t - 0.5) * Math.PI), 0.75);
    backArcPts.push([rx, SH + 0.3 + 6.9 * lift, rz]);
  }
  // Build smooth curved backrest ribbon from vertical strips along the arc
  for (let i = 0; i < backArcPts.length - 1; i++) {
    const [x0, yTop0, z0] = backArcPts[i];
    const [x1, yTop1, z1] = backArcPts[i + 1];
    const xm = (x0 + x1) / 2;
    const zm = (z0 + z1) / 2;
    const ym = (yTop0 + yTop1) / 2;
    const segH = Math.max(0.9, ym - (SH - 0.35));
    const segLen = Math.hypot(x1 - x0, z1 - z0) + 0.35;
    const seg = rbox(-segLen / 2, -segH / 2, -0.42, segLen / 2, segH / 2, 0.42, 0.35);
    seg.rotateY(-Math.atan2(z1 - z0, x1 - x0));
    seg.translate(xm, SH - 0.35 + segH / 2, zm);
    shell.push(seg);
  }

  const legs: THREE.BufferGeometry[] = [];
  const metal: THREE.BufferGeometry[] = [rbox(-3.6, SH - 1.8, -3.6, 3.6, SH - 1.25, 3.6, 0.4)];
  const ringPts: Array<[number, number, number]> = [];
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    const p0: [number, number, number] = [sx * 5.0, SH - 1.3, sz * 5.0];
    const p1: [number, number, number] = [sx * 8.2, 0.42, sz * 8.2];
    legs.push(strut(p0, p1, 0.68, 0.46, 18));
    metal.push(cylY(p1[0], p1[2], 0, 0.44, 0.48, 0.48, 16));
    const t = (8.0 - p0[1]) / (p1[1] - p0[1]);
    ringPts.push([p0[0] + (p1[0] - p0[0]) * t, 8.0, p0[2] + (p1[2] - p0[2]) * t]);
  }
  metal.push(tubePath(ringPts, 0.3, 12, true));

  return [
    makePart(shell, c.shell, 'plastic', true),
    makePart(legs, c.wood, 'oak', false),
    makePart(metal, c.metal, 'darkMetal', false),
  ];
}
