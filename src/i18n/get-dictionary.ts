import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { en } from "@/i18n/dictionaries/en";
import { zh } from "@/i18n/dictionaries/zh";

const dictionaries: Record<Locale, () => Promise<Dictionary>> = {
  en: async () => en,
  zh: async () => zh,
};

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale]();
}
