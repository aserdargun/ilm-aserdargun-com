import * as THREE from 'three';

/**
 * The ground's large-scale value structure: what the two-unit tiled maps cannot
 * carry.
 *
 * The tiled normal and roughness maps repeat every two world units, which puts
 * everything they contain below the scale at which a surface reads as having
 * form. Per-vertex colour is the only other lever the ground has, and HSL
 * lightness offsets run out of room well before the surface stops looking flat —
 * the doubled mottling in `ground-tone.ts` reaches about plus or minus 3 luma
 * levels on a surface that occupies 59% of the opening frame. So the structure
 * has to come from a map of its own, sampled in world space.
 */

/**
 * World units spanned by one repeat of the macro variation map.
 *
 * The number is a constraint, not a taste. The largest island is 92 units
 * across, so a 180-unit period means no island can contain enough of the field
 * to show the seam — and the eight islands sit 100 to 340 units apart, so each
 * one samples a different part of the same map instead of repeating a pattern.
 */
export const GROUND_MACRO_PERIOD = 180;

/**
 * How hard the macro field is allowed to push the ground's brightness.
 *
 * Swept against the real noise map rather than against the four-sine probe the
 * term replaced, on the hub's warm sand and on a blue-grey island, at 200px
 * cells:
 *
 * | amplitude | cell std | median luma | crushed pixels |
 * | --- | --- | --- | --- |
 * | 0.45 | 6.19% | 129.3 | 0.00% |
 * | 0.62 | 7.15% | 126.8 | 0.00% |
 * | 0.85 | 7.81% | 124.2 | 0.00% |
 *
 * The point is in the last two columns together. Structure rises by a quarter
 * while the median barely moves, so this is spatial variation and not a tonal
 * shift; and nothing crushes — at 0.85 the multiplier can still fall to 0.15 on
 * the darkest corner of the map, and not one sand pixel lands below luma 12.
 * Past 0.85 the map's own tails start doing the work instead of its structure,
 * which is where visible staining would start.
 *
 * It is worth saying what this does *not* do. Applied symmetrically in linear
 * space it comes out about 4 luma levels darker on screen, because the tone
 * curve compresses highlights harder than it lifts shadows; that asymmetry is
 * expected and is left alone rather than compensated.
 */
export const GROUND_MACRO_AMPLITUDE = 0.85;

const MACRO_FLAG = 'ilmekGroundMacro';

interface MacroUniforms {
  amp: { value: number };
  period: { value: number };
}

/**
 * Multiplies the ground's diffuse by the macro field.
 *
 * The varying is world-space rather than the geometry's own UVs because every
 * disc is built at the origin and moved by its group. UVs are local, so eight
 * islands sharing one field would each read the same patch; world XZ puts them
 * 100 to 340 units apart in the map instead.
 *
 * `needsUpdate` matters as much as the patch itself: without it a material that
 * was already compiled never recompiles, and this looks exactly like a change
 * that silently did nothing.
 *
 * The period and the amplitude are arguments because the field has to be
 * sampled at the scale of the surface it is on. The ground's period is 180
 * units because the largest island is 92 across; a bridge span is 84 units
 * long, so a field that coarse cannot vary across one at all, and the deck
 * needs the same map at a third of the period.
 *
 * Any `onBeforeCompile` already on the material is kept and called as well.
 * The stone detail in `detail.ts` patches the same hook, and the two used to
 * overwrite each other — whichever ran last won, and which one that was
 * depended on the order the scene happened to be built in.
 *
 * **Calling this twice on one material is not an error, and must not be.**
 * The ground attaches it to a `<meshStandardMaterial>` through a ref callback,
 * which React calls again whenever the callback's identity changes — so the
 * same material was patched repeatedly. Overwriting `onBeforeCompile` hid
 * that; chaining it does not, and a second application declares the same
 * varying and the same uniforms twice, which does not compile. So the patch
 * is installed once and later calls only move the numbers.
 */
export function patchGroundMacro(
  material: THREE.MeshStandardMaterial,
  map: THREE.Texture,
  period: number = GROUND_MACRO_PERIOD,
  amplitude: number = GROUND_MACRO_AMPLITUDE,
): void {
  const installed = material.userData[MACRO_FLAG] as
    | { uniforms: MacroUniforms }
    | undefined;

  if (installed) {
    // Already patched: just move the numbers, and let the shared uniform
    // objects carry them into the program.
    installed.uniforms.amp.value = amplitude;
    installed.uniforms.period.value = period;
    material.needsUpdate = true;
    return;
  }

  const uniforms: MacroUniforms = {
    amp: { value: amplitude },
    period: { value: period },
  };
  material.userData[MACRO_FLAG] = { uniforms };

  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (previous) previous.call(material, shader, renderer);
    shader.uniforms.uGroundMacro = { value: map };
    shader.uniforms.uGroundMacroAmp = uniforms.amp;
    shader.uniforms.uGroundMacroPeriod = uniforms.period;

    shader.vertexShader = `varying vec2 vGroundMacro;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vGroundMacro = (modelMatrix * vec4(transformed, 1.0)).xz;`,
    );

    shader.fragmentShader = `
      varying vec2 vGroundMacro;
      uniform sampler2D uGroundMacro;
      uniform float uGroundMacroAmp;
      uniform float uGroundMacroPeriod;
    ${shader.fragmentShader}`.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       float groundMacro = texture2D(uGroundMacro, vGroundMacro / uGroundMacroPeriod).r;
       diffuseColor.rgb *= 1.0 + uGroundMacroAmp * (groundMacro * 2.0 - 1.0);`,
    );
  };
  material.needsUpdate = true;
}