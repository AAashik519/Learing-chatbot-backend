import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

const state = {
  mode: 'memory',
  durable: false,
  connected: true,
  error: null,
};

export function getDatabaseState() {
  return { ...state };
}

export async function connectDatabase(env = process.env) {
  const uri = env.MONGODB_URI?.trim();
  if (!uri) {
    state.mode = 'memory';
    state.durable = false;
    state.connected = true;
    state.error = null;
    logger.info({
      message: 'Using in-memory session store. Progress is not durable and will be lost on restart.',
    });
    return getDatabaseState();
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    state.mode = 'mongodb';
    state.durable = true;
    state.connected = true;
    state.error = null;
    logger.info({ message: 'Connected to MongoDB.' });
  } catch (error) {
    state.mode = 'mongodb';
    state.durable = false;
    state.connected = false;
    state.error = 'Database connection failed';
    logger.error({ message: 'MongoDB connection failed.', detail: error.message });
  }

  return getDatabaseState();
}
