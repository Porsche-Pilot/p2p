# Mars Share — P2P File Transfer

A peer-to-peer, browser-to-browser file transfer app built with WebRTC, vanilla JavaScript, and Node.js. Files stream directly between browsers — the server only coordinates the initial connection handshake and **never sees any file data**.

## Live Demo

> [https://p2p-obsm.onrender.com/](https://p2p-obsm.onrender.com/)

## How It Works

1. The **sender** drops a file and gets a unique share link
2. The **receiver** opens the link in any browser
3. A WebRTC data channel opens directly between the two browsers
4. The file is encrypted with AES-256, then streamed peer-to-peer in 64 KB chunks
5. On the receiver side, the file is decrypted, SHA-256 verified, and auto-downloaded

No file data ever touches the signaling server.

## Features

- 📁 Drag-and-drop file upload
- 🔗 Unique room-based sharing via URL
- ⚡ Direct WebRTC P2P transfer (no server relay)
- 📊 Real-time progress bar and transfer speed (MB/s)
- 🔒 AES-GCM 256-bit end-to-end encryption — decryption key lives only in the URL hash, never sent to the server
- ✅ SHA-256 integrity verification on received files
- 🔌 Graceful disconnect handling on both sender and receiver

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML, CSS, JavaScript (ES Modules) |
| Backend | Node.js, Express, Socket.IO |
| Real-time | WebRTC (RTCPeerConnection + RTCDataChannel) |
| Signaling | Socket.IO (WebSocket) |
| Encryption | Web Crypto API (AES-GCM 256-bit) |
| Integrity | SHA-256 hash verification |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)

### Installation

```bash
# Clone the repository
git clone https://github.com/Porsche-Pilot/p2p.git
cd p2p

# Install dependencies
npm install

# Start the server
npm start
```

The app will be running at **http://localhost:3000**.

### Development

```bash
# Start with file watching (auto-restart on changes)
npm run dev
```

## Project Structure

```
mars-share/
├── server/
│   └── index.js            # Express + Socket.IO signaling server
├── public/
│   ├── index.html           # Main HTML page
│   ├── css/
│   │   └── style.css        # Corporate light design system
│   └── js/
│       ├── app.js           # Hash-based router & state management
│       ├── socket.js        # Socket.IO client wrapper
│       ├── crypto.js        # AES-GCM encryption & SHA-256 utilities
│       ├── sender.js        # Sender: WebRTC + file encryption
│       └── receiver.js      # Receiver: WebRTC + decryption + verification
├── package.json
└── .gitignore
```

## How P2P Transfer Works

```
┌──────────┐                    ┌──────────────┐                    ┌──────────┐
│  Sender  │ ── signaling ───▶  │   Server     │  ◀── signaling ── │ Receiver │
│ (Browser)│ ◀─ signaling ────  │ (Socket.IO)  │  ── signaling ──▶ │ (Browser)│
└────┬─────┘                    └──────────────┘                    └────┬─────┘
     │                                                                   │
     │              WebRTC Data Channel (direct P2P)                     │
     └──────────── encrypted file chunks (AES-256) ────────────────────▶ │
                          No server involved                             │
```

## Security

- **End-to-end encryption**: Files are encrypted with AES-GCM 256-bit before transfer
- **Key in URL hash**: The encryption key is embedded in the URL fragment (`#`), which is **never sent to the server** by browsers
- **Integrity verification**: SHA-256 hash is computed before encryption and verified after decryption
- **No storage**: Files are never stored on any server — they stream directly between browsers

## License

MIT
