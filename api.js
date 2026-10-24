// QuickNotes - API client
// This file talks to the JSONPlaceholder practice API using fetch().

const API_URL = "https://jsonplaceholder.typicode.com/posts";

// Find every page element we need, once, at the top.
const loadBtn = document.getElementById("load-btn");
const statusEl = document.getElementById("status");
const notesList = document.getElementById("notes-list");
const noteForm = document.getElementById("note-form");
const titleInput = document.getElementById("title-input");
const bodyInput = document.getElementById("body-input");
const submitBtn = document.getElementById("submit-btn");

const MAX_TITLE_LENGTH = 100;

// ---------- Helpers: status messages and busy state ----------

// type is "loading", "success" or "error". It picks the colour in style.css.
function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = type || "";
}

// While a request is running, disable every button so the user cannot
// click twice and send the same request again.
function setBusy(isBusy) {
  loadBtn.disabled = isBusy;
  submitBtn.disabled = isBusy;
  const deleteButtons = notesList.querySelectorAll(".delete-btn");
  for (const button of deleteButtons) {
    button.disabled = isBusy;
  }
}

// Turn a technical error into a message a normal person can understand.
function friendlyError(error, action) {
  if (error.status) {
    return "Sorry, we could not " + action + ". The server answered with status " +
      error.status + ". Please try again.";
  }
  return "Sorry, we could not " + action +
    ". Please check your internet connection and try again.";
}

// ---------- One reusable function for every request ----------

async function request(url, options) {
  const response = await fetch(url, options);

  // fetch() only fails on network problems. A 404 or 500 reply still counts
  // as "success" to fetch, so we check response.ok ourselves and throw.
  if (!response.ok) {
    const error = new Error("Request failed with status " + response.status);
    error.status = response.status;
    throw error;
  }

  // Some replies (like DELETE) can have an empty body, so read it as text first.
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  return { data: data, status: response.status };
}

// ---------- Showing notes on the page ----------

// We only ever use textContent to put user text on the page.
// textContent treats everything as plain text, so a note such as
// "<script>..." is shown as text and can never run as code.
function createNoteItem(note, isLocal) {
  const item = document.createElement("li");
  item.className = "note";

  const heading = document.createElement("h3");
  heading.textContent = note.title;

  const body = document.createElement("p");
  body.textContent = note.body || "";

  item.append(heading, body);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "delete-btn";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", function () {
    handleDelete(note, item, isLocal);
  });
  item.append(deleteBtn);
  return item;
}

// Show the empty-state message when there are no notes, hide it otherwise.
function updateEmptyState() {
  const hasNotes = notesList.querySelector(".note") !== null;
  const emptyItem = notesList.querySelector(".empty");

  if (!hasNotes && !emptyItem) {
    const message = document.createElement("li");
    message.className = "empty";
    message.textContent = "No notes to show yet.";
    notesList.append(message);
  } else if (hasNotes && emptyItem) {
    emptyItem.remove();
  }
}

// ---------- GET: load notes ----------

function getNotes() {
  return request(API_URL + "?_limit=10");
}

async function loadNotes() {
  setBusy(true);
  setStatus("Loading notes...", "loading");

  try {
    const result = await getNotes();
    const notes = result.data;

    notesList.textContent = "";
    for (const note of notes) {
      notesList.append(createNoteItem(note, false));
    }
    updateEmptyState();

    if (notes.length === 0) {
      setStatus("The server has no notes to show.", "success");
    } else {
      const word = notes.length === 1 ? "note" : "notes";
      setStatus("Loaded " + notes.length + " " + word + " from the server.", "success");
    }
  } catch (error) {
    console.error(error);
    setStatus(friendlyError(error, "load your notes"), "error");
  } finally {
    // finally runs whether the request worked or failed.
    setBusy(false);
  }
}

// ---------- POST: create a note ----------

// Returns a message if the title is not allowed, or "" if it is fine.
function validateTitle(title) {
  if (title === "") {
    return "Please enter a title for your note.";
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return "The title is too long (" + title.length + " characters). The maximum is " +
      MAX_TITLE_LENGTH + ".";
  }
  return "";
}

function createNote(title, body) {
  return request(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ title: title, body: body, userId: 1 })
  });
}

async function handleSubmit(event) {
  event.preventDefault();   // stop the browser from reloading the page

  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  const problem = validateTitle(title);
  if (problem) {
    setStatus(problem, "error");
    titleInput.focus();
    return;
  }

  setBusy(true);
  setStatus("Saving your note...", "loading");

  try {
    const result = await createNote(title, body);
    const note = result.data;

    // isLocal = true: this note only exists in the browser (see handleDelete).
    notesList.prepend(createNoteItem(note, true));
    updateEmptyState();
    noteForm.reset();

    setStatus("Note created (status " + result.status + ", id " + note.id + ").", "success");
  } catch (error) {
    console.error(error);
    setStatus(friendlyError(error, "save your note"), "error");
  } finally {
    setBusy(false);
  }
}

noteForm.addEventListener("submit", handleSubmit);

// ---------- DELETE: remove a note ----------

function deleteNote(id) {
  return request(API_URL + "/" + id, { method: "DELETE" });
}

// IMPORTANT: JSONPlaceholder is a practice API. It pretends to save things
// but never really stores them. When we POST a note it answers "201, id 101"
// but note 101 does not exist on the server, so a later GET would never
// return it. Our approach:
//   1. The page is the source of truth for what the user sees. We send the
//      DELETE request to the server, and when the server says it worked we
//      remove the note from the list.
//   2. A note created in this browser (isLocal) never really existed on the
//      server. If the server answers 404 for it, that means "already gone",
//      so we still remove it from the page instead of showing an error.
//   3. We remove the exact list item we clicked (not "the item with this id"),
//      because every new note gets the same fake id 101.
// A real API would store the note, so DELETE would really remove it.
async function handleDelete(note, item, isLocal) {
  setBusy(true);
  setStatus("Deleting note...", "loading");

  try {
    let statusCode;
    try {
      const result = await deleteNote(note.id);
      statusCode = result.status;
    } catch (error) {
      if (isLocal && error.status === 404) {
        statusCode = 404;   // never existed on the server: fine to remove
      } else {
        throw error;
      }
    }

    item.remove();
    updateEmptyState();
    setStatus("Note deleted (status " + statusCode + ").", "success");
  } catch (error) {
    console.error(error);
    setStatus(friendlyError(error, "delete that note"), "error");
  } finally {
    setBusy(false);
  }
}

loadBtn.addEventListener("click", loadNotes);
updateEmptyState();
