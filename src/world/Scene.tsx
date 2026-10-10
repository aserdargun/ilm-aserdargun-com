import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  GroundDetail,
  Landmark,
  PALETTE,
  REGION_POSITIONS,
  RockField,
  allRegionMeta,
  scatter,
} from './World';
import { REGION_ORDER, REGIONS } from '../catalog/regions';
import {
  createPlayerState,
  registerBridges,
  usePlayerController,
  type PlayerState,
} from './Player';
import { addColliders, clearColliders, countByOwner, getColliders } from './collision';
import { distanceToWalkable, initNavigation } from './navigation';
import { ALL_STAGE_IDS, STAGES } from '../game/stages';
import { __setStateForTests, getState } from '../game/store';
import { nextObjectiveStageId } from '../game/objective';
import { reportPlayerFacing } from '../ui/Screens';
import {
  enterStage,
  isStageReachable,
  setTargetedStage,
  updatePlayerPosition,
  useGame,
} from '../game/store';
import { PropScatter, preloadProps } from './Props';
import { Lighting } from './Lighting';
import { PostProcessing } from './PostProcessing';
import { HORIZON_COLOR, SkyDome, TerrainDisc } from './Atmosphere';
import { regionAt } from './Player';
import { input } from '../game/input';
import { audio, useSparkAudio } from '../game/audio';
import {
  ALL_MODEL_NAMES,
  Asset,
  CHARACTER_SCALE,
  CHARACTER_Y_OFFSET,
  CLIP_FOR_STATE,
  LOCOMOTION_STATES,
  preloadModels,
  type LocomotionState,
} from './Models';

const INTERACT_RANGE = 5.2;

/**
 * Where the player arrives and where the home button sends them back: the hub
 * dais, facing the world. Kept as one constant so spawning and recalling can
 * never drift apart.
 */
const SPAWN: [number, number, number] = [0, 0, 16];

// Warm the authored models before the first render so the opening frame does
// not stall while the GLB files stream in.
preloadModels(ALL_MODEL_NAMES);
preloadProps();

// Frame counter for the dev-only performance probe.
if (import.meta.env.DEV) {
  (window as unknown as { __ilmPerf?: { frames: number; last: number } }).__ilmPerf = {
    frames: 0,
    last: performance.now(),
  };
}

export function GameCanvas() {
  const quality = useGame().settings.quality;
  // A 3x phone at full resolution is three million pixels a frame; capping the
  // ratio keeps the fill rate survivable and the memory footprint small.
  const dprCap = quality === 'low' ? 1.25 : quality === 'medium' ? 1.5 : 1.75;
  return (
    <Canvas
      shadows={quality !== 'low'}
      dpr={[1, dprCap]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 58, near: 0.1, far: 900, position: [0, 8, 26] }}
      onCreated={({ gl }) => {
        // r186 removed PCFSoftShadowMap and silently falls back to this one,
        // so it is named explicitly rather than left to emit a warning. Soft
        // edges now come from `shadow-radius` instead.
        gl.shadowMap.type = THREE.PCFShadowMap;
        gl.setClearColor(new THREE.Color(PALETTE.midnight));
      }}
    >
      <Suspense fallback={null}>
        <SceneContents />
      </Suspense>
    </Canvas>
  );
}

/**
 * Regions whose span is currently laid: fully restored, or reached — matching
 * exactly what the bridge renderer draws.
 */
function openRegionIds(game: ReturnType<typeof useGame>): Set<string> {
  const open = new Set<string>();
  // The frontier region — the first one not yet restored — always has its span
  // laid. Without this the opening would leave every bridge unbuilt and the
  // first region would be unreachable: its bridge needed a stage completed
  // inside it.
  const order = REGIONS.filter((r) => r.id !== 'hub').map((r) => r.id);
  let frontier: string | null = null;
  for (const id of order) {
    if (!game.progression.completedRegions.includes(id)) {
      frontier = id;
      break;
    }
  }

  for (const region of REGIONS) {
    if (region.id === 'hub') continue;
    const restored = game.progression.completedRegions.includes(region.id);
    const reached = STAGES.some(
      (st) => st.region === region.id && game.progression.completedStages.includes(st.id),
    );
    if (restored || reached || region.id === frontier) open.add(region.id);
  }
  return open;
}

/** The next stage the player should head for; shared with the HUD compass. */
function nextObjectiveStage(game: ReturnType<typeof useGame>): string | null {
  return nextObjectiveStageId(game.progression);
}

