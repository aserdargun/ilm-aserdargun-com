import { describe, expect, it } from 'vitest';
import {
  CAMERA_FAR,
  CAMERA_REACH,
  MIST_HAZE_RAMP,
  MIST_LIFT,
  MIST_SCALE,
  MIST_WISP,
  SKY_DOME_RADIUS,
  SKY_FRAGMENT_SHADER,
  SKY_VERTEX_SHADER,
  WORLD_REACH,
  staticDomeReach,
} from '../src/world/sky-dome';
import { REGIONS } from '../src/catalog/regions';

/**
 * The sky dome had two faults that no unit test could see, because both of
 * them were numbers rather than behaviour.
 *
 * **It was clipped by the far plane.** The dome is a sphere of 760 units
 * standing on the world origin, and the camera's far plane was 900. Those two
 * numbers agree only while the camera is standing on the origin, and the
 * player never does. The farthest island is 249.3 units away once the
 * camera's reach behind the player is counted, so the dome's far side sits
 * at 1009.3 units — past the far plane, and therefore not drawn.
 *
 * What that looked like is not a thin seam. Measured at the valley, looking
 * towards the hub, the dome's surface along the view axis sits at 958.1
 * units against a 900 far plane, and the sky carries a black cap with a
 * faceted edge where the far plane cut it — the flat scene background showing
 * through a hole in the backdrop.
 *
 * The repair that was tried first and rejected was to move the dome with the
 * camera, so that its distance from the lens is a constant. It fixes the
 * clip and empties the sky: the sky is a function of the *direction* of each
 * vertex, so re-anchoring the dome moves every cloud cell, and at the hub the
 * sky's upper corners fell from 37.7 to 21.4 luma with the cloud banks going
 * with them. The far plane was raised instead, which changes no pixels.
 *
 * **The lower half of it was one flat colour.** The gradient saturates at the
 * horizon, so the void under the islands had no content. Measured on a bridge
 * crossing, that flat field was 32% of the frame at a local luminance
 * standard deviation of 0.17 — quantisation, not image.
 *
 * These tests pin the geometry, which is the part that can be checked without
 * a renderer, and they pin the shape of the shader that fixed the second one.
 */

/** The far plane the world shipped with, before the dome was measured. */
const SHIPPED_FAR_PLANE = 900;

describe('the sky dome and the far plane', () => {
  it('knows how far the camera can get from the world origin', () => {
    // The valley is the outlier: 197.6 from the origin, plus its 44-unit
    // radius, plus the camera's reach behind the player.
    expect(WORLD_REACH).toBeGreaterThan(245);
    expect(WORLD_REACH).toBeLessThan(255);
    expect(WORLD_REACH).toBe(
      Math.max(
        ...REGIONS.map(
          (r) => Math.hypot(r.anchor[0], r.anchor[2]) + r.radius + CAMERA_REACH,
        ),
      ),
    );
  });

  it('would have been clipped by the far plane the world shipped with', () => {
    // The known positive. With the far plane at 900 the dome's far side did
    // not fit, at any island but the hub's — which is why the bug only ever
    // showed up away from the middle of the world.
    expect(staticDomeReach(0)).toBeLessThan(SHIPPED_FAR_PLANE);
    expect(staticDomeReach(WORLD_REACH)).toBeGreaterThan(SHIPPED_FAR_PLANE);
  });

  it('fits inside the far plane now', () => {
    expect(staticDomeReach(WORLD_REACH)).toBeLessThan(CAMERA_FAR);
  });

  it('is inside the far plane at every island the player can stand on', () => {
    for (const region of REGIONS) {
      const distance = Math.hypot(region.anchor[0], region.anchor[2]);
      const reach = distance + region.radius + CAMERA_REACH;
      expect(staticDomeReach(reach)).toBeLessThan(CAMERA_FAR);
    }
  });

  it('leaves real headroom rather than clearing the plane by a hair', () => {
    // A dome that only just fitted would fail again the moment the radius or
    // the far plane moved.
    expect(CAMERA_FAR - staticDomeReach(WORLD_REACH)).toBeGreaterThan(50);
  });

  it('does not move the dome, because moving it empties the sky', () => {
    // The dome stands on the world origin and each vertex is read as a
    // direction from the camera. A dome that rode with the camera would fix
    // the clip and re-anchor every cloud cell, which is a visible change to
    // the sky for no gain. Pinned so the next person does not "improve" it
    // back.
    expect(SKY_VERTEX_SHADER).toContain('modelMatrix');
    expect(SKY_VERTEX_SHADER).toContain('world - cameraPosition');
  });

  it('keeps the dome outside everything the player can see', () => {
    // The other side of the same number: the dome has to be *behind* the
    // world, or the islands would poke through the sky.
    expect(SKY_DOME_RADIUS).toBeGreaterThan(WORLD_REACH * 2);
  });
});

