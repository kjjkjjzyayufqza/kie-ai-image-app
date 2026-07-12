import { type NextRequest, NextResponse } from "next/server";

import {
  defaultLocale,
  isLocale,
  localeCookieName,
  locales,
  negotiateLocale,
} from "@/i18n/config";
import { getAllowedKieAssetHosts } from "@/lib/kie-urls";

function pathnameHasLocale(pathname: string): boolean {
  return locales.some(
    (locale) =>
      pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );
}

function resolveLocale(request: NextRequest): string {
  const cookieLocale = request.cookies.get(localeCookieName)?.value;
  if (cookieLocale && isLocale(cookieLocale)) {
    return cookieLocale;
  }
  return negotiateLocale(request.headers.get("accept-language"));
}

function withSecurityHeaders(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDevelopment = process.env.NODE_ENV === "development";
  const assetSources = [...getAllowedKieAssetHosts()]
    .map((host) => `https://${host}`)
    .join(" ");
  const contentSecurityPolicy = [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${assetSources}`,
    "font-src 'self'",
    `connect-src 'self' https://kieai.redpandaai.co ${assetSources}`,
    "worker-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  // Redirect responses only need outbound security headers.
  if (response.status >= 300 && response.status < 400) {
    response.headers.set("Content-Security-Policy", contentSecurityPolicy);
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-Permitted-Cross-Domain-Policies", "none");
    response.headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
    response.headers.set("Origin-Agent-Cluster", "?1");
    if (!isDevelopment) {
      response.headers.set("Strict-Transport-Security", "max-age=31536000");
    }
    return response;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const nextResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });
  nextResponse.headers.set("Content-Security-Policy", contentSecurityPolicy);
  nextResponse.headers.set("Referrer-Policy", "no-referrer");
  nextResponse.headers.set("X-Content-Type-Options", "nosniff");
  nextResponse.headers.set("X-Frame-Options", "DENY");
  nextResponse.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  nextResponse.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  nextResponse.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  nextResponse.headers.set("Origin-Agent-Cluster", "?1");
  if (!isDevelopment) {
    nextResponse.headers.set("Strict-Transport-Security", "max-age=31536000");
  }
  return nextResponse;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return withSecurityHeaders(request, NextResponse.next());
  }

  if (!pathnameHasLocale(pathname)) {
    const locale = resolveLocale(request) || defaultLocale;
    const url = request.nextUrl.clone();
    url.pathname =
      pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
    const redirect = NextResponse.redirect(url);
    redirect.cookies.set(localeCookieName, locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
    return withSecurityHeaders(request, redirect);
  }

  return withSecurityHeaders(request, NextResponse.next());
}

export const config = {
  matcher: [
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