function SceneContents() {
  const game = useGame();
  const cameraYaw = useRef(0);
  const cameraPitch = useRef(0);
  const player = useRef<PlayerState>(createPlayerState(new THREE.Vector3(...SPAWN)));
  const stagePositions = useMemo(() => buildStagePositions(), []);
  const regionMeta = useMemo(() => allRegionMeta(), []);

  useAudioLayers(game.progression.completedRegions.length);

  const callbacks = useMemo(
    () => ({
      onInteract: () => {
        const id = targetRef.current;
        if (!id) return;
        enterStage(id);
      },
      onCycleTool: () => {
        /* handled by the store action bound in Player */
      },
      onPause: () => {
        window.dispatchEvent(new CustomEvent('ilm:pause'));
      },
      onReset: () => {
        const id = targetRef.current;
        if (!id) return;
        window.dispatchEvent(new CustomEvent('ilm:reset-stage', { detail: id }));
      },
      onHome: () => {
        // The hub is the one place the player can always find their way back
        // from, so home means "put me back on the dais, facing the world" —
        // a fresh state plus a camera that is no longer looking at a wall.
        player.current = createPlayerState(new THREE.Vector3(...SPAWN));
        cameraYaw.current = 0;
        input.setStick(0, 0);
      },
    }),
    [],
  );

  const targetRef = useRef<string | null>(null);
  const { scene } = useThree();
  const gameRef = useRef(game);
  gameRef.current = game;
  const { camera } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  // Interaction target: nearest reachable console in range and in view.
  const findTarget = useCallback(() => {
    const origin = player.current.position;
    let best: { id: string; distance: number } | null = null;
    for (const entry of stagePositions) {
      const dx = entry.position[0] - origin.x;
      const dz = entry.position[2] - origin.z;
      const dy = entry.position[1] - origin.y;
      const distance = Math.hypot(dx, dy, dz);
      if (distance > INTERACT_RANGE) continue;
      if (!isStageReachable(entry.id)) continue;
      // A finished console stops asking for attention; the player moves on.
      if (gameRef.current.progression.completedStages.includes(entry.id)) continue;
      if (best && distance >= best.distance) continue;
      best = { id: entry.id, distance };
    }
    if (!best) return null;

    // Line of sight: refuse interactions that pass through the tree trunk or
    // a landmark, so the player cannot work a puzzle through a wall.
    const entry = stagePositions.find((s) => s.id === best!.id);
    if (!entry) return null;
    const target = new THREE.Vector3(entry.position[0], entry.position[1], entry.position[2]);
    const direction = target.clone().sub(camera.position).normalize();
    raycaster.set(camera.position, direction);
    raycaster.far = camera.position.distanceTo(target) - 0.6;
    const blocked = raycaster.intersectObjects(occluderMeshes, false).length > 0;
    if (blocked) return null;
    return best.id;
  }, [camera, raycaster, stagePositions]);

  useFrame(() => {
    const id = findTarget();
    targetRef.current = id;
    if (import.meta.env.DEV) {
      const w = window as unknown as { __ilm?: Record<string, unknown> };
      w.__ilm = {
        // Dev-only shortcuts used while testing the puzzle interfaces.
        openStage: (id: string) => enterStage(id),
        // Dev-only teleport, used to inspect regions without walking there.
        teleport: (x: number, z: number) => {
          player.current.position.set(x, 0, z);
          player.current.velocityY = 0;
        },
        audio: () => audio.debugSnapshot(),
        unlockAll: () => {
          __setStateForTests({
            progression: {
              ...getState().progression,
              completedStages: ALL_STAGE_IDS.filter((s) => s !== 'finale-synthesis-tree'),
              completedRegions: [...REGION_ORDER],
              unlockedTools: ['connect', 'reveal', 'preview', 'decide'],
            },
          });
        },
        player: {
          x: player.current.position.x,
          y: player.current.position.y,
          z: player.current.position.z,
        },
        target: id,
        input: { enabled: input.enabled, move: input.moveVector() },
        colliders: { total: getColliders().length, byOwner: countByOwner() },
        // Deepest overlap between the player and any collider; should stay <= 0.
        // What is holding the player: the nearest collider, and how far the
        // player is from walkable ground.
        blocking: (() => {
          const p = player.current.position;
          let best: Record<string, number | string> | null = null;
          let bestGap = Infinity;
          for (const c of getColliders()) {
            const gap = Math.hypot(p.x - c.x, p.z - c.z) - (c.radius + 0.55);
            if (gap < bestGap) { bestGap = gap; best = { owner: c.owner ?? '?', gap: +gap.toFixed(2), r: c.radius }; }
          }
          return { nearest: best, offWalkableBy: +distanceToWalkable(p.x, p.z).toFixed(2) };
        })(),
        // Nearest rock, so collision against it can be verified by aiming.
        nearestRock: (() => {
          const p = player.current.position;
          let best: { x: number; z: number; radius: number; dist: number } | null = null;
          for (const c of getColliders()) {
            if (c.owner !== 'rocks') continue;
            const d = Math.hypot(p.x - c.x, p.z - c.z);
            if (!best || d < best.dist) {
              best = { x: +c.x.toFixed(2), z: +c.z.toFixed(2), radius: +c.radius.toFixed(2), dist: +d.toFixed(2) };
            }
          }
          return best;
        })(),
        penetration: (() => {
          const p = player.current.position;
          let worst = 0;
          for (const c of getColliders()) {
            const d = Math.hypot(p.x - c.x, p.z - c.z) - (c.radius + 0.55);
            if (-d > worst) worst = -d;
          }
          return +worst.toFixed(3);
        })(),
        /**
         * Frame timing sampled from the real render loop, so the numbers
         * reported in the README are measured rather than assumed.
         */
        perf: (() => {
          const perf = (window as unknown as { __ilmPerf?: { frames: number; last: number } }).__ilmPerf;
          const now = performance.now();
          if (perf) {
            perf.frames += 1;
            perf.last = now;
          }
          return perf ? { frames: perf.frames, last: perf.last } : null;
        })(),
        scene: (() => {
          let instanced = 0;
          let meshes = 0;
          scene.traverse((o: unknown) => {
            const m = o as { isInstancedMesh?: boolean; isMesh?: boolean };
            if (m?.isInstancedMesh) instanced += 1;
            else if (m?.isMesh) meshes += 1;
          });
          return {
            instanced,
            meshes,
            // Per-prop bounds after runtime grounding, to prove they sit flat.
            // Per-instanced-mesh bounds, to prove every prop sits on the ground.
            propBounds: (() => {
              const rows: { minY: number; maxY: number; count: number }[] = [];
              scene.traverse((o: unknown) => {
                const m = o as THREE.InstancedMesh;
                if (!(m as { isInstancedMesh?: boolean })?.isInstancedMesh) return;
                const g = m.geometry;
                if (!g.boundingBox) g.computeBoundingBox();
                const b = g.boundingBox;
                if (!b) return;
                rows.push({
                  minY: +b.min.y.toFixed(3),
                  maxY: +b.max.y.toFixed(3),
                  count: m.count,
                });
              });
              return rows;
            })(),
          };
        })(),
        anim: (() => {
          const rig = (window as unknown as { __weaverRig?: { actions: Record<string, { getEffectiveWeight: () => number; time: number }> } }).__weaverRig;
          if (!rig) return null;
          return Object.fromEntries(
            Object.entries(rig.actions).map(([k, a]) => [k, {
              weight: +a.getEffectiveWeight().toFixed(2),
              time: +a.time.toFixed(2),
            }]),
          );
        })(),
        screen: getState().screen,
        range: INTERACT_RANGE,
        stages: stagePositions.map((s2) => s2.id),
      };
    }
    setTargetedStage(id);
    updatePlayerPosition(
      player.current.position.x,
      player.current.position.y,
      player.current.position.z,
      regionAt(player.current.position.x, player.current.position.z, regionMeta),
    );
    reportPlayerFacing(player.current.facing);
  });

  return (
    <>
      <color attach="background" args={[PALETTE.midnight]} />
      <fog attach="fog" args={[HORIZON_COLOR, 110, 520]} />
      <SkyDome />
      <Lighting quality={game.settings.quality} target={player.current.position} />

      <WorldGeometry
        completedRegions={new Set(game.progression.completedRegions)}
        completedStages={new Set(game.progression.completedStages)}
        stagePositions={stagePositions}
        objectiveStageId={nextObjectiveStage(game)}
        openRegions={openRegionIds(game)}
      />

      <PlayerRig
        state={player}
        cameraYaw={cameraYaw}
        cameraPitch={cameraPitch}
        enabled={game.screen === 'playing'}
        reducedMotion={game.settings.reducedMotion}
        onInteract={callbacks.onInteract}
        onCycleTool={callbacks.onCycleTool}
        onPause={callbacks.onPause}
        onReset={callbacks.onReset}
        onHome={callbacks.onHome}
      />
      <Spark companionTarget={player} reducedMotion={game.settings.reducedMotion} />
      <PostProcessing quality={game.settings.quality} />
    </>
  );
}

