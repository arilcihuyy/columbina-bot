// Tes fitur unduh FOTO TikTok + selector (tanpa WhatsApp, tanpa jaringan).
//   node scripts/test-tiktok-photo.js
import 'dotenv/config'
import tiktokCommand from '../src/commands/tiktok.js'
import { tiktokService } from '../src/features/tiktok.js'
import {
  parseSelection, isSelectionLike, buildPhotoSelector, numberGrid,
  setPending, getPending, clearPending, clearAllPending, pendingCount, MAX_PER_REQUEST,
} from '../src/features/tiktok-photo.js'

let fail = 0
const ok = (cond, label, extra = '') => {
  if (cond) console.log(`  ✅ ${label}${extra ? ` — ${extra}` : ''}`)
  else { console.log(`  ❌ ${label}${extra ? ` — ${extra}` : ''}`); fail++ }
}

const T = 'https://www.tiktok.com/@user/photo/7412345678901234567'
const JID = '6281234567890@s.whatsapp.net'
const IMG = (n) => `https://p16.tiktokcdn.com/img-${n}.jpeg`

// ── 1. parseSelection ────────────────────────────────────────
console.log('\n[1] parseSelection()')
const p = (s, total = 5) => parseSelection(s, total)
ok(JSON.stringify(p('2').indexes) === '[2]' && p('2').mode === 'indexes', 'satu nomor → [2]')
ok(JSON.stringify(p('1 3 5').indexes) === '[1,3,5]', 'beberapa nomor (spasi) → [1,3,5]')
ok(JSON.stringify(p('1,3').indexes) === '[1,3]', 'beberapa nomor (koma) → [1,3]')
ok(JSON.stringify(p('2-4').indexes) === '[2,3,4]', 'rentang 2-4 → [2,3,4]')
ok(JSON.stringify(p('4-2').indexes) === '[2,3,4]', 'rentang terbalik 4-2 tetap benar')
ok(JSON.stringify(p('3 1 3 1').indexes) === '[1,3]', 'duplikat dibuang + diurutkan')
ok(JSON.stringify(p('semua').indexes) === '[1,2,3,4,5]' && p('semua').mode === 'all', '"semua" → semua nomor')
ok(JSON.stringify(p('ALL').indexes) === '[1,2,3,4,5]', '"ALL" (huruf besar) jalan')
ok(p('batal').mode === 'cancel', '"batal" → cancel')
ok(p('').mode === 'empty', 'kosong → empty')
ok(p('abc').mode === 'invalid', 'teks ngawur → invalid')
ok(p('9', 5).mode === 'invalid' && p('9', 5).invalid.includes('9'), 'nomor di luar jangkauan → invalid + dilaporkan')
ok(JSON.stringify(p('1 9').indexes) === '[1]' && p('1 9').invalid.includes('9'), 'campuran: yang valid jalan, yang luar diabaikan')
ok(JSON.stringify(p('1-2 4').indexes) === '[1,2,4]', 'rentang + nomor tunggal dicampur')

console.log('\n[2] isSelectionLike()')
ok(isSelectionLike('2') && isSelectionLike('1 3') && isSelectionLike('2-4'), 'nomor/rentang → true')
ok(isSelectionLike('semua') && isSelectionLike('batal'), 'kata kunci → true')
ok(!isSelectionLike('audio https://x.com'), 'perintah audio → false')
ok(!isSelectionLike('https://vt.tiktok.com/ABC'), 'URL → false')
ok(!isSelectionLike(''), 'kosong → false')

// ── 3. teks daftar pilihan ───────────────────────────────────
console.log('\n[3] buildPhotoSelector()')
const sel = buildPhotoSelector({ total: 6, title: 'judul panjang sekali '.repeat(4), author: 'user', url: T, prefix: '!' })
ok(sel.includes('6 foto'), 'menyebut jumlah foto')
ok(/\b1 2 3 4 5 6\b/.test(sel), 'grid nomor lengkap')
ok(sel.includes('!tiktok 3') && sel.includes('!tiktok 1 3 5') && sel.includes('!tiktok 2-4') && sel.includes('!tiktok semua'), 'contoh cara memilih lengkap')
ok(sel.includes(`!prw ${T}`), 'menawarkan lihat dulu semua (prw)')
ok(!/undefined/.test(sel), 'tidak ada "undefined"')
const struktur = sel.split('\n').filter((l) => !l.startsWith('🎵') && !l.includes('http'))
ok(!struktur.some((l) => l.length > 34), `baris struktur ≤34 kolom${struktur.find((l) => l.length > 34) ? ` — lewat: ${JSON.stringify(struktur.find((l) => l.length > 34))}` : ''}`)
ok(!sel.split('\n').filter((l) => !l.includes('http')).some((l) => l.length > 46), 'tidak ada baris kelewat panjang (judul dipotong, link boleh panjang)')
ok(sel.split('\n').some((l) => l.startsWith('!prw http')), 'link prw ditulis di baris sendiri (mudah disalin)')
ok(buildPhotoSelector({ total: 20, url: T }).includes('maks 10'), 'post banyak → ada catatan maks 10 sekali kirim')
ok(numberGrid(23) === '1 2 3 4 5 6 7 8 9 10\n11 12 13 14 15 16 17 18 19 20\n21 22 23', 'grid >10 dipecah per baris')

