import { serializeSession, deserializeSession, applySession } from './session-serializer.js';

function toBase64Url(str) {
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

export function buildShareUrl(ctx) {
  const data = serializeSession(ctx);
  const encoded = toBase64Url(JSON.stringify(data));
  const url = new URL(window.location.href);
  url.hash = `d=${encoded}`;
  return url.toString();
}

export function readShareUrl() {
  const hash = window.location.hash;
  const match = hash.match(/#?d=(.+)/);
  if (!match) return null;
  try {
    const json = fromBase64Url(match[1]);
    return deserializeSession(JSON.parse(json));
  } catch {
    return null;
  }
}

export function applyShareData(data, ctx) {
  return applySession(data, ctx);
}
