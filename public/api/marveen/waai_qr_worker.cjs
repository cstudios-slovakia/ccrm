#!/usr/bin/env node
/**
 * CCRM Direct WAAI WhatsApp Multi-Device Worker (Baileys).
 *
 * - Connects directly to WhatsApp Web multi-device servers (wss://web.whatsapp.com/ws/chat)
 * - Streams real WhatsApp QR codes (`https://wa.me/settings/linked_devices#2@...`) as PNG Data URLs
 * - Handles the post-scan 515 restart handshake automatically
 * - Syncs all history sync types (INITIAL_BOOTSTRAP, RECENT, FULL, PUSH_NAME, ON_DEMAND),
 *   LID-to-phone mappings, group participants, inline images/media, and live messages into `<accountDir>/store.json`
 * - Processes outgoing messages (`send`) and on-demand history requests (`resync` / `fetch_history`) from `<accountDir>/outbox/*.json`
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
  downloadMediaMessage,
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
const mediaDir = path.join(accountDir, "media");
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

// On reset, only clear authDir so a fresh QR code is generated; keep store.json & mediaDir
// so existing contacts, LID mappings, and cached messages remain available and merge with new history sync!
if (mode === "reset") {
  if (fs.existsSync(authDir)) {
    try {
      fs.rmSync(authDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}
fs.mkdirSync(authDir, { recursive: true });
fs.mkdirSync(outboxDir, { recursive: true });
fs.mkdirSync(mediaDir, { recursive: true });

// Persistent in-memory maps synced to `<accountDir>/store.json`
const contactsMap = new Map(); // canonicalJid -> { id, name, phone, lid }
const lidToJidMap = new Map(); // lid (both "12345@lid" and "12345") -> "421...@s.whatsapp.net"
const pushNamesMap = new Map(); // jid/lid -> pushName
const chatsMap = new Map(); // canonicalJid -> WhatsAppChatSummary
const messagesMap = new Map(); // canonicalJid -> Array<WhatsAppMessageItem>
const rawMessageKeysMap = new Map(); // canonicalJid -> { key, tsMs } (oldest message key for fetchMessageHistory)

function registerLidMapping(lidRaw, pnRaw) {
  if (!lidRaw || !pnRaw) return;
  const lidDigits = String(lidRaw).split("@")[0].split(":")[0].replace(/\D/g, "");
  const pnDigits = String(pnRaw).split("@")[0].split(":")[0].replace(/\D/g, "");
  if (!lidDigits || !pnDigits) return;
  const canonicalPnJid = `${pnDigits}@s.whatsapp.net`;
  lidToJidMap.set(`${lidDigits}@lid`, canonicalPnJid);
  lidToJidMap.set(lidDigits, canonicalPnJid);
}

function loadLidMappingsFromAuthDir() {
  if (!fs.existsSync(authDir)) return;
  try {
    for (const fn of fs.readdirSync(authDir)) {
      if (fn.startsWith("lid-mapping-") && fn.endswith ? fn.endsWith("_reverse.json") : fn.indexOf("_reverse.json") > 0) {
        const lidNum = fn.slice("lid-mapping-".length, -"_reverse.json".length);
        try {
          const pn = JSON.parse(fs.readFileSync(path.join(authDir, fn), "utf8"));
          if (typeof pn === "string" && pn) {
            registerLidMapping(lidNum, pn);
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
}
loadLidMappingsFromAuthDir();

function normalizeJid(rawJid) {
  if (!rawJid || typeof rawJid !== "string") return "";
  const trimmed = rawJid.trim();
  if (!trimmed || trimmed === "status@broadcast" || trimmed.endsWith("@broadcast") || trimmed.endsWith("@newsletter")) {
    return "";
  }
  if (trimmed.endsWith("@g.us")) return trimmed;

  const base = trimmed.split("@")[0].split(":")[0];
  const domain = trimmed.split("@")[1] || "";

  // Check if this is a LID (either explicit `@lid` or bare LID number in lidToJidMap)
  if (domain === "lid" || lidToJidMap.has(trimmed) || lidToJidMap.has(base) || lidToJidMap.has(`${base}@lid`)) {
    const mapped = lidToJidMap.get(trimmed) || lidToJidMap.get(base) || lidToJidMap.get(`${base}@lid`);
    if (mapped) return mapped;
    return `${base}@lid`;
  }

  return `${base}@${domain || "s.whatsapp.net"}`;
}

function jidToPhone(jid) {
  if (!jid || typeof jid !== "string") return "";
  if (jid.endsWith("@g.us") || jid.endsWith("@broadcast") || jid.endsWith("@newsletter")) return "";
  const normalized = normalizeJid(jid);
  // NEVER turn an unresolved @lid into a fake +phone number
  if (!normalized || normalized.endsWith("@lid")) return "";
  const digits = normalized.split("@")[0].split(":")[0].replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

function resolveDisplayName(jidOrLid, fallbackPushName = "") {
  if (!jidOrLid) return fallbackPushName || "WhatsApp";
  const cjid = normalizeJid(jidOrLid);
  const contact = contactsMap.get(cjid);
  if (contact?.name && !contact.name.startsWith("+") && !contact.name.endsWith("@lid")) {
    return contact.name;
  }
  if (fallbackPushName && fallbackPushName.trim()) {
    return fallbackPushName.trim();
  }
  const push = pushNamesMap.get(cjid) || pushNamesMap.get(jidOrLid);
  if (push) return push;
  const phone = jidToPhone(cjid);
  if (phone) return phone;
  return contact?.name || "WhatsApp User";
}

function formatMessageTimestamp(tsMs) {
  if (!tsMs) return "";
  const d = new Date(tsMs);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function loadStoreFromDisk() {
  if (!fs.existsSync(storeFile)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(storeFile, "utf8"));
    if (Array.isArray(raw.contacts)) {
      for (const c of raw.contacts) {
        if (c && c.id) {
          if (c.lid) registerLidMapping(c.lid, c.id);
          const cid = normalizeJid(c.id);
          if (!contactsMap.has(cid)) {
            contactsMap.set(cid, { ...c, id: cid });
          }
        }
      }
    }
    if (Array.isArray(raw.chats)) {
      for (const ch of raw.chats) {
        if (ch && ch.id) {
          const cid = normalizeJid(ch.id);
          if (!cid) continue;
          const existing = chatsMap.get(cid);
          if (!existing || (ch.lastMessageTs || 0) > (existing.lastMessageTs || 0)) {
            chatsMap.set(cid, { ...(existing || {}), ...ch, id: cid });
          }
        }
      }
    }
    if (raw.messages && typeof raw.messages === "object") {
      for (const [jid, list] of Object.entries(raw.messages)) {
        const cid = normalizeJid(jid);
        if (!cid || !Array.isArray(list)) continue;
        if (!messagesMap.has(cid)) {
          messagesMap.set(cid, list);
        } else {
          const existing = messagesMap.get(cid) || [];
          const seenIds = new Set(existing.map((m) => m.id));
          for (const item of list) {
            if (item && item.id && !seenIds.has(item.id)) {
              existing.push(item);
              seenIds.add(item.id);
            }
          }
          existing.sort((a, b) => (a.tsMs || 0) - (b.tsMs || 0));
          messagesMap.set(cid, existing.slice(-120));
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
  }, 500);
}

function flushStoreToDisk() {
  try {
    loadLidMappingsFromAuthDir();
    loadStoreFromDisk();

    // Retroactively heal any unresolved +LID sender names in messagesMap using latest contacts & LID mappings
    for (const [chatId, list] of messagesMap.entries()) {
      for (const msg of list) {
        if (!msg.fromMe && msg.senderName && /^\+\d{13,16}$/.test(msg.senderName)) {
          const bareLid = msg.senderName.slice(1);
          const mappedJid = lidToJidMap.get(bareLid) || lidToJidMap.get(`${bareLid}@lid`);
          if (mappedJid) {
            const resolved = resolveDisplayName(mappedJid);
            if (resolved && resolved !== msg.senderName) {
              msg.senderName = resolved;
            }
          }
        }
      }
      if (list.length > 0 && chatsMap.has(chatId)) {
        const newest = list[list.length - 1];
        const ch = chatsMap.get(chatId);
        if (ch && (newest.tsMs || 0) >= (ch.lastMessageTs || 0)) {
          ch.lastMessageTs = newest.tsMs;
          ch.lastMessageAt = newest.createdAt || new Date(newest.tsMs).toISOString();
          ch.lastMessageText = newest.text || ch.lastMessageText;
        }
      }
    }

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
      .filter((ch) => ch.id && ch.id !== "status@broadcast" && !ch.id.endsWith("@newsletter") && !ch.id.endsWith("@lid"))
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
      const cjid = normalizeJid(jid);
      if (!cjid) continue;
      messagesObj[cjid] = list.slice(-120);
    }

    const payload = {
      updatedAt: new Date().toISOString(),
      chats: sortedChats.slice(0, 600),
      contacts: Array.from(contactsMap.values()).slice(0, 1200),
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
  const rawLid = raw.lid || (raw.id && String(raw.id).endsWith("@lid") ? raw.id : null);
  const rawPn = raw.phoneNumber || (raw.id && String(raw.id).endsWith("@s.whatsapp.net") ? raw.id : null);
  if (rawLid && rawPn) {
    registerLidMapping(rawLid, rawPn);
  }
  const rawId = rawPn || raw.id || "";
  if (!rawId || rawId === "status@broadcast") return;
  const id = normalizeJid(rawId);
  if (!id) return;

  if (raw.notify && typeof raw.notify === "string") {
    pushNamesMap.set(id, raw.notify.trim());
    if (rawLid) pushNamesMap.set(rawLid, raw.notify.trim());
  }

  if (id.endsWith("@lid")) return;

  const prev = contactsMap.get(id) || {};
  const name = (raw.name || raw.verifiedName || prev.name || raw.notify || "").replace(/\r?\n/g, " ").trim();
  const phone = jidToPhone(id) || prev.phone || "";
  contactsMap.set(id, {
    id,
    name: name || phone || id,
    phone,
    lid: rawLid || prev.lid || null,
  });
}

function upsertChat(raw) {
  if (!raw || !raw.id || raw.id === "status@broadcast" || raw.id.endsWith("@newsletter")) return;
  if (raw.lidJid && raw.pnJid) {
    registerLidMapping(raw.lidJid, raw.pnJid);
  } else if (String(raw.id).endsWith("@lid") && raw.pnJid) {
    registerLidMapping(raw.id, raw.pnJid);
  } else if (String(raw.id).endsWith("@s.whatsapp.net") && raw.lidJid) {
    registerLidMapping(raw.lidJid, raw.id);
  }

  const id = normalizeJid(raw.id);
  if (!id || id.endsWith("@lid")) return;

  const prev = chatsMap.get(id) || {};
  const contact = contactsMap.get(id);
  const isGroup = id.endsWith("@g.us");
  const phone = isGroup ? "" : jidToPhone(id) || contact?.phone || prev.phone || "";
  const rawName = (raw.name || raw.subject || raw.displayName || contact?.name || prev.name || "")
    .replace(/\r?\n/g, " ")
    .trim();
  const tsRaw = Number(
    raw.conversationTimestamp || raw.lastMessageRecvTimestamp || raw.lastMsgTimestamp || raw.subjectTime || raw.creation || 0,
  );
  const tsMs = tsRaw > 0 ? (tsRaw < 1e12 ? tsRaw * 1000 : tsRaw) : prev.lastMessageTs || 0;

  let participantsPreview = prev.participantsPreview || "";
  if (isGroup && Array.isArray(raw.participants) && raw.participants.length > 0) {
    const names = [];
    for (const p of raw.participants) {
      if (p.lid && (p.phoneNumber || p.jid)) {
        registerLidMapping(p.lid, p.phoneNumber || p.jid);
      } else if (String(p.id || "").endsWith("@lid") && (p.phoneNumber || p.jid)) {
        registerLidMapping(p.id, p.phoneNumber || p.jid);
      }
      const pJid = normalizeJid(p.phoneNumber || p.jid || p.id || "");
      const pName = resolveDisplayName(pJid, p.notify || p.name || "");
      if (pName && !pName.startsWith("WhatsApp") && !names.includes(pName)) {
        names.push(pName.split(" ")[0]);
      }
    }
    if (names.length > 0) {
      participantsPreview = names.slice(0, 6).join(", ");
    }
  }

  chatsMap.set(id, {
    id,
    name: rawName || phone || id,
    phone,
    isGroup,
    participantCount: Array.isArray(raw.participants) ? raw.participants.length : prev.participantCount || 0,
    participantsPreview,
    unreadCount: typeof raw.unreadCount === "number" ? raw.unreadCount : prev.unreadCount || 0,
    pinned: raw.pinned !== undefined ? Boolean(raw.pinned) : Boolean(prev.pinned),
    archived: raw.archived !== undefined ? Boolean(raw.archived) : Boolean(prev.archived),
    lastMessageText: prev.lastMessageText || "",
    lastMessageAt: tsMs > 0 ? new Date(tsMs).toISOString() : prev.lastMessageAt || "",
    lastMessageTs: Math.max(tsMs, prev.lastMessageTs || 0),
  });
}

function unwrapMessageObject(msg) {
  if (!msg) return null;
  if (msg.ephemeralMessage?.message) return unwrapMessageObject(msg.ephemeralMessage.message);
  if (msg.viewOnceMessage?.message) return unwrapMessageObject(msg.viewOnceMessage.message);
  if (msg.viewOnceMessageV2?.message) return unwrapMessageObject(msg.viewOnceMessageV2.message);
  if (msg.documentWithCaptionMessage?.message) return unwrapMessageObject(msg.documentWithCaptionMessage.message);
  if (msg.editedMessage?.message?.protocolMessage?.editedMessage) {
    return unwrapMessageObject(msg.editedMessage.message.protocolMessage.editedMessage);
  }
  return msg;
}

function extractMessageDetails(rawMsg) {
  const msg = unwrapMessageObject(rawMsg?.message);
  if (!msg) return null;

  let text = "";
  let mediaType = undefined;
  let mediaPreviewUrl = undefined;
  let fileName = undefined;

  const thumbBuf =
    msg.imageMessage?.jpegThumbnail ||
    msg.videoMessage?.jpegThumbnail ||
    msg.extendedTextMessage?.jpegThumbnail ||
    msg.documentMessage?.jpegThumbnail ||
    null;

  if (thumbBuf) {
    try {
      const b64 = Buffer.isBuffer(thumbBuf)
        ? thumbBuf.toString("base64")
        : Buffer.from(thumbBuf).toString("base64");
      if (b64.length > 20) {
        mediaPreviewUrl = `data:image/jpeg;base64,${b64}`;
      }
    } catch {
      // ignore
    }
  }

  if (typeof msg.conversation === "string" && msg.conversation) {
    text = msg.conversation;
  } else if (typeof msg.extendedTextMessage?.text === "string" && msg.extendedTextMessage.text) {
    text = msg.extendedTextMessage.text;
  } else if (msg.imageMessage) {
    mediaType = "image";
    text = msg.imageMessage.caption || "📷 Photo";
  } else if (msg.videoMessage) {
    mediaType = "video";
    text = msg.videoMessage.caption || "🎥 Video";
  } else if (msg.audioMessage) {
    mediaType = "audio";
    text = "🎤 Voice message";
  } else if (msg.documentMessage) {
    mediaType = "document";
    fileName = msg.documentMessage.fileName || "Document";
    text = msg.documentMessage.caption || `📄 ${fileName}`;
  } else if (msg.stickerMessage) {
    mediaType = "image";
    text = "🏷️ Sticker";
  } else if (msg.contactMessage) {
    text = `👤 ${msg.contactMessage.displayName || "Contact"}`;
  } else if (msg.locationMessage) {
    text = "📍 Location";
  } else if (msg. reactionMessage?.text) {
    return null; // Don't clutter chat timeline with standalone reaction events
  }

  if (!text && !mediaType) return null;
  return { text: text.trim(), mediaType, mediaPreviewUrl, fileName };
}

async function maybeDownloadMediaForMessage(rawMsg, item) {
  if (!downloadMediaMessage || !item.mediaType) return;
  // Download full media for recent messages (last 14 days) so images/audio/docs render in full quality
  if (Date.now() - (item.tsMs || 0) > 14 * 86400 * 1000) return;

  const safeId = String(item.id).replace(/[^a-zA-Z0-9_-]/g, "_");
  const ext =
    item.mediaType === "image"
      ? "jpg"
      : item.mediaType === "video"
        ? "mp4"
        : item.mediaType === "audio"
          ? "ogg"
          : "bin";
  const filePath = path.join(mediaDir, `${safeId}.${ext}`);
  const publicUrl = `/uploads/.waai/accounts/${accountId}/media/${safeId}.${ext}`;

  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 50) {
    item.mediaUrl = publicUrl;
    return;
  }

  try {
    const buf = await downloadMediaMessage(rawMsg, "buffer", {});
    if (buf && buf.length > 50) {
      fs.writeFileSync(filePath, buf);
      item.mediaUrl = publicUrl;
      scheduleSaveStore();
    }
  } catch {
    // Fallback to mediaPreviewUrl (jpegThumbnail) if media download fails
  }
}

function upsertMessage(rawMsg) {
  if (!rawMsg || !rawMsg.key || !rawMsg.key.remoteJid) return;
  const rawJid = rawMsg.key.remoteJid;
  if (rawJid === "status@broadcast" || rawJid.endsWith("@newsletter")) return;

  // Record LID -> PN mapping if present on the message key
  if (rawMsg.key.senderLid && rawMsg.key.senderPn) {
    registerLidMapping(rawMsg.key.senderLid, rawMsg.key.senderPn);
  }
  if (rawMsg.key.participant && rawMsg.key.participantPn) {
    registerLidMapping(rawMsg.key.participant, rawMsg.key.participantPn);
  }
  if (rawJid.endsWith("@lid") && rawMsg.key.senderPn) {
    registerLidMapping(rawJid, rawMsg.key.senderPn);
  }

  const chatId = normalizeJid(rawJid);
  if (!chatId || chatId.endsWith("@lid")) return;

  const details = extractMessageDetails(rawMsg);
  if (!details) return;

  const msgId = rawMsg.key.id || `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const fromMe = Boolean(rawMsg.key.fromMe);
  const tsRaw = Number(rawMsg.messageTimestamp || 0);
  const tsMs = tsRaw > 0 ? (tsRaw < 1e12 ? tsRaw * 1000 : tsRaw) : Date.now();

  const rawParticipant = rawMsg.key.participantPn || rawMsg.key.participant || rawMsg.participant || "";
  if (rawMsg.pushName && rawParticipant) {
    pushNamesMap.set(normalizeJid(rawParticipant), rawMsg.pushName.trim());
  }

  const senderName = fromMe
    ? "Me"
    : resolveDisplayName(rawParticipant || chatId, rawMsg.pushName || "");

  // Track oldest message key per chat for on-demand `sock.fetchMessageHistory`
  const prevOldest = rawMessageKeysMap.get(chatId);
  if (!prevOldest || tsMs < prevOldest.tsMs) {
    rawMessageKeysMap.set(chatId, {
      key: {
        remoteJid: rawJid,
        fromMe,
        id: msgId,
        participant: rawMsg.key.participant || undefined,
      },
      tsMs,
    });
  }

  const list = messagesMap.get(chatId) || [];
  let item = list.find((x) => x.id === msgId);
  if (!item) {
    item = {
      id: msgId,
      chatId,
      fromMe,
      senderName,
      text: details.text,
      mediaType: details.mediaType,
      mediaPreviewUrl: details.mediaPreviewUrl,
      fileName: details.fileName,
      timestamp: formatMessageTimestamp(tsMs),
      createdAt: new Date(tsMs).toISOString(),
      tsMs,
    };
    list.push(item);
    list.sort((a, b) => a.tsMs - b.tsMs);
    messagesMap.set(chatId, list.slice(-120));
  } else {
    if (details.mediaPreviewUrl && !item.mediaPreviewUrl) item.mediaPreviewUrl = details.mediaPreviewUrl;
    if (senderName && (!item.senderName || item.senderName.startsWith("+") || item.senderName.startsWith("WhatsApp"))) {
      item.senderName = senderName;
    }
  }

  if (details.mediaType) {
    void maybeDownloadMediaForMessage(rawMsg, item);
  }

  // Update chat summary
  if (!chatsMap.has(chatId)) {
    upsertChat({ id: chatId, name: chatId.endsWith("@g.us") ? "" : rawMsg.pushName || "" });
  }
  const ch = chatsMap.get(chatId);
  if (ch && tsMs >= (ch.lastMessageTs || 0)) {
    ch.lastMessageText = details.text;
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
  historySyncChunks: 0,
  lastHistorySyncAt: null,
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
      } else if (cmd.action === "resync" || cmd.action === "fetch_history") {
        try {
          // If a specific chatId was passed and we have an oldest message key, request on-demand history from phone
          if (cmd.chatId && typeof activeSock.fetchMessageHistory === "function") {
            const cjid = normalizeJid(cmd.chatId);
            const oldest = rawMessageKeysMap.get(cjid);
            const msgList = messagesMap.get(cjid) || [];
            const refKey = oldest?.key || (msgList[0]
              ? { remoteJid: cjid, fromMe: Boolean(msgList[0].fromMe), id: msgList[0].id }
              : null);
            const refTs = oldest?.tsMs || msgList[0]?.tsMs || Date.now();
            if (refKey) {
              await activeSock.fetchMessageHistory(50, refKey, refTs).catch(() => undefined);
            }
          }

          if (cmd.action === "resync") {
            for (const f of fs.readdirSync(authDir)) {
              if (f.startsWith("app-state-sync-version-")) {
                fs.unlinkSync(path.join(authDir, f));
              }
            }
            if (ALL_WA_PATCH_NAMES) {
              await activeSock.resyncAppState(ALL_WA_PATCH_NAMES, true).catch(() => undefined);
            }
            const groups = await activeSock.groupFetchAllParticipating().catch(() => ({}));
            for (const g of Object.values(groups)) {
              upsertChat(g);
            }
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
      shouldSyncHistoryMessage: () => true,
      markOnlineOnConnect: false,
      getMessage: async (key) => {
        const cjid = normalizeJid(key?.remoteJid || "");
        const list = messagesMap.get(cjid) || [];
        const found = list.find((m) => m.id === key?.id);
        return found ? { conversation: found.text || "" } : undefined;
      },
    });
    activeSock = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messaging-history.set", ({ chats = [], contacts = [], messages = [], lidPnMappings = [] }) => {
      for (const m of lidPnMappings) {
        if (m && m.lid && m.pn) registerLidMapping(m.lid, m.pn);
      }
      loadLidMappingsFromAuthDir();
      for (const c of contacts) upsertContact(c);
      for (const ch of chats) upsertChat(ch);
      for (const m of messages) upsertMessage(m);
      writeStatus({
        historySyncChunks: (currentState.historySyncChunks || 0) + 1,
        lastHistorySyncAt: new Date().toISOString(),
      });
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

    sock.ev.on("messages.update", (updates = []) => {
      for (const u of updates) {
        if (u?.key && u?.update?.message) {
          upsertMessage({
            key: u.key,
            message: u.update.message,
            messageTimestamp: u.update.messageTimestamp || Math.floor(Date.now() / 1000),
          });
        }
      }
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
            loadLidMappingsFromAuthDir();
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
              error: "WhatsApp session logged out. Scan the QR code to reconnect.",
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
