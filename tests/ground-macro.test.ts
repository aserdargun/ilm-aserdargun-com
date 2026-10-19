import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  GROUND_MACRO_AMPLITUDE,
  GROUND_MACRO_PERIOD,
  patchGroundMacro,
} from '../src/world/ground-macro';

/**
 * The macro field multiplies a surface's diffuse by a noise map sampled in
 * world space. It is installed through `onBeforeCompile`, the same hook the
 * stone detail in `detail.ts` uses, and the two used to overwrite each other:
 * whichever ran last won, and which one that was depended on the order the
 * scene happened to be built in.
 *
 * Chaining them fixes that and opens a different door. The ground attaches the
 * macro to a `<meshStandardMaterial>` through a ref callback, which React
 * calls again whenever the callback's identity changes — so the same material
 * is patched repeatedly. A second application declares the same varying and
 * the same uniforms twice, and the shader does not compile:
 *
 * > ERROR: 0:82: 'vGroundMacro' : redefinition
 *
 * So the patch has to be installable more than once without installing twice.
 */
describe('the macro field', () => {
  const material = () =>
    new THREE.MeshStandardMaterial({ color: '#c9b79a', roughness: 0.9 });
  const map = () => {
    const texture = new THREE.Texture();
    return texture;
  };

  it('installs the patch once, however many times it is called', () => {
    const target = material();
    const texture = map();
    patchGroundMacro(target, texture);
    const installed = target.onBeforeCompile;
    patchGroundMacro(target, texture);
    patchGroundMacro(target, texture);
    expect(target.onBeforeCompile).toBe(installed);
  });

  it('keeps a patch that was already on the material', () => {
    // The stone detail patches the same hook. If the macro overwrites it,
    // the landmarks lose their grain; if it drops it silently, the surfaces
    // that carry both lose one of them.
    const target = material();
    let called = false;
    const existing = () => {
      called = true;
    };
    target.onBeforeCompile = existing;
    patchGroundMacro(target, map());
    target.onBeforeCompile(
      { uniforms: {}, vertexShader: '', fragmentShader: '' } as never,
      {} as never,
    );
    expect(called).toBe(true);
  });

  it('moves the numbers when it is asked for a different scale', () => {
    // The ground's field is sampled at a 180-unit period because the largest
    // island is 92 across. A bridge span is 84 units long, so the deck needs
    // the same map at a third of the period — and asking twice must not
    // install a second copy of the patch to say so.
    const target = material();
    const texture = map();
    patchGroundMacro(target, texture, GROUND_MACRO_PERIOD, GROUND_MACRO_AMPLITUDE);
    patchGroundMacro(target, texture, 80, 0.55);
    const uniforms = target.userData.ilmekGroundMacro.uniforms;
    expect(uniforms.period.value).toBe(80);
    expect(uniforms.amp.value).toBe(0.55);
  });

  it("defaults to the ground's own scale", () => {
    const target = material();
    patchGroundMacro(target, map());
    const uniforms = target.userData.ilmekGroundMacro.uniforms;
    expect(uniforms.period.value).toBe(GROUND_MACRO_PERIOD);
    expect(uniforms.amp.value).toBe(GROUND_MACRO_AMPLITUDE);
  });
});
