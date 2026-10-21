import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RESTORATION_GLOW, RESTORATION_MODEL } from '../src/world/restoration';
import { REGIONS } from '../src/catalog/regions';

/**
 * Every region promises a visible change when it is restored, and seven of the
 * eight had none. Measured on the running build, restoring the Memory Council
 * City moved its own landmark by **0.4 luma** — the region was restored, the
 * counter moved, the stage was marked complete, and the landmark looked
 * exactly as it had.
 *
 * These tests pin the effect to the models, because a glow that names a
 * material the model does not have is a glow that does nothing, and that is
 * exactly the kind of failure that cannot be seen in a screenshot: the
 * landmark still loads, the stage still completes, the frame count is
 * healthy.
 */

interface GltfJson {
  materials?: { name?: string }[];
  meshes?: { primitives: { material?: number }[] }[];
}

function readGltfJson(bytes: Buffer): GltfJson {
  let offset = 12;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'JSON') {
      return JSON.parse(bytes.toString('utf8', offset + 8, offset + 8 + length));
    }
    offset += 8 + length + ((4 - (length % 4)) % 4);
  }
  throw new Error('no JSON chunk in the GLB');
}

/** Every material a model actually uses, by name. */
function materialsIn(model: string): Set<string> {
  const path = fileURLToPath(
    new URL(`../public/models/${model}.glb`, import.meta.url),
  );
  const json = readGltfJson(readFileSync(path));
  const names = (json.materials ?? []).map((m) => m.name ?? '');
  const used = new Set<string>();
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      const index = primitive.material;
      if (index !== undefined && names[index]) used.add(names[index]);
    }
  }
  return used;
}

describe('the restoration effects', () => {
  it('gives every region but the hub one', () => {
    // The hub has its own — the tree's crown, and the canal that fills with
    // it — and it does it better than a lamp.
    const withoutGlow = REGIONS.filter(
      (region) => region.id !== 'hub' && !RESTORATION_GLOW[region.id],
    );
    expect(withoutGlow.map((r) => r.id)).toEqual([]);
  });

  it('lights a material each region\'s model actually has', () => {
    // The failure this catches is silent: a renamed or rebuilt model leaves
    // the painter pointing at a material that is not there, and the effect
    // does nothing at all while every other sign of it works.
    for (const [region, glow] of Object.entries(RESTORATION_GLOW)) {
      const model = RESTORATION_MODEL[region as keyof typeof RESTORATION_MODEL];
      expect(model, `${region} has no model`).toBeTruthy();
      const used = materialsIn(model!);
      expect(
        used.has(glow.material),
        `${region} (${model}) has no material called ${glow.material}; it has ${[...used].join(', ')}`,
      ).toBe(true);
    }
  });

  it('lights a part of the model, not the whole of it', () => {
    // A glow on every material would be a floodlight. Each of these names
    // the part the effect is about, and the test holds them to a share of the
    // model rather than to nothing at all.
    for (const [region, glow] of Object.entries(RESTORATION_GLOW)) {
      const model = RESTORATION_MODEL[region as keyof typeof RESTORATION_MODEL]!;
      const used = materialsIn(model);
      expect(used.size, `${region} has only one material`).toBeGreaterThan(1);
      expect(glow.emissive).toBeGreaterThan(0);
      expect(glow.emissive).toBeLessThanOrEqual(1);
    }
  });
});
