import { buildGame, CLIENT_NAME, GAME_NAMESPACE, importClient, normalizeSettings, PROFILES } from "./client.js";

const $ = (selector, root = document) => root.querySelector(selector);
const panel = $("#panel");
const panelContent = $("#panel-content");
const launcher = $("#launcher");
const game = $("#game");
const stage = $("#game-stage");
const loading = $("#game-loading");
const mainAction = $("#main-action");
const storageKey = "voxelpad.settings.v1";

function readLocal(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeLocal(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
function readSettings() {
  try { return normalizeSettings(JSON.parse(readLocal(storageKey) || "null")); }
  catch { return normalizeSettings(null); }
}

let dbPromise;
function clientDb() {
  return dbPromise ??= new Promise((resolve, reject) => {
    let request;
    try { request = indexedDB.open("voxelpad-launcher", 1); }
    catch (error) { reject(error); return; }
    request.onupgradeneeded = () => request.result.createObjectStore("local");
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Client storage is busy."));
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); dbPromise = null; };
      resolve(request.result);
    };
  });
}
async function clientRecord(operation, value) {
  const db = await clientDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("local", operation === "get" ? "readonly" : "readwrite");
    const store = tx.objectStore("local");
    const request = operation === "get" ? store.get("client")
      : operation === "put" ? store.put(value, "client") : store.delete("client");
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = tx.onerror = () => reject(tx.error || request.error);
  });
}

let settings = readSettings();
let client = null;
let stored = false;
let loadingStored = true;
let importBusy = false;
let importStatus = null;
let modal = null;
let panelTrigger = null;
let frame = null;
let gameUrl = null;
let gameToken = null;
let gameTimer = null;
let gameReady = false;
let gameShown = false;
let stateVersion = 0;

function setNotice(el, message, isError = false) {
  if (!el) return;
  el.classList.toggle("error", isError);
  el.textContent = message;
}

function render() {
  $("#main-action-label").textContent = client ? "Launch game" : "Import client";
  $("#main-action-icon").setAttribute("href", client ? "#i-play" : "#i-upload");
  $("#hero-dot").classList.toggle("ready", !!client);
  $("#hero-status").textContent = client ? "Client ready" : "Awaiting client";
  $("#client-tag").textContent = client ? "VERIFIED · U53" : "NOT IMPORTED";
  $("#client-description").textContent = client
    ? `Signed offline build. ${stored ? "Saved on this device." : "Available for this session."}`
    : "Add your offline ZIP or HTML file. It stays on this device.";
  $("#profile-tag").textContent = PROFILES[settings.profile].label.toUpperCase();
  if (modal !== "import") return;
  $("#selected-file").textContent = client ? CLIENT_NAME : "No client selected";
  $("#file-detail").textContent = loadingStored
    ? "Checking device storage…" : client ? `Verified · ${(client.byteLength / 1048576).toFixed(1)} MiB` : "ZIP or HTML from the Files app";
  $("#panel-launch").disabled = !client || importBusy;
  $("#choose-file").disabled = importBusy;
  $("#forget-client").hidden = !client;
  $("#forget-client").disabled = importBusy;
  $("#remember-client").disabled = importBusy;
  setNotice($("#import-notice"), importStatus?.message ?? "", importStatus?.error);
}

function showPanel(kind, trigger) {
  if (modal === kind) return;
  modal = kind;
  panelTrigger = trigger || document.activeElement;
  panelContent.replaceChildren($(`#template-${kind}`).content.cloneNode(true));
  if (kind === "import") wireImport();
  if (kind === "settings") wireSettings();
  if (kind === "exit") $("#confirm-exit").addEventListener("click", () => closeGame(true));
  if (!panel.open) panel.showModal();
  render();
  $("#panel-close").focus({ preventScroll: true });
}

function dismissPanel() {
  if (panel.open) panel.close();
}
panel.addEventListener("close", () => {
  modal = null;
  if (panelTrigger?.isConnected && !panelTrigger.closest("[hidden]")) panelTrigger.focus({ preventScroll: true });
  panelTrigger = null;
});
let backdropDown = false;
panel.addEventListener("pointerdown", event => { backdropDown = event.target === panel; });
panel.addEventListener("click", event => {
  if (backdropDown && event.target === panel) dismissPanel();
  else if (event.target.closest("[data-dismiss]")) dismissPanel();
  backdropDown = false;
});
$("#panel-close").addEventListener("click", dismissPanel);
document.addEventListener("click", event => {
  const opener = event.target.closest("[data-open]");
  if (opener) showPanel(opener.dataset.open, opener);
  else if (event.target.closest("[data-home]")) {
    dismissPanel();
    window.scrollTo({ top: 0, behavior: "instant" });
  }
});

