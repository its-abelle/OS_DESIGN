const $ = (id) => document.getElementById(id);
let user = null,
  mode = "login",
  files = [],
  nextCursor = null,
  selectedFile = null;
let maxUploadBytes = 10 * 1024 * 1024,
  listController,
  authBusy = true,
  uploadBusy = false,
  generation = 0;
let selectionRevision = 0;
const issuedLinks = new Map(),
  timers = new Set();
const collectingKeys = new Set();
const collectedKeys = new Set();

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const activeAnimations = new Set();
let stampTimer = null;

document.addEventListener("keydown", () => {
  document.body.dataset.input = "keyboard";
  for (const animation of activeAnimations) animation.cancel();
  activeAnimations.clear();
});
document.addEventListener("pointerdown", () => {
  document.body.dataset.input = "pointer";
}, { passive: true });
reducedMotion.addEventListener("change", () => {
  for (const animation of activeAnimations) animation.cancel();
  activeAnimations.clear();
});
function animateFeedback(element, frames, duration = 200) {
  if (!element || reducedMotion.matches || document.body.dataset.input === "keyboard" || !element.animate) return;
  // A repeated interaction retargets its own feedback rather than stacking effects.
  for (const animation of element.getAnimations()) animation.cancel();
  const animation = element.animate(frames, { duration, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
  activeAnimations.add(animation);
  const forget = () => activeAnimations.delete(animation);
  animation.addEventListener("finish", forget, { once: true });
  animation.addEventListener("cancel", forget, { once: true });
}
function enterFeedback(element) {
  animateFeedback(element, [{ opacity: 0.4, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }]);
}
function celebrateFiling() {
  clearTimeout(stampTimer);
  $("desk-clerk").classList.remove("working");
  $("desk-clerk").classList.add("approved");
  stampTimer = setTimeout(() => {
    $("desk-clerk").classList.remove("approved");
    stampTimer = null;
  }, 1800);
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: "same-origin",
      ...options,
      signal: options.signal ?? AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(
      0,
      "The file office is unreachable. Check your connection, then give it another try.",
    );
  }
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      response.status,
      body.error ||
        `The office returned an error (${response.status}). Please retry.`,
    );
  return body;
}
function post(path, body) {
  return api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function message(text, error = false) {
  $("notice-text").textContent = text;
  $("notice").dataset.error = String(error);
  $("notice").setAttribute("role", error ? "alert" : "status");
  $("notice").setAttribute("aria-live", error ? "assertive" : "polite");
  $("notice-illustration").hidden = error;
  $("notice").hidden = false;
  enterFeedback($("notice"));
}
function sessionExpired(error) {
  if (error.status !== 401) return false;
  setSession(null);
  $("auth-error").textContent =
    "Your session has ended. Sign in again to reopen your drawer.";
  $("auth-error").hidden = false;
  $("email").focus();
  return true;
}
function setSession(account) {
  generation++;
  clearTimeout(stampTimer);
  stampTimer = null;
  for (const animation of activeAnimations) animation.cancel();
  activeAnimations.clear();
  $("desk-clerk").classList.remove("working", "approved");
  listController?.abort();
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
  issuedLinks.clear();
  collectingKeys.clear();
  collectedKeys.clear();
  user = account;
  files = [];
  nextCursor = null;
  selectedFile = null;
  $("file-list").replaceChildren();
  $("notice").hidden = true;
  $("auth-view").hidden = Boolean(user);
  $("workspace").hidden = !user;
  $("session-controls").hidden = !user;
  $("office-note").hidden = Boolean(user);
  document.body.dataset.authenticated = String(Boolean(user));
  enterFeedback(user ? $("workspace") : $("auth-view"));
  $("user-name").textContent = user?.username ?? "";
  $("greeting").textContent = user
    ? `WELCOME TO YOUR DESK, ${user.username.toUpperCase()}.`
    : "";
  $("password").value = "";
  $("password").type = "password";
  $("show-password").setAttribute("aria-pressed", "false");
  $("show-password").setAttribute("aria-label", "Show password");
  clearSelection();
  if (user) {
    loadFiles();
    $("workspace-heading").setAttribute("tabindex", "-1");
    $("workspace-heading").focus({ preventScroll: true });
  }
}
function setMode(value) {
  mode = value;
  const register = mode === "register";
  $("login-mode").setAttribute("aria-pressed", String(!register));
  $("register-mode").setAttribute("aria-pressed", String(register));
  $("username-field").hidden = !register;
  $("username").disabled = !register;
  $("username").required = register;
  $("password").autocomplete = register ? "new-password" : "current-password";
  $("auth-heading").textContent = register
    ? "MAKE YOURSELF AT HOME."
    : "YOUR DESK IS READY.";
  $("auth-description").textContent = register
    ? "No interview. No tie. Just a place for your PDFs."
    : "Sign in. Your PDFs have saved you a seat.";
  $("auth-submit-label").textContent = register
    ? "Create my account"
    : "Clock in";
  $("auth-error").hidden = true;
  enterFeedback($("auth-heading"));
}
function authPending(pending) {
  authBusy = pending;
  for (const id of ["auth-submit", "login-mode", "register-mode"])
    $(id).disabled = pending;
  $("auth-form").setAttribute("aria-busy", String(pending));
}
$("login-mode").addEventListener("click", () => setMode("login"));
$("register-mode").addEventListener("click", () => setMode("register"));
$("show-password").addEventListener("click", () => {
  const shown = $("password").type === "password";
  $("password").type = shown ? "text" : "password";
  $("show-password").setAttribute("aria-pressed", String(shown));
  $("show-password").setAttribute(
    "aria-label",
    shown ? "Hide password" : "Show password",
  );
});
$("auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (authBusy) return;
  const body = {
    email: $("email").value.trim(),
    password: $("password").value,
  };
  if (mode === "register") body.username = $("username").value.trim();
  if (new TextEncoder().encode(body.password).length > 72) {
    $("auth-error").textContent =
      "Passwords must be at most 72 UTF-8 bytes. Try a shorter password.";
    $("auth-error").hidden = false;
    return;
  }
  authPending(true);
  $("auth-error").hidden = true;
  $("auth-submit-label").textContent =
    mode === "register" ? "Making it official…" : "Checking the register…";
  try {
    const result = await post(`/auth/${mode}`, body);
    setSession(result.user);
  } catch (error) {
    $("auth-error").textContent = error.message;
    $("auth-error").hidden = false;
  } finally {
    authPending(false);
    $("auth-submit-label").textContent =
      mode === "register" ? "Create my account" : "Clock in";
  }
});
$("logout").addEventListener("click", async () => {
  $("logout").disabled = true;
  try {
    await post("/auth/logout", {});
    setSession(null);
    setMode("login");
    $("email").focus();
  } catch (error) {
    if (!sessionExpired(error)) message(error.message, true);
  } finally {
    $("logout").disabled = false;
  }
});
$("dismiss-notice").addEventListener("click", () => {
  $("notice").hidden = true;
});
function bytes(value) {
  return value < 1024
    ? `${value} B`
    : value < 1048576
      ? `${(value / 1024).toFixed(1)} KB`
      : `${(value / 1048576).toFixed(1)} MB`;
}
function date(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
function renderFiles(highlight) {
  const list = $("file-list");
  const existing = new Map([...list.children].map((row) => [row.dataset.key, row]));
  const wanted = new Set(files.map((file) => file.key));
  let cursor = list.firstElementChild;
  for (const file of files) {
    if (collectedKeys.has(file.key)) file.available = false;
    let row = existing.get(file.key);
    const isNew = !row;
    if (!row) {
      row = $("file-template").content.firstElementChild.cloneNode(true);
      row.dataset.key = file.key;
      row.querySelector(".button-collect").addEventListener("click", () => {
        const currentFile = files.find((entry) => entry.key === row.dataset.key);
        if (currentFile) collect(currentFile, row);
      });
    }
    row.classList.toggle("unavailable", !file.available);
    row.querySelector(".file-name").textContent = file.originalFilename;
    row.querySelector(".file-meta").textContent = `${bytes(file.sizeBytes)} · ${date(file.createdAt)}`;
    row.querySelector(".receipt-id").textContent = String(file.id);
    row.querySelector(".receipt-owner").textContent = String(file.uploadedBy);
    row.querySelector(".receipt-key").textContent = file.key;
    row.querySelector(".availability").textContent = file.available ? "In the drawer" : "Collected / unavailable";
    const button = row.querySelector(".button-collect");
    const busy = collectingKeys.has(file.key);
    button.disabled = !file.available || busy;
    button.classList.toggle("busy", busy);
    button.setAttribute("aria-label", `Collect ${file.originalFilename}`);
    button.querySelector("span").textContent = busy ? "Dispatching…" : file.available ? "Collect PDF" : "Not in drawer";
    const issued = issuedLinks.get(file.key);
    const retry = row.querySelector(".retry-download");
    retry.hidden = !(issued && issued.expires > Date.now());
    if (!retry.hidden) {
      retry.href = issued.url;
      retry.setAttribute("download", file.originalFilename);
    } else {
      retry.removeAttribute("href");
    }
    // Keep existing nodes in place to preserve focus and expanded receipts.
    if (row !== cursor) list.insertBefore(row, cursor);
    else cursor = cursor.nextElementSibling;
    if (isNew && file.key === highlight) {
      row.classList.add("just-filed");
      enterFeedback(row);
      const current = generation;
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (current === generation) row.classList.remove("just-filed");
      }, 1600);
      timers.add(timer);
    }
  }
  for (const row of [...list.children]) {
    if (!wanted.has(row.dataset.key)) row.remove();
  }
  $("empty-state").hidden = files.length !== 0;
  $("record-count").textContent = `${files.length} ${files.length === 1 ? "file" : "files"} in your private drawer`;
  $("load-more").hidden = nextCursor === null;
}
async function loadFiles(more = false, highlight) {
  if (!user) return;
  listController?.abort();
  const controller = new AbortController();
  listController = controller;
  const current = generation;
  $("list-error").hidden = true;
  $("refresh").disabled = true;
  $("load-more").disabled = true;
  $("list-loading").hidden = files.length > 0;
  $("empty-state").hidden = true;
  try {
    const query = more && nextCursor !== null ? `?before=${nextCursor}` : "";
    const result = await api(`/files${query}`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
    });
    if (current !== generation) return;
    files = more ? [...files, ...result.files] : result.files;
    nextCursor = result.nextCursor;
    maxUploadBytes = result.maxUploadBytes;
    $("upload-limit").textContent = `PDF only · up to ${bytes(maxUploadBytes)}`;
    renderFiles(highlight);
  } catch (error) {
    if (controller.signal.aborted || current !== generation) return;
    if (!sessionExpired(error)) {
      $("list-error").textContent =
        `${error.message} Use Refresh to try again.`;
      $("list-error").hidden = false;
      $("record-count").textContent = files.length
        ? `${files.length} previously loaded records`
        : "Drawer could not be checked";
    }
  } finally {
    if (current === generation && listController === controller) {
      $("refresh").disabled = false;
      $("load-more").disabled = false;
      $("list-loading").hidden = true;
    }
  }
}
$("refresh").addEventListener("click", () => loadFiles());
$("load-more").addEventListener("click", () => loadFiles(true));
async function selectFile(file) {
  if (!file || uploadBusy || !user) return;
  clearSelection();
  const revision = selectionRevision,
    current = generation;
  if (file.size > maxUploadBytes) {
    message(
      `This PDF is too large. Choose one no larger than ${bytes(maxUploadBytes)}.`,
      true,
    );
    return;
  }
  let header;
  try {
    header = await file.slice(0, 5).text();
  } catch {
    message(
      "The selected file could not be read. Please choose it again.",
      true,
    );
    return;
  }
  if (revision !== selectionRevision || current !== generation) return;
  if (header !== "%PDF-") {
    message("Choose a PDF file. This file does not have a PDF header.", true);
    return;
  }
  selectedFile = file;
  $("selected-name").textContent = file.name;
  $("selected-file").hidden = false;
  $("drop-zone").classList.add("has-file");
  enterFeedback($("selected-file"));
  animateFeedback($("drop-zone").querySelector(".upload-symbol img"), [
    { transform: "translateY(-6px) rotate(-5deg)" },
    { transform: "translateY(0) rotate(-4deg)" },
  ], 240);
  $("upload-submit").disabled = false;
  $("upload-status").textContent =
    "A promising document. Ready for official filing.";
}
function clearSelection() {
  selectionRevision++;
  selectedFile = null;
  $("file-input").value = "";
  $("selected-file").hidden = true;
  $("drop-zone").classList.remove("has-file", "dragging");
  $("upload-submit").disabled = true;
  $("upload-status").textContent = "No file selected. The clerk is on standby.";
}
$("file-input").addEventListener("change", (event) =>
  selectFile(event.target.files[0]),
);
$("clear-file").addEventListener("click", clearSelection);
$("empty-choose").addEventListener("click", () => $("file-input").click());
for (const name of ["dragenter", "dragover"])
  $("drop-zone").addEventListener(name, (event) => {
    event.preventDefault();
    if (!uploadBusy) $("drop-zone").classList.add("dragging");
  });
