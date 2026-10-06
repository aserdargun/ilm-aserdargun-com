import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { tr } from '../src/i18n/tr';
import { translate, type TranslationKey } from '../src/i18n';
import { LANGS, DEFAULT_LANG } from '../src/types/catalog';
import { APPLICATIONS } from '../src/catalog/applications';
import { REGIONS } from '../src/catalog/regions';
import { STAGES } from '../src/game/stages';

const EN_KEYS = Object.keys(en) as TranslationKey[];

describe('translation completeness', () => {
  it('defaults to Turkish on a first visit', () => {
    expect(DEFAULT_LANG).toBe('tr');
  });

  it('defines exactly the same keys in both languages', () => {
    const trKeys = Object.keys(tr) as TranslationKey[];
    expect(new Set(trKeys).size).toBe(trKeys.length);
    expect([...trKeys].sort()).toEqual([...EN_KEYS].sort());
  });

  it('has no empty string in either language', () => {
    for (const key of EN_KEYS) {
      expect(en[key].trim(), `en.${key}`).not.toBe('');
      expect(tr[key].trim(), `tr.${key}`).not.toBe('');
    }
  });

  it('translates every key in both languages', () => {
    for (const lang of LANGS) {
      for (const key of EN_KEYS) {
        const value = translate(lang, key);
        expect(value, `${lang}.${key}`).not.toBe('');
      }
    }
  });

  it('does not leave Turkish identical to English for user-facing copy', () => {
    // Deliberately identical: the brand, a literal key label, and a loan word
    // that is spelled the same in Turkish.
    const exempt = new Set(['brand.name', 'prompt.interact', 'predict.model']);
    const identical = EN_KEYS.filter((key) => !exempt.has(key) && en[key] === tr[key]);
    expect(identical).toEqual([]);
  });

  it('renders Turkish characters correctly', () => {
    expect(tr['brand.descriptor']).toContain('Örülen');
    expect(tr['menu.settings']).toBe('Ayarlar');
  });
});

describe('catalog localisation', () => {
  it('gives every catalog entry Turkish and English text', () => {
    for (const entry of APPLICATIONS) {
      for (const lang of LANGS) {
        expect(entry.name[lang].trim(), `${entry.code}.name.${lang}`).not.toBe('');
        expect(entry.shortConcept[lang].trim(), `${entry.code}.shortConcept.${lang}`).not.toBe('');
        expect(entry.mechanic[lang].trim(), `${entry.code}.mechanic.${lang}`).not.toBe('');
        expect(entry.discovery[lang].trim(), `${entry.code}.discovery.${lang}`).not.toBe('');
        expect(entry.completionCondition[lang].trim(), `${entry.code}.completion.${lang}`).not.toBe('');
      }
    }
  });

  it('keeps application codes untranslated', () => {
    for (const entry of APPLICATIONS) {
      expect(entry.code).toBe(entry.code.toUpperCase());
      expect(entry.name.en).not.toBe('');
    }
  });

  it('localises every region and every stage', () => {
    for (const region of REGIONS) {
      for (const lang of LANGS) {
        expect(region.name[lang].trim(), `${region.id}.name.${lang}`).not.toBe('');
        expect(region.subtitle[lang].trim(), `${region.id}.subtitle.${lang}`).not.toBe('');
        expect(region.landmark[lang].trim(), `${region.id}.landmark.${lang}`).not.toBe('');
        expect(region.soundIdentity[lang].trim(), `${region.id}.sound.${lang}`).not.toBe('');
        expect(region.restorationEffect[lang].trim(), `${region.id}.effect.${lang}`).not.toBe('');
      }
    }
    for (const stage of STAGES) {
      for (const lang of LANGS) {
        expect(stage.title[lang].trim(), `${stage.id}.title.${lang}`).not.toBe('');
        expect(stage.objective[lang].trim(), `${stage.id}.objective.${lang}`).not.toBe('');
        expect(stage.prompt[lang].trim(), `${stage.id}.prompt.${lang}`).not.toBe('');
        expect(stage.sparkLine[lang].trim(), `${stage.id}.spark.${lang}`).not.toBe('');
      }
    }
  });

  it('keeps Turkish text free of English-only filler', () => {
    // The taglines are the brand's promise and must read natively in both.
    expect(tr['brand.tagline']).toBe('Her bağlantı dünyaya yeniden hayat verir.');
    expect(en['brand.tagline']).toBe('Every connection brings the world to life.');
  });
});

describe('no untranslated player-facing identifiers', () => {
  it('does not leak raw stage ids into the interface strings', () => {
    for (const key of EN_KEYS) {
      for (const lang of LANGS) {
        const value = translate(lang, key);
        expect(value, `${key}`).not.toMatch(/^r\d-[a-z0-9-]+$/);
      }
    }
  });
});