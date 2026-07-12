export const locales = ["en", "zh"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const localeCookieName = "NEXT_LOCALE";

export const localeLabels: Record<Locale, string> = {
  en: "English",
  zh: "中文",
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export function negotiateLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return defaultLocale;

  const preferred = acceptLanguage
    .split(",")
    .map((part) => {
      const [tagPart, qPart] = part.trim().split(";q=");
      const tag = (tagPart ?? "").toLowerCase();
      const q = qPart ? Number.parseFloat(qPart) : 1;
      return { tag, q: Number.isFinite(q) ? q : 0 };
    })
    .filter((entry) => entry.tag.length > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of preferred) {
    if (tag === "*" ) continue;
    if (tag === "zh" || tag.startsWith("zh-")) return "zh";
    if (tag === "en" || tag.startsWith("en-")) return "en";
  }

  return defaultLocale;
}
