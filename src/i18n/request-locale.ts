import { cookies, headers } from "next/headers";

import {
  defaultLocale,
  isLocale,
  localeCookieName,
  negotiateLocale,
  type Locale,
} from "@/i18n/config";
import { getDictionarySync } from "@/i18n/dictionaries";
import type { Dictionary } from "@/i18n/dictionaries/en";

export async function getRequestLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(localeCookieName)?.value;
  if (cookieLocale && isLocale(cookieLocale)) {
    return cookieLocale;
  }

  const headerStore = await headers();
  return negotiateLocale(headerStore.get("accept-language"));
}

export async function getRequestDictionary(): Promise<{
  locale: Locale;
  dictionary: Dictionary;
}> {
  const locale = await getRequestLocale();
  return { locale, dictionary: getDictionarySync(locale) };
}

export function localeFromCookieHeader(
  cookieHeader: string | null,
  acceptLanguage: string | null,
): Locale {
  if (cookieHeader) {
    const match = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${localeCookieName}=`));
    if (match) {
      const value = decodeURIComponent(match.split("=").slice(1).join("="));
      if (isLocale(value)) return value;
    }
  }
  return negotiateLocale(acceptLanguage) ?? defaultLocale;
}
