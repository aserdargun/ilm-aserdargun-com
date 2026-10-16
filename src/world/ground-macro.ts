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
 * Measured by applying it to the material at runtime and screenshotting the same
 * frame three times: the 200px cell standard deviation of the sand went 3.72% at
 * zero, 4.40% at 0.28 and 4.82% at 0.45, and the applied modulation reached
 * plus or minus 15 luma levels. Zero to 0.45 is roughly 30%, which is about
 * three times what the vertex mottling can reach at any amplitude.
 *
 * It is worth saying what this does *not* do. Applied symmetrically in linear
 * space it comes out about 4 luma levels darker on screen, because the tone
 * curve compresses highlights harder than it lifts shadows; that asymmetry is
 * expected and is left alone rather than compensated.
 */
export const GROUND_MACRO_AMPLITUDE = 0.45;

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
 */
export function patchGroundMacro(
  material: THREE.MeshStandardMaterial,
  map: THREE.Texture,
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGroundMacro = { value: map };
    shader.uniforms.uGroundMacroAmp = { value: GROUND_MACRO_AMPLITUDE };
    shader.uniforms.uGroundMacroPeriod = { value: GROUND_MACRO_PERIOD };

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