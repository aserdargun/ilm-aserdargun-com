import { useCallback, useMemo, useState } from 'react';
import {
  commitStage,
  dismissHint,
  patchStageState,
  raiseHint,
  resetStage,
  useGame,
  useT,
} from '../game/store';
import { buildScene, cellTruths, evaluateStage, initialStageState } from '../game/puzzleRuntime';
import { STAGE_BY_ID, type StageDefinition, type StageRuntimeState } from '../game/stages';
import { audio } from '../game/audio';
import type { Lang } from '../types/catalog';
import type { TranslationKey } from '../i18n/en';

/** Bound translator supplied by the store, so panels never read globals. */
type TFn = (key: TranslationKey) => string;

/**
 * Puzzle panel: one screen, six interaction models.
 *
 * Each system gets its own controls, but they all read and write the same
 * serializable stage state, so a puzzle in progress survives a reload and a
 * language switch alike.
 */

export function PuzzlePanel({ stageId, onClose }: { stageId: string; onClose: () => void }) {
  const game = useGame();
  const t = useT();
  const stage = STAGE_BY_ID[stageId];
  const state = game.stageStates[stageId] ?? (stage ? initialStageState(stage) : undefined);

  // Hooks run unconditionally; only the rendering below depends on the data.
  const set = useCallback(
    (patch: Partial<StageRuntimeState>) => patchStageState(stageId, patch),
    [stageId],
  );

  const onApply = useCallback(() => {
    const solved = commitStage(stageId);
    if (solved) {
      audio.chime();
      onClose();
    }
  }, [stageId, onClose]);

  if (!stage || !state) return null;

  const evaluation = evaluateStage(stage, state);
  const complete = game.progression.completedStages.includes(stageId);
  const lang = game.lang;

  return (
    <div className="panel-scrim" role="dialog" aria-modal="true" aria-label={stage.title[lang]}>
      <div className="panel">
        <header className="panel-head">
          <div>
            <p className="panel-system">{stage.system}</p>
            <h2>{stage.title[lang]}</h2>
            <p className="panel-objective">{stage.objective[lang]}</p>
          </div>
          <button type="button" className="btn ghost" onClick={onClose} aria-label={t('menu.close')}>
            ✕
          </button>
        </header>

        {complete && (
          <p className="panel-solved" role="status">
            ✓ {t('puzzle.solved')}
          </p>
        )}

        <div className="panel-body">
          <SystemControls stage={stage} state={state} set={set} lang={lang} t={t} />
        </div>

        {!evaluation.solved && evaluation.failures.length > 0 && (
          <p className="panel-hintline" role="status">
            {failureMessage(evaluation.failures, lang)}
          </p>
        )}

        <footer className="panel-foot">
          <HintRow stageId={stageId} stage={stage} lang={lang} />
          <div className="panel-actions">
            <button type="button" className="btn ghost" onClick={() => resetStage(stageId)}>
              {t('puzzle.reset')}
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={onApply}
              disabled={!evaluation.solved}
            >
              {t('puzzle.apply')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type SetFn = (patch: Partial<StageRuntimeState>) => void;

function SystemControls({
  stage,
  state,
  set,
  lang,
  t,
}: {
  stage: StageDefinition;
  state: StageRuntimeState;
  set: SetFn;
  lang: Lang;
  t: TFn;
}) {
  switch (stage.system) {
    case 'connection':
      return <ConnectionControls stage={stage} state={state} set={set} lang={lang} t={t} />;
    case 'placement':
      return <PlacementControls stage={stage} state={state} set={set} lang={lang} t={t} />;
    case 'allocation':
      return <AllocationControls stage={stage} state={state} set={set} lang={lang} t={t} />;
    case 'perception':
      return <PerceptionControls stage={stage} state={state} set={set} lang={lang} t={t} />;
    case 'evidence':
      return <EvidenceControls stage={stage} state={state} set={set} lang={lang} t={t} />;
    case 'prediction':
      return <PredictionControls stage={stage} state={state} set={set} lang={lang} t={t} />;
  }
}

const LENS_KEY = {
  edge: 'lens.edge',
  depth: 'lens.depth',
  motion: 'lens.motion',
} as const satisfies Record<string, TranslationKey>;

const COUNCIL_KEY = {
  proceed: 'council.proceed',
  abstain: 'council.abstain',
  block: 'council.block',
} as const satisfies Record<string, TranslationKey>;

interface ControlProps {
  stage: StageDefinition;
  state: StageRuntimeState;
  set: SetFn;
  lang: Lang;
  t: TFn;
}

// --- Connection ------------------------------------------------------------

function ConnectionControls({ stage, state, set, lang, t }: ControlProps) {
  const data = stage.data as {
    scouts?: { id: string; kind: string }[];
    seals?: { id: string; kind: string }[];
    routes?: { id: string; accepts: string }[];
    targets?: { id: string; accepts: string }[];
    links?: [string, string][];
  };

  // Two shapes share this system: wiring two named endpoints together (the
  // opening channel), and matching sources to targets by kind (everything else).
  if (data.links) return <LinkNodes stage={stage} state={state} set={set} lang={lang} t={t} />;

  return <MatchNodes stage={stage} state={state} set={set} />;
}

/** Matching sources onto targets by kind — every system except the opening. */
function MatchNodes({ stage, state, set }: { stage: StageDefinition; state: StageRuntimeState; set: SetFn }) {
  const lang = useGame().lang;
  const data = stage.data as {
    scouts?: { id: string; kind: string }[];
    seals?: { id: string; kind: string }[];
    routes?: { id: string; accepts: string }[];
    targets?: { id: string; accepts: string }[];
  };
  const sources = data.scouts ?? data.seals ?? [];
  const targets = data.routes ?? data.targets ?? [];
  const [held, setHeld] = useState<string | null>(null);

  const wire = (targetId: string) => {
    if (!held) return;
    set({ assignments: { ...state.assignments, [targetId]: [held] } });
    setHeld(null);
  };

  return (
    <div className="puzzle-grid">
      <div className="puzzle-col">
        <h3>{stage.prompt[lang]}</h3>
        <div className="chips">
          {sources.map((source) => (
            <button
              key={source.id}
              type="button"
              className={`chip ${held === source.id ? 'chip-active' : ''}`}
              onClick={() => setHeld(held === source.id ? null : source.id)}
            >
              {source.id} · {source.kind}
            </button>
          ))}
        </div>
      </div>
      <div className="puzzle-col">
        <div className="slots">
          {targets.map((target) => {
            const wired = state.assignments[target.id] ?? [];
            return (
              <button
                key={target.id}
                type="button"
                className={`slot ${wired.length ? 'slot-filled' : ''} ${
                  target.accepts === 'none' ? 'slot-forbidden' : ''
                }`}
                onClick={() => wire(target.id)}
              >
                <span className="slot-label">{target.id}</span>
                <span className="slot-sub">
                  {wired.length ? wired[0] : `— (${target.accepts})`}
                </span>
                {target.accepts === 'none' && <span className="slot-warn">✕</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** "Link these two ends" — used by the opening channel. */
function LinkNodes({
  stage,
  state,
  set,
  lang,
}: ControlProps) {
  const data = stage.data as { links?: [string, string][] };
  const links = data.links ?? [];
  const endpoints = [...new Set(links.flat())];
  const [held, setHeld] = useState<string | null>(null);

  const wired = Object.entries(state.assignments).filter(([, v]) => v.length > 0);

  const link = (other: string) => {
    if (!held || held === other) return;
    set({ assignments: { ...state.assignments, [held]: [other] } });
    setHeld(null);
  };

  return (
    <div className="puzzle-col">
      <h3>{stage.prompt[lang]}</h3>
      <div className="chips">
        {endpoints.map((id) => (
          <button
            key={id}
            type="button"
            className={`chip ${held === id ? 'chip-active' : ''}`}
            onClick={() => {
              if (held && held !== id) link(id);
              else setHeld(held === id ? null : id);
            }}
          >
            {id}
          </button>
        ))}
      </div>
      <ul className="seats">
        {wired.map(([from, to]) => (
          <li key={from} className="seat">
            <strong>
              {from} → {to[0]}
            </strong>
            <button
              type="button"
              className="btn tiny"
              onClick={() => {
                const next = { ...state.assignments };
                delete next[from];
                set({ assignments: next });
              }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Placement -------------------------------------------------------------

function PlacementControls({ stage, state, set, lang }: ControlProps) {
  const data = stage.data as { steps?: { id: string; effect: string; requires: string[] }[] };
  const steps = data.steps ?? [];
  const order = (state.assignments.order as string[] | undefined) ?? [];
  const byId = Object.fromEntries(steps.map((s) => [s.id, s]));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = order.slice();
    const tmp = next[index];
    next[index] = next[target];
    next[target] = tmp;
    set({ assignments: { ...state.assignments, order: next } });
  };

  return (
    <div className="puzzle-col">
      <h3>{stage.prompt[lang]}</h3>
      <ol className="order-list">
        {order.map((id, index) => {
          const step = byId[id];
          return (
            <li key={id} className="order-item">
              <span className="order-index">{index + 1}</span>
              <span className="order-body">
                <strong>{id}</strong>
                <span className="muted"> → {step?.effect}</span>
                {step && step.requires.length > 0 && (
                  <span className="muted"> ({step.requires.join(', ')})</span>
                )}
              </span>
              <span className="order-buttons">
                <button type="button" className="btn tiny" onClick={() => move(index, -1)} aria-label="up">
                  ↑
                </button>
                <button type="button" className="btn tiny" onClick={() => move(index, 1)} aria-label="down">
                  ↓
                </button>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// --- Allocation ------------------------------------------------------------

function AllocationControls({ stage, state, set, lang }: ControlProps) {
  const data = stage.data as {
    lanes?: { id: string; capacity: number; latency: number; costPerUnit: number }[];
    work?: { id: string; size: number; tolerance: number }[];
  };
  const lanes = data.lanes ?? [];
  const work = data.work ?? [];
  const [held, setHeld] = useState<string | null>(null);

  const place = (laneId: string) => {
    if (!held) return;
    const next: Record<string, string[]> = {};
    for (const lane of lanes) {
      next[lane.id] = (state.assignments[lane.id] ?? []).filter((id) => id !== held);
    }
    next[laneId] = [...(next[laneId] ?? []), held];
    set({ assignments: next });
    setHeld(null);
  };

  return (
    <div className="puzzle-grid">
      <div className="puzzle-col">
        <h3>{stage.prompt[lang]}</h3>
        <div className="chips">
          {work.map((w) => (
            <button
              key={w.id}
              type="button"
              className={`chip ${held === w.id ? 'chip-active' : ''}`}
              onClick={() => setHeld(held === w.id ? null : w.id)}
            >
              {w.id} · {w.size}
            </button>
          ))}
        </div>
      </div>
      <div className="puzzle-col">
        <div className="slots">
          {lanes.map((lane) => {
            const items = state.assignments[lane.id] ?? [];
            const load = items.reduce((sum, id) => {
              const unit = work.find((w) => w.id === id);
              return sum + (unit?.size ?? 0);
            }, 0);
            return (
              <div key={lane.id} className={`slot ${items.length ? 'slot-filled' : ''}`}>
                <button type="button" className="slot-label" onClick={() => place(lane.id)}>
                  {lane.id}
                </button>
                <span className="slot-sub">
                  {items.length ? items.join(', ') : '—'} · {items.length}/{lane.capacity} ·{' '}
                  {load + (items.length ? lane.latency : 0)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --- Perception ------------------------------------------------------------

function PerceptionControls({ stage, state, set, lang, t }: ControlProps) {
  const lenses = ['edge', 'depth', 'motion'] as const;
  const observations = state.observations ?? 0;
  const scene = useMemo(() => buildScene(stage), [stage]);

  return (
    <div className="puzzle-col">
      <h3>{stage.prompt[lang]}</h3>
      <div className="chips">
        {lenses.map((lens) => (
          <button
            key={lens}
            type="button"
            className={`chip ${state.lens === lens ? 'chip-active' : ''}`}
            onClick={() => set({ lens })}
          >
            {t(LENS_KEY[lens])}
          </button>
        ))}
        <button
          type="button"
          className="chip chip-action"
          onClick={() => set({ observations: observations + 1 })}
        >
          {t('lens.observeTwice')}
        </button>
      </div>
      <CellGrid stage={stage} state={state} set={set} t={t} columns={scene.width} />
    </div>
  );
}

/**
 * The classification grid: for each cell the player states whether an
 * instrument can truly see it or only assume it. The scene decides.
 */
function CellGrid({
  stage,
  state,
  set,
  t,
  columns,
}: {
  stage: StageDefinition;
  state: StageRuntimeState;
  set: SetFn;
  t: TFn;
  columns: number;
}) {
  const truths = useMemo(() => cellTruths(stage), [stage]);
  const marked = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of (state.assignments.__marked as string[] | undefined) ?? []) {
      const [index, verdict] = entry.split(':');
      map.set(index, verdict);
    }
    return map;
  }, [state.assignments]);

  const cycle = (index: number) => {
    const current = marked.get(String(index));
    const next = current === undefined ? 'observed' : current === 'observed' ? 'assumed' : undefined;
    const entries = [...(state.assignments.__marked as string[] | undefined) ?? []].filter(
      (e) => !e.startsWith(`${index}:`),
    );
    if (next) entries.push(`${index}:${next}`);
    set({ assignments: { ...state.assignments, __marked: entries } });
  };

  return (
    <>
      <p className="muted">{t('cell.classify')}</p>
      <div className="cell-grid" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {truths.map((cell) => {
          const verdict = marked.get(String(cell.index));
          return (
            <button
              key={cell.index}
              type="button"
              className={`cell cell-${verdict ?? 'unset'}`}
              aria-pressed={verdict !== undefined}
              onClick={() => cycle(cell.index)}
              title={`${cell.index}`}
            >
              <span aria-hidden="true">{verdict === 'observed' ? '●' : verdict === 'assumed' ? '○' : '?'}</span>
              <span className="sr-only">
                {verdict === 'observed'
                  ? t('cell.observed')
                  : verdict === 'assumed'
                    ? t('cell.assumed')
                    : t('puzzle.empty')}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

// --- Evidence --------------------------------------------------------------

function EvidenceControls({ stage, state, set, lang, t }: ControlProps) {
  const data = stage.data as {
    seats?: { id: string; vote: string; assumes: string }[];
    contradicted?: string[];
    requiredStates?: string[];
    capacity?: number;
    records?: { id: string; fresh: boolean; correct: boolean; tags: string[] }[];
    correctable?: string[];
  };

  if (data.seats) {
    const flagged = (state.assignments.__flagged as string[] | undefined) ?? [];
    const assumptions = [...new Set(data.seats.map((s) => s.assumes))];
    return (
      <div className="puzzle-col">
        <h3>{stage.prompt[lang]}</h3>
        <ul className="seats">
          {data.seats.map((seat) => {
            const voteKey = COUNCIL_KEY[seat.vote as keyof typeof COUNCIL_KEY] ?? 'council.abstain';
            return (
              <li key={seat.id} className="seat">
                <strong>{seat.id}</strong> — {t(voteKey)}
                <span className="muted">
                  {' '}
                  · {t('predict.assumption')}: {seat.assumes}
                </span>
                {data.contradicted?.includes(seat.assumes) && (
                  <span className="tag-warn"> {t('predict.contradicted')}</span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="muted">{t('council.agreementNotTruth')}</p>
        <div className="chips">
          {assumptions.map((assumption) => (
            <button
              key={assumption}
              type="button"
              className={`chip ${flagged.includes(assumption) ? 'chip-active' : ''}`}
              onClick={() =>
                set({
                  assignments: {
                    ...state.assignments,
                    __flagged: flagged.includes(assumption)
                      ? flagged.filter((a) => a !== assumption)
                      : [...flagged, assumption],
                  },
                })
              }
            >
              ✕ {assumption}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (data.requiredStates) {
    const performed = (state.assignments.__states as string[] | undefined) ?? [];
    return (
      <div className="puzzle-col">
        <h3>{stage.prompt[lang]}</h3>
        <div className="chips">
          {data.requiredStates.map((s) => (
            <button
              key={s}
              type="button"
              className={`chip ${performed.includes(s) ? 'chip-active' : ''}`}
              onClick={() =>
                set({
                  assignments: {
                    ...state.assignments,
                    __states: performed.includes(s)
                      ? performed.filter((x) => x !== s)
                      : [...performed, s],
                  },
                })
              }
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const packed = state.packed ?? [];
  const corrected = state.corrected ?? [];
  const records = data.records ?? [];
  const capacity = data.capacity ?? 3;
  const used = packed.reduce((sum, id) => {
    const r = records.find((x) => x.id === id);
    return sum + 1 + Math.max(0, (r?.tags.length ?? 1) - 1);
  }, 0);

  return (
    <div className="puzzle-col">
      <h3>{stage.prompt[lang]}</h3>
      <p className="muted">
        {t('puzzle.capacity')}: {used}/{capacity}
      </p>
      <ul className="records">
        {records.map((record) => {
          const isPacked = packed.includes(record.id);
          const isCorrected = corrected.includes(record.id);
          const fresh = record.fresh || isCorrected;
          return (
            <li key={record.id} className={`record ${isPacked ? 'record-packed' : ''}`}>
              <div className="record-main">
                <strong>{record.id}</strong>
                <span className="muted"> · {record.tags.join(', ')}</span>
              </div>
              <div className="record-tags">
                <span className={`pill ${fresh ? 'pill-ok' : 'pill-warn'}`}>
                  {fresh ? t('evidence.fresh') : t('evidence.stale')}
                </span>
                <span className={`pill ${record.correct ? 'pill-ok' : 'pill-bad'}`}>
                  {record.correct ? '✓' : t('evidence.incorrect')}
                </span>
              </div>
              <div className="record-actions">
                <button
                  type="button"
                  className="btn tiny"
                  onClick={() =>
                    set({
                      packed: isPacked ? packed.filter((x) => x !== record.id) : [...packed, record.id],
                    })
                  }
                >
                  {isPacked ? t('evidence.unpack') : t('evidence.pack')}
                </button>
                {data.correctable?.includes(record.id) && !isCorrected && (
                  <button
                    type="button"
                    className="btn tiny"
                    onClick={() => set({ corrected: [...corrected, record.id] })}
                  >
                    {t('evidence.correctIt')}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// --- Prediction ------------------------------------------------------------

function PredictionControls({ stage, state, set, lang, t }: ControlProps) {
  const data = stage.data as {
    options?: { id: string; outcome: number }[];
    correct?: string;
    branches?: { id: string; label: string; predicted: number }[];
    actual?: number;
    verifyTarget?: string;
    decoyTarget?: string;
    sensors?: number;
    trueFault?: string;
    markAssumed?: boolean;
  };
  const observed = (state.assignments.__observed as string[] | undefined)?.[0];
  const sensors = (state.assignments.__sensors as string[] | undefined) ?? [];

  // PDT: place sensors until exactly one fault can still explain the readings.
  if (data.sensors && data.trueFault) {
    return (
      <div className="puzzle-col">
        <h3>{stage.prompt[lang]}</h3>
        <p className="muted">{t('pdt.sensors')}</p>
        <div className="chips">
          {Array.from({ length: 6 }, (_, i) => `sensor-${i}`).map((id) => (
            <button
              key={id}
              type="button"
              className={`chip ${sensors.includes(id) ? 'chip-active' : ''}`}
              onClick={() =>
                set({
                  assignments: {
                    ...state.assignments,
                    __sensors: sensors.includes(id)
                      ? sensors.filter((s) => s !== id)
                      : [...sensors, id],
                  },
                })
              }
            >
              {id}
            </button>
          ))}
        </div>
        <p className="muted">{t('pdt.remaining')}: {sensors.length === 0 ? '—' : '?'}</p>
      </div>
    );
  }

  // ITL / WFM: the honest model — seen, or assumed.
  if (data.markAssumed) {
    const scene = buildScene(stage);
    return (
      <div className="puzzle-col">
        <h3>{stage.prompt[lang]}</h3>
        <div className="chips">
          <button
            type="button"
            className="chip chip-action"
            onClick={() => set({ observations: (state.observations ?? 0) + 1 })}
          >
            {t('lens.observeTwice')}
          </button>
        </div>
        <CellGrid stage={stage} state={state} set={set} t={t} columns={scene.width} />
      </div>
    );
  }

  const options = data.options ?? data.branches ?? [];

  return (
    <div className="puzzle-col">
      <h3>{stage.prompt[lang]}</h3>
      <div className="chips">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`chip ${state.chosen === option.id ? 'chip-active' : ''}`}
            onClick={() => set({ chosen: option.id })}
          >
            {'label' in option ? option.label : option.id}
          </button>
        ))}
      </div>

      {data.branches && (
        <div className="chips">
          <button
            type="button"
            className={`chip chip-action ${state.approved ? 'chip-active' : ''}`}
            onClick={() => set({ approved: !state.approved })}
          >
            {t('predict.approve')}
          </button>
        </div>
      )}

      {data.verifyTarget && (
        <div className="chips">
          <span className="muted">{t('predict.actual')}: </span>
          {[data.verifyTarget, data.decoyTarget].filter(Boolean).map((target) => (
            <button
              key={target as string}
              type="button"
              className={`chip ${observed === target ? 'chip-active' : ''}`}
              onClick={() =>
                set({ assignments: { ...state.assignments, __observed: [target as string] } })
              }
            >
              {target}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function HintRow({
  stageId,
  stage,
  lang,
}: {
  stageId: string;
  stage: StageDefinition;
  lang: Lang;
}) {
  const game = useGame();
  const t = useT();
  const tier = game.hintTier[stageId] ?? 0;

  if (tier === 0) {
    return (
      <button type="button" className="btn ghost" onClick={() => raiseHint(stageId)}>
        {t('hud.hint')}
      </button>
    );
  }

  const text =
    tier === 1 ? t('hint.1') : tier === 2 ? `${t('hint.2')} ${stage.prompt[lang]}` : `${t('hint.3')} ${stage.objective[lang]}`;

  return (
    <div className="hint-row">
      <span>{text}</span>
      {tier < 3 ? (
        <button type="button" className="btn tiny" onClick={() => raiseHint(stageId)}>
          +
        </button>
      ) : null}
      <button type="button" className="btn tiny" onClick={() => dismissHint(stageId)}>
        ✕
      </button>
    </div>
  );
}

function failureMessage(failures: string[], lang: Lang): string {
  const map: Record<string, [string, string]> = {
    incompatible: [
      'Bu iki düğüm aynı türden değil.',
      'These two nodes are not the same kind.',
    ],
    'unauthorised-target': [
      'Bu mekanizma mühür kabul etmiyor.',
      'This mechanism does not accept a seal.',
    ],
    'flow-insufficient': ['Akış hedefe ulaşmadı.', 'The flow never reached its target.'],
    'lane-overloaded': [
      'Bir kol kapasitesini aştı.',
      'A lane took more than it has slots.',
    ],
    'work-unassigned': [
      'Bazı işler hiçbir yere konmadı.',
      'Some work was never placed.',
    ],
    'kind-mismatch': [
      'İş, yanlış türden bir kola kondu.',
      'Work was placed on a lane of the wrong kind.',
    ],
    'context-overflow': [
      'Fener doldu; bazı kanıt geride kaldı.',
      'The lantern is full; some evidence was left behind.',
    ],
    'stale-record': ['Bu kayıt eski.', 'This record is outdated.'],
    'false-record': ['Bu kayıt yanlış.', 'This record is wrong.'],
    'missing-evidence': [
      'Gereken kanıt fenerde yok.',
      'Required evidence is not in the lantern.',
    ],
    'false-consensus': [
      'Çoğunluk aynı yanlış varsayımı paylaşıyor.',
      'The majority shares one incorrect assumption.',
    ],
    'wrong-decision': [
      'Bu karar kanıta göre doğru değil.',
      'The evidence does not support that decision.',
    ],
    'no-decision': ['Henüz bir karar seçmedin.', 'You have not chosen a decision.'],
    'not-approved': ['Eylemi onaylamadın.', 'You have not approved the action.'],
    'wrong-target': [
      'Hedeflediğin mekanizma değil, başka bir şey hareket etti.',
      'Something other than the mechanism you targeted responded.',
    ],
    'not-verified': ['Sonucu denetlemedin.', 'You did not verify the outcome.'],
    'requirement-missing': [
      'Bir adımın gerektirdiği bir şey hazır değil.',
      'A step ran before everything it required existed.',
    ],
    'missing-step': ['Bir adım eksik.', 'A step is missing.'],
    'duplicate-step': ['Bir adım iki kez kondu.', 'A step was placed twice.'],
    'needs-baseline': [
      'Hareket merceği için önce bir kez gözlemle.',
      'The motion lens needs one observation before it can compare.',
    ],
    'low-light': [
      'Işık yetersiz; derinlik okunmuyor.',
      'The light is too low to read depth here.',
    ],
  };
  const first = failures[0];
  const entry = map[first];
  if (entry) return entry[lang === 'tr' ? 0 : 1];
  return lang === 'tr' ? 'Henüz çözülmedi.' : 'Not resolved yet.';
}