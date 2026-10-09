import { useEffect, useMemo, useRef, useState } from 'react';
import { APPLICATIONS } from '../catalog/applications';
import { REGIONS, REGION_BY_ID } from '../catalog/regions';
import { STAGE_BY_ID } from '../game/stages';
import { termsFor } from '../game/terms';
import { objectivePosition } from '../game/objective';
import {
  advanceSpark,
  clearNotice,
  continueGame,
  hasSave,
  resetStage,
  setLanguage,
  setScreen,
  setTool,
  setTargetedStage,
  startNewGame,
  updateSettings,
  useGame,
  useT,
} from '../game/store';
import { LANGS, type RegionId } from '../types/catalog';
import { audio, applyAudioSettings } from '../game/audio';
import { input, isTouchDevice, rescaleDeadZone } from '../game/input';

// ---------------------------------------------------------------------------
// Title
// ---------------------------------------------------------------------------

export function TitleScreen() {
  const t = useT();
  const lang = useGame().lang;
  const [canContinue] = useState(() => hasSave());

  return (
    <div className="screen title-screen">
      <div className="title-inner">
        <h1 className="brand">ILMEK</h1>
        <p className="descriptor">
          {lang === 'tr' ? 'Yeniden Örülen Dünya' : 'A World Rewoven'}
        </p>
        <p className="tagline">{t('brand.tagline')}</p>

        <LanguageSwitch />

        <nav className="menu">
          {canContinue && (
            <button
              type="button"
              className="btn primary big"
              onClick={() => {
                audio.start();
                continueGame();
              }}
            >
              {t('menu.continue')}
            </button>
          )}
          <button
            type="button"
            className={`btn big ${canContinue ? '' : 'primary'}`}
            onClick={() => {
              audio.start();
              startNewGame();
            }}
          >
            {t('menu.newGame')}
          </button>
          <button
            type="button"
            className="btn big"
            onClick={() => {
              audio.start();
              setScreen('journal');
            }}
          >
            {t('menu.journal')}
          </button>
          <button type="button" className="btn big" onClick={() => setScreen('settings')}>
            {t('menu.settings')}
          </button>
        </nav>

        <ControlLegend />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

/** How long the region-restored notice stays up. */
const NOTICE_MS = 4000;

export function Hud() {
  const game = useGame();
  const t = useT();
  const lang = game.lang;
  const sparkLine = game.sparkLine;

  /**
   * Drain the speech queue.
   *
   * A timer rather than a render-time check, because the store only holds one
   * visible line: without something asking it to advance, the bubble showed one
   * sentence and silently discarded everything Spark had queued behind it.
   */
  useEffect(() => {
    if (!sparkLine) return;
    const duration = Math.min(
      9000,
      Math.max(2600, sparkLine.text.length * 34),
    );
    const timer = window.setTimeout(() => advanceSpark(), duration);
    return () => window.clearTimeout(timer);
  }, [sparkLine]);

  /**
   * Dismiss the HUD notice on a timer.
   *
   * This used to be a `Date.now()` comparison inside render, which means the
   * notice never left on its own — it only disappeared the next time anything
   * else caused a re-render. The store now owns the dismissal.
   */
  useEffect(() => {
    if (!game.notice) return;
    const timer = window.setTimeout(() => clearNotice(), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [game.notice]);

  const objective = objectivePosition(game.progression);
  const objectiveText = objective
    ? (STAGE_BY_ID[objective.stageId]?.objective[lang] ?? t('ending.title'))
    : t('ending.title');

  const tools = ['connect', 'reveal', 'preview', 'decide'] as const;
  const unlocked = tools.filter((tool) =>
    tool === 'connect' ? true : game.progression.unlockedTools.includes(tool),
  );

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="hud-objective">
          <span className="hud-label">{t('hud.objective')}</span>
          <span>{objectiveText}</span>
          {objective && (
            <Compass
              target={objective}
              destinationRegion={STAGE_BY_ID[objective.stageId]?.region ?? 'hub'}
              lang={lang}
            />
          )}
        </div>
        <div className="hud-actions">
          <button
            type="button"
            className="btn tiny"
            onClick={() => setScreen('journal')}
            aria-label={t('hud.journal')}
          >
            {t('hud.journal')}
          </button>
          <button
            type="button"
            className="btn tiny"
            onClick={() => setScreen('settings')}
            aria-label={t('hud.pause')}
          >
            {t('hud.pause')}
          </button>
          <LanguageSwitch compact />
        </div>
      </div>

      <div className="hud-bottom">
        <div className="hud-tools" role="group" aria-label={t('hud.tool')}>
          {tools.map((tool) => {
            const isUnlocked = unlocked.includes(tool);
            return (
              <button
                key={tool}
                type="button"
                className={`tool ${game.tool === tool ? 'tool-active' : ''}`}
                disabled={!isUnlocked}
                title={isUnlocked ? t(`tool.${tool}.desc`) : t('tool.locked')}
                onClick={() => setTool(tool)}
              >
                {t(`tool.${tool}.name`)}
              </button>
            );
          })}
        </div>

        {game.targetedStageId && (
          <div className="prompt" role="status" aria-live="polite">
            <kbd>E</kbd>
            <span>{STAGE_BY_ID[game.targetedStageId]?.title[lang]}</span>
            <span className="muted"> — {STAGE_BY_ID[game.targetedStageId]?.prompt[lang]}</span>
          </div>
        )}
      </div>

      {sparkLine && (
        <div className="speech" role="status">
          <strong>{lang === 'tr' ? 'Kıvılcım:' : 'Spark:'}</strong> {sparkLine.text}
        </div>
      )}

      {game.notice && (
        <div className="notice" role="status">
          {t(game.notice.key)}
        </div>
      )}
    </div>
  );
}

/**
 * Wayfinding: a compass needle that points at the current objective, with the
 * straight-line distance and the region it lives in. Screen-relative, so it
 * works whichever way the camera is facing.
 */
function Compass({
  target,
  destinationRegion,
  lang,
}: {
  target: { x: number; z: number };
  destinationRegion: string;
  lang: 'tr' | 'en';
}) {
  const player = useGame().save.player;
  const dx = target.x - player.x;
  const dz = target.z - player.z;
  const distance = Math.hypot(dx, dz);

  // The camera yaw lives in the 3D layer; derive the bearing from the player's
  // stored facing, which tracks the camera direction closely enough for a hint.
  const bearing = Math.atan2(dx, dz) - playerYawFallback();
  const degrees = (bearing * 180) / Math.PI;

  // The destination's region, not the player's: "180 m, Cartographer's Terrace"
  // is the useful reading.
  const regionName =
    REGION_BY_ID[destinationRegion as keyof typeof REGION_BY_ID]?.name[lang] ?? '';

  return (
    <div className="compass" aria-label={`${Math.round(distance)} m`}>
      <span className="compass-needle" style={{ transform: `rotate(${degrees}deg)` }}>
        ▲
      </span>
      <span className="compass-meta">
        <strong>{Math.round(distance)} m</strong>
        <span className="muted">{regionName}</span>
      </span>
    </div>
  );
}

/**
 * The player's last known facing, refreshed by the store. Falls back to zero
 * before the first movement.
 */
let lastKnownFacing = 0;
export function reportPlayerFacing(facing: number): void {
  lastKnownFacing = facing;
}
function playerYawFallback(): number {
  return lastKnownFacing;
}

export function PauseMenu() {
  const t = useT();
  return (
    <div className="screen modal" key="pause">
      <div className="modal-card">
        <h2>{t('menu.paused')}</h2>
        <LanguageSwitch />
        <nav className="menu">
          <button type="button" className="btn primary big" onClick={() => setScreen('playing')}>
            {t('menu.resume')}
          </button>
          <button type="button" className="btn big" onClick={() => setScreen('journal')}>
            {t('menu.journal')}
          </button>
          <button type="button" className="btn big" onClick={() => setScreen('settings')}>
            {t('menu.settings')}
          </button>
          <button
            type="button"
            className="btn big"
            onClick={() => {
              if (confirm(t('menu.confirmNewGame'))) {
                startNewGame();
              }
            }}
          >
            {t('menu.newGame')}
          </button>
          <button type="button" className="btn big" onClick={() => setScreen('title')}>
            {t('menu.back')}
          </button>
        </nav>
      </div>
    </div>
  );
}

export function SettingsScreen() {
  const t = useT();
  const game = useGame();
  const { settings } = game;

  useEffect(() => {
    applyAudioSettings(settings.master, settings.music, settings.muted);
  }, [settings.master, settings.music, settings.muted]);

  return (
    <div className="screen modal" key="settings">
      <div className="modal-card">
        <h2>{t('settings.title')}</h2>

        <section>
          <h3>{t('settings.language')}</h3>
          <LanguageSwitch />
        </section>

        <section>
          <h3>{t('settings.audio')}</h3>
          <label>
            {t('settings.master')}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.master}
              onChange={(e) => updateSettings({ master: Number(e.target.value) })}
            />
          </label>
          <label>
            {t('settings.music')}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.music}
              onChange={(e) => updateSettings({ music: Number(e.target.value) })}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={settings.muted}
              onChange={(e) => updateSettings({ muted: e.target.checked })}
            />
            {t('settings.muted')}
          </label>
        </section>

        <section>
          <h3>{t('settings.graphics')}</h3>
          <label>
            {t('settings.quality')}
            <select
              value={settings.quality}
              onChange={(e) =>
                updateSettings({ quality: e.target.value as typeof settings.quality })
              }
            >
              <option value="low">{t('settings.qualityLow')}</option>
              <option value="medium">{t('settings.qualityMedium')}</option>
              <option value="high">{t('settings.qualityHigh')}</option>
            </select>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={settings.reducedMotion}
              onChange={(e) => updateSettings({ reducedMotion: e.target.checked })}
            />
            <span>
              {t('settings.motion')}
              <span className="muted"> — {t('settings.motionDesc')}</span>
            </span>
          </label>
        </section>

        <nav className="menu">
          <button type="button" className="btn primary" onClick={() => setScreen('playing')}>
            {t('menu.back')}
          </button>
        </nav>
      </div>
    </div>
  );
}

export function JournalScreen() {
  const t = useT();
  const game = useGame();
  const lang = game.lang;
  const [region, setRegion] = useState<RegionId | 'all'>('all');

  const entries = useMemo(
    () => (region === 'all' ? APPLICATIONS : APPLICATIONS.filter((a) => a.region === region)),
    [region],
  );

  const found = game.progression.discoveredApps.length;
  const percent = Math.round((found / APPLICATIONS.length) * 100);

  return (
    <div className="screen modal" key="journal">
      <div className="modal-card wide">
        <div className="journal-head">
          <h2>{t('journal.title')}</h2>
          <div className="journal-count">
            <span className="ring" style={{ ['--p' as string]: percent }}>
              <span>{percent}%</span>
            </span>
            <span>
              {found}/{APPLICATIONS.length} {t('journal.discovered')}
            </span>
          </div>
        </div>

        <div className="journal-filters" role="group" aria-label={t('journal.filterAll')}>
          <button
            type="button"
            className={`btn tiny ${region === 'all' ? 'tool-active' : ''}`}
            onClick={() => setRegion('all')}
          >
            {t('journal.filterAll')}
          </button>
          {REGIONS.filter((r) => r.id !== 'hub').map((r) => (
            <button
              key={r.id}
              type="button"
              className={`btn tiny ${region === r.id ? 'tool-active' : ''}`}
              onClick={() => setRegion(r.id)}
            >
              {r.name[lang]}
            </button>
          ))}
        </div>

        <ul className="journal-list">
          {entries.map((entry) => {
            const isFound = game.progression.discoveredApps.includes(entry.slug);
            return (
              <li key={entry.code} className={`journal-entry ${isFound ? 'found' : 'locked'}`}>
                <header>
                  <span className="code">{entry.code}</span>
                  <h3>{entry.name[lang]}</h3>
                  {isFound && <span className="pill pill-ok">{t('journal.discovered')}</span>}
                </header>
                {isFound ? (
                  <>
                    <p>
                      <strong>{t('journal.concept')}</strong>
                      {entry.shortConcept[lang]}
                    </p>
                    <p>
                      <strong>{t('journal.inWorld')}</strong>
                      {entry.mechanic[lang]}
                    </p>
                    <p>
                      <strong>{t('journal.entry')}</strong>
                      {entry.discovery[lang]}
                    </p>
                    <p>
                      <strong>{t('puzzle.solved')}</strong>
                      {entry.completionCondition[lang]}
                    </p>
                    <div className="journal-terms">
                      <strong>{t('journal.vocabulary')}</strong>
                      <dl className="vocab">
                        {termsFor(entry.code).map((term) => (
                          <div className="vocab-item" key={term.term}>
                            <dt>{term.term}</dt>
                            <dd>
                              {term.meaning[lang]}
                              <span className="vocab-world">{term.inWorld[lang]}</span>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                    <a
                      className="source-link"
                      href={entry.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('journal.openSource')} ↗
                      <span className="muted"> ({t('journal.sourceWarning')})</span>
                    </a>
                  </>
                ) : (
                  <p className="muted">{t('journal.locked')}</p>
                )}
              </li>
            );
          })}
        </ul>

        <nav className="menu">
          <button
            type="button"
            className="btn primary"
            onClick={() => setScreen(game.screen === 'title' ? 'title' : 'playing')}
          >
            {t('menu.back')}
          </button>
        </nav>
      </div>
    </div>
  );
}

export function EndingScreen() {
  const t = useT();
  const game = useGame();
  const lang = game.lang;
  return (
    <div className="screen ending">
      <div className="modal-card">
        <h1 className="brand">{t('ending.title')}</h1>
        <p className="ending-body">{t('ending.body')}</p>
        <p className="muted">
          {t('ending.restored')}: {game.progression.completedRegions.length}/{REGIONS.length - 1}
        </p>
        <h3>{t('ending.credits')}</h3>
        <p className="muted">{t('ending.creditsBody')}</p>
        <ul className="credit-list">
          {APPLICATIONS.map((a) => (
            <li key={a.code}>
              <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer">
                {a.code} — {a.name[lang]}
              </a>
            </li>
          ))}
        </ul>
        <nav className="menu">
          <button type="button" className="btn primary" onClick={() => setScreen('playing')}>
            {t('ending.keepExploring')}
          </button>
        </nav>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const lang = useGame().lang;
  return (
    <div
      className={`lang-switch ${compact ? 'compact' : ''}`}
      role="group"
      aria-label={t('a11y.langSwitch')}
    >
      {LANGS.map((option) => (
        <button
          key={option}
          type="button"
          className={lang === option ? 'active' : ''}
          onClick={() => setLanguage(option)}
          aria-pressed={lang === option}
        >
          {option === 'tr' ? 'TR' : 'EN'}
        </button>
      ))}
    </div>
  );
}

function ControlLegend() {
  const t = useT();
  const touch = isTouchDevice();
  const rows = touch
    ? [
        [t('onboard.moveBody'), t('onboard.move')],
        [t('onboard.lookBody'), t('onboard.look')],
        [t('onboard.sprintBody'), t('onboard.sprint')],
        [t('onboard.interactBody'), t('onboard.interact')],
        [t('onboard.homeBody'), t('onboard.home')],
      ]
    : [
        ['W A S D', t('onboard.move')],
        ['Drag', t('onboard.look')],
        ['E', t('onboard.interact')],
        ['Space', t('onboard.jump')],
        ['Q', t('onboard.tool')],
        ['H', t('onboard.home')],
        ['R', t('puzzle.reset')],
        ['Esc', t('hud.pause')],
      ];
  return (
    <ul className="legend">
      {rows.map(([key, label]) => (
        <li key={label}>
          {touch ? (
            <span>
              <strong>{label}</strong> — {key}
            </span>
          ) : (
            <>
              <kbd>{key}</kbd>
              <span>{label}</span>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Touch controls: two thumb sticks, a held sprint button and three action
 * buttons. Only mounted when the device actually reports touch, so desktop is
 * untouched.
 *
 * The left stick walks and the right stick turns the camera, each anchored to
 * the corner its thumb actually rests in. Sprint sits in the bottom band between
 * them, close enough to the walking stick to hold with the same thumb. The action
 * buttons stack above the camera stick, out of the arc it needs to sweep.
 */
export function TouchControls() {
  const t = useT();
  const [sprinting, setSprinting] = useState(false);
  // Both sticks can be under a thumb at once, so each needs its own owner, but
  // one ref holds both: a stick is identified by name in the handlers below.
  const sticks = useRef<Record<string, number | null>>({ move: null, look: null });

  useEffect(() => {
    // A thumb still down as the player pauses must not leave the character
    // sprinting, or the camera still turning, on the way into the menu.
    return () => input.releaseTouch();
  }, []);

  /*
   * Pointer capture means every later event for this finger still targets the
   * stick, so a thumb that slides off the ring — or a pointer iOS cancels for
   * an incoming call — still delivers its release. Without it the intent stays
   * pushed over and the Weaver keeps walking on its own.
   */
  const stickHandlers = (name: string, apply: (x: number, y: number) => void) => ({
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      sticks.current[name] = e.pointerId;
      // Reported before the capture, and never allowed to throw, so the stick
      // still responds even where capture is refused.
      applyStick(e.currentTarget, e.clientX, e.clientY, apply);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* capture is an improvement here, not a requirement */
      }
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (sticks.current[name] !== e.pointerId) return;
      applyStick(e.currentTarget, e.clientX, e.clientY, apply);
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      if (sticks.current[name] !== e.pointerId) return;
      sticks.current[name] = null;
      releaseCapture(e.currentTarget, e.pointerId);
      centreStick(e.currentTarget, apply);
    },
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => {
      sticks.current[name] = null;
      releaseCapture(e.currentTarget, e.pointerId);
      centreStick(e.currentTarget, apply);
    },
  });

  return (
    <div className="touch-layer">
      <div
        className="stick stick-move"
        {...stickHandlers('move', (x, y) => input.setStick(x, y))}
      >
        <div className="stick-knob" />
      </div>

      <div
        className="stick stick-look"
        {...stickHandlers('look', (x, y) => input.setLookStick(x, y))}
      >
        <div className="stick-knob" />
      </div>

      <button
        type="button"
        className={`touch-btn sprint-btn${sprinting ? ' is-active' : ''}`}
        aria-label={t('onboard.sprint')}
        aria-pressed={sprinting}
        onPointerDown={(e) => {
          e.preventDefault();
          setSprinting(true);
          input.setSprint(true);
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* capture only guarantees the release event arrives here */
          }
        }}
        onPointerUp={releaseSprint(setSprinting)}
        onPointerCancel={releaseSprint(setSprinting)}
        onLostPointerCapture={releaseSprint(setSprinting)}
      >
        <span className="touch-btn-glyph" aria-hidden="true">
          »
        </span>
        <span className="touch-btn-caption">{t('onboard.sprint')}</span>
      </button>

      <div className="touch-buttons">
        <button
          type="button"
          className="touch-btn touch-btn-interact"
          aria-label={t('onboard.interact')}
          onPointerDown={(e) => {
            e.preventDefault();
            input.queueAction('interact');
          }}
        >
          <span className="touch-btn-glyph" aria-hidden="true">
            E
          </span>
        </button>
        <button
          type="button"
          className="touch-btn touch-btn-jump"
          aria-label={t('onboard.jump')}
          onPointerDown={(e) => {
            e.preventDefault();
            input.jump();
          }}
        >
          <span className="touch-btn-glyph" aria-hidden="true">
            ↑
          </span>
          <span className="touch-btn-caption">{t('onboard.jump')}</span>
        </button>
        <button
          type="button"
          className="touch-btn"
          aria-label={t('onboard.home')}
          onPointerDown={(e) => {
            e.preventDefault();
            input.home();
          }}
        >
          <span className="touch-btn-glyph" aria-hidden="true">
            ⌂
          </span>
          <span className="touch-btn-caption">{t('onboard.homeShort')}</span>
        </button>
      </div>
    </div>
  );
}

/** Releasing sprint clears both the input state and the rendered state. */
function releaseSprint(setSprinting: (value: boolean) => void) {
  return () => {
    input.setSprint(false);
    setSprinting(false);
  };
}

function releaseCapture(node: HTMLElement, pointerId: number): void {
  if (node.hasPointerCapture(pointerId)) node.releasePointerCapture(pointerId);
}

/**
 * Turn a pointer offset from the stick centre into an intent, and move the
 * visible knob to match. Without the knob offset the stick still steers but
 * gives no travel feedback, so a diagonal drag looks identical to no drag.
 *
 * Screen y grows downward, so a push upward is inverted to a positive intent,
 * matching the keyboard convention. The knob is drawn in screen space, so it
 * keeps the un-inverted sign.
 */
function applyStick(
  stick: HTMLElement,
  clientX: number,
  clientY: number,
  apply: (x: number, y: number) => void,
): void {
  const rect = stick.getBoundingClientRect();
  const max = rect.width / 2;
  const dx = clientX - (rect.left + max);
  const dy = clientY - (rect.top + max);
  const length = Math.hypot(dx, dy);
  // A resting thumb still reports a pixel or two of drift; anything inside the
  // dead zone reads as centred rather than walking the character off on its own.
  const magnitude = rescaleDeadZone(Math.min(1, length / Math.max(1, max)));

  if (magnitude === 0) {
    centreStick(stick, apply);
    return;
  }
  const nx = dx / length;
  const ny = dy / length;
  apply(nx * magnitude, -ny * magnitude);
  const travel = magnitude * max;
  stick.style.setProperty('--knob-x', `${(nx * travel).toFixed(1)}px`);
  stick.style.setProperty('--knob-y', `${(ny * travel).toFixed(1)}px`);
}

/** Drops the intent and returns the knob, without reading the layout again. */
function centreStick(stick: HTMLElement, apply: (x: number, y: number) => void): void {
  apply(0, 0);
  stick.style.setProperty('--knob-x', '0px');
  stick.style.setProperty('--knob-y', '0px');
}

/** Reset handler wired from the 3D player's R key. */
export function useGlobalKeyHandlers(): void {
  useEffect(() => {
    const onPause = () => setScreen('paused');
    const onReset = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === 'string') {
        resetStage(detail);
        setTargetedStage(null);
      }
    };
    window.addEventListener('ilm:pause', onPause);
    window.addEventListener('ilm:reset-stage', onReset);
    return () => {
      window.removeEventListener('ilm:pause', onPause);
      window.removeEventListener('ilm:reset-stage', onReset);
    };
  }, []);
}

