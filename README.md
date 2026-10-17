# Little English Buddy Backend

Express API for Little English Buddy, an English-learning chatbot for young children. The backend manages anonymous learning sessions, lesson progress, simple games, safety checks, conversation modes, and optional LLM-generated wording.

## Features

- Rule-based learning engine with levels, grading, hints, progress, and stars
- Learning, conversation, engagement, and support modes
- Child-safety and privacy checks, including distress handling and personal-data redaction
- Optional OpenAI-compatible LLM integration with rule-based fallback
- In-memory sessions for local development
- MongoDB persistence with a seven-day session TTL when configured
- Request validation, security headers, CORS, logging, and rate limiting
- Automated tests with Vitest and Supertest

## Requirements

- Node.js 20 or newer
- npm
- MongoDB, only if durable session storage is needed

## Getting Started

```bash
npm install
npm run dev
```

The API starts at `http://localhost:5000` by default. Check that it is running with:

```bash
curl http://localhost:5000/api/health
```

For a normal start without file watching:

```bash
npm start
```

## Configuration

Create a `.env` file in the project root when you need to change the defaults:

```env
PORT=5000
FRONTEND_URL=http://localhost:5173
RATE_LIMIT_MAX=60

# Optional durable session storage
MONGODB_URI=mongodb://127.0.0.1:27017/little-english-buddy

# Optional OpenAI-compatible model provider
LLM_PROVIDER=openai
LLM_API_KEY=your_api_key
LLM_MODEL=gpt-4o-mini
LLM_TIMEOUT_MS=8000

# Required when using a compatible provider instead of OpenAI
# LLM_PROVIDER=compatible
# LLM_BASE_URL=https://your-provider.example/v1
```

Without `MONGODB_URI`, sessions are kept in process memory and are lost when the server restarts. If MongoDB is configured but unavailable, the server reports a degraded health state and chat requests return `DATABASE_UNAVAILABLE` rather than silently falling back to memory.

The LLM is enabled only when both `LLM_PROVIDER` and `LLM_API_KEY` are set. The API key remains on the server. Learning grades and level changes always come from the local learning engine; the model only helps word the response. Failed, invalid, unsafe, or timed-out model responses use the rule-based response.

## API

Base URL: `http://localhost:5000/api`

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/health` | Reports service, database, and response-mode status |
| `POST` | `/chat` | Creates or updates a session with a child message or mood |
| `GET` | `/chat/:sessionId` | Returns session progress and conversation history |
| `DELETE` | `/chat/:sessionId` | Deletes a session and its progress |

Example chat request:

```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"sess_demo_child","message":"Let\u0027s learn"}'
```

Successful responses have this shape:

```json
{
  "success": true,
  "data": {}
}
```

Errors have this shape:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please send a message or choose a mood."
  }
}
```

The full request, response, and error reference is available in [API documentation](docs/docs/api-documentation.md).

## Development

Run the test suite:

```bash
npm test
```

Available scripts:

- `npm run dev` starts the server with Nodemon
- `npm start` starts the server with Node
- `npm test` runs the Vitest test suite

## Project Structure

```text
src/
  app.js                         Express application and middleware
  server.js                      Production/development entry point
  controllers/                   Request handlers
  routes/                        HTTP route definitions
  services/                      Learning, chat, safety, LLM, and session logic
  data/                          Curriculum and game content
  models/                        MongoDB session model
  middleware/                    Logging, validation, and error handling
  validators/                    Zod request schemas
  utils/                         Shared errors, levels, logging, and text helpers
tests/                           API and service tests
docs/docs/                       API, architecture, and system design documentation
```

See [architecture.md](docs/docs/architecture.md) for the request flow, learning rules, persistence behavior, and frontend integration notes. The system-level design is documented in [system-design.md](docs/docs/system-design.md).

## Security Notes

- Do not commit `.env` files or API keys.
- Configure `FRONTEND_URL` with the allowed frontend origin or comma-separated origins.
- The API limits request bodies to 16 KB and chat messages to 200 characters.
- Anonymous session IDs are client-generated; do not put personal information in them.