/** Meshes that block interaction line of sight. */
const occluderMeshes: THREE.Object3D[] = [];

// ---------------------------------------------------------------------------

interface StagePosition {
  id: string;
  position: [number, number, number];
}

function buildStagePositions(): StagePosition[] {
  return STAGES.map((stage) => {
    const anchor = REGION_POSITIONS[stage.region];
    return {
      id: stage.id,
      position: [anchor.x + stage.offset[0], 0, anchor.z + stage.offset[2]] as [number, number, number],
    };
  });
}

function WorldGeometry({
  completedRegions,
  completedStages,
  stagePositions,
  objectiveStageId,
  openRegions,
}: {
  completedRegions: Set<string>;
  completedStages: Set<string>;
  stagePositions: StagePosition[];
  objectiveStageId: string | null;
  openRegions: Set<string>;
}) {
  const rocks = useMemo(
    () =>
      REGIONS.flatMap((region, i) =>
        scatter(1000 + i * 37, region.anchor[0], region.anchor[2], region.radius * 0.94, 26),
      ),
    [],
  );

  // Finer scatter so the ground discs read as terrain rather than flat plates.
  const pebbles = useMemo(
    () =>
      REGIONS.flatMap((region, i) =>
        scatter(5000 + i * 91, region.anchor[0], region.anchor[2], region.radius * 0.96, 90),
      ),
    [],
  );
  const grass = useMemo(
    () =>
      REGIONS.filter((r) => r.id !== 'hub').flatMap((region, i) =>
        scatter(7000 + i * 53, region.anchor[0], region.anchor[2], region.radius * 0.9, 60),
      ),
    [],
  );

  // Bridges from the hub to each region, laid down as regions are restored.
  const bridges = useMemo(
    () =>
      REGIONS.filter((r) => r.id !== 'hub').map((r) => ({
        from: [0, 0] as [number, number],
        to: [r.anchor[0], r.anchor[2]] as [number, number],
        width: 12,
        y: 0,
      })),
    [],
  );

  /**
   * Build the collision set from the geometry that actually exists, rather
   * than a hand-written list that drifts out of date.
   */
  useEffect(() => {
    registerBridges(bridges);
    // Walkable area = the islands plus only the spans that have been built.
    initNavigation(openRegions);
    // Props register themselves from their own geometry; only the static world
    // is cleared and rebuilt here.
    clearColliders('landmarks');
    clearColliders('consoles');

    // Landmark footprints. Radii match the built structures: the tree trunk,
    // the loom frame, the council podium, the workshop, the terraces, the
    // mirror plinth and the pump.
    const landmarkRadii: Record<string, number> = {
      hub: 3.4,
      'cartographers-terrace': 9,
      'flow-foundry': 7,
      'memory-council-city': 9.5,
      'adaptation-cloud-harbor': 7.5,
      'collective-gardens': 8,
      'observers-mirrors': 7,
      'valley-living-machines': 6.5,
    };
    for (const region of REGIONS) {
      const radius = landmarkRadii[region.id] ?? 6;
      // One disc per landmark footprint. Inventing extra rings here would put
      // invisible walls in open ground, so the radius covers what is actually
      // built instead.
      addColliders([
        { x: region.anchor[0], z: region.anchor[2], radius, height: 9, owner: 'landmarks' },
      ]);
    }

    // Every stage console is solid, so the player cannot stand inside it.
    for (const entry of stagePositions) {
      addColliders([{ x: entry.position[0], z: entry.position[2], radius: 1.9, height: 2.6, owner: 'consoles' }]);
    }
  }, [bridges, stagePositions, openRegions]);

  return (
    <group>
      {/* ground discs */}
      {REGIONS.map((region) => (
        <group key={region.id} position={[region.anchor[0], 0, region.anchor[2]]}>
          <TerrainDisc region={region} />
        </group>
      ))}

      <RockField items={rocks} color={PALETTE.stone} />
      <GroundDetail items={pebbles} kind="pebble" />
      <GroundDetail items={grass} kind="grass" />
      <PropScatter />

      {REGIONS.map((region) => (
        <group key={`landmark-${region.id}`} position={region.anchor as [number, number, number]}>
          <Landmark
            region={region}
            // The hub responds to the opening connection, which is what turns
            // the tree's first branch and starts the canal flowing.
            restored={
              region.id === 'hub'
                ? completedStages.has('r0-opening')
                : completedRegions.has(region.id)
            }
          />
        </group>
      ))}

      {bridges.map((bridge, i) => {
        const region = REGIONS.filter((r) => r.id !== 'hub')[i];
        // Restoring a region completes the span; reaching its first console
        // grows a crossing the player can already walk across.
        const reached = STAGES.some(
          (st) => st.region === region.id && completedStages.has(st.id),
        );
        const open = completedRegions.has(region.id) || reached;
        const mid: [number, number, number] = [
          bridge.from[0] + (bridge.to[0] - bridge.from[0]) / 2,
          0.6,
          bridge.from[1] + (bridge.to[1] - bridge.from[1]) / 2,
        ];
        const length = Math.hypot(bridge.to[0] - bridge.from[0], bridge.to[1] - bridge.from[1]);
        const angle = Math.atan2(
          bridge.to[0] - bridge.from[0],
          bridge.to[1] - bridge.from[1],
        );
        if (!open) {
          // A bridge that has not grown yet: two stubs at each end.
          return (
            <group key={`stub-${region.id}`}>
              <mesh position={[bridge.from[0] * 0.28, 0.6, bridge.from[1] * 0.28]}>
                <boxGeometry args={[5, 0.6, 5]} />
                <meshStandardMaterial color={PALETTE.stoneDark} flatShading />
              </mesh>
              <mesh
                position={[
                  bridge.to[0] - (bridge.to[0] - bridge.from[0]) * 0.12,
                  0.6,
                  bridge.to[1] - (bridge.to[1] - bridge.from[1]) * 0.12,
                ]}
              >
                <boxGeometry args={[5, 0.6, 5]} />
                <meshStandardMaterial color={PALETTE.stoneDark} flatShading />
              </mesh>
            </group>
          );
        }
        return (
          <group key={`bridge-${region.id}`} position={mid} rotation={[0, angle, 0]}>
            <mesh receiveShadow>
              <boxGeometry args={[bridge.width, 0.5, length]} />
              <meshStandardMaterial color={PALETTE.stone} flatShading roughness={0.9} />
            </mesh>
            {/* a woven runner down the middle and low rails at each side */}
            <mesh position={[0, 0.28, 0]}>
              <boxGeometry args={[bridge.width * 0.55, 0.06, length * 0.98]} />
              <meshStandardMaterial
                color={PALETTE.turquoise}
                transparent
                opacity={0.4}
                emissive={PALETTE.turquoise}
                emissiveIntensity={0.35}
                roughness={0.4}
              />
            </mesh>
            {/* The rails mark exactly where the span stops being walkable, so
                the boundary is never an invisible wall. */}
            {[-1, 1].map((side) => (
              <group key={side}>
                <mesh position={[side * (bridge.width / 2 - 0.2), 0.5, 0]}>
                  <boxGeometry args={[0.3, 0.6, length]} />
                  <meshStandardMaterial
                    color={PALETTE.turquoise}
                    emissive={PALETTE.turquoise}
                    emissiveIntensity={0.5}
                    flatShading
                    roughness={0.5}
                  />
                </mesh>
                <mesh position={[side * (bridge.width / 2 - 0.2), 1.1, 0]}>
                  <boxGeometry args={[0.16, 0.7, length]} />
                  <meshStandardMaterial color={PALETTE.copper} flatShading metalness={0.6} roughness={0.35} />
                </mesh>
              </group>
            ))}
          </group>
        );
      })}

      {stagePositions.map((entry) => {
        const done = completedStages.has(entry.id);
        const reachable = isStageReachable(entry.id);
        return (
          <StageConsole
            key={entry.id}
            position={entry.position}
            done={done}
            reachable={reachable}
            isNext={entry.id === objectiveStageId && !done}
          />
        );
      })}
    </group>
  );
}

