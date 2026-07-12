import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { en } from "@/i18n/dictionaries/en";
import { zh } from "@/i18n/dictionaries/zh";

/** Shared dictionary map for server routes and client runtime bootstrap. */
export const dictionaryMap: Record<Locale, Dictionary> = {
  en,
  zh,
};

export function getDictionarySync(locale: Locale): Dictionary {
  return dictionaryMap[locale];
}
