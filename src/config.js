import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Prefix bisa lebih dari satu, mis. PREFIX="!." → command jalan dengan "!" DAN ".".
// Aturan: kalau ada koma, dipisah koma (boleh multi-karakter, mis. "!!,."); kalau
// tidak, tiap karakter jadi satu prefix. Karakter pertama = prefix utama (menu).
const rawPrefix = process.env.PREFIX || '!'
const prefixes = [...new Set(
  rawPrefix.includes(',')
    ? rawPrefix.split(',').map((s) => s.trim()).filter(Boolean)
    : rawPrefix.split('').filter((c) => c && !/\s/.test(c)),
)]

export const CONFIG = {
  botName: process.env.BOT_NAME || 'Columbina Bot',
  prefix: prefixes[0] || '!',
  prefixes: prefixes.length ? prefixes : ['!'],
  ownerNumber: (process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, ''),
  pairingNumber: (process.env.PAIRING_NUMBER || '').replace(/[^0-9]/g, ''),
  logLevel: process.env.LOG_LEVEL || 'info',
  respondToSelf: process.env.RESPOND_TO_SELF === 'true',
  sessionPath: path.resolve(process.env.SESSION_PATH || './sessions'),
  rootDir: path.resolve(__dirname, '..'),
}

export function isOwnerJid(jid = '') {
  if (!CONFIG.ownerNumber) return true // kalau owner belum diisi, semua dianggap owner
  const num = jid.replace(/[^0-9]/g, '').replace(/^0+/, '')
  return num === CONFIG.ownerNumber
}

export const ownerWaLink = `https://wa.me/${CONFIG.ownerNumber || ''}`