// ── 4. alur command dengan ctx tiruan ────────────────────────
console.log('\n[4] alur command !tiktok')
const origResolve = tiktokService.resolve
const origToBuffer = tiktokService.toBuffer
const photos = (n) => Array.from({ length: n }, (_, i) => IMG(i + 1))
const stub = (result) => { tiktokService.resolve = async () => result; tiktokService.toBuffer = async () => Buffer.from('JPEGDATA') }

function makeCtx(args = [], { quoted = null, rawArgs = null } = {}) {
  const sent = []
  return {
    sent,
    ctx: {
      sock: {}, jid: JID,
      args,
      rawArgs: rawArgs ?? args.join(' '),
      quoted,
      pushName: 'Pengguna',
      reply: async (t) => { sent.push({ type: 'reply', text: String(t) }); return { key: { id: 'r' } } },
      send: async (o) => { sent.push({ type: 'raw', keys: Object.keys(o ?? {}) }) },
      sendMedia: async (kind, buf, caption, opts) => { sent.push({ type: 'media', kind, bytes: buf?.length ?? 0, caption: caption ?? '', opts }); return { key: { id: 'm' } } },
      react: async (e) => { sent.push({ type: 'react', emoji: e }) },
      typing: async () => { sent.push({ type: 'typing' }) },
    },
  }
}
const media = (sent) => sent.filter((s) => s.type === 'media')
const replies = (sent) => sent.filter((s) => s.type === 'reply').map((s) => s.text).join('\n')

clearAllPending()

// 4a. post foto 5 gambar → TIDAK boleh langsung unduh semua
stub({ type: 'slideshow', images: photos(5), title: 'lagu keren', author: 'user', duration: 0 })
{
  const { ctx, sent } = makeCtx([T])
  await tiktokCommand.execute(ctx)
  ok(media(sent).length === 0, 'foto >1: TIDAK ada gambar yang langsung diunduh')
  ok(replies(sent).includes('5 foto') && replies(sent).includes('!tiktok semua'), 'daftar pilihan dikirim ke user')
  ok(pendingCount() === 1, 'sesi pilih foto tersimpan')
  ok(getPending(JID)?.images?.length === 5, '5 gambar tersimpan di sesi')
}

// 4b. pilih satu nomor
{
  const { ctx, sent } = makeCtx(['2'], { rawArgs: '2' })
  await tiktokCommand.execute(ctx)
  const m = media(sent)
  ok(m.length === 1 && m[0].kind === 'image', 'pilih "2" → 1 gambar dikirim')
  ok(m[0].caption.includes('lagu keren'), 'gambar pertama dapat caption judul/author', JSON.stringify(m[0].caption))
  ok(sent.some((s) => s.emoji === '✅'), 'react ✅ setelah terkirim')
}

// 4c. pilih beberapa (spasi & rentang)
{
  const { ctx, sent } = makeCtx(['1', '3'], { rawArgs: '1 3' })
  await tiktokCommand.execute(ctx)
  const m2 = media(sent)
  ok(m2.length === 2, 'pilih "1 3" → 2 gambar')
  ok(m2[1]?.caption.includes('3/5'), 'gambar kedua dapat penanda nomor', JSON.stringify(m2[1]?.caption))
}
{
  const { ctx, sent } = makeCtx(['2-4'], { rawArgs: '2-4' })
  await tiktokCommand.execute(ctx)
  ok(media(sent).length === 3, 'pilih "2-4" → 3 gambar')
}

// 4d. nomor di luar jangkauan
{
  const { ctx, sent } = makeCtx(['9'], { rawArgs: '9' })
  await tiktokCommand.execute(ctx)
  ok(media(sent).length === 0, 'nomor di luar jangkauan → tidak kirim apa-apa')
  ok(replies(sent).includes('tidak jelas'), 'user diberi tahu pilihannya tidak jelas')
}
{
  const { ctx, sent } = makeCtx(['1', '9'], { rawArgs: '1 9' })
  await tiktokCommand.execute(ctx)
  ok(media(sent).length === 1, 'campuran valid+tidak → kirim yang valid saja')
  ok(replies(sent).includes('9'), 'nomor yang diabaikan dilaporkan')
}

