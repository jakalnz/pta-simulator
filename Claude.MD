Making a Pure Tone Audiometry Simulator based off the simulator available at https://personalpages.manchester.ac.uk/staff/tim.wilding/PTA_Sim/PTAsim.html with documentation available at https://personalpages.manchester.ac.uk/staff/tim.wilding/PTA_Sim/index.html
Key changes include:
1) Updated more modern interface - Phone Touch Friendly, Keyboard Shortcuts for Masking On/Off (M) and Masking Level Up / Down (<Shift + Up Arrow/Down Arrow>), Store (S)
2) Ability to generate and share audiograms as .json in addition to the hyperlink method
3) Ability to toggle Up and Down as louder / quieter or quieter / louder
4) Default to NZ/Australia Icons
5) Allow testing and audiogram generation at 750Hz, 1500Hz
6) Allow selection of Transducer Either Headphones which have a flat IAA = 40dB) or Insertphones IAA varies by Frequency 60db@Hz[125,250,500,750,1000], 50dB@Hz[1500,2000,3000,4000,6000,8000]; Note given how this simulator works this means an additional row for the Thresholds and transmission called Insertphone to cochlea Contra (cross) usiis required with other non-cross references to "Headphone" replaced with "AC Transducer"
Use the images in the folder /Example Images as a design guide
Include a Duration Timer
Allow Save to PDF with Audiogram
The Headphone Insert phone should be a toggle contained within the AC/BC masking select tool

## Class Case Library

Supervisors can publish a set of cases for students to load from the Preset dropdown (Share dialog → "Class Case Library"), via `js/case-library.js`. Two discovery modes, both client-side with no backend or API key:

**Manifest URL** (recommended) — a `manifest.json` hosted anywhere with CORS-permissive access (GitHub raw, a Gist, GitHub Pages, a Drive-hosted file fetched via `https://drive.google.com/uc?export=download&id=<FILE_ID>`, etc.):

```json
{
  "label": "ENT 301 - Week 4 Cases",
  "cases": [
    { "label": "Case 1 - Conductive", "url": "https://.../case1.json" },
    { "label": "Case 2 - Mixed, exam", "url": "https://.../case2.json" }
  ]
}
```

- `label` (manifest, top-level) — optgroup heading in the Preset dropdown. Optional, defaults to "Class Cases".
- `cases[].label` — the option text shown to students.
- `cases[].url` — an **absolute** URL to a case file produced by the app's own "Export JSON" button (Share dialog). Relative URLs are not supported since they'd resolve against the app's own location, not the manifest's.

Each case file must be the app's native session schema (`js/session-serializer.js`, `schemaVersion: 2`): `patientInfo`, `transducer`, `toggleDirection`, `patient` (full physiological model — `cochlear`, `ipsiConductive`, `ascDescDiff`, `psychWidth` per ear, plus `crossIAA.headphone`/`crossIAA.insertphone`, all keyed by frequency), `storedPoints`, `durationSeconds`, `locked`. Don't hand-author these — export them from the app (tick Exam Mode first for a locked/answer-key-hidden case) so the schema stays correct and in sync with the model.

**OneDrive shared folder — currently broken for most accounts, do not recommend.** Paste a personal OneDrive "Anyone with the link" folder share link instead of a manifest URL (detected by URL shape: `1drv.ms` / `onedrive.live.com` / `sharepoint.com`); the app lists it anonymously via OneDrive's legacy `api.onedrive.com/v1.0/shares` API and derives each case's label from its filename (`.json` stripped).

That legacy API returns `401 unauthenticated` for any personal OneDrive account Microsoft has migrated to SharePoint-backed storage (visible as `migratedtospo=true` in the resolved share URL) — which is now most personal OneDrive accounts, confirmed against a real "Anyone with the link, view" folder on 2026-08-12 (the folder itself loads fine anonymously in a browser; the shares API rejects it regardless). The modern replacement, Microsoft Graph's `/shares` endpoint, requires an OAuth bearer token for every request, anonymous or not, so there is no drop-in fix — genuine anonymous folder listing is no longer available from OneDrive for the accounts that matter here. Code and UI still expose this mode (harmless for the shrinking pool of non-migrated accounts, or attempted personal-account edge cases) but it should not be recommended, and any error it produces should point people at the manifest.json path instead.

**Google Drive folder auto-listing is intentionally not supported** — Drive has no anonymous folder-listing endpoint (unlike OneDrive), so it would require every supervisor to create and maintain their own Google API key. Use a Drive-hosted `manifest.json` (fetched via the `uc?export=download` link above) instead.

The configured library URL and last-fetched case list persist in the browser's `localStorage`, so they reappear immediately on reload before any network round-trip, with a silent background refresh on load in case the supervisor has added cases since.