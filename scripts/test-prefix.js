// Tes prefix ganda: command harus jalan dengan "!" DAN "." (tanpa WhatsApp).
//   node scripts/test-prefix.js
import 'dotenv/config'
import { parseMessage, matchPrefix } from '../src/core/parser.js'
import { findCommand, commands } from '../src/commands/index.js'
import { CONFIG } from '../src/config.js'

let fail = 0
const ok = (cond, label, extra = '') => {
  if (cond) console.log(`  ✅ ${label}${extra ? ` — ${extra}` : ''}`)
  else { console.log(`  ❌ ${label}${extra ? ` — ${extra}` : ''}`); fail++ }
}

const raw = (text, { jid = '123@s.whatsapp.net', fromMe = false } = {}) => ({
  key: { remoteJid: jid, fromMe, id: 'X1' },
  message: { conversation: text },
})
const parse = (text, opts) => parseMessage(raw(text, opts), {})

// ── 1. daftar prefix dari config ─────────────────────────────
console.log('\n[1] konfigurasi prefix')
ok(Array.isArray(CONFIG.prefixes) && CONFIG.prefixes.length >= 2, 'lebih dari satu prefix aktif', JSON.stringify(CONFIG.prefixes))
ok(CONFIG.prefixes.includes('!') && CONFIG.prefixes.includes('.'), 'prefix "!" dan "." dua-duanya aktif', JSON.stringify(CONFIG.prefixes))
ok(CONFIG.prefix === CONFIG.prefixes[0], 'prefix utama = yang pertama (dipakai di menu)', CONFIG.prefix)

// ── 2. command terbaca dengan kedua prefix ───────────────────
console.log('\n[2] parsing command')
const c1 = parse('!menu')
ok(c1?.isCommand === true && c1.command === 'menu', '!menu → command "menu"', JSON.stringify(c1?.command))
const c2 = parse('.menu')
ok(c2?.isCommand === true && c2.command === 'menu', '.menu → command "menu"', JSON.stringify(c2?.command))
ok(findCommand(c1.command)?.name === 'help' && findCommand(c2.command)?.name === 'help', 'keduanya menemukan command help')

const c3 = parse('.PRW https://vt.tiktok.com/ABC')
ok(c3?.command === 'prw', 'prefix + nama command kapital tetap jalan', JSON.stringify(c3?.command))
ok(c3?.args?.[0] === 'https://vt.tiktok.com/ABC', 'argumen utuh setelah prefix "."', JSON.stringify(c3?.args))
ok(c3?.rawArgs === 'https://vt.tiktok.com/ABC', 'rawArgs benar (tanpa sisa prefix)', JSON.stringify(c3?.rawArgs))

const c4 = parse('!tiktok audio https://youtu.be/x')
ok(c4?.command === 'tiktok' && c4.args.join(' ') === 'audio https://youtu.be/x', '!tiktok audio <url> → args utuh', JSON.stringify(c4?.args))
ok(c4?.rawArgs === 'audio https://youtu.be/x', 'rawArgs utuh', JSON.stringify(c4?.rawArgs))

// ── 3. teks biasa tidak boleh jadi command ───────────────────
console.log('\n[3] teks biasa tidak salah dianggap command')
ok(parse('menu')?.isCommand === false, 'tanpa prefix → bukan command')
ok(parse('...')?.command !== 'menu', '"..." tidak jadi command menu', JSON.stringify(parse('...')?.command))
ok(!findCommand(parse('...')?.command ?? ''), '"..." tidak ketemu command apa pun')
ok(!findCommand(parse('.5 juta')?.command ?? ''), '".5 juta" tidak ketemu command')
ok(!findCommand(parse('.oke siap')?.command ?? ''), '".oke siap" tidak ketemu command')
ok(parse('harga 1.500.000 rupiah')?.isCommand === false, 'angka bertitik di tengah teks aman')
ok(parse('. ')?.isCommand === false, 'prefix sendirian → bukan command')

// ── 4. semua command bisa dipanggil dua-duanya ───────────────
console.log('\n[4] semua command & alias lewat kedua prefix')
const labels = [...new Set(commands.flatMap((c) => [c.name, ...(c.aliases ?? [])]))]
const gagal = []
for (const l of labels) {
  for (const p of ['!', '.']) {
    const ctx = parse(`${p}${l}`)
    if (!ctx?.isCommand || findCommand(ctx.command)?.name === undefined) gagal.push(`${p}${l}`)
  }
}
ok(!gagal.length, `${labels.length} nama/alias × 2 prefix semuanya terdeteksi${gagal.length ? ` — gagal: ${gagal}` : ''}`)

// ── 5. balas pesan (quoted) tetap jalan dengan prefix "." ────
console.log('\n[5] prefix "." + pesan yang dibalas')
const LINK = 'https://www.tiktok.com/@a/video/7412345678901234567'
const q = parseMessage({
  key: { remoteJid: '123@g.us', fromMe: false, participant: '62811@s.whatsapp.net' },
  message: {
    extendedTextMessage: {
      text: '.prw',
      contextInfo: { stanzaId: 'Q1', participant: '62899@s.whatsapp.net', quotedMessage: { extendedTextMessage: { text: `nih ${LINK}` } } },
    },
  },
}, {})
ok(q?.command === 'prw', '.prw dari pesan yang dibalas terdeteksi', JSON.stringify(q?.command))
ok(q?.quoted?.text?.includes(LINK), 'teks pesan yang dibalas terbaca')

// ── 6. prefix panjang (multi-karakter) tidak salah potong ────
console.log('\n[6] prefix lebih panjang dari 1 karakter (dipisah koma)')
ok(matchPrefix('!!menu', ['!!', '.']) === '!!', 'prefix terpanjang menang ("!!" bukan "!")', String(matchPrefix('!!menu', ['!!', '.'])))
ok(matchPrefix('.menu', ['!!', '.']) === '.', 'prefix "." tetap kepilih saat berdampingan dengan "!!"', String(matchPrefix('.menu', ['!!', '.'])))
ok(matchPrefix('menu', ['!!', '.']) === null, 'tanpa prefix → null')
ok(matchPrefix('', ['!']) === null, 'teks kosong → null')

// konfigurasi dari env (bentuk "!!,.") juga harus terbaca benar
process.env.PREFIX = '!!,.'
const { CONFIG: C2 } = await import(`../src/config.js?cachebust=${Date.now()}`)
ok(C2.prefixes.includes('!!') && C2.prefixes.includes('.'), 'env "!!,." → dua prefix (multi-karakter)', JSON.stringify(C2.prefixes))
process.env.PREFIX = '!.'
const { CONFIG: C3 } = await import(`../src/config.js?cachebust=${Date.now() + 1}`)
ok(C3.prefixes.join('') === '!.', 'env "!." → tiap karakter jadi prefix', JSON.stringify(C3.prefixes))
delete process.env.PREFIX

console.log(fail ? `\n❌ ${fail} tes GAGAL\n` : '\n✅ semua tes prefix lulus\n')
process.exit(fail ? 1 : 0)
