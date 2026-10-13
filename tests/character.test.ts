import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CHARACTER_SCALE,
  CHARACTER_Y_OFFSET,
  instanceFor,
} from '../src/world/placement';

/**
 * The Weaver stood 0.7 units in the air, in pieces, and no existing check
 * could see it: the model loaded, the mixer ran, every mesh was still
 * submitted, and the frame count looked healthy.
 *
 * Two independent causes, two independent assertions below.
 *
 * The clone: `<Asset>` deep-clones every loaded scene so landmarks placed N
 * times do not share one parent — that fixed twenty-eight puzzle consoles
 * drawing at one spot. A rigged GLB cannot survive that clone, because
 * `SkinnedMesh.copy` hands the copy the *source's* skeleton. The rendered
 * character then skinned every vertex against bones that were never in the
 * render graph, and came apart mid-air while its shadow fell correctly.
 *
 * The offset: the lowest raw `POSITION` value in the GLB is y = -1.16, which is
 * a cape, not a foot. The soles sit at y = 0 once the node hierarchy is
 * composed. So the GLB is parsed here rather than trusted, and the standing
 * height is recomputed from the rig.
 */

const GLB = fileURLToPath(new URL('../public/models/weaver.glb', import.meta.url));

interface GltfJson {
  nodes: {
    name?: string;
    mesh?: number;
    children?: number[];
    translation?: [number, number, number];
    rotation?: [number, number, number, number];
    scale?: [number, number, number];
    matrix?: number[];
    skin?: number;
  }[];
  meshes: { name?: string; primitives: { attributes: Record<string, number> }[] }[];
  accessors: { min?: number[]; max?: number[] }[];
  skins?: { joints: number[] }[];
  scenes: { nodes: number[] }[];
  animations: { name: string }[];
}

function readGltfJson(bytes: Buffer): GltfJson {
  let offset = 12;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (type === 'JSON') return JSON.parse(bytes.toString('utf8', offset + 8, offset + 8 + length));
    offset += 8 + length + ((4 - (length % 4)) % 4);
  }
  throw new Error('no JSON chunk in weaver.glb');
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const multiply = (a: number[], b: number[]): number[] => {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  }
  return out;
};

/** glTF composes translation, then rotation, then scale. */
function compose(node: GltfJson['nodes'][number]): number[] {
  if (node.matrix) return node.matrix;
  const t = node.translation ?? [0, 0, 0];
  const r = node.rotation ?? [0, 0, 0, 1];
  const s = node.scale ?? [1, 1, 1];
  const [x, y, z, w] = r;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

/**
 * The bind-pose world box of the model, with every mesh node's local geometry
 * box transformed through the chain of bones above it. This is the same number
 * `Box3.setFromObject` reports in the running scene.
 */
function bindPoseBox(json: GltfJson): { min: number[]; max: number[] } {
  const parent = new Map<number, number>();
  json.nodes.forEach((node, i) => (node.children ?? []).forEach((c) => parent.set(c, i)));

  const cache = new Map<number, number[]>();
  const worldOf = (i: number): number[] => {
    const hit = cache.get(i);
    if (hit) return hit;
    const local = compose(json.nodes[i]);
    const p = parent.has(i) ? worldOf(parent.get(i)!) : IDENTITY;
    const world = multiply(p, local);
    cache.set(i, world);
    return world;
  };

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const apply = (m: number[], p: number[]) => {
    for (let i = 0; i < 3; i++) {
      const v = m[i] * p[0] + m[4 + i] * p[1] + m[8 + i] * p[2] + m[12 + i];
      min[i] = Math.min(min[i], v);
      max[i] = Math.max(max[i], v);
    }
  };

  json.nodes.forEach((node, i) => {
    if (node.mesh === undefined) return;
    const m = worldOf(i);
    for (const primitive of json.meshes[node.mesh].primitives) {
      const accessor = json.accessors[primitive.attributes.POSITION];
      if (!accessor?.min || !accessor.max) continue;
      for (let corner = 0; corner < 8; corner++) {
        apply(m, [
          corner & 1 ? accessor.max[0] : accessor.min[0],
          corner & 2 ? accessor.max[1] : accessor.min[1],
          corner & 4 ? accessor.max[2] : accessor.min[2],
        ]);
      }
    }
  });
  return { min, max };
}

const gltf = readGltfJson(readFileSync(GLB));
const box = bindPoseBox(gltf);

describe('the Weaver GLB as authored', () => {
  it('is rigged, which is what made the scene clone unsafe', () => {
    expect(gltf.skins ?? []).toHaveLength(1);
    const skinned = gltf.nodes.filter((n) => n.skin !== undefined);
    expect(skinned.length).toBeGreaterThan(0);
  });

  it('ships every locomotion clip the controller switches between', () => {
    const names = (gltf.animations ?? []).map((a) => a.name);
    for (const clip of ['Idle', 'Walking_A', 'Running_A', 'Running_Strafe_Left', 'Running_Strafe_Right']) {
      expect(names).toContain(clip);
    }
  });

  it('has its lowest raw vertex well below the soles, so the raw minimum lies', () => {
    // The trap this file exists for: -1.16 is a cape, not a foot.
    const rawMin = Math.min(
      ...gltf.accessors
        .map((a) => a.min?.[1])
        .filter((v): v is number => typeof v === 'number'),
    );
    expect(rawMin).toBeLessThan(-1);
  });

  it('stands on y = 0 once the rig is composed, not at the raw minimum', () => {
    // Vertex positions are float32, so the composed minimum lands a few times
    // 1e-5 off zero. Half a millimetre of slack still catches a 0.7 lift by a
    // factor of a thousand.
    expect(box.min[1]).toBeCloseTo(0, 3);
  });
});

describe('CHARACTER_Y_OFFSET', () => {
  it('is zero, because the model already stands on the ground', () => {
    expect(CHARACTER_Y_OFFSET).toBe(0);
  });

  it('leaves the soles on the floor rather than floating them', () => {
    const soles = box.min[1] * CHARACTER_SCALE + CHARACTER_Y_OFFSET;
    expect(soles).toBeCloseTo(0, 3);
  });

  it('keeps the character at the height the silhouette was built around', () => {
    const height = (box.max[1] - box.min[1]) * CHARACTER_SCALE;
    expect(height).toBeGreaterThan(1.7);
    expect(height).toBeLessThan(1.9);
  });
});

describe('instanceFor', () => {
  function groupWith(child: THREE.Object3D): THREE.Group {
    const group = new THREE.Group();
    group.add(child);
    return group;
  }

  it('leaves a rigged scene alone, so the mixer drives the bones that render', () => {
    const rigged = groupWith(new THREE.SkinnedMesh());
    expect(instanceFor(rigged)).toBe(rigged);
  });

  it('clones a static scene, which is what keeps twenty-eight consoles apart', () => {
    const staticScene = groupWith(new THREE.Mesh());
    const copy = instanceFor(staticScene);
    expect(copy).not.toBe(staticScene);
    expect(copy.children).toHaveLength(1);
  });

  it('finds a skeleton nested deep in the hierarchy, not just at the root', () => {
    const root = new THREE.Group();
    const arm = new THREE.Group();
    arm.add(new THREE.SkinnedMesh());
    root.add(arm);
    expect(instanceFor(root)).toBe(root);
  });
});