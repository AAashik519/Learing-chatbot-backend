import { levelName } from '../utils/levels.js';
import { calmDistressReply } from './safety.service.js';
import { topicIsMastered } from './learningEngine.service.js';

const LEARN_REPLIES = ["Let's learn", "Let's play", 'I want to talk'];
const SUPPORT_REPLIES = ["Let's play", 'I want to talk', "Let's learn"];

function withQuestion(text, activity) {
  if (!activity?.prompt) return text;
  return `${text} ${activity.prompt}`;
}

function learningQuickReplies(session) {
  return session.currentActivity?.quickReplies || LEARN_REPLIES;
}

export function composeReply({ session, message, detection, evaluation, safety }) {
  if (safety?.severe || detection.reason === 'distress') {
    return calmDistressReply();
  }

  if (safety?.privacy) {
    return {
      reply: 'Please do not share phone numbers, addresses, or passwords here. A grown-up can help with private things.',
      quickReplies: ["Let's learn", "Let's play", 'I want to talk'],
    };
  }

  if (safety?.selfCritical) {
    return {
      reply: 'You are not a bad learner. Learning takes practice, and I can help with a smaller step.',
      quickReplies: session.currentActivity?.quickReplies || SUPPORT_REPLIES,
    };
  }

  if (safety?.unkind) {
    return {
      reply: 'Let us use kind words. I am here to help you learn.',
      quickReplies: SUPPORT_REPLIES,
    };
  }

  if (detection.mode === 'SUPPORT') return supportReply(session, detection);
  if (detection.mode === 'ENGAGEMENT') return engagementReply(session, detection, evaluation);
  if (detection.mode === 'LEARNING') return learningReply(session, detection, evaluation);
  return conversationReply(session, message, detection);
}

function supportReply(session, detection) {
  if (detection.reason === 'cannot') {
    const hint = session.currentActivity?.hint;
    return {
      reply: hint
        ? `That's okay! Learning takes practice. Would you like a little hint? ${hint}`
        : "That's okay! Learning takes practice. Would you like a little hint?",
      quickReplies: learningQuickReplies(session),
    };
  }

  if (detection.reason === 'wrong') {
    return {
      reply: withQuestion("Mistakes help us learn! Let's try an easier one together.", session.currentActivity),
      quickReplies: learningQuickReplies(session),
    };
  }

  if (detection.reason === 'mood' && detection.mood === 'frustrated') {
    return {
      reply: "That's okay! Learning takes practice. Would you like a little hint?",
      quickReplies: SUPPORT_REPLIES,
    };
  }

  return {
    reply: "I'm sorry you're feeling sad. Would you like to tell me about it, or play a little game?",
    quickReplies: SUPPORT_REPLIES,
  };
}

function engagementReply(session, detection, evaluation) {
  const game = session.game;
  if (evaluation?.correct) {
    return {
      reply: `Yes! ${evaluation.displayAnswer} is right. Let's try a fun guessing game! ${game?.prompt || ''}`.trim(),
      quickReplies: game?.quickReplies || LEARN_REPLIES,
    };
  }
  if (evaluation && !evaluation.closed) {
    return {
      reply: `Not this time. ${evaluation.hint} Try again!`,
      quickReplies: game?.quickReplies || LEARN_REPLIES,
    };
  }
  if (evaluation && evaluation.closed) {
    return {
      reply: `Good try. It was ${evaluation.revealed}. Let's try a fun guessing game! ${game?.prompt || ''}`.trim(),
      quickReplies: game?.quickReplies || LEARN_REPLIES,
    };
  }

  const opener = detection.reason === 'bored' || detection.reason === 'play'
    ? "Let's try a fun guessing game!"
    : "Let's play a little game.";
  return {
    reply: game ? `${opener} ${game.prompt}` : opener,
    quickReplies: game?.quickReplies || LEARN_REPLIES,
  };
}

function learningReply(session, detection, evaluation) {
  const activity = session.currentActivity;
  const care = detection.mood === 'sad'
    ? "I'm glad you told me. We can learn one tiny thing together."
    : null;

  if (evaluation?.correct) {
    const praise = evaluation.advanced
      ? `Yes! ${evaluation.displayAnswer} is right. You are ready for the next level. Welcome to ${levelName(session.level)}!`
      : `Yes! ${evaluation.displayAnswer} is right.`;
    return {
      reply: withQuestion(praise, activity),
      quickReplies: learningQuickReplies(session),
    };
  }

  if (evaluation && !evaluation.closed) {
    return {
      reply: `Not quite. ${evaluation.hint} Try again!`,
      quickReplies: learningQuickReplies(session),
    };
  }

  if (evaluation && evaluation.closed) {
    return {
      reply: withQuestion(
        `That's okay. The answer is ${evaluation.revealed}. Mistakes help us learn!`,
        activity,
      ),
      quickReplies: learningQuickReplies(session),
    };
  }

  if (detection.reason === 'repeat' && activity) {
    return {
      reply: `I am here. ${activity.prompt}`,
      quickReplies: activity.quickReplies,
    };
  }

  const opener = detection.resumed
    ? "Let's go back to learning."
    : care || "Let's learn together!";
  return {
    reply: activity ? `${opener} ${activity.prompt}` : `${opener} Tell me when you want a question.`,
    quickReplies: learningQuickReplies(session),
  };
}

const IDENTITY_QUESTION = /\b(open\s*ai|openai|chat\s*gpt|chatgpt|\bgpt\b|gemini|claude)\b|\bare you(?: a| an)? (?:real )?(?:person|human|robot|ai|bot)\b/i;

