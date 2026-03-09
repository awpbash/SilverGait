/**
 * i18n system — centralized translations with useT() hook.
 *
 * Usage in components:
 *   const t = useT();
 *   <p>{t.assessment.title}</p>
 *   <p>{t.common.back}</p>
 */
import { useMemo, useSyncExternalStore } from 'react';
import { useUserStore } from '../stores';
import en, { type Translations } from './en';

// Deep partial type for language overrides
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

// Deep merge: base + overrides
function deepMerge<T extends Record<string, unknown>>(base: T, override: DeepPartial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(override) as (keyof T)[]) {
    const val = override[key];
    if (val !== undefined && typeof val === 'object' && val !== null && !Array.isArray(val)) {
      result[key] = deepMerge(
        base[key] as Record<string, unknown>,
        val as DeepPartial<Record<string, unknown>>,
      ) as T[keyof T];
    } else if (val !== undefined) {
      result[key] = val as T[keyof T];
    }
  }
  return result;
}

// Lazy-load translation files
const loaders: Record<string, () => Promise<{ default: DeepPartial<Translations> }>> = {
  mandarin: () => import('./zh'),
  malay: () => import('./ms'),
  tamil: () => import('./ta'),
};

// Cache resolved translations
const cache = new Map<string, Translations>();
cache.set('en', en);

// Notification system: lets React know when a new language finishes loading
let loadGeneration = 0;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getSnapshot() {
  return loadGeneration;
}

function notifyLoaded() {
  loadGeneration += 1;
  listeners.forEach((cb) => cb());
}

/**
 * Load a language. Returns the translations (from cache or after async load).
 * If not yet loaded, returns English immediately and triggers async load + re-render.
 */
function getTranslations(lang: string): Translations {
  if (cache.has(lang)) return cache.get(lang)!;

  const loader = loaders[lang];
  if (loader) {
    loader().then((mod) => {
      const merged = deepMerge(en, mod.default);
      cache.set(lang, merged);
      notifyLoaded(); // triggers re-render in all useT() consumers
    }).catch(() => {
      cache.set(lang, en);
      notifyLoaded();
    });
  }

  // Return English while loading
  return en;
}

/**
 * React hook to get translations for the current language.
 * Re-renders when language changes OR when a new translation finishes loading.
 */
export function useT(): Translations {
  const { preferredLanguage } = useUserStore();
  const lang = preferredLanguage || 'en';

  // Subscribe to translation load events so we re-render when async load completes
  const generation = useSyncExternalStore(subscribe, getSnapshot);

  return useMemo(() => {
    return getTranslations(lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, generation]);
}

/**
 * Simple template interpolation: replaces {key} with values.
 * Usage: tpl(t.assessment.testsOf, { completed: 2, total: 3 }) => "2 of 3 tests"
 */
export function tpl(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`));
}

// Pre-load the current language on module init
const initialLang = useUserStore.getState().preferredLanguage || 'en';
if (initialLang !== 'en' && loaders[initialLang]) {
  getTranslations(initialLang);
}

export type { Translations };
export default en;
