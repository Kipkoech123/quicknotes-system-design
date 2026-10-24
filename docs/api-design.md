# QuickNotes API Design

This is the **real API** the backend team should build for QuickNotes. It is not JSONPlaceholder, which is only a practice server used by the front-end demo in this repo.

## Design rules

- **Nouns, not verbs.** The URL names the thing (`/notes`), and the HTTP method says what to do with it (`GET` reads, `POST` creates, `PATCH` changes, `DELETE` removes). Think of a library: the shelf is `/notes`, and the method is whether you look, add, change or remove a book.
- **Plural names.** `/notes`, `/tags`.
- **Versioned.** Every path starts with `/v1` so we can improve the API later without breaking old apps.
- **JSON everywhere.** Requests and responses use `Content-Type: application/json`. Times use ISO 8601 in UTC, for example `2026-10-24T10:15:00Z`.
- **Stateless and signed in.** Every call except register and login must send the header `Authorization: Bearer <access token>`. The server does not remember anything between calls.
- **Each user only sees their own notes.**
- Base URL: `https://api.quicknotes.example/v1`

## Endpoints

| # | Method | Path | Description | Success status |
|---|--------|------|-------------|----------------|
| 1 | POST | `/v1/users` | Register a new account (email, display name, password) | 201 Created |
| 2 | POST | `/v1/auth/login` | Log in with email and password and receive an access token | 200 OK |
| 3 | GET | `/v1/notes` | List the signed-in user's notes, newest first. Supports `?page=`, `?per_page=` and `?tag=` | 200 OK |
| 4 | POST | `/v1/notes` | Create a note (title, optional body, optional tags) | 201 Created |
| 5 | GET | `/v1/notes/{id}` | Get one note | 200 OK |
| 6 | PATCH | `/v1/notes/{id}` | Change part of a note (for example only the title) | 200 OK |
| 7 | DELETE | `/v1/notes/{id}` | Delete a note | 204 No Content |
| 8 | GET | `/v1/tags` | List the user's tags | 200 OK |
| 9 | PUT | `/v1/notes/{id}/tags/{tagId}` | Attach a tag to a note (safe to repeat) | 204 No Content |
| 10 | DELETE | `/v1/notes/{id}/tags/{tagId}` | Remove a tag from a note | 204 No Content |

Notes on the status codes:
- **201 Created** is used when a new thing now exists. The response includes a `Location` header with the new thing's address, for example `Location: /v1/notes/42`.
- **204 No Content** means "done, and there is nothing to send back", which is why DELETE has no body.
- Rules for notes: `title` is required and at most **100 characters**. `body` is optional.

## Example: create a note

**Request**

```
POST /v1/notes
Authorization: Bearer eyJhbGciOi...
Content-Type: application/json
```

```json
{
  "title": "Buy groceries",
  "body": "Milk, eggs, bread",
  "tags": ["personal", "shopping"]
}
```

**Response: `201 Created`**

```
Location: /v1/notes/42
```

```json
{
  "id": 42,
  "title": "Buy groceries",
  "body": "Milk, eggs, bread",
  "tags": ["personal", "shopping"],
  "created_at": "2026-10-24T10:15:00Z",
  "updated_at": "2026-10-24T10:15:00Z"
}
```

## Example: list notes

**Request**

```
GET /v1/notes?page=1&per_page=2
Authorization: Bearer eyJhbGciOi...
```

**Response: `200 OK`**

```json
{
  "data": [
    {
      "id": 42,
      "title": "Buy groceries",
      "body": "Milk, eggs, bread",
      "tags": ["personal", "shopping"],
      "created_at": "2026-10-24T10:15:00Z",
      "updated_at": "2026-10-24T10:15:00Z"
    },
    {
      "id": 41,
      "title": "Project ideas",
      "body": "Write the API design doc",
      "tags": ["work"],
      "created_at": "2026-10-23T16:02:00Z",
      "updated_at": "2026-10-23T16:02:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "per_page": 2,
    "total": 57,
    "total_pages": 29
  }
}
```

The list is **paged** so the server never sends hundreds of notes at once. An empty list is not an error: it returns `200 OK` with `"data": []`.

## Error codes

Every error uses the same body shape, so the front end can handle all of them in one place:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Title is required and must be 100 characters or fewer.",
    "details": [
      { "field": "title", "issue": "too_long", "max": 100 }
    ]
  }
}
```

| Status | Name | When the API returns it |
|--------|------|-------------------------|
| 400 | Bad Request | The request is invalid: broken JSON, missing title, title longer than 100 characters |
| 401 | Unauthorized | No token, an expired token, or a wrong email or password. The user is not proven to be who they say |
| 403 | Forbidden | The token is valid, but the note belongs to someone else. The user is known but not allowed |
| 404 | Not Found | The note or tag does not exist, or the path is wrong |
| 409 | Conflict | The request clashes with existing data, such as registering an email that already exists |
| 429 | Too Many Requests | The client is sending requests too fast (rate limit) |
| 500 | Internal Server Error | A bug or failure on our side. The user did nothing wrong, and details go to the logs and never to the client |

**Examples**

`401 Unauthorized`

```json
{
  "error": {
    "code": "unauthorized",
    "message": "Your session has expired. Please log in again."
  }
}
```

`403 Forbidden`

```json
{
  "error": {
    "code": "forbidden",
    "message": "You do not have permission to view this note."
  }
}
```

`404 Not Found`

```json
{
  "error": {
    "code": "not_found",
    "message": "Note 999 was not found."
  }
}
```

`500 Internal Server Error`

```json
{
  "error": {
    "code": "internal_error",
    "message": "Something went wrong on our side. Please try again.",
    "request_id": "req_8f3a21"
  }
}
```

The `request_id` lets the team find the exact failure in the logs without showing technical details to the user.

**401 or 403?** 401 means "we do not know who you are", so log in. 403 means "we know who you are, but this is not yours". Some APIs return 404 instead of 403 for other people's notes so they do not reveal that the note exists. We keep 403 here to match the rules of this project.
