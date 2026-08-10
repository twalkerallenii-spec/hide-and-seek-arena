// Placeholder arena. Only ever loaded if a real arena module fails to parse or
// throws while building — the player still gets something walkable and the rest
// of the game keeps working.

import * as THREE from 'three';

export const meta = {
  id: 'fallback',
  name: 'HOLDING AREA',
  tagline: 'This arena failed to load. Everything else still works.',
  order: 99,
  difficulty: 1,
  biome: 'surreal',
  seed: 1,
  spawn: [0, 0.2, 0],
  bounds: 60,
  colors: ['#8892a0', '#14171c'],
  music: 'calm',
};

export async function build(ctx) {
  const { props, mat, rng } = ctx;

  ctx.sky({ color: 0x11141a });
  ctx.fog(0x11141a, 20, 150);
  ctx.useEnvironment(0.8);
  ctx.grade({ exposure: 1.0, saturation: 0.85, contrast: 1.05, bloom: 0.4, vignette: 1.0 });
  ctx.soundscape('void', 'calm', { size: 0.7, dark: 0.5, wet: 0.25 });
  ctx.setSurface('concrete');

  const floorMat = mat.surface('concrete', { color: 0x6d7178, repeat: 30 });
  const wallMat = mat.surface('metalPanel', { color: 0x51565e, repeat: 14, panels: 5 });

  ctx.add(props.ground(120, 120, floorMat));

  // Perimeter
  const H = 9;
  for (const [x1, z1, x2, z2] of [
    [-60, -60, 60, -60], [-60, 60, 60, 60], [-60, -60, -60, 60], [60, -60, 60, 60],
  ]) {
    ctx.add(props.wallBetween(x1, z1, x2, z2, H, 1, wallMat));
  }
  ctx.add(props.ceiling(120, 120, H, wallMat));

  // Something to look at and climb on.
  const crateMat = mat.surface('wood', { color: 0x7d5b33, repeat: 1, size: 256 });
  for (let i = 0; i < 60; i++) {
    const c = props.crate(rng.range(0.8, 1.6), crateMat);
    c.position.set(rng.range(-52, 52), 0, rng.range(-52, 52));
    c.rotation.y = rng() * Math.PI * 2;
    ctx.add(c);
    if (i % 7 === 0) ctx.hidingSpot(c.position.x, 0, c.position.z, 2.0);
  }

  for (let i = 0; i < 24; i++) {
    const f = props.fluorescent(2.2, { intensity: 3.5 });
    f.position.set(-45 + (i % 6) * 18, H - 0.4, -45 + Math.floor(i / 6) * 30);
    ctx.addDecor(f);
  }

  ctx.light(new THREE.HemisphereLight(0x8fa4c0, 0x22262c, 0.55));
  const key = new THREE.DirectionalLight(0xd8e4f4, 1.2);
  key.position.set(30, 40, 20);
  ctx.light(key, { shadow: true, range: 70 });

  const { material, aspect } = mat.textMaterial('ARENA FAILED TO LOAD\nCHECK THE CONSOLE', {
    color: 0xff6b6b, fontSize: 72,
  });
  const board = props.boxC(10, 10 / aspect, 0.1, material, { collide: false });
  board.position.set(0, 4, -20);
  ctx.addDecor(board);

  for (let i = 0; i < 24; i++) {
    ctx.pickup(rng.range(-50, 50), 1.0, rng.range(-50, 50), 'coin');
  }
  ctx.pickup(0, 1.0, 8, 'battery');
  ctx.pickup(6, 1.0, 8, 'powerup:dash');
  ctx.pickup(-40, 1.0, -40, 'pup');
}
