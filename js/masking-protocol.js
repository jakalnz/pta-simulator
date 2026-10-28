/**
 * Which rules decide when masking is needed (the Check button) and the
 * interaural attenuation used for guide lines. The method review accepts
 * plateau and step masking under either.
 *
 * - uoa: University of Auckland Clinical Checklist (Feb 2024), ch. 5.
 *   AC: mask if AC(test) − IAA ≥ BC(non-test). BC: mask if the test ear's
 *   air–bone gap is ≥ 15 dB and its AC is > 15 dB HL. IAA (Katz, 2009):
 *   supra-aural 40 dB; inserts (flush) 60 dB ≤ 1 kHz, 50 dB above.
 * - bsa: UK-style Rules 1–3 as used in Wilding's PTA_Sim: rule IAA 40 dB
 *   headphones, 55 dB inserts; Rule 2 air–bone gap ≥ 10 dB.
 */

export const MASKING_PROTOCOLS = {
  uoa: {
    label: 'University of Auckland (NZ)',
    ia: (transducer, freq) => (transducer === 'insertphone' ? (freq <= 1000 ? 60 : 50) : 40),
    summary: 'AC is masked when AC(test) − IAA ≥ BC(non-test); BC is masked when the test ear has an air–bone gap ≥ 15 dB and AC > 15 dB HL. IAA: headphones 40 dB; inserts 60 dB at ≤ 1 kHz, 50 dB above.',
  },
  bsa: {
    label: 'BSA / UK (Rules 1–3)',
    ia: (transducer) => (transducer === 'insertphone' ? 55 : 40),
    summary: 'Rule 1: not-masked AC differs between ears by ≥ IAA. Rule 2: AC ≥ 10 dB worse than not-masked BC. Rule 3: AC ≥ IAA worse than the other ear\'s BC. IAA: headphones 40 dB, inserts 55 dB.',
  },
};

const STORAGE_KEY = 'pta-masking-protocol';
let current = 'uoa';
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && MASKING_PROTOCOLS[saved]) current = saved;
} catch { /* storage unavailable: keep the default */ }

export function getMaskingProtocol() {
  return current;
}

export function setMaskingProtocol(id) {
  if (!MASKING_PROTOCOLS[id]) return;
  current = id;
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
}

export function ruleIa(transducer, freq, protocol = current) {
  return MASKING_PROTOCOLS[protocol].ia(transducer, freq);
}
