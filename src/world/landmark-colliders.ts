/**
 * Landmark collider radii.
 *
 * Lives in its own module because `Scene.tsx` touches `window` at module scope and
 * therefore cannot be imported by a node test, while these numbers are the thing
 * the tests are about.
 */

// Landmark footprints.
//
// These used to be a round 6-9.5 with the note "radii match the built
// structures", and they did not: the built structures were measured from
// their own vertices in the height band a player can walk under (0.4-4.0),
// keeping only surfaces carrying real area rather than a beam's handful of
// points. Five of the eight landmarks turned out to have a raised platform
// far wider than the ring meant to keep the player out of it:
//
// | landmark | old | measured | object | vertices |
// | --- | --- | --- | --- | --- |
// | cartographers-terrace | 9 | 15.2 | terrace | 240 |
// | collective-gardens | 8 | 15.0 | terrace0 | 180 |
// | memory-council-city | 9.5 | 14.3 | podium_3 | 72 |
// | observers-mirrors | 7 | 13.2 | plinth001 | 72 |
// | valley-living-machines | 6.5 | 12.8 | pump | 432 |
//
// The Cartographer's Terrace is the one confirmed by pixels rather than by
// geometry. Its platform surface sits at y=1.70 while the player's feet are
// at y=0, so between radius 9 and radius 15.2 there was a ring the player
// could stand in with the terrace over their head: the character mesh
// reported visible and projected to a screen position where the pixels were
// bare sand. Teleporting to radius 12 landed exactly where asked, un-pushed,
// which is the same fact in one number — collision considered the spot free.
//
// Widening a collider is safe when nothing the player needs is inside it,
// and that was checked rather than assumed. `buildStagePositions()` is
// `anchor + stage.offset`, so the console positions are plain data: every
// stage on all eight islands already sits outside these rings, the tightest
// by 0.03 units (the terrace consoles at 15.23 and 15.62 against a platform
// of 15.2). That 0.03 is also the cross-check on the measurement — the
// offset was clearly chosen to land just clear of the terrace, so the
// terrace really is 15.2 wide. With `INTERACT_RANGE` at 5.2 and the consoles
// a further 1.9-radius collider each, every one stays reachable from outside.
//
// The hub, the Flow Foundry and the Adaptation Workshop measured no raised
// platform at all in that band, so they keep their radii rather than being
// grown to a number nothing was measured against.
export const LANDMARK_RADII: Record<string, number> = {
  hub: 3.4,
  'cartographers-terrace': 15.2,
  'flow-foundry': 7,
  'memory-council-city': 14.3,
  'adaptation-cloud-harbor': 7.5,
  'collective-gardens': 15,
  'observers-mirrors': 13.2,
  'valley-living-machines': 12.8,
};
