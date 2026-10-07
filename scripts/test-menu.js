// Preview + validasi tampilan !menu (tanpa WhatsApp). — kontrak v5 (Versi B, 2026-10-05)
//   node scripts/test-menu.js
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import help, { buildMenu, visibleWidth, CAPTION_LIMIT } from '../src/commands/help.js'
import { commands } from '../src/commands/index.js'

let fail = 0
const check = (cond, label) => { if (!cond) { fail++; console.log(`❌ ${label}`) } else console.log(`✅ ${label}`) }

const NAME = process.env.BOT_NAME || 'columbina bot🌙'
const menu = buildMenu(commands, { botName: NAME })
const lines = menu.split('\n')

console.log(`=========== PREVIEW (!menu) — ${NAME} ===========`)
console.log(menu)
console.log('=================================================')
console.log()

// ── 1. semua command ASLI muncul, tanpa command karangan ────
// label gabungan ('  • !twitter · pinterest · pixiv') menandai semua command-nya
const labelTokens = new Set()
for (const l of lines.filter((l) => /^ {2}• /.test(l))) {
  const label = l.replace(/^ {2}• !/, '').split('  ')[0]
  for (const tok of label.split('·').map((s) => s.trim())) if (tok) labelTokens.add(tok)
}
for (const c of commands) {
  const labels = [c.name, ...(c.aliases ?? [])]
  // command debug (hidden) memang sengaja tidak ditampilkan di menu
  check(c.hidden || labels.some((l) => menu.includes(`!${l}`) || labelTokens.has(l)), `command !${c.name} tampil di menu`)
}
const mentioned = [...new Set([...menu.matchAll(/!([a-z0-9-]+)/g)].map((m) => m[1]))]
const known = new Set(commands.flatMap((c) => [c.name, ...(c.aliases ?? [])]))
const invented = mentioned.filter((n) => !known.has(n))
check(!invented.length, `tidak ada command karangan${invented.length ? ` — ketemu: ${invented}` : ''}`)

// ── 2. tanpa ASCII art / box besar / Braille ────────────────
check(!/[╔╚║╭╮╰╯┌┐└┘├┤│┃█▀▄░▒▓⣀-⣿]/.test(menu), 'tanpa box/block/Braille (bukan ASCII art)')
check(!/```/.test(menu), 'tanpa code block ASCII')

// ── 3. tipografi (v5: layout bullet, judul/kategori tetap bold-italic unicode) ──
const isMath = (s) => /[\u{1D468}-\u{1D4FF}]/u.test(s)
check(/✦/.test(lines[0] ?? '') && isMath(lines[0] ?? ''), 'judul pakai ✦ + bold-italic nama bot (baris 1)')
check(lines.slice(0, 4).some((l) => /WhatsApp Bot/.test(l)), 'subjudul "WhatsApp Bot"')
const cmdLines = lines.filter((l) => /^ {2}• /.test(l))
check(cmdLines.length >= 7, `daftar command pakai "  • " (${cmdLines.length} baris)`)
check(!cmdLines.some(isMath), 'nama command tetap huruf normal (mudah dibaca)')
const sectionLines = lines.filter((l) => /^ {2}[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\s{2}/u.test(l))
check(sectionLines.length >= 3, `${sectionLines.length} kategori dengan emoji`)
check(sectionLines.every(isMath), 'judul kategori pakai bold-italic unicode')

// ── 4. struktur & spacing ───────────────────────────────────
check(lines.filter((l) => /^─{10,}$/.test(l.trim())).length >= 2, 'ada 2 pembatas tipis ──── (atas & bawah)')
const stickerLine = lines.find((l) => /^ {2}• !sticker/.test(l)) || ''
check(stickerLine.includes('foto/video jadi stiker'), 'deskripsi menyatu di baris command (• !cmd  desc)')
check(!/Online|Status:/.test(menu), 'tanpa footer status')
const prefixLines = lines.filter((l) => /prefix:/i.test(l))
// baris petunjuk prefix hanya muncul kalau ada >1 prefix (mis. "!." = ! dan .)
const prefixes = (process.env.PREFIX || '!').includes(',')
  ? (process.env.PREFIX || '!').split(',').map((s) => s.trim()).filter(Boolean)
  : [...new Set((process.env.PREFIX || '!').split(''))]
if (prefixes.length > 1) {
  check(prefixLines.length === 1 && prefixes.every((p) => prefixLines[0].includes(p)),
    `satu baris petunjuk prefix memuat semuanya (${prefixes.join(', ')})${prefixLines.length ? ` — ${JSON.stringify(prefixLines)}` : ''}`)
} else {
  check(prefixLines.length === 0, 'prefix tunggal → tanpa baris petunjuk prefix')
}
check(lines.filter((l) => !l.trim()).length >= 8, 'cukup whitespace (≥8 baris kosong)')
const tooWide = lines.filter((l) => visibleWidth(l) > 38) // lebar aman WA 30-38 (riset skill), maks 40
check(!tooWide.length, `semua baris ≤38 kolom${tooWide.length ? ` — lewat: ${JSON.stringify(tooWide)}` : ''}`)
check(!/undefined/.test(menu), 'tidak ada "undefined" nyempil')
check(!/[☾☽]/.test(menu), 'ornamen bulan lama (☾) hilang')

// ── 5. eksekusi: banner + menu jadi SATU pesan ──────────────
const sent = []
const ctx = {
  reply: async (t) => { sent.push({ type: 'text', text: String(t) }) },
  sendMedia: async (kind, buf, caption, opts) => { sent.push({ type: 'media', kind, bytes: buf?.length ?? 0, mime: opts?.mimetype, caption: caption ?? '' }) },
  send: async (o) => { sent.push({ type: 'raw', keys: Object.keys(o ?? {}) }) },
}
await help.execute(ctx)
const mode = (process.env.MENU_BANNER || 'image').toLowerCase()
if (mode === 'image') {
  check(sent.length === 1, `hanya SATU pesan dikirim — terkirim ${sent.length}`)
  check(sent[0]?.kind === 'image', 'pesan berisi gambar banner')
  check(sent[0]?.mime === 'image/jpeg', 'banner berformat JPEG')
  check(sent[0]?.caption === menu, 'menu jadi caption gambar (menyatu)')
  check((sent[0]?.caption ?? '').length <= CAPTION_LIMIT, `caption ${(sent[0]?.caption ?? '').length} karakter ≤ ${CAPTION_LIMIT}`)
} else {
  check(sent.length === 1 && sent[0].type === 'text', `mode ${mode}: satu pesan teks`)
}

// ── 6. aset banner ─────────────────────────────────────────
const img = path.resolve(process.cwd(), 'assets/columbina/banner.jpg')
check(fs.existsSync(img), 'assets/columbina/banner.jpg ada')
if (fs.existsSync(img)) {
  const b = fs.readFileSync(img)
  check(b.subarray(0, 2).toString('hex') === 'ffd8', 'banner JPEG valid')
  check(b.length < 300_000, `ukuran banner ${(b.length / 1024).toFixed(0)} KB (aman buat WA)`)
}

console.log(`\npanjang menu: ${menu.length} karakter`)
console.log(fail ? `${fail} pemeriksaan gagal ❌` : 'SEMUA PEMERIKSAAN LULUS ✅')
process.exit(fail ? 1 : 0)