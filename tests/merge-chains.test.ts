import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { chainGeometry, mergeChains, type Seg } from '../src/js/render/loft.js';

// Simulate a future emit phase whose chains carry inconsistent attributes,
// the only way mergeGeometries can refuse chainGeometry-built inputs today.
vi.mock('three/addons/utils/BufferGeometryUtils.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('three/addons/utils/BufferGeometryUtils.js')
    >();
  return { ...actual, mergeGeometries: vi.fn(actual.mergeGeometries) };
});

const segs: Seg[] = [
  {
    id: 1,
    a: new THREE.Vector3(0, 0, 0),
    b: new THREE.Vector3(0, 1, 0),
    r: 0.1,
  },
];

describe('mergeChains contract', () => {
  it('throws instead of returning an empty geometry when the merge fails', () => {
    const g = chainGeometry(segs, 6);
    // The runtime contract allows null on inconsistent attributes; the
    // typings do not.
    vi.mocked(mergeGeometries).mockReturnValueOnce(
      null as unknown as THREE.BufferGeometry,
    );
    expect(() => mergeChains([g])).toThrow('mergeChains: merge failed');
  });

  it('returns the documented empty result for no chains', () => {
    const merged = mergeChains([]);
    expect(merged.vertRanges).toEqual([]);
    expect(merged.triRanges).toEqual([]);
    expect(merged.geometry.getAttribute('position')).toBeUndefined();
  });
});
