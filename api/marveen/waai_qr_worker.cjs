#!/usr/bin/env node
/**
 * CCRM Direct WAAI WhatsApp Multi-Device QR Pairing Worker (Baileys).
 *
 * Connects directly to WhatsApp Web multi-device servers (wss://web.whatsapp.com/ws/chat),
 * streams real WhatsApp QR codes (`2@...`) as PNG Data URLs into `<accountDir>/status.json`,
 * handles the post-scan 515 restart handshake automatically, and persists multi-device
 * credentials in `<accountDir>/auth/`.
 */

const fs = require("node:fs");
const path = require("node:path");

const MODULE_ROOTS = [
  "/opt/ccrm-waai/node_modules",
  "/var/www/html/uploads/.waai/node_modules",
  path.resolve(__dirname, "../../../uploads/.waai/node_modules"),
];

function requireFromWaai(pkg) {
  for (const root of MODULE_ROOTS) {
    const candidate = path.join(root, pkg);
    if (fs.existsSync(candidate)) {
      return require(candidate);
    }
  }
  return require(pkg);
}

const baileys = requireFromWaai("@whiskeysockets/baileys");
const makeWASocket = baileys.default || baileys.makeWASocket || baileys;
const { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = baileys;
const QRCode = requireFromWaai("qrcode");
const pino = requireFromWaai("pino");

const accountDir = process.argv[2];
const accountId = process.argv[3] || "wa-default";
const forceReset = process.argv[4] === "reset";

if (!accountDir) {
  console.error("Usage: node waai_qr_worker.cjs <accountDir> <accountId> [reset]");
  process.exit(1);
}

fs.mkdirSync(accountDir, { recursive: true });
const authDir = path.join(accountDir, "auth");
const statusFile = path.join(accountDir, "status.json");
const pidFile = path.join(accountDir, "worker.pid");

// Stop any previous worker for this accountDir
if (fs.existsSync(pidFile)) {
  try {
    const oldPid = parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
    if (oldPid && oldPid !== process.pid) {
      process.kill(oldPid, "SIGTERM");
    }
  } catch {
    // Old process already exited
  }
}
fs.writeFileSync(pidFile, String(process.pid), "utf8");

if (forceReset && fs.existsSync(authDir)) {
  try {
    fs.rmSync(authDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}
fs.mkdirSync(authDir, { recursive: true });

let currentState = {
  accountId,
  status: "starting",
  qr: null,
  rawQr: null,
  phone: null,
  displayName: null,
  error: null,
  pid: process.pid,
  updatedAt: new Date().toISOString(),
};

function writeStatus(patch) {
  currentState = {
    ...currentState,
    ...patch,
    pid: process.pid,
    updatedAt: new Date().toISOString(),
  };
  const tmp = `${statusFile}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(currentState, null, 2), "utf8");
  fs.renameSync(tmp, statusFile);
}

writeStatus({ status: "starting", error: null });

let shuttingDown = false;
function cleanup() {
  shuttingDown = true;
  try {
    if (fs.existsSync(pidFile)) {
      const pidInFile = parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);
      if (pidInFile === process.pid) {
        fs.unlinkSync(pidFile);
      }
    }
  } catch {
    // ignore
  }
}

process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});
process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});

// Auto-stop after 4 minutes so orphan processes never linger
const maxLifetimeTimer = setTimeout(() => {
  if (currentState.status !== "connected") {
    writeStatus({
      status: "expired",
      qr: null,
      error: "QR code session expired. Click Scan WhatsApp QR Code to generate a fresh code.",
    });
  }
  cleanup();
  process.exit(0);
}, 240_000);
maxLifetimeTimer.unref();

async function startSocket() {
  if (shuttingDown) return;
  try {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    let version = [2, 3000, 1043857760];
    try {
      const latest = await fetchLatestBaileysVersion();
      if (latest && Array.isArray(latest.version)) {
        version = latest.version;
      }
    } catch {
      // Use fallback version
    }

    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: "silent" }),
      browser: ["CCRM WAAI", "Chrome", "120.0.0"],
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      try {
        const { connection, lastDisconnect, qr, isNewLogin } = update;

        if (qr) {
          const dataUrl = await QRCode.toDataURL(qr, {
            margin: 1,
            width: 280,
            color: {
              dark: "#0f172a",
              light: "#ffffff",
            },
          });
          writeStatus({
            status: "pending_qr",
            qr: dataUrl,
            rawQr: qr,
            error: null,
          });
        }

        if (isNewLogin) {
          writeStatus({
            status: "authenticated",
            qr: null,
            error: null,
          });
        }

        if (connection === "open") {
          const rawJid = sock.user?.id || state.creds?.me?.id || "";
          const digits = rawJid.split("@")[0].split(":")[0].replace(/\D/g, "");
          const phone = digits ? `+${digits}` : null;
          const displayName = sock.user?.name || state.creds?.me?.name || null;

          writeStatus({
            status: "connected",
            qr: null,
            rawQr: null,
            phone,
            displayName,
            error: null,
          });

          // Keep socket open briefly to complete initial device registration keys, then exit cleanly
          setTimeout(() => {
            cleanup();
            process.exit(0);
          }, 15_000);
        }

        if (connection === "close") {
          const statusCode =
            lastDisconnect?.error?.output?.statusCode ??
            lastDisconnect?.error?.data?.statusCode ??
            0;
          const loggedOut = statusCode === (DisconnectReason?.loggedOut ?? 401);
          const restartRequired = statusCode === (DisconnectReason?.restartRequired ?? 515);

          if (loggedOut) {
            writeStatus({
              status: "disconnected",
              qr: null,
              error: "WhatsApp session logged out. Click Scan WhatsApp QR Code to pair again.",
            });
            cleanup();
            process.exit(0);
          } else if (!shuttingDown && (restartRequired || currentState.status !== "connected")) {
            // Reconnect immediately (critical after scanning QR when WhatsApp sends 515 restartRequired)
            setTimeout(() => {
              void startSocket();
            }, 400);
          }
        }
      } catch (err) {
        writeStatus({
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  } catch (err) {
    writeStatus({
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

void startSocket();
