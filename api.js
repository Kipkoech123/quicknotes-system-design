// QuickNotes - API client
// This file talks to the JSONPlaceholder practice API using fetch().

const API_URL = "https://jsonplaceholder.typicode.com/posts";

// Find every page element we need, once, at the top.
const loadBtn = document.getElementById("load-btn");
const statusEl = document.getElementById("status");
const notesList = document.getElementById("notes-list");

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

loadBtn.addEventListener("click", loadNotes);
updateEmptyState();
