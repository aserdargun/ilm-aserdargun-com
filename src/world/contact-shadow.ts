import * as THREE from 'three';

/**
 * A soft contact shadow: a patch of ground that is darker under an object
 * than beside it, fading to nothing at its rim.
 *
 * **Why this exists, and why it is not a shadow map.** The low tier drops the
 * shadow map, and with it goes the only thing that said a rock was resting
 * on the sand rather than hovering over it. The README measures the gap: the
 * character's own shadow is worth **6.08 luma** on the sand at the low tier,
 * and about thirty scattered rocks, tufts and pebbles sit on the sand
 * touching nothing.
 *
 * Turning the shadow map back on for the low tier is the one thing this
 * project cannot price: the tier drops shadows *because* a 2048 map on a
 * phone is not affordable, and nothing here can measure a phone's frame time.
 *
 * A contact shadow is not a shadow map. It is one instanced, blended quad per
 * object — no depth pass, no second render of the scene, no 2048×2048
 * buffer — so it costs a fraction of what the tier has already given up, and
 * it restores the one thing that giving it up broke.
 *
 * **It multiplies rather than covers.** Blending a black patch over the
 * ground makes a hole in it; a shadow is the ground with the sun taken out
 * of it, which is the ground's own colour at a fraction of the brightness.
 * So the patch is drawn with `MultiplyBlending` and it carries the
 * *multiplier*: the rim is 1.0 — untouched ground — and the middle is the
 * measured fraction.
 */

/**
 * How much of the sun the contact shadow takes away where it is darkest.
 *
 * Measured against the high tier, which is the reference: the shadow map
 * there is the thing this is imitating, so the number comes from the same
 * spot on the same sand with the same sun.
 */
export const CONTACT_SHADOW_STRENGTH = 0.55;

/**
 * How wide the patch is, as a multiple of the object's own half-width.
 *
 * **The patch has to be wider than the object, or there is no patch.** A rock
 * is an icosahedron of radius one scaled by its size, so a rock of scale
 * 0.5 has a radius of 0.5 units; a patch of half-width 0.675 × 0.5 = 0.34
 * units is *inside* the rock, and a shadow that is entirely under the thing
 * it is shadowing is not a shadow. It is invisible, which is what it was:
 * measured on the running build, the boulders' patches darkened **no pixel
 * by more than four luma** and the boulders sat on bare sand, while the high
 * tier's boulders cast a shadow worth **50 luma** at its edge.
 *
 * The margin is what the eye reads: the ground just outside the object's
 * base is where "resting on the sand" is said, and the margin is the width
 * over which that reading fades out.
 */
export const CONTACT_SHADOW_SPREAD = 1.5;

/**
 * The fraction of the patch's radius that is flat.
 *
 * **The dark part is a plateau, not a cone.** A cone is darkest at the
 * centre — which is under the object, where nobody can see it — and fades
 * from there, so all of its darkness is spent where it does not show and the
 * visible margin is left almost untouched.
 *
 * So the multiplier holds its lowest value out to the object's own edge and
 * ramps to 1.0 across the margin: the dark is where it can be seen, and it
 * stops exactly where the ground is untouched.
 *
 * The core is the object's edge as a fraction of the patch's radius, which
 * is 1 / the spread: the two are one decision, not two.
 */
export const CONTACT_SHADOW_CORE = 1 / CONTACT_SHADOW_SPREAD;

/**
 * The falloff, in the shader rather than in vertex colours.
 *
 * **A vertex-colour falloff cannot hold this shape.** The plateau and the
 * ramp need several rings of vertices to be a curve at all: on an eight-by-
 * eight grid the ramp falls across one and a third of a segment, and the
 * colours come out *non-monotonic* — dark, light, dark, light — which draws
 * a zigzag ring around every object. Measured on the running build, that
 * ring was 3,851 pixels of hard edge across the rock field, each one a step
 * of up to 52 luma between neighbours.
 *
 * In the shader the radius is a number per pixel, so the falloff is a curve
 * and the rim is exactly 1.0. It is also cheaper: the patch is two
 * triangles instead of four hundred and eighty-one vertices, and three
 * hundred and fourteen of them are drawn at once.
 */
const CONTACT_SHADOW_VERTEX_SHADER = /* glsl */ `
  varying vec2 vLocal;

  void main() {
    // The plane lies in XZ, so these are the two in-plane coordinates.
    vLocal = position.xz;
    vec3 transformed = vec3( position );
    #include <project_vertex>
  }
`;

const CONTACT_SHADOW_FRAGMENT_SHADER = /* glsl */ `
  uniform float uStrength;
  uniform float uCore;

  varying vec2 vLocal;

  void main() {
    // The plane is one unit across, so its half-width is 0.5 and the rim is
    // at a radius of 1.
    float r = min( 1.0, length( vLocal ) * 2.0 );
    // The plateau, then the ramp out to nothing at the rim.
    float t = clamp( ( r - uCore ) / ( 1.0 - uCore ), 0.0, 1.0 );
    float ramp = t * t * ( 3.0 - 2.0 * t );
    // The multiplier itself. The rim is exactly 1.0, which is the whole
    // point: a multiplier of one is a no-op, and a patch that ends in a
    // no-op has no edge.
    float k = 1.0 - uStrength * ( 1.0 - ramp );
    gl_FragColor = vec4( k, k, k, 1.0 );
    // The multiplier is a fraction of the light, and the ground it lands on
    // is in the framebuffer's own encoding, so the multiplier has to be in
    // that encoding too: a linear half is an sRGB 0.74, not a 0.5. Without
    // this the patch takes away twice as much as it says it does, and the
    // rim — one, which the transfer leaves alone — still ends in a no-op.
    #include <colorspace_fragment>
  }
`;

/**
 * A unit patch in the XZ plane.
 *
 * Two triangles: the shape of the patch is in the shader, not in the mesh.
 */
export function contactShadowGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  // The plane is built in XY; a contact shadow lies on the ground.
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/**
 * The material a contact shadow is drawn with.
 *
 * `MultiplyBlending` is the point of the whole thing: the patch multiplies
 * the ground it lies on, so the ground keeps its own colour and loses only
 * the sun's share of it. It writes no depth, so it never occludes anything,
 * and it is drawn after the ground because it is transparent.
 */
export function contactShadowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uStrength: { value: CONTACT_SHADOW_STRENGTH },
      uCore: { value: CONTACT_SHADOW_CORE },
    },
    vertexShader: CONTACT_SHADOW_VERTEX_SHADER,
    fragmentShader: CONTACT_SHADOW_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.MultiplyBlending,
    // **Required, and not optional.** three.js refuses `MultiplyBlending`
    // without it and falls back to normal blending, loudly — in a console
    // error, repeated every frame, and easy to miss in a wall of warnings.
    // The symptom is a patch that renders as an opaque white square instead
    // of a darkening, because normal blending with a white source and an
    // alpha of one *is* an opaque white square.
    premultipliedAlpha: true,
    depthWrite: false,
    // The multiplier is written to the framebuffer as it is, and the rim has
    // to arrive there as exactly 1.0. A shader's output is not tone-mapped
    // or colour-converted unless the shader asks for it, which is what makes
    // the rim a true no-op; this flag says so out loud.
    toneMapped: false,
  });
}