// 4e. semua + sesi ditutup
{
  const { ctx, sent } = makeCtx(['semua'], { rawArgs: 'semua' })
  await tiktokCommand.execute(ctx)
  ok(media(sent).length === 5, 'pilih "semua" → semua gambar dikirim (5)')
  ok(pendingCount() === 0, 'sesi ditutup setelah semua terkirim')
}

// 4f. batal
{
  stub({ type: 'slideshow', images: photos(3), title: 'x', author: 'u' })
  const { ctx } = makeCtx([T])
  await tiktokCommand.execute(ctx)
  ok(pendingCount() === 1, 'sesi baru terbuka')
  const { ctx: ctx2, sent: sent2 } = makeCtx(['batal'], { rawArgs: 'batal' })
  await tiktokCommand.execute(ctx2)
  ok(pendingCount() === 0, '"batal" menutup sesi')
  ok(replies(sent2).includes('dibatalkan'), 'user diberi tahu dibatalkan')
}

// 4g. batas maks per kirim
{
  clearAllPending()
  stub({ type: 'slideshow', images: photos(12), title: 'banyak', author: 'u' })
  const { ctx } = makeCtx([T])
  await tiktokCommand.execute(ctx)
  const { ctx: ctx2, sent: sent2 } = makeCtx(['semua'], { rawArgs: 'semua' })
  await tiktokCommand.execute(ctx2)
  ok(media(sent2).length === MAX_PER_REQUEST, `"semua" pada 12 gambar → ${MAX_PER_REQUEST} dulu`)
  ok(replies(sent2).includes('11 12'), 'sisa foto ditawarkan lagi')
  ok(pendingCount() === 1, 'sesi tetap terbuka karena belum lengkap')
  const { ctx: ctx3, sent: sent3 } = makeCtx(['11', '12'], { rawArgs: '11 12' })
  await tiktokCommand.execute(ctx3)
  ok(media(sent3).length === 2, 'sisa bisa diambil di perintah berikutnya')
  ok(pendingCount() === 0, 'sesi ditutup setelah semua lengkap')
}

// 4h. satu gambar → langsung kirim, tanpa selector
{
  clearAllPending()
  stub({ type: 'slideshow', images: photos(1), title: 'solo', author: 'u' })
  const { ctx, sent } = makeCtx([T])
  await tiktokCommand.execute(ctx)
  ok(media(sent).length === 1, 'foto tunggal langsung dikirim')
  ok(!replies(sent).includes('foto'), 'tidak ada daftar pilihan untuk 1 foto')
  ok(pendingCount() === 0, 'tidak ada sesi tersisa')
}

// 4i. video & audio tidak berubah
{
  clearAllPending()
  stub({ type: 'video', url: 'https://v16.tiktokcdn.com/v.mp4', title: 'vid', author: 'u', duration: 10, width: 720, height: 1280 })
  const { ctx, sent } = makeCtx([T])
  await tiktokCommand.execute(ctx)
  ok(media(sent).length === 1 && media(sent)[0].kind === 'video', 'video → 1 video terkirim')

  stub({ type: 'audio', url: 'https://v16.tiktokcdn.com/a.mp3', title: 'lagu', author: 'u', duration: 10 })
  const { ctx: ctxA, sent: sentA } = makeCtx(['audio', T], { rawArgs: `audio ${T}` })
  await tiktokCommand.execute(ctxA)
  ok(media(sentA).length === 1 && media(sentA)[0].kind === 'audio', 'audio → 1 audio terkirim')
  ok(media(sentA)[0].opts?.mimetype === 'audio/mpeg', 'audio pakai mimetype audio/mpeg')
}

// 4j. balas pesan daftar (ada link di dalamnya) tapi ketik nomor → tetap pilih, bukan resolve ulang
{
  clearAllPending()
  stub({ type: 'slideshow', images: photos(4), title: 'x', author: 'u' })
  const { ctx } = makeCtx([T])
  await tiktokCommand.execute(ctx)
  const quoted = { text: `Lihat dulu semua: !prw ${T}`, isMedia: false }
  const { ctx: ctxQ, sent: sentQ } = makeCtx(['2'], { quoted, rawArgs: '2' })
  await tiktokCommand.execute(ctxQ)
  ok(media(sentQ).length === 1, 'balas pesan daftar + ketik nomor → tetap pilih foto')
}

