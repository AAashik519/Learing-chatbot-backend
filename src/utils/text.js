export function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function wordCount(value) {
  const normalized = normalizeText(value);
  return normalized ? normalized.split(' ').length : 0;
}

export function capitalizeWord(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function matchesAccepted(message, acceptedAnswers = []) {
  return Boolean(findAccepted(message, acceptedAnswers));
}

export function findAccepted(message, acceptedAnswers = [], { maxWords = 12 } = {}) {
  const normalized = normalizeText(message);
  if (!normalized) return null;
  const words = normalized.split(' ');
  if (words.length > maxWords) return null;

  for (const answer of acceptedAnswers) {
    const expected = normalizeText(answer);
    if (!expected) continue;
    if (normalized === expected) return answer;
    if (
      normalized === `a ${expected}`
      || normalized === `an ${expected}`
      || normalized === `the ${expected}`
      || normalized === `it is ${expected}`
      || normalized === `it's ${expected}`
      || normalized === `its ${expected}`
    ) {
      return answer;
    }

    if (expected.includes(' ')) {
      if (normalized.includes(expected)) return answer;
      continue;
    }

    if (words.includes(expected)) return answer;
  }

  return null;
}

export function redactSensitive(value) {
  return String(value || '')
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[number]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim();
}

export function clampText(value, max = 500) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return text.slice(0, max).trim();
}
