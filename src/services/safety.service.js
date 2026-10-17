import { normalizeText } from '../utils/text.js';

const SEVERE = /\b(kill myself|want to die|hurt myself|suicide|someone hurts me|hits me|touches me|abuse)\b/i;
const UNKIND = /\b(stupid|dumb|shut up|hate you|idiot)\b/i;
const PRIVACY = /\b(my address is|i live at|phone number|my password|credit card)\b/i;
const INJECTION = /\b(ignore (all |any )?(previous|prior) instructions|system prompt|you are now|developer mode|reveal (the )?(secret|api key))\b/i;
const UNSAFE_REPLY = /(https?:\/\/|www\.|api[_ ]?key|i am a (real )?(human|person|therapist)|i'm a (real )?(human|person|therapist)|as an ai language model|part of openai|i am openai|i'm openai|i am chatgpt|\bi am gpt\b)/i;

export function inspectMessage(message) {
  const text = String(message || '');
  const normalized = normalizeText(text);
  return {
    severe: SEVERE.test(text),
    unkind: UNKIND.test(normalized),
    selfCritical: /\b(i am|i'm|im) (stupid|dumb)\b/i.test(normalized),
    privacy: PRIVACY.test(normalized),
    injection: INJECTION.test(normalized),
  };
}

export function reviewGeneratedReply(generated, { evaluation, fallbackReply }) {
  const reply = String(generated?.reply || '').trim();
  if (!reply || reply.length > 400 || UNSAFE_REPLY.test(reply)) {
    return { ok: false, reply: fallbackReply };
  }

  const lower = reply.toLowerCase();
  if (evaluation && evaluation.correct === false && /\b(yes|correct|you got it|that is right|that's right)\b/i.test(lower)) {
    return { ok: false, reply: fallbackReply };
  }
  if (evaluation && evaluation.correct === true && /\b(not quite|wrong answer|incorrect)\b/i.test(lower)) {
    return { ok: false, reply: fallbackReply };
  }

  const quickReplies = Array.isArray(generated?.quickReplies)
    ? generated.quickReplies
      .map((item) => String(item || '').trim())
      .filter((item) => item && item.length <= 40)
      .slice(0, 4)
    : [];

  return { ok: true, reply, quickReplies };
}

export function calmDistressReply() {
  return {
    reply: 'I am sorry you feel this way. Please tell a grown-up you trust, like a parent or a teacher, right now. You deserve care and help.',
    quickReplies: ['I will tell a grown-up', 'Stay here a minute'],
  };
}
