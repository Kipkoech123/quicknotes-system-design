# QuickNotes Data Model

## The four entities

| Entity | What it stores |
|--------|----------------|
| **users** | One row per person with an account |
| **notes** | One row per note. Every note belongs to exactly one user |
| **tags** | One row per label (such as "work" or "shopping") that a user has created |
| **note_tags** | A join table. One row for each time a tag is attached to a note |

### users

| Column | Type | Key / rules |
|--------|------|-------------|
| id | INTEGER | **Primary key**, generated automatically |
| email | TEXT | NOT NULL, **UNIQUE** (no two accounts share an email) |
| display_name | TEXT | NOT NULL |
| password_hash | TEXT | NOT NULL (we store a hash, never the real password) |
| created_at | TEXT (timestamp) | NOT NULL, defaults to now |

### notes

| Column | Type | Key / rules |
|--------|------|-------------|
| id | INTEGER | **Primary key** |
| user_id | INTEGER | NOT NULL, **foreign key** to `users.id` |
| title | TEXT | NOT NULL, 1 to 100 characters (matches the API rule) |
| body | TEXT | NOT NULL, empty text by default |
| created_at | TEXT (timestamp) | NOT NULL, defaults to now |
| updated_at | TEXT (timestamp) | NOT NULL, defaults to now |

### tags

| Column | Type | Key / rules |
|--------|------|-------------|
| id | INTEGER | **Primary key** |
| user_id | INTEGER | NOT NULL, **foreign key** to `users.id` (tags are private to each user) |
| name | TEXT | NOT NULL, unique per user (`UNIQUE (user_id, name)`) |

### note_tags

| Column | Type | Key / rules |
|--------|------|-------------|
| note_id | INTEGER | NOT NULL, **foreign key** to `notes.id` |
| tag_id | INTEGER | NOT NULL, **foreign key** to `tags.id` |
| (note_id, tag_id) | | **Composite primary key**: the same tag cannot be put on the same note twice |

The types above are SQLite types so the SQL below runs in an online SQLite playground. In production PostgreSQL we would use `BIGINT` ids and `TIMESTAMPTZ` for times.

## Relationships

```
users 1 ----< notes            one user has many notes
users 1 ----< tags             one user has many tags
notes >----< tags              many notes have many tags (through note_tags)
```

- **One-to-many (users to notes):** one user can write many notes, but each note has exactly one owner. We store that link as `notes.user_id`, a foreign key pointing at the user. The same pattern links users to tags.
- **Many-to-many (notes and tags):** one note can have many tags ("work" and "urgent"), and one tag can be on many notes. A single column cannot hold that, because we would have to squeeze a list into one cell. The **join table** `note_tags` solves it. It is like a class register: notes and tags each keep their own list, and the register records which tag sits on which note. This turns one many-to-many relationship into two one-to-many relationships.
- **ON DELETE CASCADE:** if a user is deleted, their notes and tags go too. If a note or tag is deleted, its rows in `note_tags` go with it, so nothing is left pointing at something that no longer exists.

## CREATE TABLE statements

```sql
PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS note_tags;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS notes;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    title      TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
    body       TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE tags (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name    TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (user_id, name)
);

CREATE TABLE note_tags (
    note_id INTEGER NOT NULL,
    tag_id  INTEGER NOT NULL,
    PRIMARY KEY (note_id, tag_id),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id)  REFERENCES tags(id)  ON DELETE CASCADE
);
```

## Indexes

```sql
CREATE INDEX idx_notes_user_created ON notes(user_id, created_at DESC);
CREATE INDEX idx_note_tags_tag ON note_tags(tag_id);
```

- **`idx_notes_user_created` (the most important one).** The most common request is "show this user's notes, newest first" (`GET /v1/notes`). Without an index the database reads every note of every user and then sorts them. With this index it jumps straight to that user's notes, already in newest-first order, like using the index at the back of a book instead of reading every page. At millions of notes this is the difference between milliseconds and seconds.
- **`idx_note_tags_tag`.** The primary key of `note_tags` already makes "which tags does this note have?" fast. The reverse question, "which notes have this tag?", needs its own index on `tag_id`.

