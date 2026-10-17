import { describe, expect, it } from 'vitest';
import { createInitialSession } from '../src/services/contextManager.service.js';
import { assignNextActivity } from '../src/services/learningEngine.service.js';
import { detectMode } from '../src/services/modeDetector.service.js';

describe('mode detector', () => {
  it('detects support, engagement, conversation, and learning signals', () => {
    const session = createInitialSession('sess_mode_01');
    expect(detectMode({ message: 'I am sad', session }).mode).toBe('SUPPORT');
    expect(detectMode({ message: 'I am bored', session }).mode).toBe('ENGAGEMENT');
    expect(detectMode({ message: 'I want to talk', session }).mode).toBe('CONVERSATION');
    expect(detectMode({ message: "Let's learn", session }).mode).toBe('LEARNING');
    expect(detectMode({ message: "I can't do it", session })).toMatchObject({ mode: 'SUPPORT', reason: 'cannot' });
    expect(detectMode({ message: 'I got it wrong', session })).toMatchObject({ mode: 'SUPPORT', reason: 'wrong' });
  });

  it('lets an explicit mood fill in a weak message without overriding a clear request', () => {
    const session = createInitialSession('sess_mode_02');
    expect(detectMode({ message: 'hello', selectedMood: 'sad', session }).mode).toBe('SUPPORT');
    expect(detectMode({ message: 'hmm', selectedMood: 'bored', session }).mode).toBe('ENGAGEMENT');
    expect(detectMode({ message: 'hello', selectedMood: 'curious', session }).mode).toBe('LEARNING');
    expect(detectMode({ message: "Let's learn", selectedMood: 'sad', session }).mode).toBe('LEARNING');
  });

  it('treats a short reply as an answer only while a lesson is waiting', () => {
    const session = createInitialSession('sess_mode_03');
    expect(detectMode({ message: 'Red', session }).mode).toBe('CONVERSATION');
    assignNextActivity(session);
    expect(detectMode({ message: 'Red', session })).toMatchObject({ mode: 'LEARNING', isAnswer: true });
    expect(detectMode({ message: "Let's play", session }).mode).toBe('ENGAGEMENT');
  });

  it('does not grade a greeting or a happy mood tap as a wrong lesson answer', () => {
    const session = createInitialSession('sess_mode_05');
    assignNextActivity(session);
    expect(detectMode({ message: 'I feel happy', selectedMood: 'happy', session }).mode).toBe('CONVERSATION');
    expect(detectMode({ message: 'hello', selectedMood: 'sad', session }).mode).toBe('SUPPORT');
    expect(detectMode({ message: 'hello', session })).toMatchObject({ mode: 'LEARNING', reason: 'repeat', isAnswer: false });
    expect(detectMode({ message: 'purple', session })).toMatchObject({ mode: 'LEARNING', isAnswer: true });
  });

  it('treats a child question as conversation instead of a wrong lesson answer', () => {
    const session = createInitialSession('sess_mode_06');
    assignNextActivity(session);
    expect(detectMode({ message: '5+5 =?', session })).toMatchObject({ mode: 'CONVERSATION', reason: 'question' });
    expect(detectMode({ message: 'Why is the sky blue?', session })).toMatchObject({ mode: 'CONVERSATION', reason: 'question' });
    expect(detectMode({ message: 'Red', session })).toMatchObject({ mode: 'LEARNING', isAnswer: true });
  });

  it('does not claim a mode for an empty message with no mood', () => {
    const session = createInitialSession('sess_mode_04');
    expect(detectMode({ message: '   ', session })).toMatchObject({ mode: 'CONVERSATION', reason: 'empty' });
  });
});
