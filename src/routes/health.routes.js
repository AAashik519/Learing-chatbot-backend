import { Router } from 'express';

export function createHealthRouter({ getPersistence, llm }) {
  const router = Router();

  router.get('/', (_req, res) => {
    const persistence = getPersistence();
    const llmConfigured = Boolean(llm?.isEnabled?.());
    res.status(200).json({
      success: true,
      data: {
        status: persistence.connected ? 'ok' : 'degraded',
        responseMode: llmConfigured ? 'llm-with-rule-fallback' : 'rule-based',
        llmConfigured,
        persistence: persistence.mode,
        durable: Boolean(persistence.mode === 'mongodb' && persistence.connected),
        databaseConnected: persistence.connected,
      },
    });
  });

  return router;
}