## Sample data (so the queries return something)

```sql
INSERT INTO users (email, display_name, password_hash) VALUES
    ('amina@example.com', 'Amina', 'hash1'),
    ('brian@example.com', 'Brian', 'hash2');

INSERT INTO notes (user_id, title, body, created_at, updated_at) VALUES
    (1, 'Buy groceries',   'Milk, eggs, bread',        '2026-10-22 08:00:00', '2026-10-22 08:00:00'),
    (1, 'Project ideas',   'Write the API design doc', '2026-10-23 16:00:00', '2026-10-23 16:00:00'),
    (1, 'Meeting notes',   'Discuss the launch date',  '2026-10-24 09:30:00', '2026-10-24 09:30:00'),
    (2, 'Gym plan',        'Run on Monday',            '2026-10-24 07:00:00', '2026-10-24 07:00:00');

INSERT INTO tags (user_id, name) VALUES
    (1, 'personal'),
    (1, 'work'),
    (1, 'urgent'),
    (2, 'health');

INSERT INTO note_tags (note_id, tag_id) VALUES
    (1, 1),
    (2, 2),
    (3, 2),
    (3, 3),
    (4, 4);
```

## Example queries

**1. A user's latest notes (this is what `GET /v1/notes` runs).** It uses `idx_notes_user_created`.

```sql
SELECT id, title, created_at
FROM notes
WHERE user_id = 1
ORDER BY created_at DESC
LIMIT 10;
```

**2. Each note with its tags on one line (JOIN across three tables).**

```sql
SELECT n.id, n.title, GROUP_CONCAT(t.name, ', ') AS tags
FROM notes n
LEFT JOIN note_tags nt ON nt.note_id = n.id
LEFT JOIN tags t       ON t.id = nt.tag_id
WHERE n.user_id = 1
GROUP BY n.id, n.title
ORDER BY n.created_at DESC;
```

`LEFT JOIN` keeps notes that have no tags at all, so no note disappears from the list.

**3. All of a user's notes with the tag "work" (this is what `GET /v1/notes?tag=work` runs).**

```sql
SELECT n.id, n.title
FROM notes n
JOIN note_tags nt ON nt.note_id = n.id
JOIN tags t       ON t.id = nt.tag_id
WHERE t.user_id = 1 AND t.name = 'work'
ORDER BY n.created_at DESC;
```

**4. How many notes each tag has.**

```sql
SELECT t.name, COUNT(nt.note_id) AS number_of_notes
FROM tags t
LEFT JOIN note_tags nt ON nt.tag_id = t.id
WHERE t.user_id = 1
GROUP BY t.id, t.name
ORDER BY number_of_notes DESC;
```

**5. Delete a note (this is what `DELETE /v1/notes/{id}` runs).** The `user_id` check stops one user deleting another user's note, and the cascade rule removes its `note_tags` rows automatically.

```sql
DELETE FROM notes WHERE id = 3 AND user_id = 1;

SELECT COUNT(*) AS tag_links_left_for_note_3 FROM note_tags WHERE note_id = 3;
```

## SQL or NoSQL?

I choose **SQL (a relational database such as PostgreSQL)** for QuickNotes. The data is clearly connected: users own notes, and notes and tags link in a many-to-many way. A relational database is built for exactly this, and it can enforce the rules for us, such as unique emails, titles of at most 100 characters, and no tag attached to a note that does not exist. JOINs make questions like "all notes with the tag work" a single query. The data has a fixed, predictable shape, so we do not need the free-form flexibility of NoSQL. The size is modest too: at 1 million users we expect only a few hundred gigabytes of notes per year (see the architecture document), which one well-indexed primary database with read replicas handles comfortably. NoSQL would be worth revisiting only if the data stopped having a fixed shape, or if writes grew so large that one primary database could no longer keep up. Neither is true for a notes app.
