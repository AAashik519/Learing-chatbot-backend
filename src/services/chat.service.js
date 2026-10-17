import { createInitialSession, appendTurn, pauseActivity, resumeActivity } from './contextManager.service.js';
import {
  assignNextActivity,
  gradeAnswer,
  gradeGame,
  maybeAdvanceLevel,
  startGame,
  swapToEasier,
} from './learningEngine.service.js';
import { detectMode } from './modeDetector.service.js';
import { answerSimpleMath, composeReply, identityReply } from './responseEngine.service.js';
import { inspectMessage, reviewGeneratedReply } from './safety.service.js';
import { levelName, modeLabel } from '../utils/levels.js';
import { logger } from '../utils/logger.js';
import { redactSensitive } from '../utils/text.js';

const locks = new Map();

function withSessionLock(sessionId, task) {
  const previous = locks.get(sessionId) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  locks.set(sessionId, tail);

  return previous.then(async () => {
    try {
      return await task();
    } finally {
      release();
      if (locks.get(sessionId) === tail) locks.delete(sessionId);
    }
  });
}

export function publicActivity(session) {
  if (session.mode === 'ENGAGEMENT' && session.game) {
    return {
      questionId: session.game.id,
      topic: 'game',
      prompt: session.game.prompt,
      level: session.level,
      kind: 'game',
    };
  }
  if (!session.currentActivity) return null;
  return {
    questionId: session.currentActivity.questionId,
    topic: session.currentActivity.topic,
    prompt: session.currentActivity.prompt,
    level: session.currentActivity.level,
    kind: 'lesson',
  };
}

export function toChatData(session, { reply, quickReplies, engine, llmFallback = false }) {
  return {
    reply,
    mode: session.mode,
    modeLabel: modeLabel(session.mode),
    mood: session.mood,
    level: session.level,
    levelName: levelName(session.level),
    progress: { ...session.progress },
    quickReplies,
    activity: publicActivity(session),
    engine,
    llmFallback,
  };
}

