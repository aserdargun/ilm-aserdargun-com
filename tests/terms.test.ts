import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { APPLICATIONS } from '../src/catalog/applications';
import { STAGES, STAGE_BY_ID } from '../src/game/stages';
import { TERMS, allTerms, termCount, termsFor } from '../src/game/terms';
import { PuzzlePanel } from '../src/ui/PuzzlePanel';
import { startNewGame } from '../src/game/store';
import { LANGS } from '../src/types/catalog';

/**
 * The vocabulary layer has one job: every application in the catalog teaches the
 * words that application is actually about, in both languages.
 *
 * These tests exist because a glossary fails quietly. A missing entry does not
 * throw in play — the player just never learns that "occupancy" is a word, and
 * the application reads as a metaphor rather than as a subject. Worse, an entry
 * copied from English into the Turkish column looks complete to every check
 * that only counts keys. So the checks below are about *substance*: both
 * languages written, no term invented twice, and every stage's application
 * vocabulary actually reachable.
 */

const MIN_TERMS_PER_APP = 4;

describe('vocabulary completeness', () => {
  it('files terms under every application in the catalog', () => {
    const missing = APPLICATIONS.filter((a) => (TERMS[a.code] ?? []).length === 0).map((a) => a.code);
    expect(missing).toEqual([]);
  });

  it('files terms under no code that is not an application', () => {
    const codes = new Set(APPLICATIONS.map((a) => a.code));
    const orphans = Object.keys(TERMS).filter((code) => !codes.has(code));
    expect(orphans).toEqual([]);
  });

  it('gives every application at least the required number of terms', () => {
    const thin = APPLICATIONS.filter(
      (a) => (TERMS[a.code] ?? []).length < MIN_TERMS_PER_APP,
    ).map((a) => `${a.code}: ${(TERMS[a.code] ?? []).length}`);
    expect(thin).toEqual([]);
  });

  it('gives no application more terms than the catalog needs to stay readable', () => {
    const bloated = APPLICATIONS.filter((a) => (TERMS[a.code] ?? []).length > 6).map((a) => a.code);
    expect(bloated).toEqual([]);
  });

  it('terms every stage can reach through its own applications', () => {
    const unreachable = STAGES.filter(
      (stage) =>
        !stage.appCodes.some((code) => (TERMS[code] ?? []).length > 0) && stage.appCodes.length > 0,
    ).map((s) => s.id);
    expect(unreachable).toEqual([]);
  });
});

describe('vocabulary content', () => {
  it('writes every term and both languages', () => {
    const empty: string[] = [];
    for (const { code, term } of allTerms()) {
      if (!term.term.trim()) empty.push(`${code}: blank term`);
      for (const lang of LANGS) {
        if (!term.meaning[lang]?.trim()) empty.push(`${code}/${term.term}: missing ${lang} meaning`);
        if (!term.inWorld[lang]?.trim()) empty.push(`${code}/${term.term}: missing ${lang} world line`);
      }
    }
    expect(empty).toEqual([]);
  });

  it('writes Turkish as Turkish rather than repeating the English column', () => {
    const copied: string[] = [];
    for (const { code, term } of allTerms()) {
      if (term.meaning.tr === term.meaning.en) copied.push(`${code}/${term.term}: meaning`);
      if (term.inWorld.tr === term.inWorld.en) copied.push(`${code}/${term.term}: world line`);
    }
    expect(copied).toEqual([]);
  });

  it('keeps the meaning short enough to read before a puzzle', () => {
    const overlong = allTerms()
      .filter(({ term }) => LANGS.some((lang) => term.meaning[lang].length > 260))
      .map(({ code, term }) => `${code}/${term.term}`);
    expect(overlong).toEqual([]);
  });

  it('gives every definition a real sentence rather than a fragment', () => {
    const fragments = allTerms()
      .filter(({ term }) => LANGS.some((lang) => !/[.?!»”"]$/.test(term.meaning[lang].trim())))
      .map(({ code, term }) => `${code}/${term.term}`);
    expect(fragments).toEqual([]);
  });

  it('never repeats a term inside one application', () => {
    const repeats: string[] = [];
    for (const entry of APPLICATIONS) {
      const seen = new Set<string>();
      for (const term of TERMS[entry.code] ?? []) {
        const key = term.term.toLowerCase();
        if (seen.has(key)) repeats.push(`${entry.code}/${term.term}`);
        seen.add(key);
      }
    }
    expect(repeats).toEqual([]);
  });

  it('keeps every world line distinct from its own meaning', () => {
    const same: string[] = [];
    for (const { code, term } of allTerms()) {
      for (const lang of LANGS) {
        if (term.meaning[lang] === term.inWorld[lang]) same.push(`${code}/${term.term}: ${lang}`);
      }
    }
    expect(same).toEqual([]);
  });
});

describe('vocabulary lookup', () => {
  it('returns terms for a known code', () => {
    expect(termsFor('GPU').length).toBeGreaterThanOrEqual(MIN_TERMS_PER_APP);
  });

  it('returns nothing for an unknown code instead of throwing', () => {
    expect(termsFor('NOPE')).toEqual([]);
  });

  it('counts one term per catalog entry', () => {
    const summed = APPLICATIONS.reduce((n, a) => n + (TERMS[a.code] ?? []).length, 0);
    expect(termCount()).toBe(summed);
    expect(allTerms()).toHaveLength(summed);
  });
});

describe('vocabulary reachability', () => {
  /**
   * A complete glossary that nothing renders is documentation, not a feature.
   * These two render the real panel and read its markup, so a refactor that
   * drops the block from the lesson fails here rather than in play.
   */
  it('puts a stage application terms inside its lesson card', () => {
    startNewGame();
    const stageId = 'r1-equivalent-bridges';
    expect(STAGE_BY_ID[stageId]).toBeDefined();

    const html = renderToStaticMarkup(
      createElement(PuzzlePanel, { stageId, onClose: () => {} }),
    );

    expect(html).toContain('lesson-words');
    for (const term of termsFor('POL')) {
      expect(html).toContain(term.term);
    }
  });

  it('omits the row on a stage that stands for no application', () => {
    startNewGame();
    const html = renderToStaticMarkup(
      createElement(PuzzlePanel, { stageId: 'r0-opening', onClose: () => {} }),
    );
    expect(html).not.toContain('lesson-words');
  });
});