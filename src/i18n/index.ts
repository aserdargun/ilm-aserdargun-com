import { DEFAULT_LANG, LANGS, type Lang } from '../types/catalog';
import { en, type TranslationKey, type Translations } from './en';
import { tr } from './tr';

/**
 * Central translation lookup. Gameplay systems never call this — they work in
 * ids and numbers — so switching language cannot alter any puzzle outcome.
 */

const DICTIONARIES: Record<Lang, Translations> = { en, tr };

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}

export function translate(lang: Lang, key: TranslationKey): string {
  const dictionary = DICTIONARIES[lang] ?? DICTIONARIES[DEFAULT_LANG];
  return dictionary[key] ?? en[key];
}

export function makeT(lang: Lang) {
  return (key: TranslationKey) => translate(lang, key);
}

export type { TranslationKey };

// ---------------------------------------------------------------------------
// Reactive language store
// ---------------------------------------------------------------------------

/**
 * Language preference is persisted separately from game progression, so
 * switching it can never disturb a save or an active puzzle.
 */
export const LANG_STORAGE_KEY = 'ilm.lang.v1';

type Listener = () => void;

const listeners = new Set<Listener>();
let currentLang: Lang = DEFAULT_LANG;
let hydrated = false;

function readStoredLang(): Lang | null {
  try {
    const raw = window.localStorage.getItem(LANG_STORAGE_KEY);
    return isLang(raw) ? raw : null;
  } catch {
    // Private browsing or a blocked storage partition: fall back to default.
    return null;
  }
}

function persist(lang: Lang): void {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* storage unavailable; the in-memory value still applies for this session */
  }
}

export function getLang(): Lang {
  return currentLang;
}

/** First visit defaults to Turkish; later visits restore the stored choice. */
export function hydrateLang(): Lang {
  if (hydrated) return currentLang;
  hydrated = true;
  currentLang = readStoredLang() ?? DEFAULT_LANG;
  return currentLang;
}

export function setLang(lang: Lang): void {
  if (!isLang(lang)) return;
  if (lang === currentLang) return;
  currentLang = lang;
  persist(lang);
  for (const listener of listeners) listener();
}

export function subscribeLang(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Used by tests and by the settings reset path. */
export function __resetLangForTests(): void {
  currentLang = DEFAULT_LANG;
  hydrated = false;
  listeners.clear();
}