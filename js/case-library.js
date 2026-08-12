// Supervisor-hosted case discovery for the Preset dropdown. Two sources,
// both client-side/no-backend:
// - a manifest.json {label, cases:[{label,url}]} hosted anywhere with CORS
//   (the recommended, reliable path — see CLAUDE.md)
// - a OneDrive "Anyone with the link" shared folder, listed anonymously via
//   the legacy public shares API. KNOWN BROKEN as of 2026-08 for personal
//   OneDrive accounts Microsoft has migrated to SharePoint-backed storage
//   (now most of them) — that API returns 401 even for genuinely public
//   folders, and the modern Graph API replacement requires an OAuth token
//   for every request, anonymous or not, so there's no drop-in fix. Left in
//   place (harmless for the shrinking pool of non-migrated accounts) but
//   the error message below steers people at the manifest path instead of
//   leaving them stuck on a cryptic 401. See CLAUDE.md for the full story.
import { deserializeSession } from './session-serializer.js';

const STORAGE_KEY = 'pta-case-library';

function isOneDriveUrl(url) {
  return /(^|\.)onedrive\.live\.com|1drv\.ms|sharepoint\.com/i.test(url);
}

// https://learn.microsoft.com/en-us/onedrive/developer/rest-api/api/shares_get
function encodeOneDriveShareUrl(url) {
  return `u!${btoa(url).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')}`;
}

async function resolveOneDriveFolder(shareUrl) {
  const apiUrl = `https://api.onedrive.com/v1.0/shares/${encodeOneDriveShareUrl(shareUrl)}/root?expand=children`;
  const res = await fetch(apiUrl);
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(
        'OneDrive rejected this (401), even if the folder is genuinely shared as "Anyone with the link". '
        + 'This affects most personal OneDrive accounts now — Microsoft has broken anonymous folder listing '
        + 'for accounts migrated to SharePoint-backed storage, and there is no fix on your end. '
        + 'Use a manifest.json link instead (see the Class Case Library guide).',
      );
    }
    throw new Error(`OneDrive folder request failed (${res.status}). Make sure it's shared as "Anyone with the link".`);
  }
  const data = await res.json();
  const children = Array.isArray(data.children) ? data.children : [];
  const cases = children
    .filter((c) => c.name && c.name.toLowerCase().endsWith('.json') && c['@microsoft.graph.downloadUrl'])
    .map((c) => ({ label: c.name.replace(/\.json$/i, ''), url: c['@microsoft.graph.downloadUrl'] }));
  if (cases.length === 0) throw new Error('No .json case files found in that OneDrive folder.');
  return { label: data.name || 'OneDrive Cases', cases };
}

async function resolveManifest(manifestUrl) {
  const res = await fetch(manifestUrl);
  if (!res.ok) throw new Error(`Manifest request failed (${res.status})`);
  const data = await res.json();
  if (!Array.isArray(data.cases)) throw new Error('Manifest is missing a "cases" array.');
  const cases = data.cases
    .filter((c) => c && c.label && c.url)
    .map((c) => ({ label: c.label, url: c.url }));
  if (cases.length === 0) throw new Error('Manifest has no valid case entries.');
  return { label: data.label || 'Class Cases', cases };
}

export async function resolveLibraryUrl(url) {
  const trimmed = url.trim();
  if (!trimmed) throw new Error('Enter a manifest.json or OneDrive folder link.');
  return isOneDriveUrl(trimmed) ? resolveOneDriveFolder(trimmed) : resolveManifest(trimmed);
}

export async function loadCaseFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Case request failed (${res.status})`);
  return deserializeSession(await res.json());
}

export function saveLibraryConfig(sourceUrl, library) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sourceUrl, library }));
  } catch {
    // Storage unavailable (private browsing, quota) — non-fatal, it just won't persist.
  }
}

export function loadLibraryConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
