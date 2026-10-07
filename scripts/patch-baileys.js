// Patch kecil untuk @whiskeysockets/baileys (7.0.0-rc14).
//
// MASALAH: relayMessage() menghitung atribut `mediatype` untuk node <enc> dari
// pesan MENTAH (`getMediaType(message)`), padahal `getMediaType` hanya melihat
// field tingkat atas (imageMessage/videoMessage/...). Untuk pesan yang isinya
// dibungkus — terutama `viewOnceMessageV2` — hasilnya kosong, jadi stanza yang
// keluar TIDAK punya `mediatype="video"`.
//
// AKIBATNYA (terbukti dari diagnosa 2026-09-15, `!prwdoctor`):
// server WhatsApp tetap mengirim <ack class=message> (jadi kelihatan "terkirim"),
// tapi pesan TIDAK PERNAH sampai ke HP penerima — tidak ada <receipt> sama sekali.
// Teks dan video biasa (tanpa bungkus) sampai dalam ~1 detik.
//
// PERBAIKAN: hitung mediatype dari isi yang bungkusnya sudah dibuka
// (`normalizeMessageContent`). Untuk pesan biasa hasilnya identik, jadi aman.
//
// Dijalankan otomatis lewat `npm install` (script `postinstall`) dan idempoten:
// kalau sudah dipatch, tidak diapa-apakan.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TARGET = path.join(__dirname, '..', 'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Socket', 'messages-send.js')

const ASLI = 'const mediaType = getMediaType(message);'
const PATCH = 'const mediaType = getMediaType(normalizeMessageContent(message) || message); // patched: mediatype untuk pesan berbungkus (view once)'

if (!fs.existsSync(TARGET)) {
  console.log('[patch-baileys] dilewati: baileys belum terpasang')
  process.exit(0)
}

const src = fs.readFileSync(TARGET, 'utf8')

if (src.includes(PATCH)) {
  console.log('[patch-baileys] sudah dipatch — tidak ada perubahan')
  process.exit(0)
}

if (!src.includes(ASLI)) {
  console.log('[patch-baileys] PERINGATAN: baris target tidak ditemukan — versi baileys berubah?')
  console.log('[patch-baileys] cek manual: getMediaType(message) di relayMessage (lib/Socket/messages-send.js)')
  process.exit(0)
}

fs.writeFileSync(TARGET, src.replace(ASLI, PATCH))
console.log('[patch-baileys] ✅ mediatype dihitung dari isi yang sudah dibuka bungkusnya (view once bisa sampai)')
