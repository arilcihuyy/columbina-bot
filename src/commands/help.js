// Menu bot — layout v5 (banner gambar + daftar bullet satu baris).
//
// Struktur:
//   ✦ nama bot (center) → subjudul → pembatas → (petunjuk prefix)
//   → kategori emoji → item "  • !cmd  desc" SATU BARIS → pembatas → 🌙 <nama bot>
// Banner gambar dikirim menyatu sebagai caption (satu bubble).
//
// Aturan copy:
//   - desc ≈ ≤24 kolom → baris item ≤38 (lebar aman WA)
//   - total menu ≤1024 karakter → banner + teks jadi SATU pesan
//   - label gabungan (a · b · c) menandai beberapa command sekaligus
//   - tanpa small-caps/bold-italic unicode — judul & kategori huruf biasa
//
// ENV:
//   MENU_BANNER=image|text|off     (default image)
//   MENU_BANNER_IMAGE_FILE=...     (default assets/columbina/banner.jpg)
//   MENU_ALIAS=on|off              (default off)
//   MENU_FOOTER=teks               (default: kata pertama nama bot, lowercase)
import { CONFIG } from '../config.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ASSETS = path.resolve(__dirname, '../../assets')
const BANNER_IMAGE = process.env.MENU_BANNER_IMAGE_FILE || path.join(ASSETS, 'columbina', 'banner.jpg')
const BANNER_TEXT_FILE = process.env.MENU_BANNER_FILE || path.join(ASSETS, 'menu-banner.txt')
const MODE = (process.env.MENU_BANNER || 'image').toLowerCase()
const SHOW_ALIAS = (process.env.MENU_ALIAS || 'off').toLowerCase() === 'on'
const STYLE = (process.env.MENU_STYLE || 'math').toLowerCase()
const FOOTER = (process.env.MENU_FOOTER || '').trim()

/** Label footer menu — default kata pertama nama bot tanpa emoji ("columbina bot🌙" → "columbina"). */
export function footerLabel(botName = CONFIG.botName) {
  if (FOOTER) return FOOTER
  const first = String(botName).replace(/[^\x20-\x7E]/g, '').trim().split(/\s+/)[0] || ''
  return first.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bot'
}

export const CAPTION_LIMIT = 1024 // batas aman caption WhatsApp
const CENTER_W = 28 // lebar acuan penengahan judul/pembatas/footer
const DIVIDER = '─'.repeat(18)

// ── tipografi ────────────────────────────────────────────────
// bold-italic unicode (mathematical italic) untuk JUDUL/KATEGORI/FOOTER saja —
// memberi kesan "judul" di WhatsApp, sementara nama command tetap huruf normal
// supaya mudah dibaca & disalin. Matikan dengan MENU_STYLE=plain.
export function boldItalic(s = '') {
  if (STYLE === 'plain') return String(s)
  return String(s).replace(/[A-Za-z]/g, (ch) => {
    const base = ch === ch.toUpperCase() ? 0x1d468 : 0x1d482
    return String.fromCodePoint(base + (ch.toUpperCase().charCodeAt(0) - 65))
  })
}

