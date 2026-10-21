/**
 * Hide the interface so the ground can be looked at.
 *
 * The dialogue box sits exactly over the Weaver's feet in the resting
 * framing, so any artefact on the ground under her is hidden by the very
 * element that names it. This removes the overlay nodes and leaves the scene.
 */

const removed = [];
for (const el of document.querySelectorAll('body *')) {
  const style = getComputedStyle(el);
  if (style.position === 'fixed' || style.position === 'absolute') {
    const tag = el.tagName.toLowerCase();
    if (tag === 'canvas') continue;
    // Only the interface chrome, not the scene's own overlay containers.
    if (el.querySelector('canvas')) continue;
    removed.push(el);
    el.style.display = 'none';
  }
}
await new Promise((r) => setTimeout(r, 400));
return { hidden: removed.length };
