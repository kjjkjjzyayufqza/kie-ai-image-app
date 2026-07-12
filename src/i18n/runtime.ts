import { defaultLocale, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { en } from "@/i18n/dictionaries/en";
import { zh } from "@/i18n/dictionaries/zh";
import {
  createTranslator,
  type MessageKey,
  type TranslationValues,
} from "@/i18n/translate";

let activeLocale: Locale = defaultLocale;
let activeDictionary: Dictionary = en;
let activeTranslator = createTranslator(en);

/**
 * Sets the process-local active dictionary for non-React modules
 * (services, hooks). Called from the server-provided I18nProvider.
 */
export function setActiveDictionary(
  dictionary: Dictionary,
  locale: Locale,
): void {
  activeLocale = locale;
  activeDictionary = dictionary;
  activeTranslator = createTranslator(dictionary);
}

export function getActiveLocale(): Locale {
  return activeLocale;
}

export function getActiveDictionary(): Dictionary {
  return activeDictionary;
}

export function t(key: MessageKey, values?: TranslationValues): string {
  return activeTranslator(key, values);
}

/** Default room titles across locales — used for auto-rename checks. */
export const defaultRoomTitles = [
  en.rooms.defaultTitle,
  zh.rooms.defaultTitle,
] as const;

export function isDefaultRoomTitle(title: string | undefined): boolean {
  if (!title) return false;
  return (defaultRoomTitles as readonly string[]).includes(title);
}
