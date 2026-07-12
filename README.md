# KIE Image Workspace

[![Live Demo](https://img.shields.io/badge/demo-kie--ai--image--app.vercel.app-black?style=flat-square&logo=vercel)](https://kie-ai-image-app.vercel.app)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=nextdotjs)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10-F69220?style=flat-square&logo=pnpm&logoColor=white)](https://pnpm.io/)

A browser-local Next.js interface for generating images with Kie AI and GPT Image 2.

**Live demo:** [https://kie-ai-image-app.vercel.app](https://kie-ai-image-app.vercel.app)

![KIE Image Workspace UI](docs/kie-image-workspace.png)

The workspace supports text-to-image, image-to-image, reusable chat rooms, batch
generation from `1x` to `100x`, live task progress, credit estimates, remaining
credit checks, large image previews, and a URL-based gallery.

## Tags / Topics

`nextjs` · `react` · `typescript` · `image-generation` · `ai` · `kie-ai` ·
`gpt-image` · `browser-local` · `indexeddb` · `vercel` · `pnpm` · `shadcn-ui`

## Local-First Data

This app is **purely local** to the current browser and website origin:

- The Kie API key is stored in `localStorage` and is sent only when calling Kie.
- Rooms, prompts, task IDs, settings, reference metadata, and result URLs are
  stored in browser storage (IndexedDB / localStorage).
- Generated image files are not copied or persisted by this application. The
  gallery renders the temporary URLs returned by Kie.
- Clearing the browser's site data removes the local workspace. Expired Kie URLs
  cannot be recovered by the application.

## Internationalization

Server-side i18n is enabled with locale-prefixed routes:

- English (default): `/en`
- Chinese: `/zh`

The proxy negotiates locale from the `NEXT_LOCALE` cookie or `Accept-Language`,
then redirects bare paths (for example `/` → `/en`). Dictionaries are loaded on
the server and passed into the client tree.

## Run Locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), add your own Kie API key in
Settings, and start generating.

For production, set `APP_ORIGIN` to the exact HTTPS origin of the deployment
(for example `https://kie-ai-image-app.vercel.app`).

## Disclaimer

**This is an unofficial, third-party client.** It is not affiliated with,
endorsed by, or sponsored by Kie AI, OpenAI, Vercel, or any related service
provider.

- You must supply **your own** API key and accept the provider's terms of use.
- Image generation may incur **costs, rate limits, and content policy
  restrictions** charged or enforced by the upstream provider — not by this
  project.
- Workspace data lives only in **your browser**. The maintainers cannot recover
  lost keys, prompts, rooms, or expired result URLs.
- Generated content is produced by third-party models. You are responsible for
  how you use, share, or publish any outputs.
- This software is provided **as is**, without warranty of any kind. See the
  [MIT License](./LICENSE) for full terms.

**免责声明（中文摘要）**

本项目为非官方第三方客户端，与 Kie AI / OpenAI / Vercel 等服务方无隶属关系。
请使用你自己的 API Key，并遵守上游服务条款。生成费用、配额与内容合规责任由
你自行承担。数据仅保存在本机浏览器中，维护者无法恢复丢失数据。软件按 MIT
许可「按现状」提供，不作任何明示或默示担保。

## License

[MIT](./LICENSE) © 2026 kjjkjjzyayufqza
