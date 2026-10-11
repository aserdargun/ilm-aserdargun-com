import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { REGIONS, type RegionDef } from '../catalog/regions';
import { makeRng } from '../systems/types';
import type { RegionId } from '../types/catalog';
import { Asset } from './Models';
import { PANELS_PER_REGION, TAPESTRY_PANELS, isPanelLit } from './tapestry';
import { addCollider, clearColliders } from './collision';

/**
 * Procedural low-poly world geometry.
 *
 * Everything is generated from a fixed seed so the world is identical on every
 * load and across machines. Repeated elements use instanced meshes to keep the
 * draw-call count low.
 */

export const PALETTE = {
  midnight: '#131a2e',
  stone: '#c9b79a',
  stoneDark: '#8d8070',
  ceramic: '#e6dccb',
  copper: '#c07a44',
  copperDark: '#7d4b28',
  metal: '#2f3644',
  glass: '#9fd8e2',
  turquoise: '#3fb6c8',
  coral: '#e0795c',
  moss: '#7fa06a',
  leaf: '#8fd46a',
} as const;

/** Region anchors laid out on a ring around the hub. */
export const REGION_POSITIONS: Record<RegionId, { x: number; z: number; y: number }> =
  REGIONS.reduce(
    (acc, region) => {
      const [x, , z] = region.anchor;
      acc[region.id] = { x, z, y: 0 };
      return acc;
    },
    {} as Record<RegionId, { x: number; z: number; y: number }>,
  );

export const HUB_RADIUS = 34;

export interface RegionMeta {
  id: RegionId;
  x: number;
  z: number;
  y: number;
  radius: number;
}

/** Every walkable disc, used by ground sampling and the region HUD. */
export function allRegionMeta(): RegionMeta[] {
  return REGIONS.map((r) => ({
    id: r.id,
    x: r.anchor[0],
    z: r.anchor[2],
    y: 0,
    radius: r.radius,
  }));
}

// ---------------------------------------------------------------------------
// Deterministic scatter
// ---------------------------------------------------------------------------

export interface ScatterItem {
  position: [number, number, number];
  scale: number;
  rotation: number;
  tint: number;
}

