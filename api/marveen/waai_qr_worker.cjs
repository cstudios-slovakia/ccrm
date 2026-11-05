#!/usr/bin/env node
/**
 * CCRM Direct WAAI WhatsApp Multi-Device Worker (Baileys).
 *
 * - Connects directly to WhatsApp Web multi-device servers (wss://web.whatsapp.com/ws/chat)
 * - Streams real WhatsApp QR codes (`https://wa.me/settings/linked_devices#2@...`) as PNG Data URLs
 * - Handles the post-scan 515 restart handshake automatically
 * - Syncs WhatsApp chats, contacts, groups, and messages into `<accountDir>/store.json`
 * - Processes outgoing WhatsApp messages from `<accountDir>/outbox/*.json`
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
const {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  ALL_WA_PATCH_NAMES,
} = baileys;
const QRCode = requireFromWaai("qrcode");
const pino = requireFromWaai("pino");

const accountDir = process.argv[2];
const accountId = process.argv[3] || "wa-default";
const mode = process.argv[4] || "resume"; // "reset" | "resume"

if (!accountDir) {
  console.error("Usage: node waai_qr_worker.cjs <accountDir> <accountId> [reset|resume]");
  process.exit(1);
}

fs.mkdirSync(accountDir, { recursive: true });
const authDir = path.join(accountDir, "auth");
const outboxDir = path.join(accountDir, "outbox");
const statusFile = path.join(accountDir, "status.json");
const storeFile = path.join(accountDir, "store.json");
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

if (mode === "reset") {
  if (fs.existsSync(authDir)) {
    try {
      fs.rmSync(authDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
  if (fs.existsSync(storeFile)) {
    try {
      fs.unlinkSync(storeFile);
    } catch {
      // ignore
    }
  }
}
fs.mkdirSync(authDir, { recursive: true });
fs.mkdirSync(outboxDir, { recursive: true });

// Load or initialize persistent chat/contact/message store
const contactsMap = new Map(); // jid -> { id, name, phone, lid }
const lidToJidMap = new Map(); // lid -> phone jid
const chatsMap = new Map(); // jid -> { id, name, phone, isGroup, participantCount, unreadCount, pinned, archived, lastMessageText, lastMessageAt, lastMessageTs }
const messagesMap = new Map(); // jid -> Array<{ id, chatId, fromMe, senderName, text, timestamp, tsMs }>

function jidToPhone(jid) {
  if (!jid || typeof jid !== "string") return "";
  if (jid.endsWith("@g.us") || jid.endsWith("@broadcast") || jid.endsWith("@newsletter")) return "";
  const resolved = lidToJidMap.get(jid) || jid;
  if (resolved.endsWith("@lid")) return "";
  const digits = resolved.split("@")[0].split(":")[0].replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

function normalizeJid(rawJid) {
  if (!rawJid || typeof rawJid !== "string") return "";
  if (rawJid === "status@broadcast") return "";
  if (rawJid.endsWith("@g.us")) return rawJid;
  if (lidToJidMap.has(rawJid)) return lidToJidMap.get(rawJid);
  const base = rawJid.split("@")[0].split(":")[0];
  const domain = rawJid.split("@")[1] || "s.whatsapp.net";
  return `${base}@${domain}`;
}

function loadStoreFromDisk() {
  if (!fs.existsSync(storeFile)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(storeFile, "utf8"));
    if (Array.isArray(raw.contacts)) {
      for (const c of raw.contacts) {
        if (c && c.id && !contactsMap.has(c.id)) {
          contactsMap.set(c.id, c);
          if (c.lid) lidToJidMap.set(c.lid, c.id);
        }
      }
    }
    if (Array.isArray(raw.chats)) {
      for (const ch of raw.chats) {
        if (ch && ch.id) {
          const existing = chatsMap.get(ch.id);
          if (!existing || (ch.lastMessageTs || 0) > (existing.lastMessageTs || 0)) {
            chatsMap.set(ch.id, { ...(existing || {}), ...ch });
          }
        }
      }
    }
    if (raw.messages && typeof raw.messages === "object") {
      for (const [jid, list] of Object.entries(raw.messages)) {
        if (Array.isArray(list) && !messagesMap.has(jid)) {
          messagesMap.set(jid, list);
        }
      }
    }
  } catch {
    // ignore corrupt store
  }
}
loadStoreFromDisk();

let storeSaveTimer = null;
function scheduleSaveStore() {
  if (storeSaveTimer) return;
  storeSaveTimer = setTimeout(() => {
    storeSaveTimer = null;
    flushStoreToDisk();
  }, 600);
}

function flushStoreToDisk() {
  try {
    loadStoreFromDisk();
    // Ensure every contact is also represented as a searchable chat entry if not already present
    for (const [cid, c] of contactsMap.entries()) {
      if (!cid || cid === "status@broadcast" || cid.endsWith("@lid")) continue;
      const existing = chatsMap.get(cid);
      const phone = c.phone || jidToPhone(cid);
      const cleanName = (c.name || "").replace(/\r?\n/g, " ").trim();
      if (!existing) {
        chatsMap.set(cid, {
          id: cid,
          name: cleanName || phone || cid,
          phone,
          isGroup: cid.endsWith("@g.us"),
          participantCount: 0,
          unreadCount: 0,
          pinned: false,
          archived: false,
          lastMessageText: "",
          lastMessageAt: "",
          lastMessageTs: 0,
        });
      } else if (cleanName && (!existing.name || existing.name.startsWith("+") || existing.name === cid)) {
        existing.name = cleanName;
        if (phone && !existing.phone) existing.phone = phone;
      }
    }

    const sortedChats = Array.from(chatsMap.values())
      .filter((ch) => ch.id && ch.id !== "status@broadcast" && !ch.id.endsWith("@newsletter"))
      .sort((a, b) => {
        const aHasMsg = (a.lastMessageTs || 0) > 0 ? 1 : 0;
        const bHasMsg = (b.lastMessageTs || 0) > 0 ? 1 : 0;
        if (aHasMsg !== bHasMsg) return bHasMsg - aHasMsg;
        if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
        if ((b.lastMessageTs || 0) !== (a.lastMessageTs || 0)) {
          return (b.lastMessageTs || 0) - (a.lastMessageTs || 0);
        }
        if (Boolean(a.isGroup) !== Boolean(b.isGroup)) return a.isGroup ? -1 : 1;
        return (a.name || "").localeCompare(b.name || "");
      });

    const messagesObj = {};
    for (const [jid, list] of messagesMap.entries()) {
      messagesObj[jid] = list.slice(-100);
    }

    const payload = {
      updatedAt: new Date().toISOString(),
      chats: sortedChats.slice(0, 500),
      contacts: Array.from(contactsMap.values()).slice(0, 1000),
      messages: messagesObj,
    };
    const tmp = `${storeFile}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(payload), "utf8");
    fs.renameSync(tmp, storeFile);
  } catch {
    // ignore
  }
}

function upsertContact(raw) {
  if (!raw) return;
  const rawId = raw.phoneNumber || raw.id || "";
  if (!rawId || rawId === "status@broadcast") return;
  const id = normalizeJid(rawId);
  const lid = raw.lid || (raw.id && raw.id.endsWith("@lid") ? raw.id : null);
  if (lid && !id.endsWith("@lid")) {
    lidToJidMap.set(lid, id);
    lidToJidMap.set(lid.split(":")[0] + "@lid", id);
  }
  const prev = contactsMap.get(id) || {};
  const name = (raw.name || raw.notify || raw.verifiedName || prev.name || "").replace(/\r?\n/g, " ").trim();
  const phone = jidToPhone(id) || prev.phone || "";
  contactsMap.set(id, {
    id,
    name: name || phone || id,
    phone,
    lid: lid || prev.lid || null,
  });
}

function upsertChat(raw) {
  if (!raw || !raw.id || raw.id === "status@broadcast" || raw.id.endsWith("@newsletter")) return;
  const id = normalizeJid(raw.id);
  if (!id) return;
  const prev = chatsMap.get(id) || {};
  const contact = contactsMap.get(id);
  const isGroup = id.endsWith("@g.us");
  const phone = isGroup ? "" : jidToPhone(id) || contact?.phone || prev.phone || "";
  const rawName = (raw.name || raw.subject || contact?.name || prev.name || "").replace(/\r?\n/g, " ").trim();
  const tsRaw = Number(raw.conversationTimestamp || raw.lastMsgTimestamp || raw.subjectTime || raw.creation || 0);
  const tsMs = tsRaw > 0 ? (tsRaw < 1e12 ? tsRaw * 1000 : tsRaw) : prev.lastMessageTs || 0;

  chatsMap.set(id, {
    id,
    name: rawName || phone || id,
    phone,
    isGroup,
    participantCount: Array.isArray(raw.participants) ? raw.participants.length : prev.participantCount || 0,
    unreadCount: typeof raw.unreadCount === "number" ? raw.unreadCount : prev.unreadCount || 0,
    pinned: raw.pinned !== undefined ? Boolean(raw.pinned) : Boolean(prev.pinned),
    archived: raw.archived !== undefined ? Boolean(raw.archived) : Boolean(prev.archived),
    lastMessageText: prev.lastMessageText || "",
    lastMessageAt: tsMs > 0 ? new Date(tsMs).toISOString() : prev.lastMessageAt || "",
    lastMessageTs: Math.max(tsMs, prev.lastMessageTs || 0),
  });
}

function extractMessageText(m) {
  const msg = m?.message;
  if (!msg) return "";
  if (typeof msg.conversation === "string" && msg.conversation) return msg.conversation;
  if (typeof msg.extendedTextMessage?.text === "string" && msg.extendedTextMessage.text) {
    return msg.extendedTextMessage.text;
  }
  if (typeof msg.imageMessage?.caption === "string") return msg.imageMessage.caption || "📷 Photo";
  if (msg.imageMessage) return "📷 Photo";
  if (typeof msg.videoMessage?.caption === "string") return msg.videoMessage.caption || "🎥 Video";
  if (msg.videoMessage) return "🎥 Video";
  if (msg.audioMessage) return "🎤 Voice message";
  if (msg.documentMessage) return `📄 ${msg.documentMessage.fileName || "Document"}`;
  if (msg.stickerMessage) return "🏷️ Sticker";
  if (msg.contactMessage) return `👤 ${msg.contactMessage.displayName || "Contact"}`;
  if (msg.locationMessage) return "📍 Location";
  return "";
}

function upsertMessage(rawMsg) {
  if (!rawMsg || !rawMsg.key || !rawMsg.key.remoteJid) return;
  const rawJid = rawMsg.key.remoteJid;
  if (rawJid === "status@broadcast" || rawJid.endsWith("@newsletter")) return;
  const chatId = normalizeJid(rawJid);
  if (!chatId) return;

  const text = extractMessageText(rawMsg).trim();
  if (!text) return;

  const msgId = rawMsg.key.id || `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const fromMe = Boolean(rawMsg.key.fromMe);
  const tsRaw = Number(rawMsg.messageTimestamp || 0);
  const tsMs = tsRaw > 0 ? (tsRaw < 1e12 ? tsRaw * 1000 : tsRaw) : Date.now();
  const participantJid = normalizeJid(rawMsg.key.participant || rawMsg.participant || "");
  const participantContact = participantJid ? contactsMap.get(participantJid) : null;
  const senderName = fromMe
    ? "Me"
    : rawMsg.pushName || participantContact?.name || contactsMap.get(chatId)?.name || jidToPhone(participantJid || chatId) || "WhatsApp";

  const list = messagesMap.get(chatId) || [];
  if (!list.some((item) => item.id === msgId)) {
    list.push({
      id: msgId,
      chatId,
      fromMe,
      senderName,
      text,
      timestamp: new Date(tsMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      createdAt: new Date(tsMs).toISOString(),
      tsMs,
    });
    list.sort((a, b) => a.tsMs - b.tsMs);
    messagesMap.set(chatId, list.slice(-100));
  }

  // Update chat summary
  if (!chatsMap.has(chatId)) {
    upsertChat({ id: chatId, name: rawMsg.pushName || "" });
  }
  const ch = chatsMap.get(chatId);
  if (ch && tsMs >= (ch.lastMessageTs || 0)) {
    ch.lastMessageText = text;
    ch.lastMessageTs = tsMs;
    ch.lastMessageAt = new Date(tsMs).toISOString();
    if (!fromMe && rawMsg.pushName && !ch.isGroup && (!ch.name || ch.name.startsWith("+"))) {
      ch.name = rawMsg.pushName;
    }
  }
}

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
  flushStoreToDisk();
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

let activeSock = null;

// Process outgoing messages / history requests from `<accountDir>/outbox/*.json`
setInterval(async () => {
  if (!activeSock || currentState.status !== "connected") return;
  try {
    const files = fs.readdirSync(outboxDir).filter((f) => f.endsWith(".json") && !f.endsWith(".result.json"));
    for (const file of files) {
      const fullPath = path.join(outboxDir, file);
      let cmd = null;
      try {
        cmd = JSON.parse(fs.readFileSync(fullPath, "utf8"));
        fs.unlinkSync(fullPath);
      } catch {
        continue;
      }
      if (!cmd) continue;

      if (cmd.action === "send" && cmd.chatId && cmd.text) {
        try {
          const targetJid = cmd.chatId.includes("@")
            ? cmd.chatId
            : `${cmd.chatId.replace(/\D/g, "")}@s.whatsapp.net`;
          const sent = await activeSock.sendMessage(targetJid, { text: String(cmd.text) });
          const msgId = sent?.key?.id || `out-${Date.now()}`;
          upsertMessage({
            key: { remoteJid: targetJid, fromMe: true, id: msgId },
            message: { conversation: String(cmd.text) },
            messageTimestamp: Math.floor(Date.now() / 1000),
          });
          flushStoreToDisk();
          if (cmd.id) {
            fs.writeFileSync(
              path.join(outboxDir, `${cmd.id}.result.json`),
              JSON.stringify({ ok: true, id: msgId, chatId: targetJid }),
              "utf8",
            );
          }
        } catch (err) {
          if (cmd.id) {
            fs.writeFileSync(
              path.join(outboxDir, `${cmd.id}.result.json`),
              JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
              "utf8",
            );
          }
        }
      } else if (cmd.action === "resync") {
        try {
          for (const f of fs.readdirSync(authDir)) {
            if (f.startsWith("app-state-sync-version-")) {
              fs.unlinkSync(path.join(authDir, f));
            }
          }
          await activeSock.resyncAppState(ALL_WA_PATCH_NAMES, true);
          const groups = await activeSock.groupFetchAllParticipating().catch(() => ({}));
          for (const g of Object.values(groups)) {
            upsertChat(g);
          }
          flushStoreToDisk();
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
}, 400);

async function startSocket() {
  if (shuttingDown) return;
  try {
    // If store is empty on an already-authenticated account, clear app-state-sync-version markers once
    // BEFORE useMultiFileAuthState loads them so resyncAppState pulls all contacts & chats fresh!
    if (
      contactsMap.size < 5 &&
      chatsMap.size < 5 &&
      fs.existsSync(path.join(authDir, "creds.json"))
    ) {
      for (const f of fs.readdirSync(authDir)) {
        if (f.startsWith("app-state-sync-version-")) {
          try {
            fs.unlinkSync(path.join(authDir, f));
          } catch {
            // ignore
          }
        }
      }
    }

    const credsPath = path.join(authDir, "creds.json");
    const credsBackupPath = path.join(authDir, "creds.backup.json");
    if (fs.existsSync(credsPath)) {
      try {
        const st = fs.statSync(credsPath);
        if (st.size < 20) {
          if (fs.existsSync(credsBackupPath) && fs.statSync(credsBackupPath).size >= 20) {
            fs.copyFileSync(credsBackupPath, credsPath);
          } else {
            fs.unlinkSync(credsPath);
          }
        }
      } catch {
        // ignore
      }
    }

    const { state, saveCreds: rawSaveCreds } = await useMultiFileAuthState(authDir);
    const saveCreds = async () => {
      await rawSaveCreds();
      try {
        if (fs.existsSync(credsPath) && fs.statSync(credsPath).size >= 50) {
          const tmp = `${credsBackupPath}.tmp`;
          fs.copyFileSync(credsPath, tmp);
          fs.renameSync(tmp, credsBackupPath);
        }
      } catch {
        // ignore
      }
    };
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
      syncFullHistory: true,
      markOnlineOnConnect: false,
    });
    activeSock = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messaging-history.set", ({ chats = [], contacts = [], messages = [] }) => {
      for (const c of contacts) upsertContact(c);
      for (const ch of chats) upsertChat(ch);
      for (const m of messages) upsertMessage(m);
      scheduleSaveStore();
    });

    sock.ev.on("contacts.upsert", (list = []) => {
      for (const c of list) upsertContact(c);
      scheduleSaveStore();
    });

    sock.ev.on("contacts.update", (list = []) => {
      for (const c of list) upsertContact(c);
      scheduleSaveStore();
    });

    sock.ev.on("chats.upsert", (list = []) => {
      for (const ch of list) upsertChat(ch);
      scheduleSaveStore();
    });

    sock.ev.on("chats.update", (list = []) => {
      for (const ch of list) upsertChat(ch);
      scheduleSaveStore();
    });

    sock.ev.on("messages.upsert", ({ messages = [] }) => {
      for (const m of messages) upsertMessage(m);
      scheduleSaveStore();
    });

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

          // Fetch participating groups and resync contacts/chats into store.json
          try {
            if (contactsMap.size < 10 && ALL_WA_PATCH_NAMES) {
              await sock.resyncAppState(ALL_WA_PATCH_NAMES, true).catch(() => undefined);
            }
            const groups = await sock.groupFetchAllParticipating().catch(() => ({}));
            for (const g of Object.values(groups)) {
              upsertChat(g);
            }
            flushStoreToDisk();
          } catch {
            // ignore
          }
        }

        if (connection === "close") {
          activeSock = null;
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
          } else if (!shuttingDown && (restartRequired || currentState.status !== "disconnected")) {
            setTimeout(() => {
              void startSocket();
            }, 600);
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
