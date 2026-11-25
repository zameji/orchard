import * as THREE from 'three';

// DOM id accessors are heterogeneous (inputs, canvases, panels); the UI layer is
// plain untyped DOM by design — the one deliberate `any` in the source tree.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const $ = (id: string): any => document.getElementById(id);
export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const UP = V(0, 1, 0);
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const GOLD = 2.39996323;
export const pct = (x: number) => Math.round(100 * x) + '%';
export const signed = (x: number) => (x > 0 ? '+' : '') + x;
