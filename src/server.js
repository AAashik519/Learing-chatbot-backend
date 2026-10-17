import dotenv from 'dotenv';
import { createApp } from './app.js';
import { connectDatabase, getDatabaseState } from './config/database.js';
import { createLlmClient } from './services/llm.service.js';
import { createStoreForDatabase } from './services/sessionStore.service.js';
import { logger } from './utils/logger.js';

dotenv.config();

const database = await connectDatabase();
const store = createStoreForDatabase(database);
const llm = createLlmClient();
const app = createApp({
  store,
  getPersistence: getDatabaseState,
  llm,
});

const port = Number(process.env.PORT || 5000);
const server = app.listen(port, () => {
  logger.info({
    message: 'Little English Buddy API is listening.',
    port,
    responseMode: llm.isEnabled() ? 'llm-with-rule-fallback' : 'rule-based',
    persistence: database.mode,
    durable: Boolean(database.mode === 'mongodb' && database.connected),
  });
});

server.on('error', (error) => {
  logger.error({ message: 'Server failed to start.', detail: error.message });
  process.exit(1);
});
