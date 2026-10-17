import mongoose from 'mongoose';

const attemptSchema = new mongoose.Schema({
  questionId: String,
  concept: String,
  topic: String,
  level: String,
  correct: Boolean,
  closed: Boolean,
  at: String,
}, { _id: false });

const turnSchema = new mongoose.Schema({
  role: { type: String, enum: ['child', 'bot'] },
  text: String,
  mode: String,
  at: String,
}, { _id: false });

const activitySchema = new mongoose.Schema({
  questionId: String,
  topic: String,
  concept: String,
  prompt: String,
  hint: String,
  displayAnswer: String,
  acceptedAnswers: [String],
  quickReplies: [String],
  level: String,
  difficulty: Number,
  attemptCount: Number,
  awaitingAnswer: Boolean,
}, { _id: false });

const learningSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  level: { type: String, enum: ['L1', 'L2', 'L3'], default: 'L1' },
  mode: {
    type: String,
    enum: ['LEARNING', 'CONVERSATION', 'ENGAGEMENT', 'SUPPORT'],
    default: 'CONVERSATION',
  },
  mood: { type: String, default: null },
  progress: {
    correctAnswers: { type: Number, default: 0 },
    questionsAnswered: { type: Number, default: 0 },
    attempts: { type: Number, default: 0 },
    masteryScore: { type: Number, default: 0 },
    stars: { type: Number, default: 0 },
  },
  masteredConcepts: { type: [String], default: [] },
  recentTopics: { type: [String], default: [] },
  recentAttempts: { type: [attemptSchema], default: [] },
  conversation: { type: [turnSchema], default: [] },
  currentActivity: { type: activitySchema, default: null },
  pausedActivity: { type: activitySchema, default: null },
  game: { type: mongoose.Schema.Types.Mixed, default: null },
  gamesPlayed: { type: Number, default: 0 },
  lastQuickReplies: { type: [String], default: [] },
}, { timestamps: true });

learningSessionSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

export const LearningSession = mongoose.models.LearningSession
  || mongoose.model('LearningSession', learningSessionSchema);