function StageConsole({
  position,
  done,
  reachable,
  isNext,
}: {
  position: [number, number, number];
  done: boolean;
  reachable: boolean;
  isNext: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  const glow = done ? PALETTE.turquoise : reachable ? PALETTE.coral : PALETTE.stoneDark;

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 1.6 + position[0] * 0.1) * 0.06;
    ref.current.scale.setScalar(pulse);
    ref.current.rotation.y = clock.elapsedTime * 0.35;
  });

  return (
    <group position={[position[0], 0, position[2]]}>
      {/* Authored plinth; the floating mark stays in code because it reacts to
          puzzle state and must be able to change colour. */}
      <Asset
        name="console"
        visible={!done}
        fallback={
          <mesh position={[0, 0.5, 0]} receiveShadow>
            <cylinderGeometry args={[1.5, 1.9, 1, 6]} />
            <meshStandardMaterial color={PALETTE.stone} flatShading roughness={0.9} />
          </mesh>
        }
      />
      {/* A tall shaft marks the current objective so it can be found by eye. */}
      {isNext && (
        <mesh position={[0, 13, 0]}>
          <cylinderGeometry args={[0.16, 0.3, 24, 6, 1, true]} />
          <meshBasicMaterial
            color={PALETTE.turquoise}
            transparent
            opacity={0.24}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
      <group ref={ref} position={[0, 2.1, 0]}>
        <mesh>
          <octahedronGeometry args={[0.72, 0]} />
          <meshStandardMaterial
            color={glow}
            flatShading
            emissive={glow}
            emissiveIntensity={done ? 0.9 : 0.45}
          />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.15, 0.07, 6, 20]} />
          <meshStandardMaterial color={PALETTE.copper} metalness={0.7} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------

function PlayerRig({
  state,
  cameraYaw,
  cameraPitch,
  enabled,
  reducedMotion,
  ...rest
}: {
  state: React.MutableRefObject<PlayerState>;
  cameraYaw: React.MutableRefObject<number>;
  cameraPitch: React.MutableRefObject<number>;
  enabled: boolean;
  reducedMotion: boolean;
  onInteract: () => void;
  onCycleTool: () => void;
  onPause: () => void;
  onReset: () => void;
  onHome: () => void;
}) {
  const mesh = usePlayerController(state, {
    cameraYaw,
    cameraPitch,
    reducedMotion,
    enabled,
    ...rest,
  });
  void mesh;
  return <Weaver state={state} />;
}

/**
 * The Weaver.
 *
 * Built from primitives but deliberately proportioned: roughly 1.85 units tall,
 * with a flared coat, a shoulder cape, a wide felt hat and the weaving staff,
 * so the silhouette reads as a travelling craftsperson from behind at any
 * camera distance rather than as a stack of boxes.
 */
/**
 * The Weaver.
 *
 * Plays one of four clips authored on a single rig in Blender, so the motion is
 * consistent: idle for standing, walk for travelling, run for sprinting, and a
 * short weight-shift for turning. Clips cross-fade on speed, so changing pace
 * never pops.
 */
/**
 * The adopted model is authored facing +Z, matching how the controller turns the
 * player, so no corrective rotation is needed.
 */
const CHARACTER_FACING_OFFSET = 0;

/** Shortest signed difference between two angles. */
function shortestAngle(delta: number): number {
  return Math.atan2(Math.sin(delta), Math.cos(delta));
}

function Weaver({ state }: { state: React.MutableRefObject<PlayerState> }) {
  const group = useRef<THREE.Group>(null);
  const gltf = useWeaverModel();
  // A ref, not state: the mixer identity can change between renders, and the
  // frame loop must always drive the one that is actually mounted.
  const rigRef = useRef(gltf);
  rigRef.current = gltf;
  const lastFacing = useRef(state.current.facing);
  const turnAmount = useRef(0);
  const turnSign = useRef(1);

  useFrame((_frame, rawDelta) => {
    const gltf = rigRef.current;
    if (!group.current) return;
    group.current.position.copy(state.current.position);
    group.current.rotation.y = state.current.facing + CHARACTER_FACING_OFFSET;

    if (import.meta.env.DEV) {
      const w = window as unknown as { __weaverFrame?: Record<string, unknown> };
      w.__weaverFrame = {
        frames: ((w.__weaverFrame?.frames as number) ?? 0) + 1,
        hasGltf: !!gltf,
        mixerTime: gltf ? +gltf.mixer.time.toFixed(3) : null,
        clips: gltf
          ? Object.fromEntries(
              Object.entries(gltf.actions).map(([k, a]) => [
                k,
                { w: +a.getEffectiveWeight().toFixed(2), t: +a.time.toFixed(2) },
              ]),
            )
          : null,
      };
    }
    if (!gltf) return;
    const delta = Math.min(rawDelta, 1 / 20);
    gltf.mixer.update(delta);

    // Pick a clip from real speed, then ease the weights towards it. Doing the
    // interpolation explicitly avoids relying on fadeIn/fadeOut scheduling,
    // which silently does nothing when an action is already at weight 0.
    const speed = state.current.speed;

    // Turning: signed change in facing, smoothed. It takes over while standing
    // or walking slowly, because at pace the stride already carries the turn.
    const facingDelta = shortestAngle(state.current.facing - lastFacing.current);
    lastFacing.current = state.current.facing;
    turnAmount.current += (Math.abs(facingDelta) - turnAmount.current) * Math.min(1, delta * 6);
    turnSign.current += (Math.sign(facingDelta) - turnSign.current) * Math.min(1, delta * 8);

    const turning = speed < 5.6 && turnAmount.current > 1.0;
    const target: LocomotionState = turning
      ? turnSign.current < 0
        ? 'turnLeft'
        : 'turnRight'
      : speed < 0.3
        ? 'idle'
        : speed < 5.6
          ? 'walk'
          : 'run';
    const ease = Math.min(1, delta * 9);

    for (const name of LOCOMOTION_STATES) {
      const clipName = CLIP_FOR_STATE[name];
      const action = gltf.actions[clipName];
      if (!action) continue;
      const desired = name === target ? 1 : 0;
      const next = action.getEffectiveWeight() + (desired - action.getEffectiveWeight()) * ease;
      action.setEffectiveWeight(next > 0.002 ? next : 0);
      action.enabled = next > 0.002;
    }
  });

  return (
    <group ref={group}>
      <Asset
        name="weaver"
        position={[0, CHARACTER_Y_OFFSET, 0]}
        scale={CHARACTER_SCALE}
        fallback={<ProceduralWeaver />}
      />
    </group>
  );
}

/**
 * Loads the rigged Weaver and prepares its animation mixer. Returns null when
 * the model cannot be loaded, in which case the caller renders the fallback.
 */
function useWeaverModel(): {
  mixer: THREE.AnimationMixer;
  actions: Record<string, THREE.AnimationAction>;
} | null {
  const gltf = useGLTF('/models/weaver.glb') as unknown as {
    scene: THREE.Group;
    animations: THREE.AnimationClip[];
  };

  return useMemo(() => {
    if (!gltf?.scene || !gltf.animations?.length) return null;
    const mixer = new THREE.AnimationMixer(gltf.scene);
    const actions: Record<string, THREE.AnimationAction> = {};

    for (const clip of gltf.animations) {
      const name = clip.name;
      if (!Object.values(CLIP_FOR_STATE).includes(name)) continue;
      const action = mixer.clipAction(clip);
      action.enabled = true;
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
      // Start every clip silent; the frame loop weights them by speed.
      action.setEffectiveWeight(0);
      action.play();
      actions[name] = action;
    }

    if (!actions[CLIP_FOR_STATE.idle]) return null;
    actions[CLIP_FOR_STATE.idle].setEffectiveWeight(1);


    gltf.scene.traverse((child: unknown) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.frustumCulled = false;
      }
    });

    return { mixer, actions };
  }, [gltf]);
}

