import { createInitialSession } from '../services/contextManager.service.js';
import { processChatTurn, toSessionDto } from '../services/chat.service.js';
import { HttpError } from '../utils/errors.js';

export function createChatController({ store, getPersistence, llm }) {
  return {
    async postChat(req, res, next) {
      try {
        const { sessionId, message, selectedMood } = req.body;
        const persistence = getPersistence();
        const result = await processChatTurn({
          store,
          sessionId,
          message,
          selectedMood,
          llm,
        });
        result.data.persistence = persistence.mode;
        result.data.durable = Boolean(persistence.mode === 'mongodb' && persistence.connected);
        res.status(200).json(result);
      } catch (error) {
        next(error);
      }
    },

    async getSession(req, res, next) {
      try {
        let session = await store.get(req.params.sessionId);
        if (!session) {
          session = await store.save(createInitialSession(req.params.sessionId));
        }
        res.status(200).json({
          success: true,
          data: toSessionDto(session, getPersistence()),
        });
      } catch (error) {
        next(error);
      }
    },

    async deleteSession(req, res, next) {
      try {
        const { sessionId } = req.params;
        const removed = await store.delete(sessionId);
        if (!removed) {
          throw new HttpError(404, 'SESSION_NOT_FOUND', 'That learning session was not found.');
        }
        res.status(200).json({
          success: true,
          data: {
            sessionId,
            reset: true,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  };
}
