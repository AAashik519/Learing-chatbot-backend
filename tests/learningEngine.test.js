import { describe, expect, it } from 'vitest';
import { createInitialSession } from '../src/services/contextManager.service.js';
import {
  assignNextActivity,
  gradeAnswer,
  maybeAdvanceLevel,
  selectQuestion,
} from '../src/services/learningEngine.service.js';
import { handleTurn } from '../src/services/chat.service.js';

function learningSession() {
  const session = createInitialSession('sess_learning_01');
  assignNextActivity(session);
  return session;
}

describe('learning engine', () => {
  it('accepts a correct L1 answer and rejects a wrong one without closing on the first miss', () => {
    const session = learningSession();
    expect(session.currentActivity.prompt).toBe('What color is an apple?');

    const wrong = gradeAnswer(session, 'Blue');
    expect(wrong.correct).toBe(false);
    expect(wrong.closed).toBe(false);
    expect(wrong.hint).toMatch(/strawberry/i);
    expect(session.progress.questionsAnswered).toBe(0);
    expect(session.progress.correctAnswers).toBe(0);
    expect(session.progress.attempts).toBe(1);
    expect(session.currentActivity.questionId).toBe('l1-color-apple');

    const right = gradeAnswer(session, 'Red');
    expect(right.correct).toBe(true);
    expect(right.closed).toBe(true);
    expect(session.progress.questionsAnswered).toBe(1);
    expect(session.progress.correctAnswers).toBe(1);
    expect(session.progress.stars).toBe(0);
    expect(session.masteredConcepts).toContain('color-red');
  });

  it('closes a question after a second incorrect answer', () => {
    const session = learningSession();
    gradeAnswer(session, 'Blue');
    const second = gradeAnswer(session, 'Green');
    expect(second.correct).toBe(false);
    expect(second.closed).toBe(true);
    expect(second.revealed).toBe('Red');
    expect(session.progress.questionsAnswered).toBe(1);
    expect(session.progress.correctAnswers).toBe(0);
    expect(session.currentActivity).toBeNull();
  });

  it('does not advance before 4 of the last 5 learning answers are correct', () => {
    const session = learningSession();
    for (let index = 0; index < 3; index += 1) {
      const answer = session.currentActivity.acceptedAnswers[0];
      gradeAnswer(session, answer);
      expect(maybeAdvanceLevel(session)).toBe(false);
      assignNextActivity(session);
    }
    expect(session.level).toBe('L1');
  });

  it('asks for a new topic after colors are mastered', () => {
    const session = createInitialSession('sess_learning_02');
    session.masteredConcepts = ['color-red', 'color-blue', 'color-yellow', 'color-green'];
    session.recentTopics = ['colors'];
    session.progress.questionsAnswered = 1;
    const question = selectQuestion(session);
    expect(question.topic).not.toBe('colors');
  });

  it('brings back a mastered concept on revision turns', () => {
    const session = createInitialSession('sess_learning_03');
    session.masteredConcepts = ['color-red'];
    session.progress.questionsAnswered = 4;
    session.recentAttempts = [
      { questionId: 'l1-animal-cat', closed: true, correct: true, level: 'L1' },
      { questionId: 'l1-animal-dog', closed: true, correct: true, level: 'L1' },
      { questionId: 'l1-fruit-banana', closed: true, correct: true, level: 'L1' },
    ];
    const question = selectQuestion(session);
    expect(question.concept).toBe('color-red');
  });

  it('does not treat a support message as a quiz attempt', async () => {
    const session = learningSession();
    const result = await handleTurn(session, { message: "I can't do it" });
    expect(result.data.mode).toBe('SUPPORT');
    expect(result.data.reply).toMatch(/Learning takes practice/);
    expect(session.progress.questionsAnswered).toBe(0);
    expect(session.progress.attempts).toBe(0);
    expect(session.currentActivity.questionId).toBe('l1-color-apple');
  });
});
