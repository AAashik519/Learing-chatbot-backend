import { describe, expect, it } from 'vitest';
import { createInitialSession } from '../src/services/contextManager.service.js';
import { handleTurn, processChatTurn } from '../src/services/chat.service.js';
import { createMemoryStore } from '../src/services/sessionStore.service.js';

const disabledLlm = {
  isEnabled: () => false,
  generate: async () => {
    throw new Error('LLM should not be called');
  },
};

async function turn(store, sessionId, message, selectedMood) {
  return processChatTurn({
    store,
    sessionId,
    message,
    selectedMood,
    llm: disabledLlm,
  });
}

async function answerCurrent(store, sessionId) {
  const session = await store.get(sessionId);
  return turn(store, sessionId, session.currentActivity.acceptedAnswers[0]);
}

describe('chat flow', () => {
  it('moves from L1 to L2 after 4 correct answers in the last 5', async () => {
    const store = createMemoryStore();
    const sessionId = 'sess_progress_l1';
    await turn(store, sessionId, "Let's learn");
    for (let index = 0; index < 5; index += 1) {
      await answerCurrent(store, sessionId);
    }
    const session = await store.get(sessionId);
    expect(session.level).toBe('L2');
    expect(session.progress.correctAnswers).toBeGreaterThanOrEqual(4);
    expect(session.currentActivity.level).toBe('L2');
  });

  it('moves from L2 to L3 one level at a time', async () => {
    const store = createMemoryStore();
    const sessionId = 'sess_progress_l2';
    await turn(store, sessionId, "Let's learn");
    for (let index = 0; index < 5; index += 1) await answerCurrent(store, sessionId);
    expect((await store.get(sessionId)).level).toBe('L2');
    for (let index = 0; index < 5; index += 1) await answerCurrent(store, sessionId);
    const session = await store.get(sessionId);
    expect(session.level).toBe('L3');
    expect(session.currentActivity.level).toBe('L3');
  });

  it('does not advance or count casual conversation as quiz attempts', async () => {
    const store = createMemoryStore();
    const sessionId = 'sess_chat_only';
    const messages = [
      'Hello',
      'I like dogs',
      'My toy is fun',
      'The sun is up',
      'I have a ball',
      'Cats are nice',
      'I like milk',
      'Story time',
      'Blue is pretty',
      'I want to talk',
    ];
    for (const message of messages) await turn(store, sessionId, message);
    const session = await store.get(sessionId);
    expect(session.level).toBe('L1');
    expect(session.progress.questionsAnswered).toBe(0);
    expect(session.progress.correctAnswers).toBe(0);
    expect(session.currentActivity).toBeNull();
  });

  it('switches between learning, play, talk, and support', async () => {
    const store = createMemoryStore();
    const sessionId = 'sess_modeswitch';
    const learning = await turn(store, sessionId, "Let's learn");
    const play = await turn(store, sessionId, "Let's play");
    const talk = await turn(store, sessionId, 'I want to talk');
    const support = await turn(store, sessionId, 'I am sad');

    expect(learning.data.mode).toBe('LEARNING');
    expect(play.data.mode).toBe('ENGAGEMENT');
    expect(play.data.reply).toMatch(/guessing game/i);
    expect(talk.data.mode).toBe('CONVERSATION');
    expect(support.data.mode).toBe('SUPPORT');
    expect(support.data.reply).toMatch(/sorry you're feeling sad/i);
    expect((await store.get(sessionId)).progress.questionsAnswered).toBe(0);
  });

  it('resumes the paused lesson after a game', async () => {
    const store = createMemoryStore();
    const sessionId = 'sess_resume_01';
    await turn(store, sessionId, "Let's learn");
    const paused = await store.get(sessionId);
    const prompt = paused.currentActivity.prompt;
    await turn(store, sessionId, "Let's play");
    const resumed = await turn(store, sessionId, "Let's learn");
    expect(resumed.data.mode).toBe('LEARNING');
    expect(resumed.data.activity.prompt).toBe(prompt);
    expect(resumed.data.reply).toMatch(/back to learning/i);
  });

  it('uses mastered colors in a later conversation', async () => {
    const session = createInitialSession('sess_colors_ctx');
    session.masteredConcepts = ['color-red', 'color-blue', 'color-yellow', 'color-green'];
    const result = await handleTurn(session, { message: 'I like the color blue' });
    expect(result.data.mode).toBe('CONVERSATION');
    expect(result.data.reply).toMatch(/already know your colors/i);
  });

  it('offers a kinder next step after I got it wrong', async () => {
    const store = createMemoryStore();
    const sessionId = 'sess_mistake_01';
    await turn(store, sessionId, "Let's learn");
    const firstId = (await store.get(sessionId)).currentActivity.questionId;
    const result = await turn(store, sessionId, 'I got it wrong');
    const session = await store.get(sessionId);
    expect(result.data.reply).toMatch(/Mistakes help us learn/);
    expect(session.progress.questionsAnswered).toBe(0);
    expect(session.currentActivity.questionId).not.toBe(firstId);
  });

  it('always says no when asked if it is OpenAI', async () => {
    const session = createInitialSession('sess_identity_01');
    const result = await handleTurn(session, {
      message: 'ARE YOU OPEN AI ...??',
      llm: {
        isEnabled: () => true,
        generate: async () => ({
          reply: 'Yes, I am part of OpenAI, which helps make learning fun!',
          quickReplies: ['Learn'],
        }),
      },
    });
    expect(result.data.reply.startsWith('No.')).toBe(true);
    expect(result.data.reply).toMatch(/Little English Buddy/);
    expect(result.data.reply).not.toMatch(/openai/i);
    expect(result.data.engine).toBe('rule-based');
  });

  it('answers a simple sky question even without the model', async () => {
    const session = createInitialSession('sess_sky_01');
    const result = await handleTurn(session, { message: 'Why is the sky blue?' });
    expect(result.data.reply).toMatch(/sky is blue/i);
    expect(session.progress.questionsAnswered).toBe(0);
  });

  it('counts a full-sentence lesson answer and can level up after four correct answers', async () => {
    const store = createMemoryStore();
    const sessionId = 'sess_sentence_level';
    await turn(store, sessionId, "Let's learn");
    await turn(store, sessionId, 'I think it is red');
    let session = await store.get(sessionId);
    expect(session.progress.correctAnswers).toBe(1);
    expect(session.level).toBe('L1');

    for (let index = 0; index < 3; index += 1) {
      await answerCurrent(store, sessionId);
    }
    session = await store.get(sessionId);
    expect(session.level).toBe('L2');
  });

  it('answers a simple number question even without the model', async () => {
    const session = createInitialSession('sess_math_01');
    const result = await handleTurn(session, { message: '5+5 =?' });
    expect(result.data.mode).toBe('CONVERSATION');
    expect(result.data.reply).toMatch(/5 plus 5 is 10/i);
    expect(session.progress.questionsAnswered).toBe(0);
  });

  it('keeps only a bounded conversation history', async () => {
    const store = createMemoryStore();
    const sessionId = 'sess_history_01';
    for (let index = 0; index < 16; index += 1) {
      await turn(store, sessionId, `I like dogs ${index}`);
    }
    const session = await store.get(sessionId);
    expect(session.conversation.length).toBeLessThanOrEqual(20);
    expect(session.level).toBe('L1');
  });
});
