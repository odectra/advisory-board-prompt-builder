# Advisory Board Prompt Builder

A short conversational flow that turns a topic, some personal context, and a
goal into a personalised "expert panel" prompt — four fictional experts you
paste into your own AI model of choice and question like an advisory board.

No accounts, no database beyond anonymous star-rating feedback. Static
frontend (HTML/CSS/vanilla JS, no build step) plus a single Cloudflare
Worker that makes one Anthropic API call per session.

Built by Oskar Lindvall, linked from [olindvall.se/projects](https://olindvall.se/projects).

## How it works

1. You answer four quick questions: topic, optional personal context, your
   goal, and which AI model you'll paste the result into.
2. The Worker verifies you're not a bot (Cloudflare Turnstile), validates
   your input, and asks Claude Haiku to write a system-style prompt that
   sets up four fictional expert personas tailored to your inputs.
3. You copy the prompt and paste it into a new conversation in your chosen
   model. The experts introduce themselves and take your questions from
   there — no further calls to this app.
4. Optionally, you rate the result. Only the star rating and comment are
   ever stored — never your topic, context, or the generated prompt.

## What the LLM adds

The panel *mechanics* — persistent personas, the debate rule, the
addressing convention, source discipline, the introduction — are a fixed
template baked into the Worker's system prompt (`worker.js`). What the LLM
actually contributes each time is **persona selection** (inventing four
personas that fit your specific topic) and **model-specific formatting**
(XML structure for Claude, markdown for ChatGPT/Copilot/Gemini, lighter
structure for Perplexity). It is not reasoning about your topic — it is
authoring a prompt about your topic.

## Repository layout

```
worker.js                    Cloudflare Worker: /generate, /feedback
wrangler.toml                Worker config (name, bindings, vars)
.dev.vars.example            Template for local secrets — copy to .dev.vars
package.json                 devDependency on wrangler + npm scripts
scripts/quality-check.mjs    Sends 8 varied prompts to a local Worker
scripts/hardening-check.sh   curl-based acceptance checks (section 11)
PHASE1_REVIEW.md             Checklist for judging quality-check output

index.html, style.css, app.js   Static frontend (no build step)
assets/preview.svg              Project-card preview image (1280×720)
assets/favicon.svg              App favicon
project-card-snippet.html       Ready-to-paste card for olindvall.se/projects
```

## Prerequisites

- Node.js (for `npx wrangler` and the quality-check script)
- A Cloudflare account with Workers, Workers KV and the Rate Limiting
  binding available
- An Anthropic API key, ideally in its own workspace with a spend limit
  (see "Cost note" below)
- `npm install` in this directory once, to pull in `wrangler` as a
  devDependency

## Setting up Cloudflare (manual steps)

None of this was run for you — it needs your Cloudflare and Anthropic
credentials, which this build environment intentionally did not have
access to. Everything below is a placeholder until you do this.

### 1. Create the KV namespace

```
npx wrangler kv namespace create ADVISORY_FEEDBACK
```

This prints an `id`. Open `wrangler.toml` and replace
`REPLACE_WITH_KV_NAMESPACE_ID` in the `[[kv_namespaces]]` block with that
id. The binding itself (name `ADVISORY_FEEDBACK`) is already declared in
`wrangler.toml` — there is deliberately no dashboard-created binding to
keep config in one place.

### 2. Create the Turnstile widget

In the Cloudflare dashboard → Turnstile, create a new widget:

- Widget mode: **Managed**
- Hostnames: your deployed origin(s), e.g. `olindvall.se` and, if you also
  serve the GitHub Pages fallback, `olindvall.github.io`. Add `localhost`
  too if you want to test the real widget locally (Turnstile allows
  `localhost` on any site key, per Cloudflare's docs).

Copy the **Site Key** it gives you — you'll need it for step 5 below. The
**Secret Key** goes into a Worker secret in step 3, never into `wrangler.toml`
or any committed file.

### 3. Set Worker secrets

```
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
```

Paste the real values when prompted. These never touch the repository.

### 4. Deploy the Worker

```
npx wrangler deploy
```

Note the `*.workers.dev` URL it prints (or your configured route/custom
domain, if you set one up).

### 5. Point the frontend at your Worker

Open `app.js` and fill in the `CONFIG` object at the top:

```js
const CONFIG = {
  WORKER_URL: 'https://advisory-board-prompt-builder.YOUR-SUBDOMAIN.workers.dev',
  TURNSTILE_SITE_KEY: 'YOUR_TURNSTILE_SITE_KEY',
};
```

### 6. Enable GitHub Pages

In this repository's Settings → Pages, deploy from the branch containing
`index.html` (root). Confirm the live URL — either
`https://olindvall.github.io/advisory-board-prompt-builder/` or, if you
attach `olindvall.se` as a custom domain for this repo,
`https://olindvall.se/advisory-board-prompt-builder/`.

If your live origin differs from the placeholders already in
`wrangler.toml`'s `ALLOWED_ORIGINS`, update it and redeploy the Worker
(`npx wrangler deploy`). Also revisit the Turnstile widget's allowed
hostnames (step 2) if the origin changed.

### 7. Add the project card to olindvall.se/projects

See `project-card-snippet.html` for the exact markup/data-object shape,
matching `src/pages/projects.astro`'s existing `project-card` structure and
class names. Two placeholders in it need your real deployed URL once you
have one:

- The `<img src>` / `image` field — either point it at
  `https://olindvall.se/advisory-board-prompt-builder/assets/preview.svg`
  (this app hosts its own preview asset, same pattern as the "Financial
  Business Case" and "Property Investment" cards, which point at
  `https://odectra.github.io/financial-business-case/previews/...png`
  rather than a copy inside olindvall.github.io), **or** copy
  `assets/preview.svg` into olindvall.github.io's
  `public/images/projects/` and reference it as
  `/images/projects/advisory-board-prompt-builder-preview.svg` like the
  Savings Calculator and Fuel Calculator cards do. Either is consistent
  with existing precedent on the site — pick whichever you'd rather
  maintain.
- The `<a href>` / `href` field — your deployed app URL from step 6.

### 8. Where the card fits

`olindvall.se/projects` currently has three categories, derived
automatically from each project's `category` field: **Journal**,
**Finance**, and **Training**. There is no existing "AI / Learning"
category — this card introduces one. Because the category filter chips on
that page are generated from `[...new Set(projects.map(p => p.category))]`,
adding this project with `category: 'AI / Learning'` is enough; a new
filter chip appears automatically, no other page changes needed.

## Running locally

```
npm install
cp .dev.vars.example .dev.vars   # then fill in a real ANTHROPIC_API_KEY
npx wrangler dev
```

`wrangler dev` serves the Worker at `http://localhost:8787`, using local
(non-billing) emulations of KV and the rate limiters. `.dev.vars.example`'s
`ENVIRONMENT=development` also makes the Worker skip rate limiting locally,
since `wrangler dev` cannot provision real production rate limiters.

To exercise the frontend against it, open `index.html` directly in a
browser (or serve the directory with any static file server) with
`CONFIG.WORKER_URL` in `app.js` temporarily set to
`http://localhost:8787`.

## Running the quality check (from Phase 1)

With `wrangler dev` running in one terminal:

```
npm run quality-check
```

This sends 8 varied sample requests (all four goals, all six target
models, one empty context) to `http://localhost:8787/generate`, using
Cloudflare's published Turnstile dummy token/secret pair (already set in
`.dev.vars.example`) so the Turnstile check passes locally without a real
widget. Each result is written to `quality-output/NN-topic.md`
(gitignored). Review them against `PHASE1_REVIEW.md`.

## Acceptance checks (section 11)

```
wrangler dev            # in one terminal
scripts/hardening-check.sh   # in another
```

Checks: missing/invalid Turnstile token → 403, topic over 1,000 chars →
400, body over 8,000 bytes → 413, invalid goal/model string → 400,
disallowed Origin → 403, rating of 7 or non-integer rating → 400, comment
over 500 chars → 400, rapid repeated requests → 429, plus static
`git grep` checks that no Anthropic key or Turnstile secret pattern is
committed and that `.gitignore` covers everything it should.

Two of these need a live Turnstile pass to reach the validation code
they're actually testing (see "What I could not verify" below) and the
429 check needs rate limiting active (it's off under
`ENVIRONMENT=development`) — point `WORKER_URL` at a deployed Worker with
real secrets to exercise them for real:

```
WORKER_URL=https://your-worker.workers.dev scripts/hardening-check.sh
```

## Security and abuse hardening

In place, in `worker.js`:

- **Turnstile** on `/generate`, verified server-side against Cloudflare's
  siteverify endpoint, without forwarding the caller's IP.
- **Rate limiting** via the Workers Rate Limiting binding, keyed on
  `CF-Connecting-IP` (used only as an ephemeral limiter key — never stored
  or logged): 2 req/60s on `/generate`, 3 req/60s on `/feedback`. Fails
  closed (denies the request) in production if the binding is missing.
- **Strict input validation**: body size cap (8,000 bytes → 413), field
  length/type/enum checks, control-character stripping, and stripping of
  the XML delimiter tags used in the Anthropic request so user text can't
  forge a fake `<goal>` or `<target_model>` boundary.
- **Fixed cost controls**: `max_tokens: 2000` is hardcoded, never taken
  from the client; a 45-second `AbortController` timeout on the Anthropic
  call; a truncated (`stop_reason: "max_tokens"`) response is rejected
  with a friendly 502 rather than returned partial.
- **Origin-restricted CORS**: only origins in `ALLOWED_ORIGINS` are
  reflected; a present-but-disallowed `Origin` header gets 403. This is a
  browser-side control only — it does nothing against a non-browser script
  that omits or forges the header. Turnstile and rate limiting are the
  real defenses against abuse.
- **No logging** of request bodies, prompts, topics, contexts, comments,
  or IPs. `[observability] enabled = false` in `wrangler.toml`.
- **Response hygiene**: `Cache-Control: no-store`, JSON everywhere,
  generic `{ "error": "..." }` messages — upstream Anthropic error bodies
  and stack traces are never forwarded to the client.
- **Isolation**: `/feedback`'s KV write is wrapped in its own try/catch and
  shares no state with `/generate` — a KV outage cannot affect prompt
  generation.
- **Frontend**: all dynamic/model-generated text is rendered with
  `textContent`, never `innerHTML`.

**Residual risk**: a determined, distributed attacker (many IPs, real
Turnstile solves) can still drive up Anthropic spend — no combination of
Turnstile, per-IP rate limiting and input validation fully prevents that
for a public, unauthenticated endpoint. The backstop is a **spend limit on
the Anthropic workspace** this API key belongs to (see "Cost note" below),
not anything in this codebase.

## Privacy notes

- `/feedback` stores only `{ rating, comment, createdAt }` in KV, keyed
  `feedback:{ISO timestamp}:{8-char random suffix}`. No IP, no user agent,
  no topic, no context, no generated prompt.
- Your topic, context, goal and target-model choice are sent to
  Anthropic's API to generate the prompt, per
  [Anthropic's usage policies](https://www.anthropic.com/legal/aup) — the
  Worker does not otherwise store or log them.
- Cloudflare Turnstile runs on every `/generate` request; Cloudflare may
  retain its own operational metadata (e.g. for abuse prevention) outside
  this app's control — see
  [Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/).
- The Worker does not log request bodies, and `[observability]` is
  disabled in `wrangler.toml`.

## Cost note

At current published pricing, Claude Haiku 4.5 is $1 / MTok input and
$5 / MTok output. A single `/generate` call (short system prompt +
short user inputs, up to 2,000 output tokens) costs roughly
**$0.005–0.01** — mostly driven by the output tokens actually generated,
which are usually well under the 2,000 cap for a ~500–900 word prompt.
Verify current pricing at
[platform.claude.com/docs/en/about-claude/pricing](https://platform.claude.com/docs/en/about-claude/pricing)
before relying on this estimate. Given the endpoint is public and
unauthenticated, put this API key in its own Anthropic workspace with a
dedicated spend limit — that limit, not anything in the code, is the real
ceiling on worst-case cost (see "Residual risk" above).

## Assumptions

Decisions made without a `design-reference/` folder (none existed in the
target repo), or where the source brief was ambiguous or its PDF text was
cut off in extraction:

1. **No Google-hosted fonts.** olindvall.se loads Fraunces (serif) and
   Inter (sans) from Google Fonts. The brief disallows any third-party
   JS/CSS beyond Turnstile, so this app uses the same font *stacks* with
   system fonts instead: `ui-serif, Georgia, 'Times New Roman', serif` and
   `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif`. Same
   oklch color palette, spacing, `--radius` and `--shadow-card` values as
   `src/layouts/Layout.astro`, copied verbatim for both light and dark
   mode.
2. **No primary CTA button precedent on the site to copy.** The savings
   calculator and other project pages use tabs, chips and cards, but no
   filled primary button. `.btn-primary` here is modeled on the site's
   existing `.chip.active` / `.status-live` treatment (solid
   `--color-accent` background, `--color-bg` text).
3. **Option cards auto-advance on selection** (steps 3 and 4) rather than
   requiring a separate "Continue" click — the brief specifies the cards
   but not a Continue button for those two steps, and immediate advance
   fits its "conversational and calm, not form-like" requirement.
4. **Preview image is an original abstract SVG illustration**
   (`assets/preview.svg`), not a screenshot, matching the 1280×720
   dimensions of the existing PNG card previews
   (`public/images/projects/*.png` in olindvall.github.io) and reusing the
   exact accent/cream hex values from the site's existing favicon
   (`#a54f35` / `#fcf6ed`) since oklch values aren't directly usable as
   static SVG fills without a conversion.
5. **Card CTA text and target.** The brief specifies "Try it →" for this
   card, even though the site's own convention for *external* links is
   "Visit ↗" (internal `/projects/...` links get "Try it →"). Followed the
   brief's literal text, added `target="_blank" rel="noopener noreferrer"`
   since the deployed app is on a different origin/repo, consistent with
   how the site's other external tool cards behave.
6. **Preview asset hosting**: rather than copying `assets/preview.svg`
   into olindvall.github.io (out of scope — that repo was read-only for
   this build), `project-card-snippet.html` points at the asset hosted
   from this app's own deployed origin, the same pattern already used by
   the "Financial Business Case" and "Property Investment" cards on
   `olindvall.se/projects`. See step 7 above for the alternative.
7. Added `assets/favicon.svg` for the standalone app, styled like the main
   site's favicon (`rx="8"` rounded square, accent fill, initials) but
   with "AB" instead of "OL" — not requested explicitly, but low-risk and
   consistent with a polished standalone deployment.

**Update:** an earlier version of this list included an assumption that
the Worker's system prompt had to be authored from the brief's 10
numbered requirements rather than copied verbatim, because the source
PDF's system-prompt callout was laid out in a box that clipped every line
at the right margin in plain-text extraction. That was fixed:
`SYSTEM_PROMPT` in `worker.js` now holds the brief's actual verbatim text,
recovered via block-level PDF extraction (the clipped lines turned out to
belong to a separate floating text box that simple linear text extraction
had skipped past entirely) and confirmed against the original brief. No
open assumption remains there.

## What I could not verify

This build environment intentionally has no Cloudflare or Anthropic
credentials, and its outbound network policy blocks `*.cloudflare.com`
entirely (confirmed: direct `curl` to
`https://challenges.cloudflare.com/turnstile/v0/siteverify` and to
`developers.cloudflare.com` both fail at the network layer, not at the
application layer). Given that:

**Verified:**
- `node --check` passes on `worker.js`, `app.js` and
  `scripts/quality-check.mjs`.
- `bash -n` passes on `scripts/hardening-check.sh`.
- `npx wrangler dev` boots cleanly against `wrangler.toml` as committed —
  all bindings (`ADVISORY_FEEDBACK` KV, both rate limiters, all vars and
  secrets) resolve and show up in the local binding summary.
- Against that local `wrangler dev`, confirmed by hand and via
  `scripts/hardening-check.sh`: request-body-too-large → 413, malformed
  rating → 400, comment-too-long → 400, disallowed Origin → 403, valid
  `/feedback` → 200 with a real KV write, and missing/invalid Turnstile
  token → 403.
- Rate limiting is correctly **skipped** under `ENVIRONMENT=development`,
  as designed (confirmed 5 rapid `/feedback` calls all returned 200
  locally) — this is expected local behavior, not a bug; it needs a
  deployed Worker to verify the 429 path for real.

**Could not verify, because the network path to Cloudflare is blocked in
this environment:**
- Real Turnstile verification end-to-end (the siteverify call itself never
  reaches Cloudflare here) — this also means the input-validation checks
  that sit *behind* a successful Turnstile pass (topic length, goal/model
  enum) could only be exercised by temporarily reordering the Worker's
  checks for a local test, which I did not do since that would test
  different code than what's shipped. The validation logic itself is
  simple and directly inspectable in `worker.js`; I'd still recommend
  re-running `scripts/hardening-check.sh` against a real deployment before
  trusting it fully.
- Any real Anthropic API call (would need a real key, which I was told not
  to use) — so the actual quality of generated prompts is unverified.
  Please run `npm run quality-check` yourself once you have a key in
  `.dev.vars`, and judge the output against `PHASE1_REVIEW.md`.
- `wrangler deploy`, `wrangler secret put`, `wrangler kv namespace create`
  — none of these were run, per your instructions.
- The real Turnstile widget rendering/UX in a browser (explicit render,
  expired/error callbacks) — the JS logic in `app.js` is written and
  internally consistent, but I could not load `challenges.cloudflare.com`'s
  script in this environment to click through it.
- GitHub Pages serving behavior, and the live site's actual response to
  the deployed app (both need a real deploy).

## Tuning the prompt

`SYSTEM_PROMPT` in `worker.js` is the whole "product" here — persona
quality and model-specific formatting come entirely from it. Test it with
`npm run quality-check` against real output, judge the results against
`PHASE1_REVIEW.md`, and iterate on the prompt text directly in
`worker.js`.
