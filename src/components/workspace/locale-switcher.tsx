"use client";

import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  localeCookieName,
  localeLabels,
  locales,
  type Locale,
} from "@/i18n/config";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

function setLocaleCookie(next: Locale) {
  document.cookie = `${localeCookieName}=${next}; path=/; max-age=31536000; samesite=lax`;
}

function buildLocalePath(pathname: string, next: Locale) {
  const segments = pathname.split("/");
  // pathname: /en/... or /zh
  if (segments.length >= 2 && locales.includes(segments[1] as Locale)) {
    segments[1] = next;
  } else {
    segments.splice(1, 0, next);
  }
  return segments.join("/") || `/${next}`;
}

export function LocaleSwitcher({ className }: { className?: string }) {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();

  const switchLocale = (next: Locale) => {
    if (next === locale) return;
    setLocaleCookie(next);
    router.replace(buildLocalePath(pathname, next));
    router.refresh();
  };

  return (
    <div
      className={cn("flex items-center rounded-md border p-0.5", className)}
      role="group"
      aria-label={t("locale.switchTo")}
    >
      {locales.map((item) => (
        <Button
          key={item}
          type="button"
          size="sm"
          variant={item === locale ? "secondary" : "ghost"}
          className="h-7 px-2 text-xs active:scale-[0.98]"
          onClick={() => switchLocale(item)}
          aria-pressed={item === locale}
        >
          {localeLabels[item]}
        </Button>
      ))}
    </div>
  );
}