for (const name of ["dragleave", "drop"])
  $("drop-zone").addEventListener(name, (event) => {
    event.preventDefault();
    $("drop-zone").classList.remove("dragging");
  });
$("drop-zone").addEventListener("drop", (event) => {
  if (uploadBusy) return;
  if (event.dataTransfer.files.length !== 1) {
    message("Choose one PDF at a time.", true);
    return;
  }
  selectFile(event.dataTransfer.files[0]);
});
$("upload-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedFile || uploadBusy) return;
  const current = generation;
  const form = new FormData();
  form.append("file", selectedFile);
  uploadBusy = true;
  $("upload-submit").disabled = true;
  $("file-input").disabled = true;
  $("clear-file").disabled = true;
  $("logout").disabled = true;
  $("upload-form").setAttribute("aria-busy", "true");
  clearTimeout(stampTimer);
  stampTimer = null;
  $("desk-clerk").classList.remove("approved");
  $("desk-clerk").classList.add("working");
  $("upload-submit-label").textContent = "Filing in triplicate…";
  $("upload-status").textContent =
    "Finding a cosy spot for your PDF…";
  try {
    const result = await api("/files", { method: "POST", body: form });
    if (current !== generation) return;
    clearSelection();
    message(
      "Filed with a smile. Your PDF is right at home in the drawer.",
    );
    celebrateFiling();
    await loadFiles(false, result.key);
  } catch (error) {
    if (current === generation && !sessionExpired(error)) {
      message(error.message, true);
      $("upload-status").textContent =
        "Filing failed. Your selected PDF is ready to retry.";
    }
  } finally {
    uploadBusy = false;
    $("file-input").disabled = false;
    $("clear-file").disabled = false;
    $("logout").disabled = false;
    $("upload-submit").disabled = !selectedFile;
    $("upload-submit-label").textContent = "File this PDF";
    $("upload-form").setAttribute("aria-busy", "false");
    $("desk-clerk").classList.remove("working");
  }
});
async function collect(file, row) {
  if (collectingKeys.has(file.key)) return;
  collectingKeys.add(file.key);
  const button = row.querySelector(".button-collect");
  button.disabled = true;
  button.classList.add("busy");
  button.querySelector("span").textContent = "Dispatching…";
  const current = generation;
  try {
    const result = await api(`/files/${encodeURIComponent(file.key)}/download`);
    if (current !== generation) return;
    const link = new URL(result.url);
    if (!["http:", "https:"].includes(link.protocol))
      throw new Error("Storage returned an invalid download link.");
    const expires = Date.now() + result.expiresIn * 1000;
    issuedLinks.set(file.key, { url: link.href, expires });
    collectedKeys.add(file.key);
    file.available = false;
    const anchor = document.createElement("a");
    anchor.href = link.href;
    anchor.download = file.originalFilename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    collectingKeys.delete(file.key);
    renderFiles();
    enterFeedback(row.querySelector(".availability"));
    message(
      "PDF dispatched. The database receipt is staying put. Use “Retry issued link” within 60 seconds if needed.",
    );
    const timer = setTimeout(() => {
      timers.delete(timer);
      issuedLinks.delete(file.key);
      if (current === generation) renderFiles();
    }, result.expiresIn * 1000);
    timers.add(timer);
  } catch (error) {
    if (current !== generation || sessionExpired(error)) return;
    collectingKeys.delete(file.key);
    if (error.status === 404) {
      collectedKeys.add(file.key);
      file.available = false;
      renderFiles();
      message(
        "This PDF is no longer in the drawer. Its database receipt is still here.",
        true,
      );
    } else {
      renderFiles();
      message(error.message, true);
    }
  } finally {
    collectingKeys.delete(file.key);
  }
}
async function init() {
  authPending(true);
  $("session-retry").hidden = true;
  try {
    const result = await api("/auth/me");
    setSession(result.user);
  } catch (error) {
    if (error.status !== 401) {
      $("auth-error").textContent = error.message;
      $("auth-error").hidden = false;
      $("session-retry").hidden = false;
    }
  } finally {
    authPending(false);
    $("auth-submit-label").textContent =
      mode === "register" ? "Create my account" : "Clock in";
  }
}
$("session-retry").addEventListener("click", init);
init();
