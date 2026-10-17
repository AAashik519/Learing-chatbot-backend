import { GAMES } from '../data/games.js';
import { questionsForLevel } from '../data/curriculum.js';
import { nextLevel } from '../utils/levels.js';
import { capitalizeWord, findAccepted } from '../utils/text.js';
import {
  markConceptMastered,
  noteAttempt,
  noteTopic,
  recentQuestionIds,
  recomputeProgress,
} from './contextManager.service.js';

export function selectQuestion(session, { preferEasier = false, excludeIds = [] } = {}) {
  const pool = questionsForLevel(session.level);
  const recentIds = new Set([...recentQuestionIds(session), ...excludeIds]);
  if (session.currentActivity?.questionId) recentIds.add(session.currentActivity.questionId);
  if (session.pausedActivity?.questionId) recentIds.add(session.pausedActivity.questionId);

  let candidates = pool.filter((question) => !recentIds.has(question.id));
  if (!candidates.length) candidates = [...pool];

  const revisionTurn = session.progress.questionsAnswered > 0
    && session.progress.questionsAnswered % 4 === 0;

  if (revisionTurn) {
    const revision = candidates.filter((question) => session.masteredConcepts.includes(question.concept));
    if (revision.length) candidates = revision;
  } else {
    const fresh = candidates.filter((question) => !session.masteredConcepts.includes(question.concept));
    if (fresh.length) candidates = fresh;
  }

  if (preferEasier) {
    const easier = candidates.filter((question) => question.difficulty === 1);
    if (easier.length) candidates = easier;
  }

  const lastTopic = session.recentTopics[0];
  if (lastTopic && !revisionTurn) {
    const otherTopics = candidates.filter((question) => question.topic !== lastTopic);
    if (otherTopics.length) candidates = otherTopics;
  }

  candidates.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return candidates[0] || null;
}

export function toActivity(question) {
  return {
    questionId: question.id,
    topic: question.topic,
    concept: question.concept,
    prompt: question.prompt,
    hint: question.hint,
    displayAnswer: question.displayAnswer,
    acceptedAnswers: [...question.acceptedAnswers],
    quickReplies: [...question.quickReplies],
    level: question.level,
    difficulty: question.difficulty,
    attemptCount: 0,
    awaitingAnswer: true,
  };
}

export function assignNextActivity(session, options = {}) {
  const question = selectQuestion(session, options);
  if (!question) {
    session.currentActivity = null;
    return null;
  }
  session.currentActivity = toActivity(question);
  session.pausedActivity = null;
  return session.currentActivity;
}

export function swapToEasier(session) {
  const excludeIds = [session.currentActivity?.questionId, session.pausedActivity?.questionId].filter(Boolean);
  session.currentActivity = null;
  session.pausedActivity = null;
  return assignNextActivity(session, { preferEasier: true, excludeIds });
}

function pushClosedAttempt(session, activity, correct) {
  noteAttempt(session, {
    questionId: activity.questionId,
    concept: activity.concept,
    topic: activity.topic,
    level: session.level,
    correct,
    closed: true,
    at: new Date().toISOString(),
  });
  session.progress.questionsAnswered += 1;
  if (correct) {
    session.progress.correctAnswers += 1;
    markConceptMastered(session, activity.concept);
  }
  noteTopic(session, activity.topic);
  session.currentActivity = null;
  recomputeProgress(session);
}

export function gradeAnswer(session, message) {
  const activity = session.currentActivity;
  if (!activity?.awaitingAnswer) return null;

  const matched = findAccepted(message, activity.acceptedAnswers, { maxWords: 12 });
  session.progress.attempts += 1;

  if (matched) {
    const displayAnswer = capitalizeWord(matched);
    pushClosedAttempt(session, activity, true);
    return { correct: true, closed: true, displayAnswer, advanced: false };
  }

  activity.attemptCount += 1;
  if (activity.attemptCount < 2) {
    noteAttempt(session, {
      questionId: activity.questionId,
      concept: activity.concept,
      topic: activity.topic,
      level: session.level,
      correct: false,
      closed: false,
      at: new Date().toISOString(),
    });
    return { correct: false, closed: false, hint: activity.hint };
  }

  const revealed = activity.displayAnswer;
  pushClosedAttempt(session, activity, false);
  return { correct: false, closed: true, revealed, advanced: false };
}

export function maybeAdvanceLevel(session) {
  const upcoming = nextLevel(session.level);
  if (!upcoming) return false;

  const closed = session.recentAttempts.filter((attempt) => attempt.closed && attempt.level === session.level);
  const recent = closed.slice(-5);
  if (recent.length < 4) return false;
  const correct = recent.filter((attempt) => attempt.correct).length;
  if (correct < 4) return false;

  session.level = upcoming;
  recomputeProgress(session);
  return true;
}

export function startGame(session) {
  const index = (session.gamesPlayed || 0) % GAMES.length;
  const game = GAMES[index];
  session.game = {
    id: game.id,
    prompt: game.prompt,
    displayAnswer: game.displayAnswer,
    acceptedAnswers: [...game.acceptedAnswers],
    quickReplies: [...game.quickReplies],
    hint: game.hint,
    attemptCount: 0,
  };
  return session.game;
}

export function gradeGame(session, message) {
  const game = session.game;
  if (!game) return null;
  const matched = findAccepted(message, game.acceptedAnswers);
  if (matched) {
    const displayAnswer = capitalizeWord(matched);
    session.gamesPlayed = (session.gamesPlayed || 0) + 1;
    startGame(session);
    return { correct: true, closed: true, displayAnswer };
  }

  game.attemptCount += 1;
  if (game.attemptCount < 2) {
    return { correct: false, closed: false, hint: game.hint };
  }

  const revealed = game.displayAnswer;
  session.gamesPlayed = (session.gamesPlayed || 0) + 1;
  startGame(session);
  return { correct: false, closed: true, revealed };
}

export function topicIsMastered(session, topic) {
  const concepts = questionsForLevel(session.level)
    .concat(questionsForLevel('L1'), questionsForLevel('L2'), questionsForLevel('L3'))
    .filter((question) => question.topic === topic)
    .map((question) => question.concept);
  const unique = [...new Set(concepts)];
  if (!unique.length) return false;
  return unique.every((concept) => session.masteredConcepts.includes(concept));
}
