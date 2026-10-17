# API documentation

Base URL in local development: `http://localhost:5000/api`

Successful responses use:

```json
{ "success": true, "data": {} }
```

Errors use:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Please send a message or choose a mood." } }
```

The server never returns API keys, stack traces, or the accepted answer list.

## GET /api/health

Shows whether the process is up, whether an LLM key is configured, and which store is active.

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "responseMode": "rule-based",
    "llmConfigured": false,
    "persistence": "memory",
    "durable": false,
    "databaseConnected": true
  }
}
```

`responseMode` is `rule-based` or `llm-with-rule-fallback`. `status` is `degraded` when `MONGODB_URI` is set but the database is not connected. `durable` is true only when MongoDB is connected.

## POST /api/chat

Starts a session on first use and applies one turn.

### Body

| Field | Rule |
| --- | --- |
| `sessionId` | Required. 8 to 64 characters: letters, numbers, `_`, or `-` |
| `message` | Required string, at most 200 characters. May be blank only when `selectedMood` is sent |
| `selectedMood` | Optional: `happy`, `sad`, `bored`, `curious`, or `frustrated` |

```json
{
  "sessionId": "sess_live_demo_01",
  "message": "I am sad",
  "selectedMood": "sad"
}
```

### Response

Values come from the saved session. The example below is one real L1 turn, not a fixed sample.

```json
{
  "success": true,
  "data": {
    "reply": "Let's learn together! What color is an apple?",
    "mode": "LEARNING",
    "modeLabel": "Learning",
    "mood": "curious",
    "level": "L1",
    "levelName": "Beginner",
    "progress": {
      "correctAnswers": 0,
      "questionsAnswered": 0,
      "attempts": 0,
      "masteryScore": 0,
      "stars": 0
    },
    "quickReplies": ["Red", "Blue", "Green"],
    "activity": {
      "questionId": "l1-color-apple",
      "topic": "colors",
      "prompt": "What color is an apple?",
      "level": "L1",
      "kind": "lesson"
    },
    "engine": "rule-based",
    "llmFallback": false,
    "persistence": "memory",
    "durable": false
  }
}
```

`mode` is `LEARNING`, `CONVERSATION`, `ENGAGEMENT`, or `SUPPORT`. `activity` is `null` when nothing is waiting. `kind` is `lesson` or `game`. `engine` is `rule-based` or `llm`. `levelName`, `modeLabel`, `engine`, `llmFallback`, `persistence`, and `durable` are extra display fields. The learning fields above are the source of truth for the UI.

A wrong first try keeps the same activity and adds a hint. A correct answer updates `progress` and usually includes the next prompt.

## GET /api/chat/session/:sessionId

Returns the saved session. If that anonymous id has not been stored yet, the server creates an empty L1 session and returns it. Opening the app does not fail with `SESSION_NOT_FOUND`.

```json
{
  "success": true,
  "data": {
    "sessionId": "sess_live_demo_01",
    "level": "L1",
    "levelName": "Beginner",
    "mode": "LEARNING",
    "modeLabel": "Learning",
    "mood": null,
    "progress": {
      "correctAnswers": 1,
      "questionsAnswered": 1,
      "attempts": 2,
      "masteryScore": 100,
      "stars": 0
    },
    "masteredConcepts": ["color-red"],
    "recentTopics": ["colors"],
    "quickReplies": ["Cat", "Dog", "Cow"],
    "activity": {
      "questionId": "l1-animal-cat",
      "topic": "animals",
      "prompt": "Which animal says meow?",
      "level": "L1",
      "kind": "lesson"
    },
    "conversation": [
      { "role": "child", "text": "Let's learn", "mode": "LEARNING" },
      {
        "role": "bot",
        "text": "Let's learn together! What color is an apple?",
        "mode": "LEARNING",
        "modeLabel": "Learning"
      }
    ],
    "persistence": "memory",
    "durable": false,
    "createdAt": "2026-10-17T05:26:42.000Z",
    "updatedAt": "2026-10-17T05:26:42.000Z"
  }
}
```

Bot turns include `modeLabel`. Child turns do not need one.

## DELETE /api/chat/session/:sessionId

Deletes that anonymous session and its progress. The same session id can be used again later as a new session.

```json
{
  "success": true,
  "data": {
    "sessionId": "sess_live_demo_01",
    "reset": true
  }
}
```

Unknown ids return `404`.

## Error codes

| HTTP | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Bad session id, mood, empty message, or a message over 200 characters |
| 400 | `INVALID_JSON` | The body is not JSON |
| 403 | `CORS_FORBIDDEN` | The browser origin is not in `FRONTEND_URL` |
| 404 | `SESSION_NOT_FOUND` | Delete for a session that is not stored |
| 404 | `NOT_FOUND` | Any other path |
| 429 | `RATE_LIMITED` | More than the configured number of API calls in one minute |
| 503 | `DATABASE_UNAVAILABLE` | `MONGODB_URI` is set, but MongoDB is not connected |
| 500 | `INTERNAL_ERROR` | Unexpected failure. The message is generic |

## Examples

```bash
curl http://localhost:5000/api/health

curl -X POST http://localhost:5000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"sess_demo_child","message":"Let'\''s learn"}'

curl http://localhost:5000/api/chat/session/sess_demo_child

curl -X DELETE http://localhost:5000/api/chat/session/sess_demo_child
```
