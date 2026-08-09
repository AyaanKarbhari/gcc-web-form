# GCC form — setup

A static page on Cloudflare Pages, a Google Sheet behind it. No server, no cost.

```
build.js                 fills config from env vars at deploy time
package.json
.gitignore
src/index.html           the form (logos baked in, config placeholders)
functions/api/submit.js  optional proxy — only used if you turn it on
Code.gs                  paste into Apps Script, not into this repo
```

---

## First, the honest bit about "secrets"

**The Google client ID is not secret.** It's sent to every visitor's browser — that's how
Google sign-in works. Anyone can read it in View Source. Same for the Apps Script URL if the
page posts to it directly.

Putting them in Cloudflare environment variables buys you real things:

- nothing hardcoded in the repo, so the values never land in git history
- different values for Production and Preview deployments
- rotate a value by editing one field and redeploying, not by editing HTML

It does **not** buy you security. What actually protects the sheet is the token check inside
Apps Script (see "How the domain lock works" below) — that's what stops a stranger writing
rows, not the visibility of the client ID.

The one value that *can* be genuinely hidden is the Apps Script URL, using the optional
proxy in step 5.

---

## 1. Sheet + Apps Script

1. Create a Google Sheet (e.g. **GCC Applications 2026**).
2. **Extensions → Apps Script**, delete the starter code, paste all of `Code.gs`.
3. In the editor, select `setupProperties` from the function dropdown and **Run** once.
   That creates the script properties. Authorise when prompted.
4. **Project Settings → Script properties**, set `CLIENT_ID` (you'll have it after step 2 —
   come back for this). The others have sane defaults:

   | Property | Default | Does what |
   |---|---|---|
   | `CLIENT_ID` | — | Must match `GCC_CLIENT_ID`. Tokens issued for any other app are rejected. |
   | `ALLOWED_DOMAIN` | `gsfcuniversity.ac.in` | The only domain that can submit. |
   | `SHEET_NAME` | `Form Responses 1` | Tab the rows land in. |
   | `ALLOW_EDITS` | `false` | `false` blocks a second submission from the same account. `true` overwrites their earlier row. |
   | `CLOSES_ON` | `2026-08-15T23:59:59+05:30` | Hard cutoff. Clear it to stay open. |

5. **Deploy → New deployment → Web app**, Execute as **Me**, access **Anyone**.
   Copy the `/exec` URL.

   > Access **must** be `Anyone`. Any narrower setting produces a URL shaped
   > `https://script.google.com/a/macros/<your-domain>/s/…/exec`, which returns **401** to the
   > browser's anonymous POST with no CORS headers — the form then reports
   > *"Your response wasn't saved: Load failed"*. A correct deployment URL has no
   > `/a/macros/<domain>/` segment. This does not weaken anything: `verifyToken()` is what
   > guards the sheet, and it runs on every submission regardless.

## 2. Google sign-in credential

1. <https://console.cloud.google.com/> → new project (e.g. `gcc-form`).
2. **OAuth consent screen** → **Internal** if the project sits under the university
   Workspace; that adds domain enforcement at Google's own level. Otherwise **External**.
3. **Credentials → Create credentials → OAuth client ID → Web application**.
4. **Authorised JavaScript origins** — add your Pages URL exactly, no trailing slash, no path:
   - `https://gcc-web-form.pages.dev`
   - plus your custom domain if you add one
   - plus `http://localhost:8788` for local testing
5. Copy the client ID, and put it in the Apps Script `CLIENT_ID` property from step 1.4.

## 3. Push the repo

Push this folder to GitHub. `dist/` and `.env` are gitignored — the build regenerates them.

## 4. Cloudflare Pages

**Workers & Pages → Create → Pages → Connect to Git**, pick the repo, then:

| Setting | Value |
|---|---|
| Framework preset | None |
| Build command | `node build.js` |
| Build output directory | `dist` |

Then **Settings → Variables and secrets**, add these for **Production** *and* **Preview**:

| Variable | Type | Value |
|---|---|---|
| `GCC_CLIENT_ID` | Plaintext | `…apps.googleusercontent.com` |
| `GCC_ENDPOINT` | Secret | your `/exec` URL |
| `GCC_DOMAIN` | Plaintext | `gsfcuniversity.ac.in` *(optional)* |
| `GCC_DEADLINE` | Plaintext | `15 Aug 2026` *(optional — display only)* |

`GCC_CLIENT_ID` is marked plaintext deliberately: it ends up in the page anyway, and
plaintext stays readable in the dashboard, which makes it easy to check against the Apps
Script property. Marking it Secret would hide it from you without hiding it from anyone else.

Deploy. If a variable is missing or malformed the build **fails loudly** rather than
shipping a form that silently can't submit.

## 5. Optional — hide the Apps Script URL

By default the page posts straight to Apps Script, so the URL is in the page source. Someone
could POST to it directly — they still can't write a row without a valid university token,
but they can make noise.

To route submissions through your own domain instead, add one more variable:

| Variable | Type | Value |
|---|---|---|
| `GCC_USE_PROXY` | Plaintext | `1` |

Now the page posts to `/api/submit`, and `functions/api/submit.js` forwards it using
`GCC_ENDPOINT` read server-side. The Apps Script URL never reaches the browser. Bonus: it's
same-origin, so CORS stops being a consideration at all.