/** Scatters rocks over a disc, avoiding the centre so paths stay readable. */
export function scatter(
  seed: number,
  centerX: number,
  centerZ: number,
  radius: number,
  count: number,
  minRadius = radius * 0.35,
  y = 0,
): ScatterItem[] {
  const rng = makeRng(seed);
  const items: ScatterItem[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = rng() * Math.PI * 2;
    const distance = minRadius + rng() * (radius - minRadius);
    items.push({
      position: [centerX + Math.cos(angle) * distance, y, centerZ + Math.sin(angle) * distance],
      scale: 0.22 + rng() * 0.55,
      rotation: rng() * Math.PI * 2,
      tint: rng(),
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Shared instanced rock / plant fields
// ---------------------------------------------------------------------------

/** Pebble tint. The material colour and the per-instance tint share it, so the
 *  scatter can never drift away from what is actually drawn. */
const PEBBLE_COLOUR = '#9a8a72';

/**
 * Small pebbles and dry grass tufts. Cheap instanced detail that keeps large
 * ground discs from reading as empty painted planes.
 */
export function GroundDetail({
  items,
  kind,
}: {
  items: ScatterItem[];
  kind: 'pebble' | 'grass';
}) {
  // One colour, read in both places. `instanceColor` *multiplies* the material
  // colour, so the base handed to `buildInstances` and the colour on the
  // material have to be the same value or the two silently cancel into mud.
  // Writing the choice twice is what broke it: grass was given the pebble's
  // sandstone while its material was moss, and 420 cones rendered at a mean
  // linear luminance of 0.194 — identical to the pebbles beside them, and at
  // a hue of 45° rather than green. The comment inside `buildInstances`
  // describes that exact failure while the call site was committing it.
  const tint = kind === 'pebble' ? PEBBLE_COLOUR : PALETTE.moss;

  const { matrices, colors } = useMemo(
    () => buildInstances(items, 77, new THREE.Color(tint), 0.02, kind === 'grass' ? 0.5 : 0.22, kind === 'grass' ? 1 : 0.5),
    [items, kind, tint],
  );
  if (matrices.length === 0) return null;
  return (
    <instancedMesh
      args={[undefined, undefined, matrices.length]}
      receiveShadow
      // Pebbles cast, grass does not. A pebble sitting on the ground with no
      // shadow under it floats; a grass tuft is a thin double-sided cone whose
      // shadow is a hard speck rather than form, and it is the largest group of
      // the three. Measured cost of all three together was ~5% at 3.55 MP.
      castShadow={kind === 'pebble'}
      onUpdate={(mesh) => {
        for (let i = 0; i < matrices.length; i += 1) mesh.setMatrixAt(i, matrices[i]);
        mesh.instanceMatrix.needsUpdate = true;
        applyInstanceColours(mesh, colors);
      }}
    >
      {kind === 'pebble' ? (
        <dodecahedronGeometry args={[1, 0]} />
      ) : (
        <coneGeometry args={[0.5, 1.4, 4, 1, true]} />
      )}
      <meshStandardMaterial
        color={tint}
        flatShading
        roughness={0.95}
        side={kind === 'grass' ? THREE.DoubleSide : THREE.FrontSide}
      />
    </instancedMesh>
  );
}

/**
 * Wind-carved boulders.
 *
 * Anything large enough to read as an obstacle registers one, so the player
 * cannot walk through a rock. Small scatter stays walkable: it is ground
 * detail, not cover.
 */
const BLOCKING_ROCK = 0.45;

export function RockField({
  items,
  color,
  seedOffset = 0,
  y = 0,
}: {
  items: ScatterItem[];
  color: string;
  seedOffset?: number;
  y?: number;
}) {
  const { matrices, colors } = useMemo(
    () => buildInstances(items, seedOffset, new THREE.Color(color), y),
    [items, seedOffset, y, color],
  );

  useLayoutEffect(() => {
    clearColliders('rocks');
    for (const item of items) {
      if (item.scale < BLOCKING_ROCK) continue;
      addCollider({
        x: item.position[0],
        z: item.position[2],
        // The instance is an icosahedron of radius 1 scaled by item.scale; a
        // slightly tighter disc keeps contact from feeling premature.
        radius: item.scale * 0.88,
        // Low enough for the camera to look straight over.
        height: item.scale * 1.5,
        owner: 'rocks',
      });
    }
  }, [items]);

  if (matrices.length === 0) return null;
  return (
    <instancedMesh
      args={[undefined, undefined, matrices.length]}
      castShadow
      receiveShadow
      frustumCulled
      ref={(mesh) => {
        if (!mesh) return;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }}
      onUpdate={(mesh) => {
        for (let i = 0; i < matrices.length; i += 1) mesh.setMatrixAt(i, matrices[i]);
        mesh.instanceMatrix.needsUpdate = true;
        applyInstanceColours(mesh, colors);
      }}
    >
      <icosahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color={color} flatShading roughness={0.95} metalness={0} />
    </instancedMesh>
  );
}

function buildInstances(
  items: ScatterItem[],
  seedOffset: number,
  base: THREE.Color,
  yOffset = 0,
  scaleMul = 1,
  stretch = 1,
) {
  const matrices: THREE.Matrix4[] = [];
  const colors: THREE.Color[] = [];
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  // Darkened from the material's own colour rather than a fixed brown. The same
  // scatter code dresses green grass tufts, and multiplying moss by sandstone
  // does not give variation — it gives mud.
  const dark = base.clone().offsetHSL(0, -0.02, -0.18);

  items.forEach((item, index) => {
    const rng = makeRng(index * 7919 + seedOffset);
    position.set(item.position[0], item.position[1] + yOffset + item.scale * 0.35, item.position[2]);
    euler.set(rng() * 0.5, item.rotation, rng() * 0.5);
    quaternion.setFromEuler(euler);
    scale.set(
      item.scale * scaleMul,
      item.scale * scaleMul * stretch,
      item.scale * scaleMul,
    );
    matrix.compose(position, quaternion, scale);
    matrices.push(matrix.clone());
    const c = base.clone().lerp(dark, item.tint * 0.7);
    colors.push(c);
  });
  return { matrices, colors };
}

/**
 * Writes the per-instance colours, allocating the attribute if it is not there.
 *
 * `setColorAt` is the call that *creates* `instanceColor` — guarding on the
 * attribute being non-null before calling it means the guard permanently
 * prevents the only thing that could ever set it. Every rock in the world was
 * computed, given a tint, and then dropped on the floor: 208 boulders, 720
 * pebbles and 420 grass tufts all rendering in one flat colour each.
 */
function applyInstanceColours(mesh: THREE.InstancedMesh, colors: THREE.Color[]): void {
  for (let i = 0; i < colors.length; i += 1) mesh.setColorAt(i, colors[i]);
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Landmarks — one per region, each built from simple primitives
// ---------------------------------------------------------------------------

/** Authored Blender model for each region landmark. */
const LANDMARK_MODELS: Record<RegionId, string> = {
  hub: 'synthesis_tree',
  'cartographers-terrace': 'terrace_map',
  'flow-foundry': 'great_loom',
  'memory-council-city': 'council_city',
  'adaptation-cloud-harbor': 'cloud_harbour',
  'collective-gardens': 'collective_gardens',
  'observers-mirrors': 'observer_mirrors',
  'valley-living-machines': 'living_valley',
};

export function Landmark({
  region,
  restored = false,
  restoredCount = 0,
}: {
  region: RegionDef;
  restored?: boolean;
  /** Regions restored so far, which is what the tapestry reads. */
  restoredCount?: number;
}) {
  const [x, , z] = region.anchor;

  if (region.id === 'hub') {
    return (
      <group>
        <Asset
          name="synthesis_tree"
          fallback={<SynthesisTree restored={restored} />}
          // The crown catches the light once the opening connection is made.
          // `synthesis_tree.glb` is a single mesh split into three primitives —
          // copper trunk, copper rings, ceramic crown — and the crown is a mesh
          // of its own, so it can be lit in place. The procedural version had
          // this behaviour and was only ever visible while the GLB downloaded,
          // which meant the beat the comments describe ("the opening connection
          // turns the tree's first branch") never reached the player. Painting
          // the model beats swapping it out for a worse-looking one.
          paint={(mesh) => {
            const material = mesh.material as THREE.MeshStandardMaterial;
            if (!material?.name || material.name !== 'ceramic') return;
            material.emissive.set(PALETTE.turquoise);
            material.emissiveIntensity = restored ? 0.55 : 0;
            material.needsUpdate = true;
          }}
          paintKey={restored}
        />
        {/* The tapestry is built from primitives rather than loaded, because the
            progression is the whole point of it and a GLB cannot express it:
            `tapestry.glb` is a *single* mesh with two materials and no emissive
            channel, so there is nothing to light up panel by panel. It was drawn
            from the model while the panels stayed behind in a `visible={false}`
            copy, which means the documented mechanic — the tapestry brightening
            as regions come back — had not been visible in the shipped game. */}
        <UnfinishedTapestry restoredCount={restoredCount} />
        <SuspendedAqueduct />
        {restored && <FlowingCanal />}
      </group>
    );
  }

  const model = LANDMARK_MODELS[region.id];
  const fallback = (() => {
    switch (region.id) {
      case 'cartographers-terrace':
        return <TerraceMap x={x} z={z} />;
      case 'flow-foundry':
        return <GreatLoom x={x} z={z} />;
      case 'memory-council-city':
        return <CouncilCity x={x} z={z} />;
      case 'adaptation-cloud-harbor':
        return <CloudHarbor x={x} z={z} />;
      case 'collective-gardens':
        return <CollectiveGardens x={x} z={z} />;
      case 'observers-mirrors':
        return <ObserverMirrors x={x} z={z} />;
      default:
        return <LivingValley x={x} z={z} />;
    }
  })();

  return <Asset name={model} fallback={fallback} />;
}

function SynthesisTree({ restored }: { restored: boolean }) {
  const branches = useMemo(() => {
    const rng = makeRng(4242);
    const out: { from: [number, number, number]; to: [number, number, number]; r: number }[] = [];
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      const height = 12 + rng() * 5;
      out.push({
        from: [0, 9 + rng() * 2, 0],
        to: [Math.cos(angle) * 11, height, Math.sin(angle) * 11],
        r: 0.32 + rng() * 0.22,
      });
    }
    return out;
  }, []);

  return (
    <group position={[0, 0, 0]}>
      {/* trunk, built from stacked tapered sections for a woven look */}
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[0, i * 2 + 1, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[1.5 - i * 0.18, 1.9 - i * 0.18, 2.2, 9]} />
          <meshStandardMaterial color={PALETTE.copperDark} flatShading roughness={0.8} metalness={0.3} />
        </mesh>
      ))}
      {branches.map((b, i) => {
        const mid = new THREE.Vector3(
          (b.from[0] + b.to[0]) / 2,
          (b.from[1] + b.to[1]) / 2 + 1.4,
          (b.from[2] + b.to[2]) / 2,
        );
        const start = new THREE.Vector3(...b.from);
        const end = new THREE.Vector3(...b.to);
        const direction = new THREE.Vector3().subVectors(end, start);
        const length = direction.length();
        const quaternion = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          direction.clone().normalize(),
        );
        const euler = new THREE.Euler().setFromQuaternion(quaternion);
        return (
          <mesh key={i} position={mid} rotation={euler} castShadow>
            <cylinderGeometry args={[b.r * 0.6, b.r, length, 7]} />
            <meshStandardMaterial
              color={restored ? PALETTE.turquoise : PALETTE.copperDark}
              flatShading
              roughness={0.7}
              metalness={0.4}
              emissive={restored ? PALETTE.turquoise : '#000000'}
              emissiveIntensity={restored ? 0.5 : 0}
            />
          </mesh>
        );
      })}
      {/* copper thread rings, the loom the tree was never finished on */}
      {[6.5, 8.5, 10.5].map((y, i) => (
        <mesh key={i} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.9 + i * 0.35, 0.09, 6, 24]} />
          <meshStandardMaterial color={PALETTE.copper} metalness={0.7} roughness={0.35} />
        </mesh>
      ))}
    </group>
  );
}