/**
 * The primitive Weaver, used only when the authored Blender model cannot load.
 * The authored model carries its own walk cycle, so this fallback is static.
 */
function ProceduralWeaver() {
  const cloth = '#2f3c55';
  const clothLight = '#3d4d6b';
  const leather = '#6b4a33';
  const skin = '#d9b493';

  return (
    <group>
      {/* --- legs and boots --- */}
      <group position={[0.11, 0.72, 0]}>
        <mesh position={[0, -0.28, 0]} castShadow>
          <cylinderGeometry args={[0.075, 0.065, 0.56, 6]} />
          <meshStandardMaterial color="#232c40" flatShading roughness={0.9} />
        </mesh>
        <mesh position={[0, -0.6, 0.04]} castShadow>
          <boxGeometry args={[0.17, 0.13, 0.3]} />
          <meshStandardMaterial color={leather} flatShading roughness={0.8} />
        </mesh>
      </group>
      <group position={[-0.11, 0.72, 0]}>
        <mesh position={[0, -0.28, 0]} castShadow>
          <cylinderGeometry args={[0.075, 0.065, 0.56, 6]} />
          <meshStandardMaterial color="#232c40" flatShading roughness={0.9} />
        </mesh>
        <mesh position={[0, -0.6, 0.04]} castShadow>
          <boxGeometry args={[0.17, 0.13, 0.3]} />
          <meshStandardMaterial color={leather} flatShading roughness={0.8} />
        </mesh>
      </group>

      {/* --- coat: narrow at the waist, flaring to a hem --- */}
      <mesh position={[0, 0.98, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.44, 0.86, 9]} />
        <meshStandardMaterial color={cloth} flatShading roughness={0.86} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0.58, 0]} castShadow>
        <cylinderGeometry args={[0.445, 0.45, 0.1, 9]} />
        <meshStandardMaterial color={PALETTE.copper} flatShading metalness={0.45} roughness={0.5} />
      </mesh>

      {/* --- shoulders and cape --- */}
      <mesh position={[0, 1.44, 0]} castShadow>
        <sphereGeometry args={[0.26, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={clothLight} flatShading roughness={0.82} />
      </mesh>
      <mesh position={[0, 1.34, -0.03]} castShadow>
        <cylinderGeometry args={[0.27, 0.42, 0.42, 9, 1, true]} />
        <meshStandardMaterial
          color={PALETTE.ceramic}
          flatShading
          side={THREE.DoubleSide}
          roughness={0.92}
        />
      </mesh>

      {/* --- belt and satchel --- */}
      <mesh position={[0, 1.18, 0]} castShadow>
        <cylinderGeometry args={[0.27, 0.27, 0.1, 9]} />
        <meshStandardMaterial color={leather} flatShading roughness={0.75} />
      </mesh>
      <mesh position={[0.24, 1.06, -0.1]} rotation={[0, 0, 0.2]} castShadow>
        <boxGeometry args={[0.19, 0.24, 0.12]} />
        <meshStandardMaterial color={leather} flatShading roughness={0.8} />
      </mesh>

      {/* --- arms --- */}
      <mesh position={[0.27, 1.16, 0.02]} rotation={[0.1, 0, -0.16]} castShadow>
        <cylinderGeometry args={[0.055, 0.05, 0.52, 6]} />
        <meshStandardMaterial color={clothLight} flatShading roughness={0.85} />
      </mesh>
      <mesh position={[0.33, 0.86, 0.04]} rotation={[0.1, 0, -0.16]} castShadow>
        <cylinderGeometry args={[0.048, 0.044, 0.26, 6]} />
        <meshStandardMaterial color={skin} flatShading roughness={0.9} />
      </mesh>

      {/* --- neck, head, hat --- */}
      <mesh position={[0, 1.53, 0]} castShadow>
        <cylinderGeometry args={[0.065, 0.075, 0.12, 6]} />
        <meshStandardMaterial color={skin} flatShading roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.68, 0]} castShadow>
        <sphereGeometry args={[0.165, 12, 9]} />
        <meshStandardMaterial color={skin} flatShading roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.79, 0]} castShadow>
        <cylinderGeometry args={[0.42, 0.46, 0.05, 12]} />
        <meshStandardMaterial color="#7a5236" flatShading roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.88, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.19, 0.16, 12]} />
        <meshStandardMaterial color="#6b472e" flatShading roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.81, 0]}>
        <torusGeometry args={[0.175, 0.022, 5, 14]} />
        <meshStandardMaterial color={PALETTE.copper} metalness={0.6} roughness={0.4} />
      </mesh>

      {/* --- the weaving staff --- */}
      <group position={[0.34, 1.0, 0.06]} rotation={[0.14, 0, -0.13]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.035, 0.042, 2.5, 7]} />
          <meshStandardMaterial color={PALETTE.copper} metalness={0.78} roughness={0.26} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, 1.26, (i - 1) * 0.07]} rotation={[0, 0, 0.1]} castShadow>
            <boxGeometry args={[0.012, 0.3, 0.012]} />
            <meshStandardMaterial
              color={i === 1 ? PALETTE.turquoise : PALETTE.ceramic}
              emissive={i === 1 ? PALETTE.turquoise : '#000000'}
              emissiveIntensity={0.5}
              roughness={0.6}
            />
          </mesh>
        ))}
        <mesh position={[0, 1.42, 0]}>
          <octahedronGeometry args={[0.1, 0]} />
          <meshStandardMaterial
            color={PALETTE.turquoise}
            emissive={PALETTE.turquoise}
            emissiveIntensity={1.1}
          />
        </mesh>
        <mesh position={[0, -1.2, 0]}>
          <sphereGeometry args={[0.06, 8, 6]} />
          <meshStandardMaterial color={PALETTE.copperDark} metalness={0.7} roughness={0.35} />
        </mesh>
      </group>
    </group>
  );
}