Cost: one extra hop, and a Pages Functions invocation per submission (free tier is 100k
requests/day — a club intake won't come close).

## 6. Local testing

```bash
cp .env.example .env      # or just export the vars inline
npm run build
npx wrangler pages dev dist      # serves the built page, runs functions/ too
```

Add `http://localhost:8788` to the authorised origins in step 2.4 or sign-in won't render.

---

## How the domain lock actually works

Two checks, and only the second one counts:

- **In the browser** — the account chooser is hinted to `gsfcuniversity.ac.in`, and a
  personal account gets a clear error instead of the form. Convenience only; dev tools
  defeat it.
- **In Apps Script** — every submission's token is re-verified against Google
  (`oauth2.googleapis.com/tokeninfo`). The row is rejected unless the token was issued for
  *your* client ID, the email is verified, and the hosted domain matches. Nothing reaches
  the sheet without passing this.

This is why the client ID's visibility doesn't matter: a token minted for a different app
fails the `aud` check, and a token from a personal Gmail fails the domain check.

## Before you announce it

- Personal Gmail → refused at the gate.
- University account → row appears with the right columns (check `Course` specifically).
- Same account again → refused as a duplicate.
- School → Stream → Course cascade: pick SOT, then SOS, and confirm the Course list changes
  and no stale option stays selected.
- Phone → single column, everything tappable.
- Break `GCC_ENDPOINT` on a preview deploy → the form shows a visible error, not a silent
  success.

## When something breaks

Every one of these has been hit on this project. All of them fail *quietly*, which is why
they're worth knowing by shape.

| Symptom | Cause | Fix |
|---|---|---|
| Page renders but no sign-in button, no console error you'd notice | A top-level `const` doesn't become a `window` property, so a second `<script>` reading `window.X` got `undefined` and threw on first use | Config object is assigned as `window.GCC_CONFIG` — keep it that way |
| *"Your response wasn't saved: Load failed"* | Apps Script deployed with narrower access than **Anyone** → 401, no CORS headers | Re-deploy as Anyone; the URL must not contain `/a/macros/<domain>/` |
| `{"ok":false,"error":"form is not configured…"}` | `CLIENT_ID` script property is empty | Run `setupProperties` **in the Apps Script editor** — editing the copy of `Code.gs` in this repo does nothing |
| `{"ok":false,"error":"sign-in was issued for a different app"}` | `setupProperties` ran with the placeholder still in it | Set the real client ID in Project Settings → Script properties |
| Front-end says *Application received*, no row appears | `SHEET_NAME` doesn't match the tab name, so `getSheet()` silently **created a new tab**; or `appendRow` landed below stray content far down the sheet | Run `whereAmI()` (below) and compare tab names character for character |
| A deploy "goes backwards" — old content returns | Cloudflare Pages doesn't rebuild on env-var changes, so a **Retry deployment** on an older entry rebuilds *that commit* and promotes it | Check the commit hash on the deployment marked Production; retry the newest one |
| A new sheet column shifts other answers | `Code.gs` referenced two columns positionally (`HEADERS[11]`, `HEADERS[12]`) | After inserting a column, re-check every numeric `HEADERS[n]` index |
| New answers silently missing from the sheet | `Code.gs` pasted but not re-deployed | **Deploy → New deployment**; saving is not enough |

Paste this into the editor and run it to see which spreadsheet and tab the script is
actually writing to:

```js
function whereAmI() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('Spreadsheet: ' + ss.getName() + ' — ' + ss.getUrl());
  Logger.log('SHEET_NAME property: ' + JSON.stringify(SHEET_NAME));
  ss.getSheets().forEach(function (s) {
    Logger.log('  tab ' + JSON.stringify(s.getName()) +
               ' — lastRow=' + s.getLastRow() + ', lastCol=' + s.getLastColumn());
  });
}
```

**View → Executions** in the editor lists every `doPost` run with its status — the fastest
way to tell "never arrived" from "arrived and was rejected".

## Logos

Baked into `src/index.html` as data URIs, so the page stays one self-contained file. Already
background-removed, trimmed and compressed — the whole page including all four logo variants
is about 164 KB. `gcc-logo-horizontal.png` and `gcc-logo-square.png` are the cleaned
transparent versions, handy for slides and socials.

To swap one, replace the matching `data:image/png;base64,…` string. The four uses are:
masthead (horizontal), sign-in card (square), hero watermark (globe only, cream), favicon.

## Notes

- Sheet columns match a Google Forms response sheet exactly, so existing exports and filters
  keep working. `Course` was added after the fact, between `Stream` and `Semester` — adding a
  column means editing `HEADERS`, the `row` array, *and* inserting the column in the sheet.
- School drives Stream drives Course, all rendered from the `STREAMS` / `COURSES` maps in
  `src/index.html`. Options are built in JS rather than hidden in markup, so an option that
  doesn't apply can't end up checked and submitted. A group with exactly one option
  auto-selects, which is how BCA (no sub-courses) keeps `Course` non-empty without a special
  case anywhere else.
- The POST uses `text/plain` on purpose — Apps Script can't answer a CORS preflight, and this
  avoids one. Don't switch it to `application/json`.
- Email is filled from the signed-in account and locked, so it can't be mistyped.
