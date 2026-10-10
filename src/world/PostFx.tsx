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
      // The canvas already antialiases; a multisampled composer target would
      // pay for it twice.
      multisampling={0}
      enableNormalPass
    >
      <N8AO
        // N8AO is a group pass rather than an effect: it composites its own
        // occlusion into the frame and takes no blendFunction, so there is
        // nothing to configure beyond its sampling.
        aoRadius={2.2}
        aoSamples={full ? 16 : 8}
        distanceFalloff={1.0}
        screenSpaceRadius={false}
        // AO is a low-frequency term — it darkens creases and contact points —
        // so sampling it at half resolution is indistinguishable on the medium
        // tier and costs a quarter as much.
        halfRes={!full}
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
      {full ? <SMAA /> : <></>}
    </EffectComposer>
  );
}