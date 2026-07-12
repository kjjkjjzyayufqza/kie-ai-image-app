"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { setActiveDictionary } from "@/i18n/runtime";
import {
  createTranslator,
  type MessageKey,
  type TranslationValues,
} from "@/i18n/translate";

interface I18nContextValue {
  locale: Locale;
  dictionary: Dictionary;
  t: (key: MessageKey, values?: TranslationValues) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  dictionary,
  children,
}: {
  locale: Locale;
  dictionary: Dictionary;
  children: ReactNode;
}) {
  // Keep non-React modules in sync for the current request/render tree.
  setActiveDictionary(dictionary, locale);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      dictionary,
      t: createTranslator(dictionary),
    }),
    [dictionary, locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return value;
}
