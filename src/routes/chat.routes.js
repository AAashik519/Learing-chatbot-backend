import { Router } from 'express';
import { createChatController } from '../controllers/chat.controller.js';
import { validateBody, validateParams } from '../middleware/validateRequest.js';
import { chatBodySchema, sessionParamsSchema } from '../validators/chat.validator.js';

export function createChatRouter({ store, getPersistence, llm }) {
  const router = Router();
  const controller = createChatController({ store, getPersistence, llm });

  router.post('/', validateBody(chatBodySchema), controller.postChat);
  router.get('/session/:sessionId', validateParams(sessionParamsSchema), controller.getSession);
  router.delete('/session/:sessionId', validateParams(sessionParamsSchema), controller.deleteSession);

  return router;
}
