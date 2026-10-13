import type { Group } from 'three';

/**
 * Where the Weaver stands, and whether a loaded scene may be duplicated.
 *
 * Both of these are plain data decisions about the character, kept out of
 * `Models.tsx` so they can be asserted without pulling React and the renderer
 * into a unit test. Two separate bugs lived here, and both were invisible to
 * every other check in the repo.
 */

/**
 * The Weaver's scale.
 *
 * The model is 3.00 units tall from the soles to the hat; 0.6 brings that to
 * 1.80 world units, the height the silhouette was designed around.
 */
export const CHARACTER_SCALE = 0.6;

/**
 * The Weaver's vertical offset, in model-local units, and it is zero.
 *
 * The reason it is *not* 0.7 is the reason this comment exists. The lowest raw
 * `POSITION` value in `weaver.glb` is y = -1.16, which reads like the feet
 * until the node hierarchy is walked: that vertex belongs to `Plane.030`, a cape
 * whose geometry hangs below its own bone. Composed through the rig, the soles
 * of `Cube.153`/`Cube.154` already sit at y = 0 exactly. Lifting by 0.7 —
 * chosen from that raw minimum — floated the character 0.7 units above the
 * ground for as long as it stood there, with its shadow cast correctly on the
 * floor a metre below its boots.
 *
 * `tests/character.test.ts` reads the GLB and recomputes this from the rig, so
 * the number cannot drift back without the test failing.
 */
export const CHARACTER_Y_OFFSET = 0;

/**
 * The scene an `<Asset>` should render: a private copy, unless it is rigged.
 *
 * The copy exists to give every placement of a landmark its own transform tree.
 * A rigged model is the one case where it cannot work, because
 * `SkinnedMesh.copy` hands the clone the *source's* `Skeleton`: the clone's own
 * bone tree is never touched, while `Skeleton.update` reads `bone.matrixWorld`
 * off the source's bones. The source scene is not in the render graph, so
 * nothing calls `updateMatrixWorld` on those bones and they stay frozen in the
 * bind pose no matter what the mixer writes into their local transforms. The
 * clone then skins every vertex against a stale and internally inconsistent
 * bone frame — the Weaver rendered as its hat, torso, arms and staff floating
 * apart in mid-air above a perfectly correct shadow.
 *
 * Skipping the clone is safe only because the one rigged model in this world is
 * placed exactly once. A rigged GLB placed twice would need a real skeleton
 * clone (`SkeletonUtils.clone`), not this.
 */
export function instanceFor(scene: Group): Group {
  let rigged = false;
  scene.traverse((child: unknown) => {
    if ((child as { isSkinnedMesh?: boolean }).isSkinnedMesh) rigged = true;
  });
  return rigged ? scene : scene.clone(true);
}