# System design

## Functional requirements

- A child can chat with Little English Buddy, answer short English questions, play a guessing game, talk, or say how they feel.
- The buddy teaches three levels: L1 Beginner, L2 Growing Learner, and L3 Little Explorer.
- The server decides the mode, the grade, the level, the score, and the next activity.
- A random child question, such as a small sum, gets a direct answer. A configured model may write that answer. A built-in reply is used when the model is off or fails.
- The child can leave and come back to the same anonymous session.
- The child can reset the session.
- The app works with no model key.

## Non-functional requirements

- Child-facing copy stays short and kind.
- The rule-based path should return quickly. The local target for that path is under 2 seconds. See the measured results below.
- A live model call may take longer. It is bounded by `LLM_TIMEOUT_MS`, then the built-in reply is used.
- Session context cannot grow without a limit.
- Errors do not include stack traces or secrets.
- The buddy does not present itself as a person, a teacher, a therapist, OpenAI, or ChatGPT.
- In-memory progress is labeled as not durable.

## Interaction modes

Exactly four modes are returned:

| Mode | When it is used | What it changes |
| --- | --- | --- |
| LEARNING | The child asks to learn, or answers the open question | Grades the answer and may move the level |
| CONVERSATION | The child wants to talk, greets the buddy, asks a question, or shares an everyday topic | Pauses the lesson. No quiz attempt |
| ENGAGEMENT | The child asks to play, says they are bored, or answers the guessing game | Runs a game. No quiz attempt |
| SUPPORT | The child says they are sad, scared, stuck, or discouraged, or selects that mood on a weak message | Pauses teaching, except a hint or an easier question when they are stuck on the current item |

Clear support words win over a lesson. "Let's learn" still starts a lesson if that is the actual request. A selected mood is applied when the message is empty, very short, a greeting, or names that feeling. A real answer such as "red" is still graded if a question is open.

A message with a question mark, or a small sum such as "5+5", is treated as conversation so it is not marked wrong against the open lesson.

Serious distress phrases always return a calm request to tell a parent or teacher. The bot does not ask for details and does not diagnose anyone.

## Answering random questions

1. Identity questions ("Are you OpenAI?", "Are you ChatGPT?", "Are you a real person?") never call the model. The reply starts with "No" and then says the helper is Little English Buddy.
2. Small sums and a few everyday facts, such as why the sky looks blue, have a deterministic answer.
3. Other questions are sent to the model when `LLM_API_KEY` and `LLM_PROVIDER` are set. The prompt asks for a short answer a young child can understand.
4. If the model times out, has no credits, or returns unsafe or invalid text, the built-in reply is returned instead. A sum still receives the deterministic answer.

The model is not allowed to change the level or to call a wrong lesson answer correct.

## L1–L3 progression

Curriculum items live in `backend/src/data/curriculum.js`. Each item has a level, topic, concept, prompt, accepted answers, quick replies, hint, and difficulty.

A learning question is closed in one of two ways:

- The answer matches, after lowercasing and light cleanup.
- The child misses twice. The first miss keeps the same question and gives the hint. The second miss reveals the answer and moves on.

Only closed learning questions count toward `questionsAnswered` and `correctAnswers`. Games, chat, feelings, and random questions do not.

Advancement looks only at the current level:

1. Take the last 5 closed learning questions for that level.
2. If there are fewer than 5, stay on the level.
3. If at least 4 of those 5 are correct, move exactly one level: L1 to L2, or L2 to L3.
4. L3 does not advance further.

Message count alone cannot raise the level. After a move, the next question comes from the new level.

Other learning rules:

- A concept is mastered after one correct closed answer.
- The next new question prefers a concept that is not mastered, and it avoids repeating the latest topic when another topic is available.
- Every 4th closed question, the selector prefers a mastered concept that was not asked in the last few attempts.
- The last 6 question ids are skipped when other questions remain.
- After a wrong close, or after "I got it wrong", the next item prefers difficulty 1.
- "I can't do it" keeps the same question, gives the hint, and does not count an attempt.

`masteryScore` is the percent correct among the last 5 closed learning questions, of any level. `stars` is one star for every two correct answers, with a cap of 15.

## Context

Each session stores the level, mode, mood, progress, mastered concepts, recent topics, recent attempts, the open or paused activity, the guessing game, and up to 20 conversation turns. User text is stored as data. It is not evaluated as code and it is not allowed to change these rules. Phone-like numbers and email addresses are redacted before they are saved.

