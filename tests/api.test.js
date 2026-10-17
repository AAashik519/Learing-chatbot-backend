import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createMemoryStore } from '../src/services/sessionStore.service.js';

function buildApp() {
  const store = createMemoryStore();
  const app = createApp({
    store,
    getPersistence: () => ({ mode: 'memory', durable: false, connected: true }),
    llm: { isEnabled: () => false, generate: async () => ({ reply: 'nope' }) },
    env: { ...process.env, NODE_ENV: 'test', FRONTEND_URL: 'http://localhost:5173' },
  });
  return { app, store };
}

describe('HTTP API', () => {
  it('reports rule-based mode and non-durable memory without secrets', async () => {
    const { app } = buildApp();
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      status: 'ok',
      responseMode: 'rule-based',
      llmConfigured: false,
      persistence: 'memory',
      durable: false,
    });
    expect(JSON.stringify(response.body)).not.toMatch(/LLM_API_KEY|mongodb\+srv|sk-/i);
  });

  it('creates, restores, and resets an anonymous session', async () => {
    const { app } = buildApp();
    const sessionId = 'sess_api_restore';
    const created = await request(app).post('/api/chat').send({ sessionId, message: "Let's learn" });
    expect(created.status).toBe(200);
    expect(created.body.success).toBe(true);
    expect(created.body.data.level).toBe('L1');
    expect(created.body.data.activity.prompt).toBe('What color is an apple?');
    expect(created.body.data.activity.acceptedAnswers).toBeUndefined();
    expect(created.body.data.durable).toBe(false);

    const correct = await request(app).post('/api/chat').send({ sessionId, message: 'Red' });
    expect(correct.body.data.progress.correctAnswers).toBe(1);
    expect(correct.body.data.reply).toMatch(/Red is right/i);

    const restored = await request(app).get(`/api/chat/session/${sessionId}`);
    expect(restored.status).toBe(200);
    expect(restored.body.data.progress.correctAnswers).toBe(1);
    expect(restored.body.data.conversation).toHaveLength(4);
    expect(restored.body.data.durable).toBe(false);
    expect(JSON.stringify(restored.body)).not.toContain('acceptedAnswers');

    const removed = await request(app).delete(`/api/chat/session/${sessionId}`);
    expect(removed.status).toBe(200);
    expect(removed.body.data.reset).toBe(true);

    const missing = await request(app).get(`/api/chat/session/${sessionId}`);
    expect(missing.status).toBe(200);
    expect(missing.body.data.level).toBe('L1');
    expect(missing.body.data.progress.correctAnswers).toBe(0);
    expect(missing.body.data.conversation).toEqual([]);

    const fresh = await request(app).post('/api/chat').send({ sessionId, message: 'Hello' });
    expect(fresh.body.data.level).toBe('L1');
    expect(fresh.body.data.progress.correctAnswers).toBe(0);
  });

  it('creates a missing session on read and rejects invalid input', async () => {
    const { app } = buildApp();
    const unknownDelete = await request(app).delete('/api/chat/session/sess_unknown_404');
    expect(unknownDelete.status).toBe(404);

    const unknown = await request(app).get('/api/chat/session/sess_unknown_404');
    expect(unknown.status).toBe(200);
    expect(unknown.body.success).toBe(true);
    expect(unknown.body.data.sessionId).toBe('sess_unknown_404');
    expect(unknown.body.data.progress.correctAnswers).toBe(0);

    const shortId = await request(app).post('/api/chat').send({ sessionId: 'short', message: 'Hi' });
    expect(shortId.status).toBe(400);
    expect(shortId.body.error.code).toBe('VALIDATION_ERROR');

    const longMessage = await request(app).post('/api/chat').send({
      sessionId: 'sess_valid_id',
      message: 'a'.repeat(201),
    });
    expect(longMessage.status).toBe(400);

    const badMood = await request(app).post('/api/chat').send({
      sessionId: 'sess_valid_id',
      message: 'Hi',
      selectedMood: 'angry',
    });
    expect(badMood.status).toBe(400);

    const empty = await request(app).post('/api/chat').send({ sessionId: 'sess_valid_id', message: '   ' });
    expect(empty.status).toBe(400);

    const badParam = await request(app).get('/api/chat/session/no');
    expect(badParam.status).toBe(400);

    const badJson = await request(app)
      .post('/api/chat')
      .set('Content-Type', 'application/json')
      .send('{"message":');
    expect(badJson.status).toBe(400);
    expect(badJson.body.error.code).toBe('INVALID_JSON');
  });

  it('answers a mood selection and keeps support ahead of a lesson', async () => {
    const { app } = buildApp();
    const response = await request(app).post('/api/chat').send({
      sessionId: 'sess_mood_api',
      message: 'hello',
      selectedMood: 'sad',
    });
    expect(response.status).toBe(200);
    expect(response.body.data.mode).toBe('SUPPORT');
    expect(response.body.data.mood).toBe('sad');
    expect(response.body.data.progress.questionsAnswered).toBe(0);
  });

  it('keeps rule-based chat responses under 2 seconds', async () => {
    const { app } = buildApp();
    const sessionId = 'sess_latency_01';
    const samples = [];
    const messages = ["Let's learn", 'Blue', 'Red', "Let's play", 'Cat', 'I want to talk', 'I like dogs', 'I am sad'];

    for (let index = 0; index < 20; index += 1) {
      const started = performance.now();
      const response = await request(app)
        .post('/api/chat')
        .send({ sessionId, message: messages[index % messages.length] });
      const elapsed = performance.now() - started;
      expect(response.status).toBe(200);
      const headerMs = Number(response.headers['x-response-time-ms']);
      expect(headerMs).toBeLessThan(2000);
      samples.push({ elapsed, headerMs });
    }

    const headerTimes = samples.map((sample) => sample.headerMs).sort((a, b) => a - b);
    const average = headerTimes.reduce((sum, value) => sum + value, 0) / headerTimes.length;
    const p95 = headerTimes[Math.min(headerTimes.length - 1, Math.ceil(headerTimes.length * 0.95) - 1)];
    const max = headerTimes[headerTimes.length - 1];
    console.log(`LATENCY_RESULT ${JSON.stringify({
      count: headerTimes.length,
      averageMs: Number(average.toFixed(2)),
      p95Ms: Number(p95.toFixed(2)),
      maxMs: Number(max.toFixed(2)),
      environment: 'vitest supertest, in-memory store, rule-based engine, no network',
    })}`);
    expect(p95).toBeLessThan(2000);
    expect(max).toBeLessThan(2000);
  });
});
