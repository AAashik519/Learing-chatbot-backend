import { z } from 'zod';

export const sessionIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/, 'Session id must be 8 to 64 letters, numbers, underscores, or hyphens.');

export const chatBodySchema = z.object({
  sessionId: sessionIdSchema,
  message: z.string().max(200, 'Message is too long. Please use 200 characters or fewer.'),
  selectedMood: z.enum(['happy', 'sad', 'bored', 'curious', 'frustrated']).optional(),
}).superRefine((value, ctx) => {
  if (!value.message.trim() && !value.selectedMood) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Please send a message or choose a mood.',
      path: ['message'],
    });
  }
});

export const sessionParamsSchema = z.object({
  sessionId: sessionIdSchema,
});
