import { type NextRequest, NextResponse } from "next/server";

const defaultAssetHosts = [
  "tempfile.aiquickdraw.com",
  "tempfile.redpandaai.co",
  "kieai.redpandaai.co",
  "static.aiquickdraw.com",
];

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDevelopment = process.env.NODE_ENV === "development";
  const configuredHosts =
    process.env.NEXT_PUBLIC_KIE_ASSET_HOSTS?.split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean) ?? [];
  const assetSources = [...new Set([...defaultAssetHosts, ...configuredHosts])]
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

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  return response;
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
