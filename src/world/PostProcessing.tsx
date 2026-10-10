import { lazy, Suspense, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Quality } from '../game/store';

/**
 * The post-processing stack.
 *
 * Everything here is a pass over the finished frame, so each one is also a
 * full-screen cost. They are ordered by what they buy per millisecond:
 * ambient occlusion first because it is the one that makes geometry read as
 * solid, then bloom for the emissive turquoise the restored world runs on,
 * then the two that are purely cosmetic.
 *
 * The whole module is loaded lazily. A player on the low tier never runs these
 * effects, so there is no reason for their phone to download the ~160 KB of
 * shader code behind them.
 */

const PostFX = lazy(() =>
  import('./PostFx').then((module) => ({ default: module.PostProcessing })),
);

export interface PostProcessingProps {
  quality: Quality;
}

/**
 * Hands tone mapping over to the composer.
 *
 * R3F sets `ACESFilmicToneMapping` on the renderer by default, which is right
 * for a direct-to-canvas render and wrong here: with a composer in the chain
 * the scene is written to an offscreen target first, and a renderer-side tone
 * map would compress the range *before* bloom reads it. Bloom then has nothing
 * above its threshold to find, because every bright value has already been
 * pulled down. The effect in `PostFx` is what actually maps the final frame.
 */
function RendererToneMappingOff() {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const previous = gl.toneMapping;
    gl.toneMapping = THREE.NoToneMapping;
    // Restored when the composer unmounts, so dropping back to the low tier
    // does not leave the scene untone-mapped.
    return () => {
      gl.toneMapping = previous;
    };
  }, [gl]);
  return null;
}

export function PostProcessing({ quality }: PostProcessingProps) {
  const enabled = quality !== 'low';

  if (!enabled) return null;

  return (
    <>
      <RendererToneMappingOff />
      {/* The chunk arrives a beat after the world does. Renders nothing until
          then, so the first frames are simply unprocessed rather than blank. */}
      <Suspense fallback={null}>
        <PostFX quality={quality} />
      </Suspense>
    </>
  );
}