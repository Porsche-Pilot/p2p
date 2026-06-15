import socket from "./socket.js";
import { generateKey, exportKey, encrypt, sha256 } from "./crypto.js";

const CHUNK_SIZE = 64 * 1024; // 64 KB

let currentFile = null;
let roomId = null;
let encryptionKey = null;
let peerConnection = null;
let onStateChange = null;

/**
 * Initialize the sender module
 * @param {function} stateCallback - called with {status, progress, speed, shareLink, fileName, fileSize}
 */
export function initSender(stateCallback) {
  onStateChange = stateCallback;

  // ─── Socket event listeners ───────────────────────────────
  socket.on("peer-joined", handlePeerJoined);
  socket.on("answer", handleAnswer);
  socket.on("ice-candidate", handleIceCandidate);
  socket.on("peer-disconnected", handlePeerDisconnected);
}

/**
 * Clean up sender listeners
 */
export function destroySender() {
  socket.off("peer-joined", handlePeerJoined);
  socket.off("answer", handleAnswer);
  socket.off("ice-candidate", handleIceCandidate);
  socket.off("peer-disconnected", handlePeerDisconnected);

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
}

/**
 * Start sharing a file — creates room, generates key, returns share link
 * @param {File} file
 */
export async function startSharing(file) {
  currentFile = file;

  // Generate unique room ID
  roomId = crypto.randomUUID();

  // Generate AES-GCM 256-bit encryption key
  encryptionKey = await generateKey();
  const keyString = await exportKey(encryptionKey);

  // Create room on signaling server
  socket.emit("create-room", roomId);

  // Build share link: key lives in hash fragment (never sent to server)
  const shareLink = `${window.location.origin}/#/receive/${roomId}/${keyString}`;

  onStateChange({
    status: "waiting",
    progress: 0,
    speed: 0,
    shareLink,
    fileName: file.name,
    fileSize: file.size,
  });
}

// ─── Socket handlers ─────────────────────────────────────────

async function handlePeerJoined() {
  onStateChange({ status: "connected" });

  // Create WebRTC peer connection
  peerConnection = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  });

  // Create data channel for file transfer
  const channel = peerConnection.createDataChannel("fileTransfer", {
    ordered: true,
  });
  channel.binaryType = "arraybuffer";

  channel.onopen = () => {
    if (!currentFile) {
      console.error("Data channel opened but no file selected");
      return;
    }
    sendFile(channel, currentFile);
  };

  channel.onerror = (e) => {
    console.error("Data channel error:", e);
    onStateChange({ status: "error" });
  };

  // ICE candidate forwarding
  peerConnection.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit("ice-candidate", { roomId, candidate: e.candidate });
    }
  };

  // Connection state monitoring
  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    if (state === "failed" || state === "disconnected") {
      onStateChange({ status: "waiting", progress: 0, speed: 0 });
    }
  };

  // Create and send SDP offer
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit("offer", { roomId, offer });
}

async function handleAnswer({ answer }) {
  if (peerConnection) {
    await peerConnection.setRemoteDescription(answer);
  }
}

async function handleIceCandidate({ candidate }) {
  try {
    if (peerConnection) {
      await peerConnection.addIceCandidate(candidate);
    }
  } catch (e) {
    // ICE candidate errors are usually harmless during setup
  }
}

function handlePeerDisconnected() {
  onStateChange({ status: "waiting", progress: 0, speed: 0 });

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
}

// ─── File transfer logic ─────────────────────────────────────

async function sendFile(channel, file) {
  onStateChange({ status: "transferring" });

  try {
    // Read file into ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Compute SHA-256 of the original plaintext
    const hash = await sha256(arrayBuffer);

    // Encrypt the file
    const { iv, ciphertext } = await encrypt(encryptionKey, arrayBuffer);

    // Send metadata as first message (JSON)
    const metadata = {
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      hash,
      ivBase64: btoa(String.fromCharCode(...iv)),
      encryptedSize: ciphertext.byteLength,
    };

    // Wait for channel to be ready for sending
    channel.send(JSON.stringify(metadata));

    // Stream encrypted data in chunks
    const totalBytes = ciphertext.byteLength;
    let offset = 0;
    let lastTime = Date.now();
    let lastBytes = 0;

    const sendNextChunk = () => {
      while (offset < totalBytes) {
        // Flow control: if buffer is too full, wait
        if (channel.bufferedAmount > CHUNK_SIZE * 8) {
          setTimeout(sendNextChunk, 20);
          return;
        }

        const end = Math.min(offset + CHUNK_SIZE, totalBytes);
        const chunk = ciphertext.slice(offset, end);
        channel.send(chunk);
        offset = end;

        // Calculate progress and speed
        const progress = Math.round((offset / totalBytes) * 100);

        const now = Date.now();
        const elapsed = (now - lastTime) / 1000;
        let speed = 0;
        if (elapsed >= 0.3) {
          const delta = offset - lastBytes;
          speed = parseFloat((delta / elapsed / (1024 * 1024)).toFixed(2));
          lastTime = now;
          lastBytes = offset;
        }

        onStateChange({ progress, speed });
      }

      // Send end sentinel
      channel.send("__END__");
      onStateChange({ status: "done", progress: 100 });
    };

    sendNextChunk();
  } catch (err) {
    console.error("Send file error:", err);
    onStateChange({ status: "error" });
  }
}
