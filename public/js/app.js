import { initSender, startSharing, destroySender } from "./sender.js";
import { initReceiver, destroyReceiver } from "./receiver.js";

// ─── DOM references ──────────────────────────────────────────
const views = {
  home: document.getElementById("view-home"),
  waiting: document.getElementById("view-waiting"),
  receiver: document.getElementById("view-receiver"),
};

// Home / Sender elements
const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const browseBtn = document.getElementById("browse-btn");
const filePreview = document.getElementById("file-preview");
const fileNameEl = document.getElementById("file-name");
const fileSizeEl = document.getElementById("file-size");
const shareBtn = document.getElementById("share-btn");
const removeFileBtn = document.getElementById("remove-file");

// Waiting view elements
const shareLinkInput = document.getElementById("share-link");
const copyBtn = document.getElementById("copy-btn");
const waitingStatus = document.getElementById("waiting-status");
const senderProgress = document.getElementById("sender-progress");
const senderProgressBar = document.getElementById("sender-progress-bar");
const senderProgressText = document.getElementById("sender-progress-text");
const senderSpeed = document.getElementById("sender-speed");
const senderDone = document.getElementById("sender-done");
const shareNewBtn = document.getElementById("share-new-btn");
const waitingFileName = document.getElementById("waiting-file-name");
const waitingFileSize = document.getElementById("waiting-file-size");

// Receiver view elements
const receiverStatus = document.getElementById("receiver-status");
const receiverFileName = document.getElementById("receiver-file-name");
const receiverFileSize = document.getElementById("receiver-file-size");
const receiverProgress = document.getElementById("receiver-progress");
const receiverProgressBar = document.getElementById("receiver-progress-bar");
const receiverProgressText = document.getElementById("receiver-progress-text");
const receiverSpeed = document.getElementById("receiver-speed");
const receiverDone = document.getElementById("receiver-done");
const receiverError = document.getElementById("receiver-error");
const receiverErrorMsg = document.getElementById("receiver-error-msg");

// ─── State ───────────────────────────────────────────────────
let selectedFile = null;

