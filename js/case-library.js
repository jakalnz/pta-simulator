// Supervisor-hosted case discovery for the Preset dropdown. Two sources,
// both client-side/no-backend:
// - a manifest.json {label, cases:[{label,url}]} hosted anywhere with CORS
// - a OneDrive "Anyone with the link" shared folder, listed anonymously via
//   the public shares API (no API key — unlike Google Drive, which has no
//   anonymous folder-listing endpoint, so it isn't supported here; a
//   Drive-hosted manifest.json works fine via the manifest path instead).
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
  if (!res.ok) throw new Error(`OneDrive folder request failed (${res.status}). Make sure it's shared as "Anyone with the link".`);
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
