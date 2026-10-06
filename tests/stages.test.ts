import { describe, expect, it } from 'vitest';
import { STAGES, type StageDefinition } from '../src/game/stages';
import { evaluateStage, initialStageState } from '../src/game/puzzleRuntime';
import { solveStage } from './helpers/solver';
import type { StageRuntimeState } from '../src/game/stages';

/**
 * Every stage must be completable.
 *
 * Each test constructs a legitimate winning configuration for one system, then
 * asserts the runtime actually marks the stage solved. If a stage's data is
 * impossible to satisfy, or its system is mismatched, this fails rather than
 * shipping a puzzle the player cannot finish.
 */

describe('every stage is completable', () => {
  const failures: string[] = [];

  for (const stage of STAGES) {
    it(`${stage.id} can be solved`, () => {
      const state = solveStage(stage);
      const result = evaluateStage(stage, state);
      if (!result.solved) {
        failures.push(`${stage.id}: ${result.failures.join(', ')}`);
      }
      expect(result.failures, `${stage.id} unsolved`).toEqual([]);
      expect(result.solved).toBe(true);
    });
  }

  it('reports no unsolved stages', () => {
    expect(failures).toEqual([]);
  });
});

describe('stages start unsolved', () => {
  it('never begins in a solved state', () => {
    for (const stage of STAGES) {
      const initial = initialStageState(stage);
      expect(evaluateStage(stage, initial).solved, `${stage.id} starts solved`).toBe(false);
    }
  });
});

describe('solving a stage yields the applications it represents', () => {
  it('reports exactly the stage application codes', () => {
    for (const stage of STAGES) {
      const result = evaluateStage(stage, solveStage(stage));
      expect([...result.satisfiedCodes].sort(), stage.id).toEqual([...stage.appCodes].sort());
    }
  });
});