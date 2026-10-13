import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, KernelSize, ToneMappingMode } from 'postprocessing';
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
      <Vignette offset={0.28} darkness={0.62} blendFunction={BlendFunction.NORMAL} />
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