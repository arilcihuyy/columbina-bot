// Ubah pesan mentah Baileys jadi struktur yang gampang dibaca command:
// text, args, quoted media, media sendiri, dll.
import { getContentType, jidNormalizedUser, downloadMediaMessage } from '@whiskeysockets/baileys'
import { CONFIG } from '../config.js'

const MEDIA_TYPES = new Set([
  'imageMessage', 'videoMessage', 'audioMessage',
  'documentMessage', 'stickerMessage',
])

// Buka bungkus pesan bertingkat (viewOnceMessage, dll) sampai dapat isi aslinya.
function unwrap(message) {
  let cur = message
  for (let i = 0; i < 6; i++) {
    const type = getContentType(cur)
    if (!type) return { type: null, content: null }
    const node = cur[type]
    if (node && typeof node === 'object' && node.message) { cur = node.message; continue }
    return { type, content: node }
  }
  return { type: null, content: null }
}

function extractText(message, type, content) {
  switch (type) {
    case 'conversation': return content
    case 'extendedTextMessage': return content.text || ''
    case 'imageMessage':
    case 'videoMessage':
    case 'stickerMessage':
    case 'audioMessage':
    case 'documentMessage': return content.caption || ''
    case 'buttonsResponseMessage': return content.selectedButtonId || ''
    case 'listResponseMessage': return content.singleSelectReply?.selectedRowId || ''
    default: return ''
  }
}

function extractQuoted(raw, content, sock) {
  const quotedMsg = content?.contextInfo?.quotedMessage
  if (!quotedMsg) return null

  const { type, content: inner } = unwrap(quotedMsg)
  const quotedText = type ? (extractText(quotedMsg, type, inner) ?? '') : ''
  if (!type) return { exists: true, isMedia: false, mimetype: null, type: null, text: '' }

  const quoted = {
    exists: true,
    isMedia: MEDIA_TYPES.has(type),
    type,
    text: quotedText,
    mimetype: inner?.mimetype ?? null,
    key: {
      remoteJid: raw.key.remoteJid,
      id: content.contextInfo.stanzaId,
      fromMe: content.contextInfo.participant === sock.user?.id,
      participant: content.contextInfo.participant,
    },
  }

  if (!quoted.isMedia) return quoted

  const msgLike = { key: quoted.key, message: { [type]: inner } }
  quoted.download = async () => {
    const opts = { logger: sock.logger, reuploadRequest: sock.updateMediaMessage }
    try {
      return await downloadMediaMessage(msgLike, 'buffer', {}, opts)
    } catch (err) {
      // Media yang di-quote bisa kedaluwarsa — coba refresh sekali
      if (sock.updateMediaMessage && quoted.key.id) {
        await sock.updateMediaMessage(msgLike)
        return downloadMediaMessage(msgLike, 'buffer', {}, opts)
      }
      throw err
    }
  }
  return quoted
}

/**
 * Cari prefix yang cocok di awal teks. Prefix terpanjang menang, jadi prefix
 * multi-karakter (mis. "!!") tidak salah potong. Dipakai parser + bisa diuji langsung.
 */
export function matchPrefix(text = '', prefixes = CONFIG.prefixes) {
  return [...prefixes]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .find((p) => String(text).startsWith(p)) || null
}

export function parseMessage(raw, sock) {
  if (!raw?.message) return null

  const jid = raw.key?.remoteJid
  if (!jid) return null

  const fromMe = raw.key?.fromMe ?? false
  const isGroup = jid.endsWith('@g.us')
  const participant = isGroup ? (raw.key?.participant ?? raw.participant ?? jid) : jid

  const { type, content } = unwrap(raw.message)
  if (!type) return null

  const fullText = extractText(raw.message, type, content) ?? ''
  const text = fullText.trim()

  // Prefix bisa lebih dari satu (mis. "!" dan "."). matchPrefix memilih yang cocok.
  const prefix = matchPrefix(text)
  const startsWithPrefix = !!prefix

  const tokens = text.split(/\s+/)
  const command = startsWithPrefix ? (tokens.shift() || '').slice(prefix.length).toLowerCase() : null
  const args = tokens
  const rawArgs = text.slice((prefix?.length ?? 0) + (command ? command.length : 0)).trim()

  const quoted = extractQuoted(raw, content, sock)
  const isSelfMedia = MEDIA_TYPES.has(type)
  const media = isSelfMedia
    ? {
        isMedia: true, type, mimetype: content?.mimetype ?? null,
        download: () => downloadMediaMessage(raw, 'buffer', {}, { logger: sock.logger, reuploadRequest: sock.updateMediaMessage }),
      }
    : null

  const reply = (msg, options = {}) => {
    const body = typeof msg === 'string' ? { text: msg } : msg
    return sock.sendMessage(jid, { ...body, ...options }, { quoted: raw })
  }

  return {
    sock, raw, jid, fromMe, isGroup,
    sender: jidNormalizedUser(participant),
    pushName: raw.pushName || '',
    type, text: fullText, trimmed: text,
    command,
    args,
    rawArgs,
    isCommand: !!command,
    quoted,
    media,
    key: raw.key,
    reply,
    react: (emoji) => sock.sendMessage(jid, { react: { text: emoji, key: raw.key } }),
    send: (msg, options = {}) => {
      const body = typeof msg === 'string' ? { text: msg } : msg
      return sock.sendMessage(jid, { ...body, ...options })
    },
    sendMedia: (kind, data, caption = '', options = {}) =>
      sock.sendMessage(jid, {
        [kind]: typeof data === 'string' ? { url: data } : data,
        caption, ...options,
      }, { quoted: raw }),
    typing: () => sock.sendPresenceUpdate('composing', jid),
  }
}
