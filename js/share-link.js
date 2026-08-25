import { serializeSession, deserializeSession, applySession } from './session-serializer.js';
import { encodeCompact, decodeCompact } from './share-codec.js';
import { xorBytes } from './obfuscate.js';

function toBase64Url(str) {
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

function bytesToBase64Url(bytes) {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function buildShareUrl(ctx) {
  // patientInfo (name/id/dob) is deliberately never carried in the compact
  // share link — it's free text that doesn't pack well and would blow the
  // length budget. It's still fully preserved by "Export JSON".
  const data = serializeSession({ ...ctx, skipObfuscation: true });
  const bytes = encodeCompact(data, { xorPatientBytes: xorBytes });
  const encoded = bytesToBase64Url(bytes);
  const url = new URL(window.location.href);
  url.hash = `c=${encoded}`;
  return url.toString();
}

export function readShareUrl() {
  const hash = window.location.hash;
  const compactMatch = hash.match(/#?c=(.+)/);
  if (compactMatch) {
    try {
      return decodeCompact(base64UrlToBytes(compactMatch[1]), { xorPatientBytes: xorBytes });
    } catch {
      return null;
    }
  }
  // Legacy links shared before the compact format existed.
  const legacyMatch = hash.match(/#?d=(.+)/);
  if (!legacyMatch) return null;
  try {
    const json = fromBase64Url(legacyMatch[1]);
    return deserializeSession(JSON.parse(json));
  } catch {
    return null;
  }
}

export function applyShareData(data, ctx) {
  return applySession(data, ctx);
}
