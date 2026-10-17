const MAX_TURNS = 20;
const MAX_TOPICS = 8;
const MAX_ATTEMPTS = 30;
const MAX_CONCEPTS = 80;

export function createInitialSession(sessionId, now = new Date()) {
  const timestamp = now.toISOString();
  return {
    sessionId,
    level: 'L1',
    mode: 'CONVERSATION',
    mood: null,
    progress: {
      correctAnswers: 0,
      questionsAnswered: 0,
      attempts: 0,
      masteryScore: 0,
      stars: 0,
    },
    masteredConcepts: [],
    recentTopics: [],
    recentAttempts: [],
    conversation: [],
    currentActivity: null,
    pausedActivity: null,
    game: null,
    gamesPlayed: 0,
    lastQuickReplies: ["Let's learn", "Let's play", 'I want to talk'],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function appendTurn(session, turn) {
  session.conversation.push({
    role: turn.role,
    text: String(turn.text || '').slice(0, 500),
    mode: turn.mode,
    at: new Date().toISOString(),
  });
  if (session.conversation.length > MAX_TURNS) {
    session.conversation.splice(0, session.conversation.length - MAX_TURNS);
  }
}

export function noteTopic(session, topic) {
  if (!topic) return;
  session.recentTopics = [topic, ...session.recentTopics.filter((item) => item !== topic)].slice(0, MAX_TOPICS);
}

export function noteAttempt(session, attempt) {
  session.recentAttempts.push(attempt);
  if (session.recentAttempts.length > MAX_ATTEMPTS) {
    session.recentAttempts.splice(0, session.recentAttempts.length - MAX_ATTEMPTS);
  }
}

export function markConceptMastered(session, concept) {
  if (!concept || session.masteredConcepts.includes(concept)) return;
  session.masteredConcepts.push(concept);
  if (session.masteredConcepts.length > MAX_CONCEPTS) {
    session.masteredConcepts.splice(0, session.masteredConcepts.length - MAX_CONCEPTS);
  }
}

export function recomputeProgress(session) {
  const closed = session.recentAttempts.filter((attempt) => attempt.closed);
  const window = closed.slice(-5);
  const correct = window.filter((attempt) => attempt.correct).length;
  session.progress.masteryScore = window.length ? Math.round((100 * correct) / window.length) : 0;
  session.progress.stars = Math.min(15, Math.floor(session.progress.correctAnswers / 2));
}

export function pauseActivity(session) {
  if (session.currentActivity?.awaitingAnswer) {
    session.pausedActivity = session.currentActivity;
    session.currentActivity = null;
  }
}

export function resumeActivity(session) {
  if (!session.pausedActivity) return false;
  session.currentActivity = session.pausedActivity;
  session.pausedActivity = null;
  return true;
}

export function recentQuestionIds(session, limit = 6) {
  return session.recentAttempts.slice(-limit).map((attempt) => attempt.questionId);
}
