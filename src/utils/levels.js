export const LEVELS = {
  L1: { name: 'Beginner', next: 'L2' },
  L2: { name: 'Growing Learner', next: 'L3' },
  L3: { name: 'Little Explorer', next: null },
};

export const MODE_LABELS = {
  LEARNING: 'Learning',
  CONVERSATION: 'Chat',
  ENGAGEMENT: 'Game',
  SUPPORT: 'Care',
};

export function levelName(level) {
  return LEVELS[level]?.name || 'Beginner';
}

export function nextLevel(level) {
  return LEVELS[level]?.next || null;
}

export function modeLabel(mode) {
  return MODE_LABELS[mode] || 'Chat';
}
