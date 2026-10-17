import { describe, expect, it } from 'vitest';
import { LearningSession } from '../src/models/LearningSession.model.js';
import { createInitialSession } from '../src/services/contextManager.service.js';
import { createMemoryStore, createUnavailableStore } from '../src/services/sessionStore.service.js';

describe('session store', () => {
  it('saves and restores a session, then deletes it', async () => {
    const store = createMemoryStore();
    const session = createInitialSession('sess_store_restore');
    session.level = 'L2';
    session.progress.correctAnswers = 4;
    await store.save(session);

    const restored = await store.get('sess_store_restore');
    expect(restored.level).toBe('L2');
    expect(restored.progress.correctAnswers).toBe(4);

    await store.delete('sess_store_restore');
    expect(await store.get('sess_store_restore')).toBeNull();
  });

  it('drops expired in-memory sessions and does not pretend they are durable', async () => {
    let clock = 0;
    const store = createMemoryStore({ now: () => clock, ttlMs: 1000, maxSessions: 10 });
    clock = 1_000;
    await store.save(createInitialSession('sess_old_session'));
    clock = 3_000;
    await store.save(createInitialSession('sess_new_session'));
    expect(await store.get('sess_old_session')).toBeNull();
    expect(await store.get('sess_new_session')).not.toBeNull();
    expect(store.kind).toBe('memory');
  });

  it('reports a clear error when the configured database is unavailable', async () => {
    const store = createUnavailableStore();
    await expect(store.get('sess_missing_db')).rejects.toMatchObject({
      status: 503,
      code: 'DATABASE_UNAVAILABLE',
    });
  });

  it('defines the learning session fields used for progress', () => {
    expect(LearningSession.schema.path('sessionId').options.unique).toBe(true);
    expect(LearningSession.schema.path('level')).toBeTruthy();
    expect(LearningSession.schema.path('conversation')).toBeTruthy();
    expect(LearningSession.schema.path('currentActivity')).toBeTruthy();
    expect(LearningSession.schema.path('masteredConcepts')).toBeTruthy();
  });
});
