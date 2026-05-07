# Deploying Cytogenesis to Vercel

Pure static Next.js — no env vars, no DB, no server runtime. Two-command deploy.

## First-time setup

```bash
# 1. Install Vercel CLI globally if you don't have it
pnpm i -g vercel

# 2. Link this repo to a Vercel project (creates .vercel/project.json locally)
cd ~/projects/cytogenesis
vercel link
#   → Set up and deploy? y
#   → Which scope? <your account>
#   → Link to existing project? n
#   → Project name? cytogenesis     (Vercel will fall back to a suffixed name if taken)
#   → Code in current directory? y

# 3. First production deploy
vercel --prod
```

Vercel auto-detects Next.js 16 and runs `next build` (Turbopack default). Build output is fully static — every route in this app is `○ Static` per `pnpm build`.

## Subsequent deploys

```bash
vercel --prod
```

Or set up GitHub auto-deploy:

```bash
gh repo create AreteDriver/cytogenesis --public --source=. --remote=origin --push
# Then connect the repo in the Vercel dashboard → Import Project → GitHub.
# After that, every push to main auto-deploys to prod, and PRs get preview URLs.
```

## After the first deploy

1. Note the production URL Vercel printed (likely `https://cytogenesis.vercel.app`, possibly `https://cytogenesis-<scope>.vercel.app` if the bare name is taken).
2. Open `~/projects/arete-portfolio/index.html` and update the Cytogenesis card's `Play` link if Vercel assigned a different URL than `https://cytogenesis.vercel.app`.
3. From `arete-portfolio/`, run `vercel --prod` (or push, if git-integrated) to ship the portfolio update.

## Sanity checks before pushing

```bash
pnpm test    # 60/60
pnpm build   # clean, all routes prerendered ○ Static
```

## Notes

- `vercel.json` adds standard security headers (X-Frame-Options, Referrer-Policy, Permissions-Policy) and immutable cache for `/_next/static/`. No CSP — the Next.js dev tools rely on inline scripts/styles, and tightening it here is best left to a polish-phase pass.
- No `output: "export"` — we're shipping the standard Next.js static prerender, not a flat HTML export. Both work on Vercel; the prerender path is simpler and gives us future room for ISR if we ever want it.
- The d3 bundle is roughly ~80KB gz — fine for v0.1, but a phase-9 polish item is to import only the d3 modules we use (`d3-force`, `d3-zoom`, `d3-drag`, `d3-quadtree`) instead of the umbrella `d3` package.