/** The channel that carries water once the opening connection is made. */
function FlowingCanal() {
  return (
    <group position={[0, 0.12, 11]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.2, 8]} />
        <meshStandardMaterial
          color={PALETTE.turquoise}
          transparent
          opacity={0.72}
          roughness={0.15}
          metalness={0.1}
          emissive={PALETTE.turquoise}
          emissiveIntensity={0.35}
        />
      </mesh>
      {[-4, 4].map((z) => (
        <mesh key={z} position={[0, 0.2, z]}>
          <boxGeometry args={[3.8, 0.4, 0.5]} />
          <meshStandardMaterial color={PALETTE.stone} flatShading roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * The enormous unfinished tapestry the Weaver wakes beneath. Its woven panels
 * brighten one by one as regions are restored.
 */
function UnfinishedTapestry({ restoredCount = 0 }: { restoredCount?: number }) {
  const panels = useMemo(
    () =>
      Array.from({ length: TAPESTRY_PANELS }, (_, i) => {
        const cloth = new THREE.Color(PALETTE.ceramic);
        // A little tone variation along the row, so fourteen panels read as woven
        // from one bolt of cloth rather than as fourteen identical cards.
        cloth.offsetHSL(0.004 * ((i % 3) - 1), -0.02 * ((i % 2) - 0.5), -0.03 * ((i % 4) - 1.5));
        return {
          position: [(i - (TAPESTRY_PANELS - 1) / 2) * 3.4, 17.5, 0] as [number, number, number],
          cloth,
        };
      }),
    [],
  );
  return (
    <group>
      {/* the crossbeam the tapestry hangs from */}
      <mesh position={[0, 20.4, 0]} castShadow>
        <boxGeometry args={[52, 0.7, 0.7]} />
        <meshStandardMaterial color={PALETTE.copperDark} flatShading roughness={0.75} metalness={0.4} />
      </mesh>
      {panels.map((panel, i) => {
        // `restoredCount` is panels, not regions — the scene already multiplied.
        const lit = isPanelLit(i, restoredCount / PANELS_PER_REGION);
        return (
          <mesh key={i} position={panel.position} castShadow>
            {/* A thin box rather than a plane: a plane has no edge to catch the
                sun, and fourteen of them in a row read as paper cut-outs. */}
            <boxGeometry args={[3.1, 4.6, 0.09]} />
            <meshStandardMaterial
              color={lit ? PALETTE.turquoise : panel.cloth}
              roughness={0.95}
              flatShading
              emissive={lit ? PALETTE.turquoise : '#000000'}
              emissiveIntensity={lit ? 0.35 : 0}
            />
          </mesh>
        );
      })}
      {/* the loom frame at one end of the tapestry */}
      <mesh position={[26, 16.5, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.5, 0.5, 10, 8]} />
        <meshStandardMaterial color={PALETTE.copper} metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  );
}

/** The aqueduct that curves through the sky above the opening area. */
function SuspendedAqueduct() {
  const segments = useMemo(() => {
    const out: { position: [number, number, number]; rotation: number }[] = [];
    const count = 16;
    for (let i = 0; i < count; i += 1) {
      const t = i / (count - 1);
      const angle = t * Math.PI * 0.9;
      out.push({
        position: [Math.cos(angle) * 78, 24 + Math.sin(t * Math.PI) * 7, Math.sin(angle) * 78 - 30],
        rotation: -angle * 0.35,
      });
    }
    return out;
  }, []);
  return (
    <group>
      {segments.map((segment, i) => (
        <mesh key={i} position={segment.position} rotation={[0, segment.rotation, 0]}>
          <boxGeometry args={[9, 0.9, 3.4]} />
          {/* Flat shading is a no-op on a `BoxGeometry` — it builds four
              vertices per face with face-aligned normals — so dropping it only
              lets the stone detail map through.

              Deliberately does **not** cast. Sixteen slabs hanging twenty-four to
              thirty-one units above the hub threw a starburst of shadows across
              the island floor, and an A/B with the flag flipped showed those were
              the only thing producing the radial banding the ground appeared to
              have. A decorative sky structure casting a meaningless pattern over
              the one place the player spawns is clutter, not depth. */}
          <meshStandardMaterial color={PALETTE.ceramic} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

function TerraceMap({ x, z }: { x: number; z: number }) {
  const plates = useMemo(() => {
    const rng = makeRng(8181);
    return Array.from({ length: 9 }, () => ({
      position: [(rng() - 0.5) * 16, 1.2 + rng() * 0.6, (rng() - 0.5) * 16] as [number, number, number],
      scale: 1.4 + rng() * 1.6,
      rotation: rng() * Math.PI,
    }));
  }, []);
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.6, 0]} receiveShadow>
        <cylinderGeometry args={[15, 15.4, 1.2, 40]} />
        <meshStandardMaterial color={PALETTE.stone} flatShading roughness={0.95} />
      </mesh>
      {plates.map((p, i) => (
        <mesh key={i} position={p.position} rotation={[0, p.rotation, 0]} receiveShadow>
          <cylinderGeometry args={[p.scale, p.scale * 1.1, 0.5, 6]} />
          <meshStandardMaterial color={PALETTE.ceramic} flatShading roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function GreatLoom({ x, z }: { x: number; z: number }) {
  const arms = useMemo(
    () => Array.from({ length: 6 }, (_, i) => ({ angle: (i / 6) * Math.PI * 2, len: 7 + (i % 3) * 2 })),
    [],
  );
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 4, 0]} castShadow>
        <boxGeometry args={[16, 8, 2.4]} />
        <meshStandardMaterial color={PALETTE.metal} flatShading roughness={0.6} metalness={0.55} />
      </mesh>
      {arms.map((a, i) => (
        <mesh
          key={i}
          position={[Math.cos(a.angle) * a.len, 5.5, Math.sin(a.angle) * a.len]}
          rotation={[0, -a.angle, 0.5]}
          castShadow
        >
          <boxGeometry args={[1.1, 0.7, a.len]} />
          <meshStandardMaterial color={PALETTE.copper} flatShading roughness={0.5} metalness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 0.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[30, 4]} />
        <meshStandardMaterial color={PALETTE.turquoise} transparent opacity={0.65} roughness={0.2} />
      </mesh>
    </group>
  );
}

function CouncilCity({ x, z }: { x: number; z: number }) {
  // Deterministic ring of archive towers around the council dome.
  const ring = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        return {
          position: [Math.cos(angle) * 13, 3, Math.sin(angle) * 13] as [number, number, number],
          height: 5 + (i % 3) * 2.2,
        };
      }),
    [],
  );
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[9, 10, 4, 16]} />
        <meshStandardMaterial color={PALETTE.ceramic} flatShading roughness={0.85} />
      </mesh>
      <mesh position={[0, 6, 0]} castShadow>
        <sphereGeometry args={[7.4, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={PALETTE.glass} flatShading transparent opacity={0.6} roughness={0.15} metalness={0.1} />
      </mesh>
      {ring.map((t, i) => (
        <mesh key={i} position={t.position} castShadow receiveShadow>
          <cylinderGeometry args={[1.5, 1.8, t.height, 6]} />
          <meshStandardMaterial color={PALETTE.stone} flatShading roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function CloudHarbor({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[-6, 2.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[9, 5, 9]} />
        <meshStandardMaterial color={PALETTE.copper} flatShading roughness={0.7} metalness={0.35} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[7, 6 + i * 5, i * 3 - 3]} castShadow>
          <boxGeometry args={[0.5, 10, 0.5]} />
          <meshStandardMaterial color={PALETTE.metal} flatShading metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[7, 14, -1.5]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.3, 0.3, 16, 8]} />
        <meshStandardMaterial color={PALETTE.copper} metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  );
}

function CollectiveGardens({ x, z }: { x: number; z: number }) {
  const terraces = useMemo(
    () =>
      Array.from({ length: 4 }, (_, i) => ({
        y: i * 1.6,
        r: 15 - i * 2.4,
      })),
    [],
  );
  const flowers = useMemo(() => {
    const rng = makeRng(9090);
    return Array.from({ length: 14 }, () => {
      const angle = rng() * Math.PI * 2;
      const distance = 5 + rng() * 10;
      return {
        position: [Math.cos(angle) * distance, 1 + Math.floor(distance / 4) * 1.6, Math.sin(angle) * distance] as [
          number,
          number,
          number,
        ],
        hue: rng(),
      };
    });
  }, []);
  return (
    <group position={[x, 0, z]}>
      {terraces.map((t, i) => (
        <mesh key={i} position={[0, t.y, 0]} receiveShadow>
          <cylinderGeometry args={[t.r, t.r + 1.2, 1.6, 24]} />
          <meshStandardMaterial color={PALETTE.stoneDark} flatShading roughness={0.95} />
        </mesh>
      ))}
      {flowers.map((f, i) => (
        <group key={i} position={f.position}>
          <mesh position={[0, 0.5, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.12, 1, 5]} />
            <meshStandardMaterial color={PALETTE.moss} flatShading />
          </mesh>
          <mesh position={[0, 1.05, 0]} castShadow>
            <octahedronGeometry args={[0.42, 0]} />
            <meshStandardMaterial
              color={f.hue > 0.6 ? PALETTE.coral : PALETTE.leaf}
              flatShading
              emissive={PALETTE.leaf}
              emissiveIntensity={0.25}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function ObserverMirrors({ x, z }: { x: number; z: number }) {
  const mirrors = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => {
        const angle = (i / 5) * Math.PI * 2;
        return {
          position: [Math.cos(angle) * 9, 3.4, Math.sin(angle) * 9] as [number, number, number],
          rotation: -angle + Math.PI,
        };
      }),
    [],
  );
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.4, 0]} receiveShadow>
        <cylinderGeometry args={[13, 13.4, 0.8, 28]} />
        <meshStandardMaterial color={PALETTE.stone} flatShading roughness={0.9} />
      </mesh>
      {mirrors.map((m, i) => (
        <group key={i} position={m.position} rotation={[0, m.rotation, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.3, 6, 3.4]} />
            <meshStandardMaterial
              color={PALETTE.glass}
              transparent
              opacity={0.42}
              roughness={0.08}
              metalness={0.4}
            />
          </mesh>
          <mesh position={[0, -3.2, 0]}>
            <boxGeometry args={[0.8, 0.6, 3.8]} />
            <meshStandardMaterial color={PALETTE.metal} flatShading metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function LivingValley({ x, z }: { x: number; z: number }) {
  const pipes = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        position: [(i - 2.5) * 3.4, 1.6, (i % 2) * 4 - 2] as [number, number, number],
        rotation: (i % 3) * 0.4,
      })),
    [],
  );
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 2.2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[3.4, 4, 4.4, 12]} />
        <meshStandardMaterial color={PALETTE.copper} flatShading roughness={0.6} metalness={0.5} />
      </mesh>
      <mesh position={[0, 5.2, 0]} castShadow>
        <cylinderGeometry args={[1.6, 2.4, 2.4, 12]} />
        <meshStandardMaterial color={PALETTE.metal} flatShading metalness={0.65} roughness={0.35} />
      </mesh>
      {pipes.map((p, i) => (
        <mesh key={i} position={p.position} rotation={[0, p.rotation, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.42, 0.42, 5, 8]} />
          <meshStandardMaterial color={PALETTE.copper} flatShading metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}
