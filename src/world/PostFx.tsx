import { useEffect, useRef } from 'react';
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, KernelSize, ToneMappingMode } from 'postprocessing';
import type { BloomEffect, VignetteEffect } from 'postprocessing';
import type { Quality } from '../game/store';

/**
 * The effect chain, split into its own chunk.
 *
 * Loaded lazily by `PostProcessing.tsx` so that the low tier — which renders
 * none of this — never pays to download it.
 *
 * The effects are ordered by what they buy per millisecond: ambient occlusion
 * first, because it is the one that makes geometry read as solid; then bloom,
 * for the emissive turquoise the restored world runs on; then the two that are
 * purely cosmetic.
 */
export function PostProcessing({ quality }: { quality: Quality }) {
  // High gets the full stack; medium keeps occlusion and drops the rest, which
  // is where the visual/cost ratio falls off a cliff.
  const full = quality === 'high';

  // Dev-only handles on the effect instances.
  //
  // The parameters in this file are all numbers somebody chose, and until now
  // there was no way to ask the renderer what any of them actually did. That is
  // how the ground's normal map spent its life looking inert: nobody could reach
  // the one uniform that controlled it. A bloom threshold of 0.72 is either
  // catching the emissive turquoise the chain exists for, or catching nothing at
  // all, and the difference is one measurement away.
  const bloom = useRef<BloomEffect>(null);
  const vignette = useRef<VignetteEffect>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __postfx?: unknown };
    w.__postfx = {
      get bloom() { return bloom.current; },
      get vignette() { return vignette.current; },
      quality,
    };
  }, [quality]);

  return (
    <EffectComposer
      // Measured, not assumed. The reason this was left at 0 was "the canvas
      // already antialiases, so a multisampled target pays twice" — and the
      // premise is wrong: with a composer the scene is rendered into an
      // offscreen target and the canvas backbuffer's MSAA never touches it, so
      // the composer is the only place edge antialiasing can come from. The
      // decision still came out the same, for different reasons, priced at
      // 3840x2160 on the medium tier: multisampling 0 -> 67.4 FPS, 4 -> 41.5.
      // MSAA costs 38% of the frame rate to move 0.93% of static pixels by
      // more than 4/255, and it is that number, not the comment's reasoning,
      // that the medium tier is running without it on. See "The medium tier has
      // no antialiasing, and buying it back is not worth the frame" in the
      // README.
      multisampling={0}
      enableNormalPass
    >
      <N8AO
        // N8AO is a group pass rather than an effect: it composites its own
        // occlusion into the frame and takes no blendFunction, so there is
        // nothing to configure beyond its sampling.
        aoRadius={2.2}
        aoSamples={16}
        distanceFalloff={1.0}
        screenSpaceRadius={false}
        // Full resolution on every tier. It was halved outside high on the
        // reasoning that AO is a low-frequency term, priced against a build
        // that was frame-bound. The deployed build is refresh-bound (every tier
        // pinned to 120 Hz, worst frame 9.4-10.4 ms), so that price no longer
        // applies -- and contact darkening is precisely the term that shows up
        // as a hard contact edge, which is the half-resolution pass cannot
        // resolve. Measured on production before and after; see "Occlusion was
        // halved for a frame-bound build" in the README.
        halfRes={false}
        intensity={1.6}
      />
      <Bloom
        ref={bloom}
        // A high threshold so only the emissive accents bloom. Dropping it
        // starts blooming the sunlit stone, which reads as haze rather than
        // as light sources.
        intensity={full ? 0.62 : 0.42}
        luminanceThreshold={0.72}
        luminanceSmoothing={0.22}
        mipmapBlur
        radius={0.72}
        kernelSize={KernelSize.LARGE}
      />
      {/* Owns the tone response, because the renderer's was switched off in
          `PostProcessing.tsx` to keep bloom working on real HDR values. */}
      <ToneMapping mode={ToneMappingMode.AGX} />
      {/* 0.42, down from 0.62, and the number is a consequence rather than a
          preference. Pulling the environment probe back to 0.6 darkened the
          whole scene, and the vignette multiplies whatever it is given — so a
          value calibrated when the ambient fill was twice as strong started
          driving the corners onto the floor. Measured by radius: at 0.62 the
          outer fifth of the frame, 13.2% of its area, carried 1.96% of its
          pixels at or below 2/255, against 0.001% in the 60-80% ring. Those
          were almost all vignette, not shadow: with the darkness at zero and
          the lighting untouched, the same corners fell to 0.996%.

          0.42 lifts mean corner brightness from 47.8 to 61.3 without removing
          the effect — below about 0.3 the corners stop responding and the
          remaining dark is the geometry actually standing in them, so turning
          it down further would spend the vignette for nothing. */}
      <Vignette ref={vignette} offset={0.28} darkness={0.42} blendFunction={BlendFunction.NORMAL} />
      {/* High only, and the gap is deliberate. The medium tier renders this
          composer with no edge antialiasing at all, and the two ways to buy it
          back were both measured at a fixed camera: SMAA costs 7.4% of the
          frame rate (67.4 -> 62.4 FPS) and removes 8.6% of the hard silhouette
          steps while barely touching the ground texture (-0.8%). MSAA costs
          five times that. High is the tier where the money is worth spending. */}
      {/* Every tier, not just high. Measured on the deployed build, the medium
          tier was pinned to the 120 Hz refresh with a worst frame of 10.3 ms, so
          there is frame budget here that the old table -- taken when the scene
          was frame-bound and this read as unaffordable -- did not know about.
          Cost is 7.4% at 3840x2160; the question is whether the shipped buffer
          can absorb it, and that is only answerable on production, where the
          dev-only __ilm hook is not walking the scene graph every frame and
          swamping a difference this small. */}
      <SMAA />
    </EffectComposer>
  );
}