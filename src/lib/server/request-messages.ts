import { AsyncLocalStorage } from "node:async_hooks";

import { defaultLocale, type Locale } from "@/i18n/config";
import { getDictionarySync } from "@/i18n/dictionaries";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { localeFromCookieHeader } from "@/i18n/request-locale";
import {
  createTranslator,
  type MessageKey,
  type TranslationValues,
} from "@/i18n/translate";

interface RequestMessageStore {
  locale: Locale;
  dictionary: Dictionary;
  t: (key: MessageKey, values?: TranslationValues) => string;
}

const storage = new AsyncLocalStorage<RequestMessageStore>();

export function runWithRequestMessages<T>(
  request: Request,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  const locale = localeFromCookieHeader(
    request.headers.get("cookie"),
    request.headers.get("accept-language"),
  );
  const dictionary = getDictionarySync(locale);
  const store: RequestMessageStore = {
    locale,
    dictionary,
    t: createTranslator(dictionary),
  };
  return storage.run(store, fn);
}

export function t(key: MessageKey, values?: TranslationValues): string {
  const store = storage.getStore();
  if (store) return store.t(key, values);
  return createTranslator(getDictionarySync(defaultLocale))(key, values);
}
