# QuickNotes System Design

QuickNotes is a simple notes app. This project covers two jobs. First, a small web page that talks to an online API: it loads notes, creates them and deletes them. Second, the design documents a backend team would use to build the real QuickNotes service for **1 million users**.

The front end talks to [JSONPlaceholder](https://jsonplaceholder.typicode.com), a free practice API. It pretends to save data but never really stores it, so a note you create disappears when you reload the page. That is expected.

## How to run the API client

You need a web browser and an internet connection. There is nothing to install.

1. Download or clone this repository.
2. Double-click `index.html` to open it in your browser.
3. Click **Load notes** to fetch 10 notes from the server.
4. Type a title (required, up to 100 characters) and an optional body, then click **Add note**. The new note appears at the top of the list.
5. Click **Delete** on any note to remove it.

If you prefer to run it from a small local server, open a terminal in this folder and run `python -m http.server 8000`, then visit `http://localhost:8000`.

### What the page shows

- **Loading:** "Loading notes..." while a request is running, and the buttons are switched off so you cannot click twice.
- **Success:** a green message such as "Loaded 10 notes from the server." or "Note created (status 201, id 101)."
- **Error:** a red, friendly message if the server or your connection fails.
- **Empty:** "No notes to show yet." when the list has nothing in it.

## Project files

| File | What it is |
|------|------------|
| `index.html` | The page: Load button, status message, add-note form and the notes list |
| `api.js` | The code: one reusable `request()` function, plus GET, POST and DELETE |
| `style.css` | The styling, including different looks for success and error messages |
| `docs/api-design.md` | The real QuickNotes REST API: endpoints, JSON examples and error codes |
| `docs/data-model.md` | The database: tables, keys, relationships, SQL, an index and SQL vs NoSQL |
| `docs/architecture.md` | The system design: requirements, load estimates, diagram, request flows and trade-offs |

## The three documents

- [API design](docs/api-design.md)
- [Data model](docs/data-model.md)
- [Architecture](docs/architecture.md)

## What I learned

1. **`fetch` does not fail on a 404 or 500.** It only fails when the network is down. A bad reply still counts as "success", so I have to check `response.ok` myself and throw an error. That is why `request()` exists in one place.
2. **Every request has four states: loading, success, error and empty.** Building all four, and switching the buttons off while a request runs, is what makes a page feel reliable instead of confusing.
3. **`textContent` keeps user text safe.** If a user types HTML or a script as a note title, `textContent` shows it as plain text. Using `innerHTML` instead could let someone run harmful code on the page.
4. **A many-to-many relationship needs a join table.** Notes and tags cannot link through one column, so `note_tags` sits in the middle, like a class register, and turns one hard relationship into two simple ones.
5. **Estimating the load changes the design.** Working out that QuickNotes does about 46 reads and 7 writes per second showed me it is read-heavy, which is why a cache and a read replica make sense. It also showed that extra servers are there for safety, not just for speed.
6. **Good APIs and good designs are about clear rules.** Status codes such as 201, 401, 403 and 404 each mean one specific thing, and a single "single point of failure" can be hidden anywhere, so every component needs a backup.