Saying "Let's play" pauses the open question. "Let's learn" resumes that same question when it is still unanswered. If the child has mastered the color concepts, a later remark about colors acknowledges that instead of teaching the same colors again.

In-memory sessions older than 7 days are dropped, and the map keeps at most 500 sessions. MongoDB uses a 7-day TTL on `updatedAt`.

## Safety

- Profanity and insults get a request to use kind words. The reply does not repeat the insult.
- "I am stupid" is treated as discouragement, not as a reason to scold.
- Requests to ignore instructions, change the system prompt, or reveal secrets do not change the level or the rules.
- Private details are not requested. Addresses, phone numbers, and passwords get a short warning.
- Generated text is rejected if it is empty, longer than 400 characters, contains a URL, claims the buddy is human, a therapist, OpenAI, or ChatGPT, or calls a wrong answer correct.
- The public activity object never includes `acceptedAnswers`.

## Performance strategy

The default path is keyword mode detection, a session read, and template replies. Context arrays are capped. The optional model call has a hard timeout and a small token budget. Each response sets `X-Response-Time-Ms` and writes a log line with method, path, status, and latency. The log does not include the child's message or secrets.

### Measured results

Measured on 17 October 2026 on this development machine (Linux, Node.js v24.14.1). The store was in-memory. No model call was made. These numbers do not include a remote database, a model provider, or internet delay.

| Check | Requests | Average | p95 | Max |
| --- | --- | --- | --- | --- |
| Vitest through Supertest, server time | 20 | 0.87 ms | 1.5 ms | 3.9 ms |
| localhost HTTP, client round trip | 20 | 1.55 ms | 2.14 ms | 2.57 ms |
| localhost HTTP, `X-Response-Time-Ms` | 20 | 0.55 ms | 0.9 ms | 0.9 ms |

On this machine the rule-based path is under 2 seconds. A hosted server, MongoDB Atlas, or a live model still needs its own measurement. Live OpenAI calls in this project often needed more than 1.2 seconds, so the practical timeout in `.env` is 10000 ms. If the account has no credits, the provider returns an error and the built-in reply is used.

## Data persistence

Anonymous session ids match `^[A-Za-z0-9_-]{8,64}$`. There are no child accounts.

The Mongoose model stores `sessionId`, level, mode, mood, progress, mastered concepts, recent topics, recent attempts, conversation, current activity, paused activity, game state, and timestamps. `sessionId` is unique and indexed.

If `MONGODB_URI` is empty, the store is memory. Health and chat responses set `durable` to false. With a valid Atlas URI, this app connects to the `little-english-buddy` database and reports `durable: true`. A rejected username or password leaves chat unavailable until the login works. It does not silently save to memory.

Opening the app calls `GET /api/chat/session/:sessionId`. A new id is saved as an empty L1 session. Deleting an id that was never stored returns 404.

## Error handling

| Situation | Result |
| --- | --- |
| Invalid body or session id | 400 `VALIDATION_ERROR` |
| Invalid JSON | 400 `INVALID_JSON` |
| Delete of an unknown session | 404 `SESSION_NOT_FOUND` |
| Browser origin not allowed | 403 `CORS_FORBIDDEN` |
| Too many requests | 429 `RATE_LIMITED` |
| `MONGODB_URI` is set but the database is down or the login fails | 503 `DATABASE_UNAVAILABLE` |
| Unexpected failure | 500 with a generic message |
| Model timeout, quota, or bad output | 200 with the rule-based reply and `llmFallback: true` |

## Security

- CORS allows only origins listed in `FRONTEND_URL`.
- Helmet sets security headers.
- `/api` is rate limited. The default is 60 requests per minute per IP. Tests skip the limiter.
- Production sets `trust proxy` so the limiter sees the platform's client IP.
- Zod checks the body and the session id. Messages are limited to 200 characters.
- The global error handler hides stacks and secret values.
- Model keys and the MongoDB URI are read from the server environment only. They are not placed in frontend env files or in git.

## Trade-offs and limitations

- Built-in replies are predictable and fast. Open questions outside the small fact list need a working model key.
- The curriculum is a fixed list. New items belong in `curriculum.js`.
- Lesson grading is text matching. A creative sentence that does not contain the expected words can be marked wrong.
- Mood detection uses keywords and the selected mood. It does not claim to know how a child feels.
- Memory mode loses progress on restart. One server process does not share that memory with another.
- There is no voice input, picture upload, account, or parent dashboard.
- The buddy cannot replace a teacher or a caregiver.