describe('the mist below the horizon', () => {
  it('adds structure below the horizon rather than mixing a colour over it', () => {
    // The lift is additive so the gaps between the banks keep the void's own
    // tone. Mixed in, the whole void becomes one pale wash — which is the
    // flat field the mist was added to replace.
    expect(SKY_FRAGMENT_SHADER).toContain('colour += uGlow');
    expect(SKY_FRAGMENT_SHADER).not.toMatch(/colour\s*=\s*mix\(colour,\s*mist/);
  });

  it('has a mist that is actually on', () => {
    // A mist amplitude of zero would leave the void exactly as flat as it was,
    // and would look like a working change while doing nothing.
    expect(MIST_LIFT).toBeGreaterThan(0);
    expect(MIST_WISP).toBeGreaterThan(0);
    expect(MIST_SCALE).toBeGreaterThan(0);
    expect(MIST_HAZE_RAMP).toBeGreaterThan(0);
  });

  it('resolves the noise finely enough to make banks rather than one cell', () => {
    // The first attempt was 0.0055, which put the whole visible void inside
    // a single cell of the noise and left it flat. The scale is now chosen so
    // the coordinate runs to several cells across the void.
    expect(MIST_SCALE).toBeGreaterThanOrEqual(0.01);
  });

  it('keeps the mist out of the sky', () => {
    // The mist is below the horizon and the clouds above it. If the two
    // overlapped, the sky would gain a second, lower cloud layer.
    expect(SKY_FRAGMENT_SHADER).toContain('if (d.y < 0.0)');
  });

  it('leaves the sky above the horizon exactly as it was', () => {
    // The mist must not touch the cloud layer, the sun, or the ridge. If it
    // did, the sky above the horizon would change as well — which is a
    // different claim from "the void below it gained structure".
    const mist = SKY_FRAGMENT_SHADER.slice(
      SKY_FRAGMENT_SHADER.indexOf('if (d.y < 0.0)'),
    );
    expect(mist).not.toContain('cloudUv');
    expect(mist).not.toContain('farBand');
    expect(mist).not.toContain('uSunColour');
  });

  it('reaches the shader as floats, because an integer will not compile', () => {
    // GLSL ES 1.00 has no implicit `int` to `float` conversion on the left of
    // an operator. An integer constant interpolated into `26 / max(down, 0.02)`
    // fails to compile, and a shader that does not compile does not draw:
    // the whole dome stops rendering and the sky becomes the flat scene
    // background, with nothing in the console but a repeated warning.
    //
    // So the invariant is simple and absolute: no bare integer literal may
    // appear in the shader body. Every number is written with a decimal
    // point, which is what GLSL will accept in a float expression.
    expect(bareIntegers(SKY_FRAGMENT_SHADER)).toEqual([]);
  });

  it('keeps the vertex shader free of the same trap', () => {
    expect(bareIntegers(SKY_VERTEX_SHADER)).toEqual([]);
  });
});

/**
 * Every integer literal in a shader, with comments and float literals removed.
 *
 * The float literals have to go first: `1.0` contains the digit `1`, and a
 * naive scan for digits would report every number in the shader.
 */
function bareIntegers(source: string): string[] {
  const body = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/\d+\.\d+/g, ' ');
  return body.match(/\b\d+\b/g) ?? [];
}
