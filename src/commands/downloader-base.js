// Pabrik command downloader — satu tempat untuk pola yang sama:
// ambil URL dari pesan -> resolve lewat service -> kirim medianya.
//
// Dipakai oleh command hasil integrasi scrapr (twitter, pinterest, pixiv, bilibili,
// douyin, rednote, soundcloud, spotify, applemusic) supaya tidak ada 9 salinan kode
// yang isinya sama.
import { pickUrl } from './preview.js'
import { CONFIG } from '../config.js'

const MAX_BYTES = 64 * 1024 * 1024 // batas aman media WhatsApp
const big = (n) => `${(n / 1024 / 1024).toFixed(1)}MB`

// Sumber yang isinya lagu: pakai ikon 🎵, sisanya media biasa 📌.
const SUMBER_MUSIK = new Set(['Spotify', 'Apple Music', 'SoundCloud'])

function caption({ title, author, source, index, total }) {
  const lines = []
  if (title) lines.push(`${SUMBER_MUSIK.has(source) ? '🎵' : '📌'} ${title}`)
  if (author) lines.push(`👤 ${author}`)
  if (total > 1) lines.push(`🖼️ ${index}/${total}`)
  return lines.join('\n')
}

/**
 * @param {object} opsi
 * @param {string} opsi.name        nama command (tanpa prefix)
 * @param {string[]} opsi.aliases
 * @param {string} opsi.description
 * @param {string} opsi.usage       contoh pemakaian, tampil kalau URL tidak ada
 * @param {RegExp} opsi.urlPattern  pola untuk memastikan domainnya benar
 * @param {object} opsi.service     service: { resolve(url), toBuffer(url, referer) }
 * @param {string} [opsi.kind]      'media' (default) atau 'music'
 * @param {number} [opsi.maxItems]  maksimum item yang dikirim untuk post multi-gambar
 */
export function makeDownloadCommand({ name, aliases = [], description, usage, urlPattern, service, kind = 'media', maxItems = 10, label = name }) {
  const P = () => CONFIG.prefix
  const usageText = () => `Usage: \`${P()}${name} <url>\`\n${usage}`

  return {
    name,
    aliases,
    description,
    usage,

    async execute(ctx) {
      const args = ctx.args ?? []
      const url = pickUrl(args, ctx.quoted?.text).replace(/[>,.)\]]+$/, '')

      if (!url) return ctx.reply(usageText())
      if (urlPattern && !urlPattern.test(url)) {
        return ctx.reply(`❌ Link itu bukan link ${label} yang dikenali.`)
      }

      await ctx.typing()
      await ctx.react('⏳')

      try {
        const data = await service.resolve(url)

        // ── jalur musik: cover + audio ──
        if (kind === 'music') {
          const dl = await service.download(data)
          if (dl.buf.length > MAX_BYTES) throw new Error(`File terlalu besar (${big(dl.buf.length)}).`)

          const judul = [data.artist, data.title].filter(Boolean).join(' - ') || data.title
          const cap = `🎵 ${judul}\n📻 ${data.source}${dl.note ? `\n↳ ${dl.note}` : ''}`

          if (data.cover) {
            try {
              const cov = await service.toBuffer(data.cover)
              await ctx.sendMedia('image', cov.buf, cap)
            } catch {
              await ctx.reply(cap)
            }
          } else {
            await ctx.reply(cap)
          }

          const mime = dl.contentType?.includes('mp4') ? 'audio/mp4' : 'audio/mpeg'
          await ctx.sendMedia('audio', dl.buf, '', { mimetype: mime, ptt: false })
          await ctx.react('✅')
          return null
        }

        // ── jalur media biasa ──
        const items = (data.items ?? []).slice(0, maxItems)
        if (!items.length) throw new Error('Tidak ada media yang bisa diunduh dari link itu.')

        let terkirim = 0
        let gagal = 0
        let lastError = null
        for (const [i, it] of items.entries()) {
          try {
            // Coba URL pilihan dulu; kalau gagal, coba kandidat lain dari media yang sama.
            const kandidat = [it, ...(data.alternatif ?? []).filter((a) => a.type === it.type)]
            let terkirimItem = false
            let errorTerakhir = null
            for (const k of kandidat) {
              try {
                const buf = await service.toBuffer(k.url, k.referer ?? data.referer)
                if (buf.buf.length > MAX_BYTES) throw new Error('terlalu besar')
                const cap = caption({ title: i === 0 ? data.title : null, author: i === 0 ? data.author : null, source: data.source, index: i + 1, total: items.length })

                if (buf.kind === 'video') await ctx.sendMedia('video', buf.buf, cap, { mimetype: 'video/mp4' })
                else if (buf.kind === 'audio') await ctx.sendMedia('audio', buf.buf, cap, { mimetype: 'audio/mpeg', ptt: false })
                else if (buf.kind === 'image') await ctx.sendMedia('image', buf.buf, cap)
                else await ctx.sendMedia('document', buf.buf, cap, { mimetype: buf.contentType || 'application/octet-stream', fileName: `${name}-${i + 1}` })
                terkirimItem = true
                break
              } catch (e) {
                errorTerakhir = e
              }
            }
            if (terkirimItem) terkirim++
            else {
              gagal++
              if (errorTerakhir) lastError = errorTerakhir
            }
          } catch {
            gagal++
          }
        }

        if (!terkirim) {
          await ctx.react('❌')
          const sebab = lastError ? ` (${lastError.message})` : ''
          return ctx.reply(`❌ Medianya gagal diunduh${sebab}. Coba lagi sebentar ya.`)
        }

        await ctx.react('✅')
        const catatan = []
        if (data.method) catatan.push(`sumber: ${data.method}`)
        if (gagal) catatan.push(`${gagal} item gagal`)
        if (data.items.length > items.length) catatan.push(`dikirim ${items.length} dari ${data.items.length}`)
        return catatan.length > 1 ? ctx.reply(catatan.join(' • ')) : null
      } catch (err) {
        await ctx.react('❌')
        return ctx.reply(`❌ ${err.message}`)
      }
    },
  }
}