function wireImport() {
  const picker = $("#file-input");
  const zone = $("#file-zone");
  const remember = $("#remember-client");
  remember.checked = client ? stored : true;
  $("#choose-file").addEventListener("click", () => picker.click());
  picker.addEventListener("change", () => {
    if (picker.files[0]) acceptFile(picker.files[0], remember.checked);
    picker.value = "";
  });
  zone.addEventListener("dragover", event => { event.preventDefault(); if (!importBusy) zone.classList.add("drag"); });
  zone.addEventListener("dragleave", event => { if (!zone.contains(event.relatedTarget)) zone.classList.remove("drag"); });
  zone.addEventListener("drop", event => {
    event.preventDefault();
    zone.classList.remove("drag");
    if (event.dataTransfer.files[0]) acceptFile(event.dataTransfer.files[0], remember.checked);
  });
  remember.addEventListener("change", async () => {
    if (!client || importBusy) return;
    ++stateVersion;
    importBusy = true; render();
    try {
      if (remember.checked) await clientRecord("put", client);
      else await clientRecord("delete");
      stored = remember.checked;
      importStatus = { message: stored ? "Client saved to this device." : "The imported file will be cleared when you leave this page." };
    } catch {
      remember.checked = stored;
      importStatus = { message: "Could not change client storage in this browser. Your current session still works.", error: true };
    } finally { importBusy = false; render(); }
  });
  $("#panel-launch").addEventListener("click", launchGame);
  $("#forget-client").addEventListener("click", async () => {
    if (importBusy) return;
    ++stateVersion;
    importBusy = true; render();
    try {
      if (stored) await clientRecord("delete");
      client = null;
      stored = false;
      remember.checked = true;
      importStatus = { message: "Client removed. Saved worlds were not deleted." };
    } catch {
      importStatus = { message: "The saved file could not be removed right now. Close other Voxelpad tabs and try again.", error: true };
    } finally { importBusy = false; render(); }
  });
}

async function acceptFile(file, remember) {
  if (importBusy) return;
  ++stateVersion;
  loadingStored = false;
  importBusy = true;
  importStatus = { message: "Reading and verifying your file locally…" };
  render();
  try {
    client = await importClient(file);
    let persistenceFailed = false;
    try {
      if (remember) await clientRecord("put", client);
      else if (stored) await clientRecord("delete");
      stored = remember;
    } catch { persistenceFailed = true; }
    importStatus = persistenceFailed
      ? { message: "Client verified. This browser couldn’t save the storage change, but you can launch now.", error: true }
      : { message: "Client verified. You’re ready to play." };
    if (modal === "import") $("#remember-client").checked = stored;
  } catch (error) {
    importStatus = { message: error.message || "Could not read this file. Try choosing it again.", error: true };
  } finally { importBusy = false; render(); }
}

function wireSettings() {
  const slider = $("#touch-opacity");
  const value = $("#opacity-value");
  $(`input[name=profile][value=${settings.profile}]`).checked = true;
  slider.value = settings.opacity;
  value.textContent = `${slider.value}%`;
  slider.addEventListener("input", () => { value.textContent = `${slider.value}%`; });
  $("#save-settings").addEventListener("click", () => {
    settings = normalizeSettings({ profile: $("input[name=profile]:checked").value, opacity: Number(slider.value) });
    const persisted = writeLocal(storageKey, JSON.stringify(settings));
    setNotice($("#settings-notice"), persisted ? `${PROFILES[settings.profile].label} will apply the next time you launch.` : "Settings apply this session. Device storage is unavailable in this preview.");
    render();
  });
}

function showGameStatus(title, description) {
  $("#game-loading-title").textContent = title;
  $("#game-loading-detail").textContent = description;
  loading.hidden = false;
}

