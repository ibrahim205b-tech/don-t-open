# لا تفتح — DON'T OPEN

> بعض الأبواب من الأفضل أن تبقى مغلقة.
> *Some doors are better left closed.*

An interactive Arabic (Iraqi dialect) psychological-mystery experience, with an English option.
Seven stages, seven hidden secrets, four endings, shareable results. It is a static site with
no build step, no backend, no trackers and no third-party requests.

Created and developed by **Ibrahim Ali — إبراهيم علي**. © 2026 Ibrahim Ali — DON'T OPEN.

## Credits & intro

Ownership details live in one place: `js/credits.js` (name in Arabic/English, year, intro lines).
They feed the opening credits (`js/intro.js`: under 4 s, skippable, shown once per browser session
via `sessionStorage`, static under reduced motion), the site footer, the result card and the page
`author` meta tag (the meta tag and the footer's no-JS fallback in `index.html` repeat the text).

## What's inside

| Feature | Where |
| --- | --- |
| Landing page, chapters, secrets & endings collection, privacy notice | `js/app.js` |
| Chapter 1 "الشقة رقم ٧ / Apartment 7": 7 stages, 7 secrets, 4 endings | `js/chapters/chapter1.js` |
| Chapter registry (chapters 2–3 shown as "coming soon") | `js/chapters/index.js` |
| Arabic/English strings, answer normalisation | `js/i18n.js` |
| Validated `localStorage` persistence (survives corruption / blocked storage) | `js/storage.js` |
| Optional synthesised ambient sound (Web Audio, off by default) | `js/audio.js` |
| Challenge links, Web Share + clipboard fallback, PNG result card (canvas) | `js/share.js` |
| Styles, reduced-motion support | `css/style.css` |
| Self-hosted fonts (Noto Kufi Arabic, IBM Plex Sans Arabic — SIL OFL) | `fonts/`, `css/fonts.css` |
| End-to-end tests (Playwright) | `tests/e2e.cjs` |
| Open Graph image + icon generator | `tools/` |

### The story in brief (spoilers)

1. **الباب / The Door**: find the key (bulb → frame). Peephole = secret *eye*.
2. **الرسالة / The Message**: acrostic letter; the answer is **سرداب / cellar**. Holding the letter to the bulb = secret *watermark* (reveals the name **سِدرة / Sidra**).
3. **الاختيار / The Choice**: sign, tear or ignore the visitors' book; this shapes later scenes and endings. Line 9 = secret *date*; the side door = secret *room*.
4. **النمط / The Pattern**: 3×3 "lights-out" candle puzzle (always solvable; hints mark the next correct move). The broken candle after solving = secret *candle* (also reveals Sidra).
5. **الصمت / The Silence**: don't touch anything for 12 s, then notice that the clock runs backwards. Waiting 15 s more = secret *patience*.
6. **السر / The Secret**: dials: 3:17 in a mirror = **713**. Entering **014** = secret *number*.
7. **القرار الأخير / The Final Decision**:
   - Stay → **المراقب / The Observer**
   - Leave → **الناجي / The Escaped**, *unless* you signed the book → **The Observer** (bound variant)
   - Open the red door → **الباب الأخير / The Last Door**
   - Call the door "Sidra" (only offered once you know the name) → **المجهول / The Unknown**

## Run locally

Any static server works (ES modules need `http://`, not `file://`):

```bash
python3 -m http.server 8000
# open http://localhost:8000/
```

## Tests

```bash
npm i -D playwright && npx playwright install chromium   # once
node tests/e2e.cjs                                          # local copy
BASE_URL=https://<user>.github.io/dont-open/ node tests/e2e.cjs   # deployed copy
```

The suite plays every ending, finds every secret, and checks wrong-answer feedback, refresh
persistence, reset, Web Share / clipboard / card download, challenge links, corrupted and blocked
`localStorage`, keyboard play, 320 px layouts and asset links.

## Adding a chapter

1. Copy the shape of `js/chapters/chapter1.js` into `chapter2.js` (`stages`, `secrets`, `clues`,
   `endings`, `resolve`, `reasonLines`). Use globally unique secret/ending ids.
2. In `js/chapters/index.js`, import it and replace the `comingSoon(2, …)` placeholder.

Stored progress is validated against the registry, so old saves keep working.

## Privacy

Everything is stored in the visitor's own `localStorage`. Sharing sends only the site URL, an
ending id and a secret count, and only when the visitor presses a share button. Challenge links are
created on the visitor's device and are **not** server-verified.

## Regenerating the social image / icons

```bash
node tools/render-assets.cjs   # needs playwright
```