/** Kıvılcım / Spark — a curious, sometimes mistaken mechanical companion. */
function Spark({
  companionTarget,
  reducedMotion,
}: {
  companionTarget: React.MutableRefObject<PlayerState>;
  reducedMotion: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const pos = useRef(new THREE.Vector3(1.6, 1.6, 14));

  useFrame(({ clock }, delta) => {
    if (!ref.current || !inner.current) return;
    const dt = Math.min(delta, 0.05);
    const target = companionTarget.current.position;
    const t = clock.elapsedTime;

    // Trail a little behind and above, bobbing gently like something alive.
    // Kept clear of the character's silhouette: beside and slightly ahead,
    // never inside the coat or the cape.
    const wanted = new THREE.Vector3(
      target.x + 1.45 + Math.sin(t * 0.6) * 0.18,
      target.y + 1.55 + (reducedMotion ? 0 : Math.sin(t * 1.25) * 0.18),
      target.z + 0.55,
    );
    pos.current.lerp(wanted, 1 - Math.exp(-2.4 * dt));
    ref.current.position.copy(pos.current);

    // Counter-rotate the body and let the rings spin on different axes, which
    // is what makes it read as a little mechanism rather than a ball.
    inner.current.rotation.y = t * 0.9;
    if (!reducedMotion) inner.current.rotation.z = Math.sin(t * 0.8) * 0.25;
  });

  return (
    <group ref={ref}>
      <group ref={inner}>
        {/* shell */}
        <mesh castShadow>
          <icosahedronGeometry args={[0.26, 0]} />
          <meshStandardMaterial
            color={PALETTE.coral}
            emissive="#8c2f1c"
            emissiveIntensity={0.5}
            flatShading
            roughness={0.35}
            metalness={0.25}
          />
        </mesh>
        {/* copper equatorial band and a polar cap, so it is not a bare sphere */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.28, 0.035, 5, 16]} />
          <meshStandardMaterial color={PALETTE.copper} metalness={0.75} roughness={0.28} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, Math.PI / 2]}>
          <torusGeometry args={[0.23, 0.025, 5, 14]} />
          <meshStandardMaterial color={PALETTE.glass} metalness={0.4} roughness={0.2} />
        </mesh>
        <mesh position={[0, 0.24, 0]}>
          <coneGeometry args={[0.11, 0.16, 6]} />
          <meshStandardMaterial color={PALETTE.copperDark} metalness={0.7} roughness={0.3} />
        </mesh>
        {/* the eye: the part that makes it feel attentive */}
        <mesh position={[0, 0.02, 0.24]}>
          <sphereGeometry args={[0.09, 10, 8]} />
          <meshStandardMaterial
            color="#fff3e0"
            emissive={PALETTE.turquoise}
            emissiveIntensity={1.4}
          />
        </mesh>
        <pointLight color={PALETTE.coral} intensity={2.2} distance={5.5} decay={2} />
      </group>
      {/* two small fins, like folded wings */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.26, -0.04, -0.04]} rotation={[0, 0, side * 0.5]}>
          <boxGeometry args={[0.16, 0.03, 0.2]} />
          <meshStandardMaterial color={PALETTE.glass} transparent opacity={0.65} roughness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

function useAudioLayers(restoredCount: number): void {
  useSparkAudio(restoredCount);
}

void input;