import * as THREE from 'three';
import { GOLD, UP, V } from '../util.js';
import type { Branch, Caps, Profile } from '../sim/types.js';

// Shared scratch objects; transforms are copied out before the next use.
export const obj = new THREE.Object3D(),
  col = new THREE.Color(),
  tmp = V();
export const axisZ = V(0, 0, 1),
  heatA = new THREE.Color(0x59569c),
  heatB = new THREE.Color(0x83ad7d),
  heatC = new THREE.Color(0xffdf6e);
export const coral = new THREE.Color(0xff7258);

export const barkMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
export const leafMat = new THREE.MeshLambertMaterial({
  color: 0xffffff,
  vertexColors: true,
  side: THREE.DoubleSide,
});
export const fruitMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  vertexColors: true,
  roughness: 0.53,
  metalness: 0,
});
export const stemMat = new THREE.MeshLambertMaterial({ color: 0x67643b });
export const cutMat = new THREE.MeshBasicMaterial({ color: 0xff7758 });
export const ringMat = new THREE.MeshBasicMaterial({
  color: 0xffd894,
  depthTest: false,
  depthWrite: false,
});
export const guideMat = new THREE.MeshBasicMaterial({
  color: 0x277966,
  depthTest: false,
  depthWrite: false,
});
export const guideInner = new THREE.MeshBasicMaterial({
  color: 0xdfffaf,
  depthTest: false,
  depthWrite: false,
});
export const planeMat = new THREE.MeshBasicMaterial({
  color: 0xffbb81,
  side: THREE.DoubleSide,
});

export const ringG = new THREE.TorusGeometry(1, 0.105, 5, 30),
  diskG = new THREE.CircleGeometry(1, 18);

export function stickMatrix(
  a: THREE.Vector3,
  b: THREE.Vector3,
  r: number,
  overlap = true,
) {
  tmp.subVectors(b, a);
  const len = Math.max(0.0001, tmp.length());
  obj.position.copy(a).lerp(b, 0.5);
  obj.quaternion.setFromUnitVectors(UP, tmp.multiplyScalar(1 / len));
  obj.scale.set(r, len + (overlap ? Math.min(len * 0.22, r * 0.83) : 0), r);
  obj.updateMatrix();
  return obj.matrix;
}

export function atPoint(q: Branch, at: number) {
  return q.a.clone().lerp(q.b, at);
}

// Folded, pointed leaf blades in rosettes; no textures or alpha-card overdraw.
export function leafGeometry(profile: Profile, caps: Caps) {
  const pos: number[] = [],
    colArr: number[] = [],
    ind: number[] = [],
    count = caps.leaves;
  for (let j = 0; j < count; j++) {
    const a = j * GOLD,
      dx = Math.cos(a),
      dz = Math.sin(a),
      length =
        (profile.sp === 'Peach' ? 0.121 : 0.091) * (1 - (0.16 * (j % 3)) / 2);
    const width = length * (profile.sp === 'Peach' ? 0.13 : 0.235),
      rise = 0.013 + 0.012 * (j % 3);
    const base = pos.length / 3,
      y0 = 0.005 * j;
    const pts = [
      [0, 0, y0],
      [length * 0.49, width, rise + y0],
      [length * 0.52, 0, rise + 0.009 + y0],
      [length * 0.52, -width, rise - 0.004 + y0],
      [length, 0, y0 + rise * 0.3],
    ];
    for (let k = 0; k < 5; k++) {
      const [l, w, y] = pts[k];
      pos.push(dx * l - dz * w, y, dz * l + dx * w);
      const f = 0.79 + 0.045 * ((k + j) % 5);
      colArr.push(f * 0.97, f, f * 0.88);
    }
    for (const k of [0, 1, 2, 0, 2, 3, 1, 4, 2, 2, 4, 3]) ind.push(base + k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
  g.setIndex(ind);
  g.computeVertexNormals();
  return g;
}

export function fruitGeometry(profile: Profile, caps: Caps) {
  const pts: THREE.Vector2[] = [],
    apple = profile.sp === 'Apple';
  for (let i = 0; i <= 14; i++) {
    const a = (i * Math.PI) / 14,
      s = Math.sin(a),
      y = -Math.cos(a);
    const width =
      s * (apple ? 1 + 0.13 * y : profile.sp === 'Peach' ? 1 + 0.055 * y : 1);
    pts.push(
      new THREE.Vector2(
        Math.max(0.0001, width),
        y * (apple ? 0.88 : 1) -
          (apple && y > 0 ? 0.15 * Math.exp(-s * s * 16) : 0) +
          (apple && y < 0 ? 0.08 * Math.exp(-s * s * 18) : 0),
      ),
    );
  }
  const g = new THREE.LatheGeometry(pts, caps.sides + 4),
    p = g.attributes.position,
    colors: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i)),
      f = 0.88 + 0.12 * Math.cos(2 * a + 0.65 * p.getY(i));
    colors.push(1, f, Math.max(0.69, f - 0.08));
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
}
