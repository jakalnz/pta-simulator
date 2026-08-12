# Publishing class cases via manifest.json (recommended)

This is the reliable way to run a Class Case Library — it doesn't depend on
any cloud provider's folder-listing API (the OneDrive route does, and that
API is currently broken for most accounts — see
[the OneDrive guide](onedrive-case-library-guide.md) for why). A manifest is
just one small JSON file you host somewhere; everything downstream is a
plain HTTPS fetch.

## Exactly how it works

There is no cloud-provider integration involved at all — just two ordinary
`fetch()` calls, both made straight from the student's browser (`js/case-library.js`):

1. **You paste a manifest URL** into Share → Class Case Library → Load. The
   app does `fetch(manifestUrl)` and expects back:
   ```json
   {
     "label": "ENT 301 - Week 4 Cases",
     "cases": [
       { "label": "Case 1 - Conductive", "url": "https://.../case1.json" },
       { "label": "Case 2 - Mixed, exam", "url": "https://.../case2.json" }
     ]
   }
   ```
2. The app builds a new `<optgroup>` in the **Preset** dropdown from
   `cases[]` — one `<option>` per entry, labelled with `cases[].label`.
   Nothing is downloaded yet at this point; only the small index file was
   fetched.
3. **When a student picks a case**, *that's* when the app fetches the
   second thing: `cases[].url` for the one they selected. This file must be
   the app's own native session format — exactly what **Export JSON**
   produces (`js/session-serializer.js`, `schemaVersion: 2`): patient
   physiology, stored threshold points, transducer, direction, and the
   `locked` flag.
4. That JSON is validated (`deserializeSession`) and applied to the running
   app (`applySession`) — physiology, stored points, transducer, direction
   all update live. If `locked: true`, Exam Mode engages the same way it
   does for a shared link or Wilding import: Edit Thresholds disables, and
   the patient data was already obfuscated inside the file by Export JSON
   (ticking Exam Mode before exporting), so nothing sensitive was ever
   sitting in plaintext on the case host.
5. The manifest URL **and** the resolved case list are cached in the
   browser's `localStorage`. Next time that student opens the app, the
   cached list populates the dropdown immediately — no network wait, works
   even offline — while a background `fetch` silently re-checks the
   manifest in case you've added cases since. If that background check
   fails (host down, no internet), it just keeps showing the cached list
   rather than erroring.

**One rule that trips people up:** `cases[].url` must be an **absolute**
URL (`https://...`), not a relative one like `case1.json`. The reason is
mechanical, not arbitrary — step 3's fetch resolves relative to the *app's
own page location*, not the manifest file's location, since the browser has
no way to know where the manifest came from by the time it's just handling
a fetch call. An absolute URL sidesteps the ambiguity entirely.

**Why not every host works:** both fetches are cross-origin (the manifest
and case files live on a different domain than the app). The browser will
only allow that if the host sends CORS headers permitting it
(`Access-Control-Allow-Origin`). Plain file hosts that don't set this header
will silently fail with a CORS error in the browser console. This is the
actual selection criterion below — not "which service is popular," but
"which services serve raw JSON with CORS enabled, for free, with no auth."

## Where to host it

| Host | Anonymous read | CORS | Setup effort | Notes |
|---|---|---|---|---|
| **GitHub repo (raw.githubusercontent.com)** | ✅ | ✅ | Low | Recommended default. Free public repo, commit case files + manifest.json, use the "Raw" URL. Fully versioned — you get history/diffs on every case for free. |
| **GitHub Gist** | ✅ | ✅ | Low | One gist can hold the manifest *and* every case file together (each file in a gist gets its own raw URL) — no repo needed if you want something lighter-weight than a full repo. |
| **GitHub Pages** (this project already uses it) | ✅ | ✅ | Low | If you already publish a class site via Pages, drop the JSON files in and link straight to them — this is exactly how `samples/manifest.json` in this repo is served. |
| **Google Drive** (single file, not a folder) | ✅ | ✅ | Low | Fetch the file directly via `https://drive.google.com/uc?export=download&id=<FILE_ID>` (right-click the file → Get link → extract the ID). Works for the manifest itself and for individual case files — Drive's *folder listing* API is the thing that needs a key, not fetching one known public file. |
| **OneDrive** (single file, not a folder) | ⚠️ untested | ⚠️ | Low | The broken piece is specifically *anonymous folder listing*. A direct link to one individual public file may still work fine, since that's just ordinary file sharing, not the same API. Worth trying if you're already committed to OneDrive — get each file's "Anyone can view" link and reference it explicitly in the manifest instead of relying on auto-discovery. Not verified working as part of this investigation, so test it with one case first. |
| Your own web host / LMS file storage | Depends | Depends | Varies | Works if it serves the raw file with `Content-Type: application/json` (or similar) and doesn't block cross-origin requests. Many LMS file-storage areas *do* block this — check by pasting the file URL into a browser: if it downloads instead of displaying, or the app reports a CORS error, that host won't work. |

**Not recommended:** Dropbox and Box both require an authenticated API call
even to read a "public" shared file — no anonymous path, same category of
problem as Google Drive's folder listing. Amazon S3 / Cloudflare R2 *can*
work (a public bucket with CORS enabled serves raw JSON anonymously) but
require standing up real cloud infrastructure — overkill unless you're
already managing one for other reasons.

## Practical recipe (GitHub repo)

1. Create a public GitHub repo (or a folder in an existing one), e.g.
   `pta-cases`.
2. Export each case from the app (**Export JSON**, ticking **Exam Mode**
   first for locked cases) and commit the files.
3. Add a `manifest.json` at the repo root or in that folder, listing each
   case with its **raw** URL — click a file on GitHub, then **Raw**, and
   copy that URL (`https://raw.githubusercontent.com/<user>/<repo>/<branch>/<path>`).
4. Paste the manifest's own raw URL into Share → Class Case Library → Load.
5. To add a case later: commit a new file, add an entry to `manifest.json`,
   push. Students' browsers pick it up automatically on their next visit
   (or immediately if they hit Load again).

## Reference

- `samples/manifest.json`, `samples/case1-conductive.json`,
  `samples/case2-sensorineural-exam.json` — a working example hosted this
  exact way (GitHub Pages) that you can load right now.
- `CLAUDE.md` — full manifest/case-file schema reference.
- `js/case-library.js` — the actual fetch/cache logic described above.
