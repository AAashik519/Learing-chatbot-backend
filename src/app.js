  import cors from 'cors';
  import express from 'express';
  import rateLimit from 'express-rate-limit';
  import helmet from 'helmet';
  import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
  import { requestLogger } from './middleware/requestLogger.js';
  import { createChatRouter } from './routes/chat.routes.js';
  import { createHealthRouter } from './routes/health.routes.js';
  import { createLlmClient } from './services/llm.service.js';
  import { createMemoryStore } from './services/sessionStore.service.js';
  import { HttpError } from './utils/errors.js';

  function allowedOrigins(env) {
    return (env.FRONTEND_URL || 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  export function createApp({
    store = createMemoryStore(),
    getPersistence = () => ({ mode: store.kind || 'memory', durable: false, connected: true }),
    llm = createLlmClient(),
    env = process.env,
  } = {}) {
    const app = express();
    if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

    app.use(helmet());
    app.use(cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins(env).includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new HttpError(403, 'CORS_FORBIDDEN', 'This origin is not allowed.'));
      },
    }));
    app.use(express.json({ limit: '16kb' }));
    app.use(requestLogger);
    app.use(rateLimit({
      windowMs: 60 * 1000,
      limit: Number(env.RATE_LIMIT_MAX || 60),
      standardHeaders: true,
      legacyHeaders: false,
      skip: () => env.NODE_ENV === 'test',
      message: {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please wait a moment and try again.',
        },
      },
    }));

    app.use('/api/health', createHealthRouter({ getPersistence, llm }));
    app.use('/api/chat', createChatRouter({ store, getPersistence, llm }));
    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
  }


  export default createApp();