// ─── Router ──────────────────────────────────────────────────
function route() {
  const hash = window.location.hash || "#/";

  // Clean up previous state
  destroySender();
  destroyReceiver();

  // Match: #/receive/:roomId/:key
  const receiveMatch = hash.match(/^#\/receive\/([^/]+)\/(.+)$/);

  if (receiveMatch) {
    showView("receiver");
    const roomId = receiveMatch[1];
    const keyString = receiveMatch[2];
    startReceiver(roomId, keyString);
  } else {
    showView("home");
    initSenderMode();
  }
}

function showView(name) {
  Object.entries(views).forEach(([key, el]) => {
    if (el) {
      el.classList.toggle("active", key === name);
    }
  });
}

// ─── Sender Mode ─────────────────────────────────────────────

function initSenderMode() {
  selectedFile = null;
  filePreview.classList.remove("visible");
  shareBtn.disabled = true;

  initSender(handleSenderState);
}

function handleSenderState(update) {
  if (update.status === "waiting") {
    showView("waiting");
    waitingStatus.classList.add("visible");
    senderProgress.classList.remove("visible");
    senderDone.classList.remove("visible");

    if (update.shareLink) {
      shareLinkInput.value = update.shareLink;
    }
    if (update.fileName) {
      waitingFileName.textContent = update.fileName;
      waitingFileSize.textContent = formatSize(update.fileSize);
    }
  }

  if (update.status === "connected") {
    waitingStatus.querySelector(".status-badge").textContent = "Peer Connected";
    waitingStatus.querySelector(".status-badge").className = "status-badge status-connected";
    waitingStatus.querySelector(".status-text").textContent = "Preparing to transfer...";
  }

  if (update.status === "transferring") {
    waitingStatus.classList.remove("visible");
    senderProgress.classList.add("visible");
    senderDone.classList.remove("visible");
  }

  if (update.progress !== undefined && update.status !== "waiting") {
    senderProgressBar.style.width = `${update.progress}%`;
    senderProgressText.textContent = `${update.progress}%`;
  }

  if (update.speed !== undefined && update.speed > 0) {
    senderSpeed.textContent = `${update.speed} MB/s`;
  }

  if (update.status === "done") {
    senderProgress.classList.remove("visible");
    senderDone.classList.add("visible");
  }

  if (update.status === "error") {
    waitingStatus.querySelector(".status-badge").textContent = "Error";
    waitingStatus.querySelector(".status-badge").className = "status-badge status-error";
  }
}

// ─── Receiver Mode ───────────────────────────────────────────

function startReceiver(roomId, keyString) {
  // Reset UI
  receiverStatus.classList.add("visible");
  receiverProgress.classList.remove("visible");
  receiverDone.classList.remove("visible");
  receiverError.classList.remove("visible");

  receiverStatus.querySelector(".status-badge").textContent = "Connecting";
  receiverStatus.querySelector(".status-badge").className = "status-badge status-connecting";
  receiverStatus.querySelector(".status-text").textContent = "Connecting to sender...";

  initReceiver(roomId, keyString, handleReceiverState);
}

function handleReceiverState(update) {
  if (update.status === "connecting") {
    receiverStatus.querySelector(".status-badge").textContent = "Connecting";
    receiverStatus.querySelector(".status-badge").className = "status-badge status-connecting";
    receiverStatus.querySelector(".status-text").textContent = "Connecting to sender...";
  }

  if (update.status === "waiting") {
    receiverStatus.querySelector(".status-badge").textContent = "Connected";
    receiverStatus.querySelector(".status-badge").className = "status-badge status-connected";
    receiverStatus.querySelector(".status-text").textContent = "Waiting for file transfer to begin...";
  }

  if (update.status === "receiving") {
    receiverStatus.classList.remove("visible");
    receiverProgress.classList.add("visible");

    if (update.fileName) {
      receiverFileName.textContent = update.fileName;
      receiverFileSize.textContent = formatSize(update.fileSize);
    }
  }

  if (update.progress !== undefined) {
    receiverProgressBar.style.width = `${update.progress}%`;
    receiverProgressText.textContent = `${update.progress}%`;
  }

  if (update.speed !== undefined && update.speed > 0) {
    receiverSpeed.textContent = `${update.speed} MB/s`;
  }

  if (update.status === "verifying") {
    receiverProgressBar.style.width = "100%";
    receiverProgressText.textContent = "Verifying...";
  }

  if (update.status === "done") {
    receiverProgress.classList.remove("visible");
    receiverDone.classList.add("visible");
  }

  if (update.status === "error") {
    receiverStatus.classList.remove("visible");
    receiverProgress.classList.remove("visible");
    receiverError.classList.add("visible");
    if (update.errorMsg) {
      receiverErrorMsg.textContent = update.errorMsg;
    }
  }
}

// ─── Event listeners ─────────────────────────────────────────

// Drag & Drop
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    selectFile(files[0]);
  }
});

dropZone.addEventListener("click", () => {
  fileInput.click();
});

browseBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  fileInput.click();
});

fileInput.addEventListener("change", (e) => {
  if (e.target.files.length > 0) {
    selectFile(e.target.files[0]);
  }
});

removeFileBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  selectedFile = null;
  filePreview.classList.remove("visible");
  shareBtn.disabled = true;
  fileInput.value = "";
});

shareBtn.addEventListener("click", () => {
  if (selectedFile) {
    startSharing(selectedFile);
  }
});

// Copy link
copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(shareLinkInput.value);
    copyBtn.classList.add("copied");
    copyBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
    setTimeout(() => {
      copyBtn.classList.remove("copied");
      copyBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy`;
    }, 2000);
  } catch {
    shareLinkInput.select();
    document.execCommand("copy");
  }
});

// Share new file
shareNewBtn.addEventListener("click", () => {
  window.location.hash = "#/";
  route();
});

// ─── Helpers ─────────────────────────────────────────────────

function selectFile(file) {
  selectedFile = file;
  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = formatSize(file.size);
  filePreview.classList.add("visible");
  shareBtn.disabled = false;
}

function formatSize(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + " " + units[i];
}

// ─── Initialize ──────────────────────────────────────────────
window.addEventListener("hashchange", route);
route();
