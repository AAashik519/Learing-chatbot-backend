import { describe, expect, it } from 'vitest';
import { processChatTurn } from '../src/services/chat.service.js';
import { requestLlm } from '../src/services/llm.service.js';
import { createMemoryStore } from '../src/services/sessionStore.service.js';
import { reviewGeneratedReply } from '../src/services/safety.service.js';

describe('optional LLM', () => {
  it('times out and falls back to the rule-based reply', async () => {
    const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    });

    await expect(requestLlm(
      { message: 'I am sad', mode: 'SUPPORT', draftReply: 'I am here.' },
      {
        env: {
          LLM_API_KEY: 'test-key',
          LLM_PROVIDER: 'openai',
          LLM_MODEL: 'test-model',
          LLM_TIMEOUT_MS: '40',
        },
        fetchImpl,
      },
    )).rejects.toMatchObject({ code: 'LLM_TIMEOUT' });

    const store = createMemoryStore();
    const started = Date.now();
    const result = await processChatTurn({
      store,
      sessionId: 'sess_llm_timeout',
      message: 'I am sad',
      llm: {
        isEnabled: () => true,
        generate: async () => {
          throw Object.assign(new Error('timed out'), { code: 'LLM_TIMEOUT' });
        },
      },
    });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(result.data.engine).toBe('rule-based');
    expect(result.data.llmFallback).toBe(true);
    expect(result.data.mode).toBe('SUPPORT');
    expect(result.data.reply).toMatch(/sorry you're feeling sad/i);
    expect(result.data.level).toBe('L1');
  });

  it('uses safe LLM wording without letting it change the score or level', async () => {
    const store = createMemoryStore();
    await processChatTurn({
      store,
      sessionId: 'sess_llm_grade',
      message: "Let's learn",
      llm: { isEnabled: () => false },
    });

    const result = await processChatTurn({
      store,
      sessionId: 'sess_llm_grade',
      message: 'Blue',
      llm: {
        isEnabled: () => true,
        generate: async () => ({
          reply: 'You are now a level three explorer. Keep going!',
          quickReplies: ['Skip school'],
        }),
      },
    });

    const session = await store.get('sess_llm_grade');
    expect(result.data.engine).toBe('llm');
    expect(result.data.reply).toMatch(/level three explorer/i);
    expect(result.data.level).toBe('L1');
    expect(result.data.quickReplies).toEqual(['Red', 'Blue', 'Green']);
    expect(session.progress.correctAnswers).toBe(0);
    expect(session.progress.questionsAnswered).toBe(0);
    expect(session.level).toBe('L1');
  });

  it('rejects an LLM reply that calls a wrong answer correct', () => {
    const reviewed = reviewGeneratedReply(
      { reply: 'Yes! That is correct. Blue is right.' },
      { evaluation: { correct: false, closed: false }, fallbackReply: 'Not quite. Try again!' },
    );
    expect(reviewed.ok).toBe(false);
    expect(reviewed.reply).toBe('Not quite. Try again!');
  });
});
