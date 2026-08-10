import { serializeSession, deserializeSession, applySession } from './session-serializer.js';

export function exportJson(ctx) {
  const data = serializeSession(ctx);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const name = ctx.patientInfo?.name?.trim() || 'audiogram';
  a.href = url;
  a.download = `${name.replace(/\s+/g, '_')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function importJson(file, ctx) {
  const text = await file.text();
  const data = deserializeSession(JSON.parse(text));
  return applySession(data, ctx);
}
