import { HttpError } from '../utils/errors.js';
import { LearningSession } from '../models/LearningSession.model.js';

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 500;

export function createMemoryStore({
  now = () => Date.now(),
  ttlMs = Number(process.env.SESSION_TTL_DAYS || 7) * 24 * 60 * 60 * 1000 || DEFAULT_TTL_MS,
  maxSessions = DEFAULT_MAX_SESSIONS,
} = {}) {
  const sessions = new Map();

  function prune() {
    for (const [id, session] of sessions) {
      if (now() - Date.parse(session.updatedAt) > ttlMs) sessions.delete(id);
    }
    if (sessions.size <= maxSessions) return;
    const oldest = [...sessions.values()].sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
    for (const session of oldest.slice(0, sessions.size - maxSessions)) {
      sessions.delete(session.sessionId);
    }
  }

  return {
    kind: 'memory',
    async get(sessionId) {
      prune();
      const found = sessions.get(sessionId);
      return found ? structuredClone(found) : null;
    },
    async save(session) {
      const next = structuredClone(session);
      next.updatedAt = new Date(now()).toISOString();
      sessions.set(next.sessionId, next);
      prune();
      return structuredClone(next);
    },
    async delete(sessionId) {
      return sessions.delete(sessionId);
    },
  };
}

function toPlainSession(doc) {
  if (!doc) return null;
  return {
    sessionId: doc.sessionId,
    level: doc.level,
    mode: doc.mode,
    mood: doc.mood ?? null,
    progress: {
      correctAnswers: doc.progress?.correctAnswers || 0,
      questionsAnswered: doc.progress?.questionsAnswered || 0,
      attempts: doc.progress?.attempts || 0,
      masteryScore: doc.progress?.masteryScore || 0,
      stars: doc.progress?.stars || 0,
    },
    masteredConcepts: doc.masteredConcepts || [],
    recentTopics: doc.recentTopics || [],
    recentAttempts: doc.recentAttempts || [],
    conversation: (doc.conversation || []).map((turn) => ({
      role: turn.role,
      text: turn.text,
      mode: turn.mode,
      at: turn.at,
    })),
    currentActivity: doc.currentActivity || null,
    pausedActivity: doc.pausedActivity || null,
    game: doc.game || null,
    gamesPlayed: doc.gamesPlayed || 0,
    lastQuickReplies: doc.lastQuickReplies || [],
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : new Date().toISOString(),
  };
}

export function createMongoStore(model = LearningSession) {
  return {
    kind: 'mongodb',
    async get(sessionId) {
      const doc = await model.findOne({ sessionId }).lean();
      return toPlainSession(doc);
    },
    async save(session) {
      const saved = await model.findOneAndUpdate(
        { sessionId: session.sessionId },
        {
          $set: {
            level: session.level,
            mode: session.mode,
            mood: session.mood,
            progress: session.progress,
            masteredConcepts: session.masteredConcepts,
            recentTopics: session.recentTopics,
            recentAttempts: session.recentAttempts,
            conversation: session.conversation,
            currentActivity: session.currentActivity,
            pausedActivity: session.pausedActivity,
            game: session.game,
            gamesPlayed: session.gamesPlayed,
            lastQuickReplies: session.lastQuickReplies,
          },
          $setOnInsert: {
            sessionId: session.sessionId,
            createdAt: session.createdAt ? new Date(session.createdAt) : new Date(),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
      return toPlainSession(saved);
    },
    async delete(sessionId) {
      const result = await model.deleteOne({ sessionId });
      return result.deletedCount > 0;
    },
  };
}

export function createUnavailableStore() {
  const fail = async () => {
    throw new HttpError(
      503,
      'DATABASE_UNAVAILABLE',
      'The database is unavailable, so progress cannot be saved right now.',
    );
  };
  return {
    kind: 'mongodb',
    get: fail,
    save: fail,
    delete: fail,
  };
}

export function createStoreForDatabase(databaseState) {
  if (databaseState.mode === 'mongodb') {
    if (!databaseState.connected) return createUnavailableStore();
    return createMongoStore();
  }
  return createMemoryStore();
}