function canUseWebGL() {
  try {
    const probe = document.createElement("canvas");
    const context = probe.getContext("webgl2") || probe.getContext("webgl");
    const enabled = !!context;
    context?.getExtension("WEBGL_lose_context")?.loseContext();
    return enabled;
  } catch { return false; }
}

async function launchGame() {
  if (!client || gameShown || importBusy) return;
  dismissPanel();
  gameShown = true;
  gameReady = false;
  game.hidden = false;
  launcher.inert = true;
  launcher.hidden = true;
  gameToken = crypto.randomUUID();
  const token = gameToken;
  showGameStatus("Opening your client", "Verifying the file and preparing your render profile…");
  $("#cancel-launch").focus({ preventScroll: true });
  if (window.origin === "null") {
    showGameStatus("Open the public site to play", "This preview isolates browser storage. Open Voxelpad directly on GitHub Pages, then import your file there.");
    return;
  }
  if (!canUseWebGL()) {
    showGameStatus("WebGL isn’t available", "Open the public site in an up-to-date Safari tab and try again.");
    return;
  }
  try {
    const blob = await buildGame(client, settings, token, readLocal(`${GAME_NAMESPACE}.g`));
    if (gameToken !== token) return;
    gameUrl = URL.createObjectURL(blob);
    frame = document.createElement("iframe");
    frame.title = "EaglercraftX 1.8 game";
    // Never use this capability for arbitrary imports. The exact build hash was
    // checked immediately before creating the blob, with an offline CSP injected.
    frame.sandbox = "allow-scripts allow-same-origin allow-pointer-lock allow-downloads";
    frame.referrerPolicy = "no-referrer";
    frame.src = gameUrl;
    stage.prepend(frame);
    showGameStatus("Opening your client", "The game is unpacking its textures and starting the renderer…");
    gameTimer = setTimeout(() => {
      if (gameToken !== token || gameReady) return;
      showGameStatus("The client is taking longer to start", "Wait a little longer, or return and retry in Safari with other tabs closed.");
    }, 35_000);
  } catch (error) {
    if (gameToken === token) showGameStatus("Couldn’t start the client", error.message || "Return to the launcher and try importing the original file again.");
  }
}

window.addEventListener("message", event => {
  if (!frame || event.source !== frame.contentWindow || event.origin !== location.origin || event.data?.voxelpad !== "canvas" || event.data.token !== gameToken) return;
  clearTimeout(gameTimer);
  gameReady = true;
  loading.hidden = true;
  frame.focus({ preventScroll: true });
});

function closeGame(force = false) {
  if (gameReady && !force) {
    showPanel("exit", $("#exit-game"));
    return;
  }
  dismissPanel();
  clearTimeout(gameTimer);
  frame?.remove();
  frame = null;
  if (gameUrl) URL.revokeObjectURL(gameUrl);
  gameUrl = null;
  gameToken = null;
  gameReady = false;
  gameShown = false;
  if (document.fullscreenElement === game) document.exitFullscreen?.().catch(() => {});
  game.hidden = true;
  launcher.hidden = false;
  launcher.inert = false;
  mainAction.focus({ preventScroll: true });
}

mainAction.addEventListener("click", () => client ? launchGame() : showPanel("import", mainAction));
$("#exit-game").addEventListener("click", () => closeGame());
$("#cancel-launch").addEventListener("click", () => closeGame(true));
$("#fullscreen").addEventListener("click", async event => {
  const button = event.currentTarget;
  try {
    if (document.fullscreenElement === game) await document.exitFullscreen();
    else if (game.requestFullscreen) await game.requestFullscreen();
    else throw new Error("Fullscreen unavailable");
  } catch { showPanel("install", button); }
});
document.addEventListener("fullscreenchange", () => {
  const label = document.fullscreenElement === game ? "Exit full screen" : "Expand game";
  $("#fullscreen").setAttribute("aria-label", label);
  $("#fullscreen").title = label;
});

async function restoreClient() {
  const version = stateVersion;
  try {
    const record = await clientRecord("get");
    if (stateVersion === version && record instanceof ArrayBuffer) {
      client = record;
      stored = true;
      if (modal === "import") $("#remember-client").checked = true;
    }
  } catch { /* Import remains available for the current session. */ }
  finally { loadingStored = false; render(); }
}
render();
restoreClient();
if ("serviceWorker" in navigator && window.origin !== "null") {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
