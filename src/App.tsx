import { useEffect, useState } from 'react';
import { GameCanvas } from './world/Scene';
import { PuzzlePanel } from './ui/PuzzlePanel';
import {
  EndingScreen,
  Hud,
  JournalScreen,
  PauseMenu,
  SettingsScreen,
  TitleScreen,
  TouchControls,
  useGlobalKeyHandlers,
} from './ui/Screens';
import { hydrateLang } from './i18n';
import { closeStage, setScreen, useGame } from './game/store';
import { input } from './game/input';
import { STAGE_BY_ID } from './game/stages';
import './styles.css';

/**
 * ILMEK — A World Rewoven / Yeniden Örülen Dünya
 *
 * App root: screen routing, the WebGL fallback, and the global input binding.
 */

function hasWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl');
    return Boolean(gl);
  } catch {
    return false;
  }
}

function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0)
  );
}

export default function App() {
  const game = useGame();
  const [webgl] = useState(() => hasWebGL());
  const [touch] = useState(() => isTouchDevice());

  // Language defaults to Turkish on a first visit and restores afterwards.
  useEffect(() => {
    hydrateLang();
  }, []);

  // Keep the document language in sync so assistive tech announces correctly.
  useEffect(() => {
    document.documentElement.lang = game.lang;
  }, [game.lang]);

  useGlobalKeyHandlers();

  useEffect(() => {
    input.enabled = game.screen === 'playing';
    if (game.screen !== 'playing') input.clearEdges();
  }, [game.screen]);

  useEffect(() => {
    input.attach();
    return () => input.detach();
  }, []);

  // Non-gameplay keyboard escape hatch, so the menus work without a pointer.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab') return;
      if (event.code === 'Escape') {
        event.preventDefault();
        const current = game.screen;
        if (current === 'playing') setScreen('paused');
        else if (current === 'paused' || current === 'journal' || current === 'settings') {
          setScreen('playing');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game.screen]);

  if (!webgl) {
    return (
      <div className="screen fatal">
        <div className="modal-card">
          <h1>ILMEK</h1>
          <h2>{game.lang === 'tr' ? 'WebGL bulunamadı' : 'WebGL is unavailable'}</h2>
          <p>
            {game.lang === 'tr'
              ? 'ILMEK 3B dünya için WebGL gerektirir. Güncel bir tarayıcı dene ve donanım hızlandırmanın açık olduğundan emin ol.'
              : 'ILMEK needs WebGL for the 3D world. Try a recent browser and make sure hardware acceleration is enabled.'}
          </p>
        </div>
      </div>
    );
  }

  // The console panel belongs to play only; menus take priority.
  const activeStage =
    game.screen === 'playing' && game.activeStageId ? STAGE_BY_ID[game.activeStageId] : null;

  return (
    <div className="app">
      <GameCanvas />

      {game.screen === 'playing' && <Hud />}
      {touch && game.screen === 'playing' && <TouchControls />}

      {/* Each screen is keyed so it remounts and its enter transition runs. */}
      {game.screen === 'title' && <TitleScreen key="title" />}
      {game.screen === 'paused' && <PauseMenu key="paused" />}
      {game.screen === 'journal' && <JournalScreen key="journal" />}
      {game.screen === 'settings' && <SettingsScreen key="settings" />}
      {game.screen === 'ending' && <EndingScreen key="ending" />}

      {activeStage && (
        <PuzzlePanel key={activeStage.id} stageId={activeStage.id} onClose={() => closeStage()} />
      )}

      {game.loadWarning && (
        <div className="load-warning" role="alert">
          {game.loadWarning === 'version'
            ? game.lang === 'tr'
              ? 'Kayıt farklı bir sürümde yazıldığı için yüklenmedi.'
              : 'The save was written by a different version and was not loaded.'
            : game.lang === 'tr'
              ? 'Kayıtlı yolculuk okunamadı, yenisi başlatıldı.'
              : 'The saved journey could not be read, so a fresh one was started.'}
        </div>
      )}
    </div>
  );
}