// ── tipografi ────────────────────────────────────────────────
export function dispWidth(s = '') {
  let w = 0
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0)
    if (cp === 0xfe0f || cp === 0x200d) continue
    if ((cp >= 0x1f000 && cp <= 0x1faff) || (cp >= 0x2600 && cp <= 0x27bf) || (cp >= 0x2b00 && cp <= 0x2bff)) w += 2
    else w += 1
  }
  return w
}
export const visibleWidth = (s = '') => dispWidth(String(s).replace(/[`*_~]/g, ''))

const center = (s, w = CENTER_W) => {
  const pad = Math.max(0, w - dispWidth(s))
  return ' '.repeat(Math.floor(pad / 2)) + s
}

// ── isi menu (command ASLI dari src/commands/index.js) ───────
const SECTIONS = [
  {
    emoji: '🎨',
    title: 'STICKER',
    items: [
      { cmd: 'sticker', label: 'sticker', desc: 'foto/video jadi stiker' },
      { cmd: 'brat', label: 'brat', desc: 'teks jadi stiker brat' },
      { cmd: 'animatedtext', label: 'animatedtext', desc: 'stiker brat animasi' },
      { cmd: 'toimg', label: 'toimg', desc: 'stiker jadi gambar' },
      { cmd: 'rmbg', label: 'rmbg', desc: 'hapus bg (lokal)' },
      { cmd: 'arbg', label: 'arbg', desc: 'hapus bg via Adobe Express' },
    ],
  },
  {
    emoji: '📥',
    title: 'DOWNLOADER',
    items: [
      { cmd: 'youtube', label: 'youtube', desc: 'unduh video YouTube' },
      { cmd: 'youtube', label: 'ytmp3', desc: 'unduh audio YouTube' },
      { cmd: 'tiktok', label: 'tiktok', desc: 'unduh video/foto TikTok' },
      { cmd: 'preview', label: 'prw', desc: 'preview TikTok sekali lihat' },
      { cmd: 'instagram', label: 'instagram', desc: 'media Instagram' },
      { cmd: 'facebook', label: 'facebook', desc: 'unduh Facebook/Reel' },
      { cmd: 'twitter', label: 'twitter · pinterest · pixiv' },
      { cmd: 'bilibili', label: 'bilibili · douyin · rednote' },
    ],
  },
  {
    emoji: '🎧',
    title: 'MUSIC',
    items: [
      { cmd: 'soundcloud', label: 'soundcloud · spotify · applemusic' },
    ],
  },
  {
    emoji: '🛠',
    title: 'TOOLS',
    items: [
      { cmd: 'cek', label: 'cek', desc: 'lihat tujuan asli link' },
      { cmd: 'help', label: 'menu', desc: 'tampilkan menu bot' },
    ],
  },
]

export function buildMenu(commands = [], { botName = CONFIG.botName, prefix = CONFIG.prefix, prefixes = CONFIG.prefixes, banner = '' } = {}) {
  // command debug (mis. !prwdoctor) tidak ditampilkan di menu
  commands = commands.filter((c) => !c.hidden)
  const byName = new Map(commands.map((c) => [c.name, c]))
  const used = new Set()
  const out = []

  if (banner) {
    out.push('```')
    out.push(banner)
    out.push('```')
    out.push('')
  }

  // ── judul ────────────────────────────────────────────────
  const clean = (botName.replace(/[^\x00-\x7F]/g, '').trim().toUpperCase() || 'COLUMBINA BOT')
  out.push(center(`✦  ${boldItalic(clean)}  ✦`))
  out.push(center('WhatsApp Bot'))
  out.push('')
  out.push(center(DIVIDER))
  out.push('')

  // prefix: tampilkan semuanya kalau lebih dari satu (mis. ! dan .)
  if (prefixes.length > 1) {
    out.push(center(`prefix: ${prefixes.join(' atau ')}`))
    out.push('')
  }

  // ── kategori ─────────────────────────────────────────────
  for (const sec of SECTIONS) {
    const items = sec.items.filter((it) => byName.has(it.cmd))
    if (!items.length) continue
    out.push(`  ${sec.emoji}  ${boldItalic(sec.title)}`)
    for (const it of items) {
      used.add(it.cmd)
      // label gabungan (mis. 'twitter · pinterest · pixiv') menandai semua command-nya
      for (const tok of String(it.label ?? '').split('·').map((s) => s.trim())) {
        if (byName.has(tok)) used.add(tok)
      }
      const label = it.label ?? it.cmd
      out.push(it.desc ? `  • !${label}  ${it.desc}` : `  • !${label}`)
    }
    out.push('')
  }

  // ── command yang belum dikategorikan: jangan sampai hilang ──
  const rest = commands.filter((c) => !used.has(c.name))
  if (rest.length) {
    out.push(`  ✨  ${boldItalic('LAINNYA')}`)
    for (const c of rest) {
      out.push(c.description ? `  • !${c.name}  ${c.description}` : `  • !${c.name}`)
    }
    out.push('')
  }

  // ── alias (opsional) ─────────────────────────────────────
  if (SHOW_ALIAS) {
    out.push('')
    out.push(center(DIVIDER))
    out.push('')
    out.push(`  🔖  ${boldItalic('ALIAS')}`)
    for (const c of commands) {
      if (!c.aliases?.length) continue
      out.push(`    ${c.aliases.map((a) => `${prefix}${a}`).join(' · ')}`)
    }
  }

  // ── footer ───────────────────────────────────────────────
  out.push(center(DIVIDER))
  out.push('')
  out.push(center(`🌙 ${boldItalic(footerLabel(botName))}`))

  return out.join('\n')
}

function readBannerText() {
  try {
    if (!fs.existsSync(BANNER_TEXT_FILE)) return ''
    return fs.readFileSync(BANNER_TEXT_FILE, 'utf8').replace(/\s+$/, '')
  } catch {
    return ''
  }
}

export default {
  name: 'help',
  aliases: ['menu', 'h', '?'],
  description: 'Buka menu perintah',
  usage: '!menu',

  async execute(ctx) {
    const { commands } = await import('./index.js')
    const banner = MODE === 'text' ? readBannerText() : ''
    const text = buildMenu(commands, { banner })

    // mode gambar: gambar + menu sebagai SATU pesan (caption)
    if (MODE === 'image' && fs.existsSync(BANNER_IMAGE)) {
      try {
        const buf = fs.readFileSync(BANNER_IMAGE)
        const opts = { mimetype: 'image/jpeg' }
        if (text.length <= CAPTION_LIMIT) {
          if (typeof ctx.sendMedia === 'function') await ctx.sendMedia('image', buf, text, opts)
          else await ctx.send({ image: buf, caption: text, ...opts })
          return
        }
        if (typeof ctx.sendMedia === 'function') await ctx.sendMedia('image', buf, '', opts)
        else await ctx.send({ image: buf, ...opts })
      } catch {
        /* banner gagal: menu teks tetap dikirim */
      }
    }

    await ctx.reply(text)
  },
}