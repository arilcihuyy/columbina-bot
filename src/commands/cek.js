// !cek <link> — lihat ke mana sebuah link pergi, tanpa membukanya di HP.
//
// Tidak ada halaman yang di-render di HP user, jadi popup, tab baru, dan
// tawaran APK tidak pernah muncul. Bot yang menelusuri sendiri (lihat
// src/features/linkcheck.js).
import { resolveLink, normalizeUrl } from '../features/linkcheck.js'

const URL_RE = /https?:\/\/[^\s]+|(?<![\w@.])(?:[\w-]+\.)+[a-z]{2,}(?:\/[^\s]*)?/i

// Ambil link dari argumen, kalau kosong dari pesan yang dibalas.
export function pickUrl(args = [], quotedText = '') {
  const all = [...(args || []), String(quotedText || '')].join(' ').trim()
  if (!all) return ''
  const m = all.match(URL_RE)
  return m ? m[0].replace(/[>,.)\]]+$/, '') : ''
}

const AMBANG_LAMBAT_MS = 12000

export function formatReport(r) {
  const lines = []
  const u = (() => {
    try {
      return new URL(r.finalUrl)
    } catch {
      return null
    }
  })()
  const bersih = u ? `${u.hostname}${u.pathname}${u.search}` : r.finalUrl

  if (r.finalUrl === r.input) {
    lines.push('🔗 Itu sudah link aslinya — tidak ada redirect.')
    lines.push(bersih)
  } else {
    lines.push('🔗 *Tujuan:*')
    lines.push(bersih)
  }

  if (r.file?.label) lines.push(`📦 ${r.file.label}`)

  if (r.route?.length > 1) {
    const jalur = r.route.slice(-4).join(' → ')
    lines.push(`🛣 ${jalur}${r.gates ? ` (${r.gates} gerbang iklan)` : ''}`)
  } else if (r.gates) {
    lines.push(`🛣 ${r.gates} gerbang iklan`)
  }

  if (r.warnings?.length) {
    lines.push('')
    for (const w of r.warnings) lines.push(`⚠️ ${w}`)
  }

  return lines.join('\n')
}

export default {
  name: 'cek',
  aliases: ['ceklink', 'unshort', 'jelas'],
  description: 'Lihat tujuan asli sebuah link tanpa membukanya',
  usage: '!cek <link> — atau balas pesan yang berisi link',

  async execute(ctx) {
    const raw = pickUrl(ctx.args, ctx.quoted?.text)
    if (!raw) {
      return ctx.reply('Usage: `!cek <link>`\natau balas pesan yang ada link-nya.')
    }
    const url = normalizeUrl(raw)
    if (!url) return ctx.reply('❌ Itu bukan link yang bisa kubaca.')

    await ctx.typing()
    await ctx.react('🔎')

    // Gerbang iklan bisa 15-30 detik. Kasih kabar dulu supaya tidak dikira mati.
    let kabar = null
    const timer = setTimeout(() => {
      kabar = ctx.send('⏳ Ini link lewat gerbang iklan. Aku telusuri dulu ya, bisa 30-60 detik...').catch(() => {})
    }, AMBANG_LAMBAT_MS)

    try {
      const r = await resolveLink(url, { log: (m) => console.log(`[cek] ${m}`) })
      clearTimeout(timer)
      await kabar
      await ctx.react('✅')
      console.log(`[cek] ${url} → ${r.finalUrl} (${r.hops} hop, ${r.gates} gerbang, ${r.ms}ms${r.viaTor ? ', via tor' : ''})`)
      return ctx.reply(formatReport(r))
    } catch (err) {
      clearTimeout(timer)
      await kabar
      await ctx.react('❌')
      console.error('[cek] gagal:', err?.message)
      return ctx.reply(`❌ ${err.message}`)
    }
  },
}