export function identityReply(message) {
  const text = String(message || '');
  if (!IDENTITY_QUESTION.test(text)) return null;
  return {
    reply: 'No. I am Little English Buddy, a computer helper for learning English. We can learn a word or play a game.',
    quickReplies: ["Let's learn", "Let's play", 'I want to talk'],
  };
}

export function answerSimpleMath(message) {
  const match = String(message || '').toLowerCase().match(/(\d+)\s*(\+|plus|-|minus|−|x|×|\*|times)\s*(\d+)/);
  if (!match) return null;
  const left = Number(match[1]);
  const right = Number(match[3]);
  if (!Number.isInteger(left) || !Number.isInteger(right) || left > 100 || right > 100) return null;

  const operator = match[2];
  let value = left + right;
  let spoken = 'plus';
  if (operator === '-' || operator === 'minus' || operator === '−') {
    value = left - right;
    spoken = 'minus';
  } else if (operator === 'x' || operator === '×' || operator === '*' || operator === 'times') {
    value = left * right;
    spoken = 'times';
  }
  if (value < 0 || value > 200) return null;
  return `${left} ${spoken} ${right} is ${value}.`;
}

function answerSimpleFact(normalized) {
  const facts = [
    [/why.{0,24}sky|sky.{0,16}blue/, 'Sunlight makes the sky look blue. On a sunny day, the sky is blue.'],
    [/how many days/, 'There are 7 days in one week.'],
    [/what is your name|who are you/, 'I am Little English Buddy. I am a computer helper, not a real person.'],
    [/how old are you/, 'I am a computer helper. I do not have a birthday.'],
    [/what do cats say|what does a cat say/, 'A cat says meow.'],
    [/what do dogs say|what does a dog say/, 'A dog says woof.'],
  ];
  const found = facts.find(([pattern]) => pattern.test(normalized));
  return found ? found[1] : null;
}

function conversationReply(session, message, detection) {
  const text = String(message || '');
  const normalized = text.toLowerCase();
  const identity = identityReply(text);
  if (identity) return identity;

  if (detection.reason === 'empty' || detection.reason === 'injection') {
    return {
      reply: 'I am here with you. You can say let\'s learn, let\'s play, or tell me how you feel.',
      quickReplies: LEARN_REPLIES,
    };
  }

  if (detection.reason === 'greeting') {
    return {
      reply: 'Hello! I am Little English Buddy. We can learn words, play a game, or just talk.',
      quickReplies: LEARN_REPLIES,
    };
  }

  if (detection.mood === 'happy' && detection.reason === 'mood') {
    return {
      reply: 'I am glad you feel happy. What would you like to do: learn, play, or talk?',
      quickReplies: LEARN_REPLIES,
    };
  }

  const colorWords = /\b(red|blue|green|yellow|color|colours|colors)\b/i.test(normalized);
  const colorConcepts = ['color-red', 'color-blue', 'color-yellow', 'color-green'];
  const knowsColors = colorConcepts.every((concept) => session.masteredConcepts.includes(concept));
  if (colorWords && knowsColors) {
    return {
      reply: 'You already know your colors well. Let us try a new idea, or tell me your favorite animal.',
      quickReplies: ["Let's learn", 'I like cats', "Let's play"],
    };
  }

  if (/\b(cat|cats|dog|dogs|animal|animals)\b/i.test(normalized) && topicIsMastered(session, 'animals')) {
    return {
      reply: 'You already know a lot about animals. Cats say meow, and dogs say woof. Which animal do you like today?',
      quickReplies: ['I like cats', 'I like dogs', "Let's learn"],
    };
  }

  if (/\b(cat|kitten)\b/i.test(normalized)) {
    return {
      reply: 'Cats say meow. They like to nap. Do you want to learn animal words or just talk?',
      quickReplies: ["Let's learn", "Let's play", 'I like dogs'],
    };
  }

  if (/\b(dog|puppy)\b/i.test(normalized)) {
    return {
      reply: 'Dogs say woof. A baby dog is a puppy. What do you like to do with dogs?',
      quickReplies: ["Let's play", "Let's learn", 'I like cats'],
    };
  }

  if (/\b(banana|apple|fruit)\b/i.test(normalized)) {
    return {
      reply: 'Fruit is yummy. Apples can be red, and bananas are yellow. Would you like a fruit question?',
      quickReplies: ["Let's learn", "Let's play", 'I like apples'],
    };
  }

  const mathReply = answerSimpleMath(message);
  if (mathReply) {
    return {
      reply: mathReply,
      quickReplies: ['Another one', "Let's learn", "Let's play"],
    };
  }

  const factReply = answerSimpleFact(normalized);
  if (factReply) {
    return {
      reply: factReply,
      quickReplies: ["Let's learn", "Let's play", 'Another question'],
    };
  }

  if (detection.reason === 'question') {
    return {
      reply: 'That is a good question. I am not sure yet. You can ask a grown-up, or we can learn a word together.',
      quickReplies: LEARN_REPLIES,
    };
  }

  if (detection.reason === 'talk') {
    const topic = session.recentTopics[0];
    const topicLine = topic
      ? ` We were talking about ${topic}.`
      : '';
    return {
      reply: `I am listening.${topicLine} Tell me something from your day, or pick a game or a lesson.`,
      quickReplies: LEARN_REPLIES,
    };
  }

  return {
    reply: 'That sounds interesting. I am a learning helper, not a real person. Would you like to talk more, play, or learn a word?',
    quickReplies: LEARN_REPLIES,
  };
}
