import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  MIRROR_GLASS_COLOR,
  MIRROR_METAL_COLOR,
  MIRROR_ROUGHNESS,
  applyMirrorFrameMaterial,
  applyMirrorMaterial,
} from '../src/world/mirror-material';

/**
 * The Observer's Mirrors' panels were a hole in the frame, and three
 * separate things had to be true for them to read as mirrors. All three were
 * false, and each of them is a property of the material rather than of the
 * model, so each one can be pinned here.
 *
 * The model was wrong in the same way: the lenses were never turned to face
 * the test scene they are built to look at, and the lens plate was placed
 * *inside* its own 0.35-unit frame — 658 pixels of a five-million-pixel
 * frame showed it at all. That part is fixed in `tools/blender/landmarks.py`
 * and cannot be pinned from here, because the geometry is baked into the GLB
 * when Blender builds it.
 */
describe('the mirror panels', () => {
  const glass = () =>
    new THREE.MeshStandardMaterial({ color: '#8fb8c8', metalness: 0.1, roughness: 0.12 });

  it('is a metal, because a dielectric is black under a night sky', () => {
    // At 10% metallic, 90% of the panel's response is a diffuse term, and
    // the sky it is lit by is the darkest thing in the world. The panels came
    // out the darkest thing on the island, and the island is named after
    // them.
    const material = applyMirrorMaterial(glass(), null);
    expect(material.metalness).toBe(1);
  });

  it('is opaque, because 42% alpha is a smear over whatever is behind it', () => {
    const material = applyMirrorMaterial(glass(), null);
    expect(material.transparent).toBe(false);
    expect(material.opacity).toBe(1);
  });

  it('is polished, so it reflects rather than blurs', () => {
    const material = applyMirrorMaterial(glass(), null);
    expect(material.roughness).toBe(MIRROR_ROUGHNESS);
    expect(MIRROR_ROUGHNESS).toBeLessThan(0.2);
  });

  it('reflects the probe it is given', () => {
    const probe = new THREE.Texture();
    const material = applyMirrorMaterial(glass(), probe);
    expect(material.envMap).toBe(probe);
  });

  it('survives having no probe at all', () => {
    // The probe is built from the renderer, which is not available in a test.
    const material = applyMirrorMaterial(glass(), null);
    expect(material.envMap).toBeNull();
    expect(material.metalness).toBe(1);
  });

  it('keeps a cool tint, because a mirror tints what it reflects', () => {
    const material = applyMirrorMaterial(glass(), null);
    expect('#' + material.color.getHexString()).toBe(MIRROR_GLASS_COLOR);
  });

  it('leaves the frame dark, because a bright edge is a sticker not a mirror', () => {
    const material = new THREE.MeshStandardMaterial({ color: '#696f7e' });
    applyMirrorFrameMaterial(material);
    expect('#' + material.color.getHexString()).toBe(MIRROR_METAL_COLOR);
    // The frame is still a metal; only the lens became one.
    expect(material.metalness).toBe(0);
  });
});