// 4k. ketik nomor tanpa sesi terbuka
{
  clearAllPending()
  const { ctx, sent } = makeCtx(['3'], { rawArgs: '3' })
  await tiktokCommand.execute(ctx)
  ok(media(sent).length === 0 && replies(sent).includes('Belum ada daftar'), 'tanpa sesi → pesan jelas')
}

// 4l. URL dari pesan yang dibalas
{
  clearAllPending()
  stub({ type: 'slideshow', images: photos(2), title: 'q', author: 'u' })
  const { ctx, sent } = makeCtx([], { quoted: { text: `nih ${T}`, isMedia: false }, rawArgs: '' })
  await tiktokCommand.execute(ctx)
  ok(replies(sent).includes('2 foto'), 'link dari pesan yang dibalas ikut dipakai')
}

// 4m. validasi & usage
{
  clearAllPending()
  const { ctx, sent } = makeCtx([])
  await tiktokCommand.execute(ctx)
  ok(replies(sent).includes('Usage'), 'tanpa argumen → usage')

  const { ctx: ctxY, sent: sentY } = makeCtx(['https://youtu.be/abc'], { rawArgs: 'https://youtu.be/abc' })
  await tiktokCommand.execute(ctxY)
  ok(replies(sentY).includes('Cuma link TikTok'), 'link non-TikTok ditolak')

  const { ctx: ctxE, sent: sentE } = makeCtx([T])
  tiktokService.resolve = async () => { throw new Error('Post tidak tersedia: x') }
  await tiktokCommand.execute(ctxE)
  ok(sentE.some((s) => s.emoji === '❌') && replies(sentE).includes('tidak tersedia'), 'error resolve dilaporkan jujur')
}

// 4n. sesi kedaluwarsa
{
  clearAllPending()
  setPending(JID, { images: photos(3), total: 3, title: 'x', author: 'u' })
  process.env.TIKTOK_PENDING_TTL_MS = '1'
  await new Promise((r) => setTimeout(r, 15))
  ok(getPending(JID) === null, 'sesi kedaluwarsa otomatis')
  const { ctx, sent } = makeCtx(['1'], { rawArgs: '1' })
  await tiktokCommand.execute(ctx)
  ok(replies(sent).includes('Belum ada daftar'), 'sesi kedaluwarsa → dianggap tidak ada')
  delete process.env.TIKTOK_PENDING_TTL_MS
}

// 4o. gagal unduh gambar
{
  clearAllPending()
  stub({ type: 'slideshow', images: photos(3), title: 'x', author: 'u' })
  const { ctx } = makeCtx([T])
  await tiktokCommand.execute(ctx)
  tiktokService.toBuffer = async () => { throw new Error('timeout') }
  const { ctx: ctxF, sent: sentF } = makeCtx(['1'], { rawArgs: '1' })
  await tiktokCommand.execute(ctxF)
  ok(media(sentF).length === 0 && sentF.some((s) => s.emoji === '❌'), 'gagal unduh → react ❌ + lapor, bukan diam')
}

clearAllPending()
tiktokService.resolve = origResolve
tiktokService.toBuffer = origToBuffer

// ── 5. opsional: post foto ASLI (resolve + download sungguhan) ──
const realIdx = process.argv.indexOf('--real')
if (realIdx > -1 && process.argv[realIdx + 1]) {
  const url = process.argv[realIdx + 1]
  console.log(`\n[5] live: ${url}`)
  clearAllPending()
  const { ctx, sent } = makeCtx([url])
  await tiktokCommand.execute(ctx)
  const reply = replies(sent)
  console.log(reply)
  ok(media(sent).length === 0, 'live: tidak langsung unduh semua gambar')
  const total = Number(reply.match(/Ada (\d+) foto/)?.[1] ?? 0)
  ok(total > 0, 'live: jumlah foto terbaca', String(total))
  if (total > 1) {
    ok(pendingCount() === 1, 'live: sesi pilih foto terbuka')
    const pilih = total >= 3 ? '1 3' : '1'
    const { ctx: ctx2, sent: sent2 } = makeCtx(pilih.split(' '), { rawArgs: pilih })
    await tiktokCommand.execute(ctx2)
    const m = media(sent2)
    ok(m.length === pilih.split(' ').length, `live: pilih "${pilih}" → ${m.length} gambar terkirim`)
    ok(m.every((x) => x.bytes > 5000), 'live: gambar terunduh (bukan file kosong)', m.map((x) => `${(x.bytes / 1024).toFixed(0)}KB`).join(', '))
  }
} else {
  console.log('\n[5] dilewati (pakai `--real <url post foto>` buat tes jaringan)')
}

clearAllPending()
console.log(fail ? `\n❌ ${fail} tes GAGAL\n` : '\n✅ semua tes foto TikTok lulus\n')
process.exit(fail ? 1 : 0)
