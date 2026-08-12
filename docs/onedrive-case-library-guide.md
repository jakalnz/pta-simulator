# Publishing class cases via a shared OneDrive folder

This is the recommended setup if you (a supervisor) want to build up a shared
library of cases with colleagues, and have every student's PTA Simulator
auto-discover them from the Preset dropdown — no emailing files around, no
manifest.json to hand-maintain.

It relies on the app's OneDrive "Class Case Library" mode
(`js/case-library.js`, documented in `CLAUDE.md`), which lists a publicly
shared OneDrive folder's contents anonymously — no Microsoft API key or
account setup beyond normal OneDrive sharing.

## 1. Create the folder

In OneDrive (onedrive.live.com or the desktop/mobile app), create a folder
for the case set, e.g. `PTA Simulator Cases`.

## 2. Give colleagues edit access (named people, not "anyone")

You want colleagues to be able to drop cases in, but you don't want the
whole internet to be able to. OneDrive lets a single folder have two
*separate* links with different permissions, so:

1. Right-click the folder → **Share**.
2. Under "People you specify can view or edit", **add your colleagues by
   email** and set their permission to **Can edit**.
3. Send that invite. This is the link/access colleagues use to actually add
   files — it is *not* the link you'll paste into the app.

## 3. Create the public "view" link for the app

The app needs a second, separate link — one that's viewable by anyone who
has it, since that's what lets it list the folder anonymously without every
student needing a Microsoft account:

1. Right-click the folder → **Share** again (or **Manage access** →
   **+ Add link**).
2. Change the link's audience from "Specific people" to **"Anyone with the
   link"**, and set its permission to **Can view** (not edit — you don't
   want the anonymous link students get to also let them modify or delete
   cases).
3. **Copy this link.** This is the one that goes into the app, not the
   colleague-invite link from step 2.

## 4. Add cases to the folder

Each case is a plain `.json` file, produced by the simulator itself:

1. Open the PTA Simulator, set up a patient (via a built-in preset, then
   **Edit Thresholds** to fine-tune, or dial in real values).
2. Optional: tick **Exam Mode** in the Share dialog first if this case
   should hide the answer key from students (disables their Edit
   Thresholds, obfuscates the underlying values in the file).
3. Click **Export JSON** — this downloads the case file.
4. Drop that file directly into the shared OneDrive folder (web upload,
   desktop sync, or the mobile app all work).
5. **Rename the file to the label you want students to see** — the app
   derives each case's dropdown label from its filename with `.json`
   stripped, e.g. `Case 3 - Mixed Loss, Right Ear.json` shows up as
   *"Case 3 - Mixed Loss, Right Ear"*. Colleagues can do this themselves
   when they add their own cases.

Any colleague you invited in step 2 can repeat steps 1–5 to add their own
cases to the same shared folder — nothing further needs to be reconfigured
on your end.

A few constraints worth knowing:
- Only files **directly inside** that folder are picked up — subfolders
  aren't indexed.
- Only `.json` files are considered; anything else in the folder is
  ignored.
- There's no "hide a case" short of removing or renaming the file — the
  list always reflects the folder's current contents.

## 5. Point the app at the folder

1. In the PTA Simulator, open **Share → Class Case Library**.
2. Paste the "Anyone with the link" URL from step 3.
3. Click **Load**. You should see a status message like *"Loaded N case(s)
   from '...'"*, and the cases appear as a new group in the **Preset**
   dropdown.
4. Give that same link to your students once (course page, LMS
   announcement, etc.) — each of their browsers only needs to paste it in a
   single time. After that it's remembered locally (`localStorage`) and
   silently re-checked for new cases every time they open the app.

## 6. Adding more cases later

Just drop more `.json` files into the same OneDrive folder — no need to
reconfigure or re-share anything. Existing students' browsers pick up new
cases automatically on their next visit (the background refresh); anyone
who wants to see a brand-new case immediately can hit **Load** again in the
Share dialog.

## Troubleshooting

- **"OneDrive folder request failed (4xx)"** — the folder's public link
  permission most likely isn't set to "Anyone with the link can view" (see
  step 3), or the link was later changed/revoked.
- **"No .json case files found in that OneDrive folder"** — check that the
  case files are directly in the folder (not a subfolder) and actually have
  a `.json` extension.
- **A case loads but looks wrong / Edit Thresholds isn't locked when it
  should be** — the file wasn't exported with Exam Mode ticked; re-export
  it from the app with that checkbox on and re-upload.

## Reference

- `CLAUDE.md` — full manifest.json / case-file schema, and why Google Drive
  folder auto-listing isn't supported (use a Drive-hosted `manifest.json`
  instead, per that doc).
- `samples/manifest.json`, `samples/case1-conductive.json`,
  `samples/case2-sensorineural-exam.json` — a working example you can load
  into the app right now to see the feature in action before setting up
  your own OneDrive folder.
