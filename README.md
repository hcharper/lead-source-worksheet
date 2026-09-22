# Lead Source Worksheet

A password-protected worksheet where McWilliams|Ballard marketing marks up our first pass at lead
sources and channels. Served by GitHub Pages; answers go to a Google Sheet.

**The repo is public, so nothing readable is committed.** `index.html` is a password form plus
the actual page, encrypted with AES-256-GCM under a key derived from the password (PBKDF2-SHA256,
600k iterations). The page source, lead counts, password and sheet URL live in `private/`, which is
gitignored. Viewing source on the live site shows only ciphertext.

## Files

| file | what it is | committed |
|---|---|---|
| `index.html` | built output: gate + ciphertext | yes |
| `gate.html` | the password form template | yes |
| `build.mjs` | encrypts `private/` into `index.html` | yes |
| `apps-script/Code.gs` | the Google Sheet endpoint | yes (holds no secret) |
| `private/` | page source, data, `config.json` (password, salt, sheet URL) | **no** |

## Setting up the sheet (once)

1. Create a Google Sheet (any name). **Extensions → Apps Script.**
2. Replace `Code.gs` with `apps-script/Code.gs` from this repo. Save.
3. **Project Settings → Script properties → Add**: `TOKEN` = the "sheet TOKEN" that
   `node build.mjs` prints.
4. **Deploy → New deployment → Web app.** Execute as: **Me**. Who has access: **Anyone**. Deploy,
   authorise, copy the web-app URL (ends in `/exec`).
5. `node build.mjs --api <that URL>`, commit `index.html`, push.

On first open the page loads our first pass into a `take` tab; answers land in `reviews`, one row
per person per item. **Edit our take directly in the `take` tab** — the page picks changes up
within 30 seconds. `channel` holds a channel id (`ch-search`, `ch-pubs`, …), the `id` of a
`kind = channel` row.

"Anyone" access is required for a static page to reach the script. Every request must still carry
the token, which only someone who knows the password can derive.

## Changing the password

`node build.mjs --password <new>`, then update the `TOKEN` script property to the new printed
value, commit and push. Everyone re-enters the password once.

## Rebuilding after a content change

Edit `private/head.html` or `private/app.js`, `node build.mjs`, commit `index.html`, push.
`private/pagedata.json` and `private/seed.json` were generated from the CRM replica on
2026-09-22 by `tools/lead-source-taxonomy.mjs` in the portal repo.