export function toSessionDto(session, persistence) {
  return {
    sessionId: session.sessionId,
    level: session.level,
    levelName: levelName(session.level),
    mode: session.mode,
    modeLabel: modeLabel(session.mode),
    mood: session.mood,
    progress: { ...session.progress },
    masteredConcepts: [...session.masteredConcepts],
    recentTopics: [...session.recentTopics],
    quickReplies: [...(session.lastQuickReplies || [])],
    activity: publicActivity(session),
    conversation: session.conversation.map((turn) => ({
      role: turn.role,
      text: turn.text,
      mode: turn.mode,
      modeLabel: turn.role === 'bot' ? modeLabel(turn.mode) : undefined,
    })),
    persistence: persistence.mode,
    durable: Boolean(persistence.durable && persistence.connected),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function applyLearningSideEffects(session, detection) {
  if (detection.mode === 'LEARNING' && detection.isAnswer) return null;

  if (detection.mode === 'LEARNING') {
    session.game = null;
    const resumed = resumeActivity(session);
    if (!session.currentActivity) assignNextActivity(session);
    return { resumed };
  }

  if (detection.mode === 'ENGAGEMENT') {
    if (detection.restartGame) {
      session.gamesPlayed = (session.gamesPlayed || 0) + 1;
      startGame(session);
    } else if (detection.reason !== 'game-answer' && !session.game) {
      startGame(session);
    }
    if (session.currentActivity) pauseActivity(session);
    return null;
  }

  if (detection.mode === 'SUPPORT' && detection.reason === 'cannot') {
    return null;
  }

  if (detection.mode === 'SUPPORT' && detection.reason === 'wrong') {
    swapToEasier(session);
    return null;
  }

  pauseActivity(session);
  session.game = null;
  return null;
}

export async function handleTurn(session, { message, selectedMood = null, llm = null }) {
  const cleaned = redactSensitive(message).slice(0, 200);
  const safety = inspectMessage(cleaned);

  if (safety.severe) {
    pauseActivity(session);
    session.game = null;
    const composed = composeReply({
      session,
      message: cleaned,
      detection: { mode: 'SUPPORT', mood: 'sad', reason: 'distress' },
      evaluation: null,
      safety,
    });
    return finishTurn(session, {
      message: cleaned,
      detection: { mode: 'SUPPORT', mood: 'sad', reason: 'distress' },
      composed,
      engine: 'rule-based',
      llmFallback: false,
    });
  }

  const detection = detectMode({ message: cleaned, selectedMood, session });
  let evaluation = null;

  if (detection.mode === 'LEARNING' && detection.isAnswer) {
    if (!session.currentActivity && session.pausedActivity) resumeActivity(session);
    evaluation = gradeAnswer(session, cleaned);
    if (evaluation?.closed) {
      evaluation.advanced = maybeAdvanceLevel(session);
      assignNextActivity(session, { preferEasier: evaluation.correct === false });
    }
  } else if (detection.mode === 'ENGAGEMENT' && detection.isGameAnswer) {
    evaluation = gradeGame(session, cleaned);
    if (session.currentActivity) pauseActivity(session);
  } else {
    const extra = applyLearningSideEffects(session, detection);
    if (extra?.resumed) detection.resumed = true;
  }

  if (safety.injection) detection.reason = 'injection';

  const composed = composeReply({ session, message: cleaned, detection, evaluation, safety });
  let reply = composed.reply;
  let quickReplies = composed.quickReplies;
  let engine = 'rule-based';
  let llmFallback = false;

  const lessonLocked = Boolean(
    session.currentActivity?.awaitingAnswer || (detection.mode === 'ENGAGEMENT' && session.game),
  );
  const fixedIdentity = identityReply(cleaned);
  if (fixedIdentity) {
    reply = fixedIdentity.reply;
    quickReplies = fixedIdentity.quickReplies;
  } else if (llm?.isEnabled?.() && !safety.privacy && !safety.unkind && !safety.injection) {
    try {
      const generated = await llm.generate({
        message: cleaned,
        recentTalk: session.conversation.slice(-6).map((turn) => ({
          role: turn.role,
          text: turn.text,
        })),
        mode: detection.mode,
        mood: detection.mood,
        level: session.level,
        draftReply: composed.reply,
        evaluation: evaluation
          ? { correct: Boolean(evaluation.correct), closed: Boolean(evaluation.closed) }
          : null,
      });
      const reviewed = reviewGeneratedReply(generated, {
        evaluation,
        fallbackReply: composed.reply,
      });
      if (reviewed.ok) {
        reply = reviewed.reply;
        if (!lessonLocked && reviewed.quickReplies?.length) quickReplies = reviewed.quickReplies;
        engine = 'llm';
      } else {
        llmFallback = true;
      }
    } catch (error) {
      llmFallback = true;
      engine = 'rule-based';
      logger.info({
        message: 'LLM fallback',
        code: error.code || error.name || 'LLM_ERROR',
        detail: String(error.message || '').slice(0, 180),
      });
    }

  }

  const mathReply = answerSimpleMath(cleaned);
  if (!fixedIdentity && mathReply && !/\bis\s+\d+\b/i.test(reply)) {
    reply = mathReply;
  }

  const lessonPrompt = session.currentActivity?.awaitingAnswer ? session.currentActivity.prompt : '';
  if (lessonPrompt && !reply.toLowerCase().includes(lessonPrompt.toLowerCase())) {
    reply = `${reply} ${lessonPrompt}`.trim();
  }

  return finishTurn(session, {
    message: cleaned,
    detection,
    composed: { reply, quickReplies },
    engine,
    llmFallback,
  });
}

function finishTurn(session, { message, detection, composed, engine, llmFallback }) {
  session.mode = detection.mode;
  session.mood = detection.mood || null;
  session.lastQuickReplies = composed.quickReplies;
  appendTurn(session, { role: 'child', text: message, mode: detection.mode });
  appendTurn(session, { role: 'bot', text: composed.reply, mode: detection.mode });
  return {
    success: true,
    data: toChatData(session, {
      reply: composed.reply,
      quickReplies: composed.quickReplies,
      engine,
      llmFallback,
    }),
  };
}

export async function processChatTurn({ store, sessionId, message, selectedMood, llm }) {
  return withSessionLock(sessionId, async () => {
    let session = await store.get(sessionId);
    if (!session) session = createInitialSession(sessionId);
    const result = await handleTurn(session, { message, selectedMood, llm });
    await store.save(session);
    return result;
  });
}
