import socket from "./socket.js";
import { importKey, decrypt, sha256 } from "./crypto.js";

let peerConnection = null;
let onStateChange = null;
let encryptionKey = null;

// Receive buffer
const chunks = [];
let receivedSize = 0;
let lastTime = Date.now();
let lastBytes = 0;
let fileInfo = null;

/**
 * Initialize the receiver module
 * @param {string} roomId - Room to join
 * @param {string} keyString - Base64URL encryption key from URL hash
 * @param {function} stateCallback - called with {status, progress, speed, fileName, fileSize, fileType}
 */
export async function initReceiver(roomId, keyString, stateCallback) {
  onStateChange = stateCallback;

  onStateChange({ status: "connecting" });

  // Import the encryption key from the URL hash
  try {
    encryptionKey = await importKey(keyString);
  } catch (err) {
    console.error("Failed to import encryption key:", err);
    onStateChange({ status: "error", errorMsg: "Invalid encryption key" });
    return;
  }

  // Join the room
  socket.emit("join-room", roomId);

  // ─── Socket event listeners ───────────────────────────────
  socket.on("room-not-found", () => {
    onStateChange({ status: "error", errorMsg: "Room not found. The sender may have disconnected." });
  });

  socket.on("offer", handleOffer.bind(null, roomId));
  socket.on("ice-candidate", handleIceCandidate);
  socket.on("peer-disconnected", handlePeerDisconnected);
}

/**
 * Clean up receiver listeners
 */
export function destroyReceiver() {
  socket.off("room-not-found");
  socket.off("offer");
  socket.off("ice-candidate");
  socket.off("peer-disconnected");

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
}

// ─── Socket / WebRTC handlers ────────────────────────────────

async function handleOffer(roomId, { offer }) {
  onStateChange({ status: "waiting" });

  peerConnection = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  });

  peerConnection.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit("ice-candidate", { roomId, candidate: e.candidate });
    }
  };

  peerConnection.onconnectionstatechange = () => {
    const state = peerConnection.connectionState;
    if (state === "failed" || state === "disconnected") {
      onStateChange({ status: "error", errorMsg: "Connection lost" });
    }
  };

  // ─── Data channel handling ──────────────────────────────
  peerConnection.ondatachannel = (e) => {
    const channel = e.channel;
    channel.binaryType = "arraybuffer";

    let metadataReceived = false;

    channel.onopen = () => {
      console.log("Data channel open on receiver");
    };

    channel.onerror = (err) => {
      console.error("Receiver data channel error:", err);
      onStateChange({ status: "error", errorMsg: "Data channel error" });
    };

    channel.onmessage = (event) => {
      // First message: JSON metadata
      if (!metadataReceived) {
        try {
          const metadata = JSON.parse(event.data);
          fileInfo = metadata;
          metadataReceived = true;
          onStateChange({
            status: "receiving",
            fileName: metadata.name,
            fileSize: metadata.size,
            fileType: metadata.type,
            progress: 0,
            speed: 0,
          });
        } catch {
          console.error("Failed to parse metadata");
          onStateChange({ status: "error", errorMsg: "Invalid file metadata" });
        }
        return;
      }

      // Sentinel string: transfer complete
      if (typeof event.data === "string") {
        if (event.data === "__END__") {
          verifyAndDownload();
        }
        return;
      }

      // Binary chunk
      chunks.push(event.data);
      receivedSize += event.data.byteLength;

      // Progress
      if (fileInfo) {
        const progress = Math.round((receivedSize / fileInfo.encryptedSize) * 100);

        // Speed (sampled every 300ms)
        const now = Date.now();
        const elapsed = (now - lastTime) / 1000;
        let speed = 0;
        if (elapsed >= 0.3) {
          const delta = receivedSize - lastBytes;
          speed = parseFloat((delta / elapsed / (1024 * 1024)).toFixed(2));
          lastTime = now;
          lastBytes = receivedSize;
        }

        onStateChange({ progress, speed });
      }
    };
  };

  // Set remote description (offer) and create answer
  await peerConnection.setRemoteDescription(offer);
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit("answer", { roomId, answer });
}

async function handleIceCandidate({ candidate }) {
  try {
    if (peerConnection) {
      await peerConnection.addIceCandidate(candidate);
    }
  } catch (e) {
    // Usually harmless
  }
}

function handlePeerDisconnected({ role }) {
  if (role === "sender") {
    onStateChange({ status: "error", errorMsg: "Sender disconnected" });
  }
}

// ─── Decrypt, verify & download ──────────────────────────────

async function verifyAndDownload() {
  onStateChange({ status: "verifying" });

  try {
    // Reassemble the encrypted data
    const totalSize = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const encryptedBuffer = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      encryptedBuffer.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    // Decode IV from Base64
    const ivBinary = atob(fileInfo.ivBase64);
    const iv = new Uint8Array(ivBinary.length);
    for (let i = 0; i < ivBinary.length; i++) {
      iv[i] = ivBinary.charCodeAt(i);
    }

    // Decrypt
    const decryptedBuffer = await decrypt(
      encryptionKey,
      iv,
      encryptedBuffer.buffer
    );

    // Verify SHA-256 hash
    const computedHash = await sha256(decryptedBuffer);

    if (computedHash !== fileInfo.hash) {
      console.error(`Hash mismatch! Expected ${fileInfo.hash}, got ${computedHash}`);
      onStateChange({
        status: "error",
        errorMsg: "File integrity check failed — the file may be corrupted",
      });
      return;
    }

    // Create download
    const blob = new Blob([decryptedBuffer], { type: fileInfo.type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileInfo.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    onStateChange({ status: "done", progress: 100 });
  } catch (err) {
    console.error("Decryption/verification error:", err);
    onStateChange({
      status: "error",
      errorMsg: "Failed to decrypt the file. The link may be invalid.",
    });
  }
}
