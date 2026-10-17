import { matchesAccepted, normalizeText, wordCount } from '../utils/text.js';

const SEVERE = /\b(kill myself|want to die|hurt myself|suicide|someone hurts me|hits me|touches me|abuse)\b/i;
const SAD = /\b(sad|unhappy|crying|cry|scared|afraid|frightened|lonely|upset)\b/i;
const CANNOT = /\b(can'?t do it|cannot do it|too hard|i give up|give up|frustrated|i hate this|this is hard)\b/i;
const GOT_WRONG = /\b(got it wrong|i was wrong|i am wrong|i'?m wrong)\b/i;
const BORED = /\b(bored|boring|this is dull)\b/i;
const PLAY = /\b(let'?s play|lets play|play a game|want to play|guessing game|another game)\b/i;
const TALK = /\b(let'?s talk|lets talk|i want to talk|talk to you|can we talk|let us talk)\b/i;
const LEARN = /\b(let'?s learn|lets learn|teach me|i want to learn|back to learning|another question|ask me a question|ask me)\b/i;
const CURIOUS = /\b(curious|i wonder)\b/i;
const GREETING = /^(hi|hello|hey|good morning|good night|howdy)( there)?$/i;
const WEAK = /^(ok|okay|um|uh|hmm|idk|k|yes|yeah|no|nah)?$/i;

function base(mode, extras = {}) {
  return {
    mode,
    mood: null,
    reason: 'chat',
    isAnswer: false,
    isGameAnswer: false,
    startLesson: false,
    ...extras,
  };
}

function matchesChoice(text, activity) {
  if (!activity || !text) return false;
  if (matchesAccepted(text, activity.acceptedAnswers || [])) return true;
  return matchesAccepted(text, activity.quickReplies || []);
}

function answersWaitingLesson(message, activity) {
  if (!activity) return false;
  const text = normalizeText(message);
  if (isChildQuestion(message, text) && wordCount(message) > 4) return false;
  return matchesChoice(message, activity);
}

function isChildQuestion(message, text) {
  if (/[?]/.test(String(message || ''))) return true;
  if (/^(what|why|who|how|where|when|can you|do you)\b/.test(text)) return true;
  return /\d+\s*(\+|plus|-|minus|times|x|×|\*)\s*\d+/.test(String(message || '').toLowerCase());
}

function looksLikeShortGuess(text) {
  if (!text || GREETING.test(text) || WEAK.test(text)) return false;
  const count = wordCount(text);
  return count > 0 && count <= 2;
}

export function detectMode({ message = '', selectedMood = null, session }) {
  const text = normalizeText(message);

  if (SEVERE.test(message)) {
    return base('SUPPORT', { mood: 'sad', reason: 'distress' });
  }
  if (SAD.test(text)) {
    return base('SUPPORT', { mood: 'sad', reason: 'sad' });
  }
  if (CANNOT.test(text) || (selectedMood === 'frustrated' && CANNOT.test(text))) {
    return base('SUPPORT', { mood: 'frustrated', reason: 'cannot' });
  }
  if (GOT_WRONG.test(text)) {
    return base('SUPPORT', { mood: 'frustrated', reason: 'wrong' });
  }
  if (BORED.test(text)) {
    return base('ENGAGEMENT', { mood: 'bored', reason: 'bored' });
  }
  const replay = session?.mode === 'ENGAGEMENT' && /^(again|another)$/i.test(text);
  if (PLAY.test(text) || replay) {
    return base('ENGAGEMENT', {
      mood: selectedMood || 'happy',
      reason: 'play',
      restartGame: replay || /\banother game\b/i.test(text),
    });
  }
  if (TALK.test(text)) {
    return base('CONVERSATION', { mood: selectedMood || null, reason: 'talk' });
  }
  if (LEARN.test(text)) {
    return base('LEARNING', { mood: selectedMood === 'sad' ? 'sad' : 'curious', reason: 'learn', startLesson: true });
  }
  if (CURIOUS.test(text)) {
    return base('LEARNING', { mood: 'curious', reason: 'curious', startLesson: true });
  }

  const waitingLesson = session?.currentActivity?.awaitingAnswer
    ? session.currentActivity
    : session?.pausedActivity;
  if (waitingLesson && answersWaitingLesson(message, waitingLesson)) {
    return base('LEARNING', {
      mood: selectedMood || null,
      reason: 'answer',
      isAnswer: true,
      resumePaused: !session?.currentActivity,
    });
  }

  if (isChildQuestion(message, text)) {
    return base('CONVERSATION', { mood: selectedMood || 'curious', reason: 'question' });
  }

  if (session?.currentActivity?.awaitingAnswer && matchesChoice(text, session.currentActivity)) {
    return base('LEARNING', { mood: selectedMood || null, reason: 'answer', isAnswer: true });
  }

  if (session?.game && matchesChoice(text, session.game)) {
    return base('ENGAGEMENT', { mood: selectedMood || 'happy', reason: 'game-answer', isGameAnswer: true });
  }

  const weak = !text || WEAK.test(text) || GREETING.test(text);
  const mentionsSelectedMood = Boolean(selectedMood && text.includes(selectedMood));
  if ((weak || mentionsSelectedMood) && selectedMood === 'sad') {
    return base('SUPPORT', { mood: 'sad', reason: 'mood' });
  }
  if ((weak || mentionsSelectedMood) && selectedMood === 'frustrated') {
    return base('SUPPORT', { mood: 'frustrated', reason: 'cannot' });
  }
  if ((weak || mentionsSelectedMood) && selectedMood === 'bored') {
    return base('ENGAGEMENT', { mood: 'bored', reason: 'bored' });
  }
  if ((weak || mentionsSelectedMood) && selectedMood === 'curious') {
    return base('LEARNING', { mood: 'curious', reason: 'curious', startLesson: true });
  }
  if ((weak || mentionsSelectedMood) && selectedMood === 'happy') {
    return base('CONVERSATION', { mood: 'happy', reason: 'mood' });
  }

  if (GREETING.test(text) && session?.currentActivity?.awaitingAnswer) {
    return base('LEARNING', { mood: selectedMood || 'happy', reason: 'repeat' });
  }
  if (GREETING.test(text) && session?.game) {
    return base('ENGAGEMENT', { mood: selectedMood || 'happy', reason: 'play' });
  }
  if (GREETING.test(text)) {
    return base('CONVERSATION', { mood: selectedMood || 'happy', reason: 'greeting' });
  }

  if (session?.currentActivity?.awaitingAnswer && looksLikeShortGuess(text)) {
    return base('LEARNING', { mood: selectedMood || null, reason: 'answer', isAnswer: true });
  }
  if (session?.game && looksLikeShortGuess(text)) {
    return base('ENGAGEMENT', { mood: selectedMood || 'happy', reason: 'game-answer', isGameAnswer: true });
  }

  if (!text) {
    return base('CONVERSATION', { mood: selectedMood || null, reason: 'empty' });
  }

  return base('CONVERSATION', { mood: selectedMood || null, reason: 'chat' });
}

export function isSevereMessage(message) {
  return SEVERE.test(String(message || ''));
}
