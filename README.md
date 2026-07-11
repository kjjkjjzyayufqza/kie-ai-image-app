# KIE Image Workspace

Browser-local Next.js workspace for Kie AI image generation.

## Data boundary

- No login, email identity, database, S3, or server-side image storage.
- The Kie API Key is stored in the current origin's `localStorage`.
- Rooms, prompts, task IDs, settings, and result URLs are stored in IndexedDB.
- Generated image bytes are never persisted by the application.
- Closing the page does not stop Kie. On reopen, known task IDs are queried again.
- Clearing site data removes the local workspace. Expired Kie URLs are not recoverable.

## Development

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000> and enter your own Kie API Key in Settings.

Copy `.env.example` to `.env.local` for local development. In production,
`APP_ORIGIN` must be the exact canonical HTTPS origin. Do not place a Kie Key in
environment variables.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm run build
```

Real Kie generation and 30 MB upload smoke tests are intentionally not run by
the automated suite because they require a user-provided Key and may consume
credits. The browser upload path targets Kie's official temporary file endpoint.

## Supported workflow

- GPT Image 2 text-to-image and image-to-image.
- Custom `1x` through `100x` batches with immediate ordered placeholders.
- Rate-limited independent task submission and progressive result rendering.
- Cross-tab leader election to prevent duplicate submissions.
- Task recovery by persisted Kie task ID.
- Official remaining credits plus browser-local usage statistics.
- URL-only gallery with search, favorites, tags, collections, preview, and download.
- JSON metadata export without the API Key or image bytes.

The detailed design is in
[`docs/superpowers/specs/2026-07-11-kie-ai-image-app-design.md`](docs/superpowers/specs/2026-07-11-kie-ai-image-app-design.md).
