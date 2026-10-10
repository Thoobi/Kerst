# Litdeck marketing site

Next.js 16 marketing site for [Litdeck](https://litdeck.space). Static-only — no API routes, no server actions. Deployed to GitHub Pages on push to `main`.

## Develop

```bash
cd web
bun install
bun run dev
```

Opens [http://localhost:3029](http://localhost:3029).

## Build

```bash
bun run build
```

Outputs a static site to `web/out/`.

## Deploy

The site is hosted on Vercel as a project whose **Root Directory** is `web`.
Vercel builds and deploys every push to `main`, and gives pull requests their
own preview URL. Set `NEXT_PUBLIC_DOWNLOADS_URL` in the Vercel project's
environment variables to point the download buttons somewhere other than
`https://downloads.litdeck.space` (see `documentation/downloads.md`).

`.github/workflows/build-web.yml` also builds the site on every push and pull
request that touches `web/**`, as a check that it still builds. It does not
deploy anything.

## Notes

- `output: "export"` in `next.config.ts` — the site is a fully static export. Anything that needs a Node server (route handlers, server actions, ISR, `next/image` optimization) will fail the build.
- Self-hosted fonts under `public/fonts/`. Referenced from `app/globals.css` via absolute paths — do not introduce a `basePath`, it does not rewrite CSS `url()` values.
