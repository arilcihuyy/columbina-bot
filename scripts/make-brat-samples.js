// Bikin contoh stiker brat untuk dites user: pendek → sangat panjang.
// Setelan: PERSIS situs (putih, teks hitam, font 30/300, stretch 1.5×, justify),
// TAPI font dikecilkan otomatis kalau teks tidak muat (mode 'shrink').
import fs from 'fs'
import { renderBratFrame, BRAT_FONT_PX } from '../src/features/brat.js'
import { toStickerBuffer } from '../src/features/media.js'

const OUT = process.env.BRAT_OUT || '/tmp/brat-uji'
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const kasus = [
  ['1-pendek', 'selamat pagi dunia'],
  ['2-sedang', 'tugas matematika nomor 12 selesai'],
  ['3-panjang', 'ini contoh teks yang panjang banget supaya kelihatan bagaimana brat membungkus kalimat panjang jadi banyak baris'],
  ['4-emoji', 'aku suka kamu 🌙'],
  ['5-satu-kata', 'brat'],
  ['6-tka', 'besok kumpul tugas tka jangan lupa ya'],
  ['7-sangat-panjang', 'ini contoh teks yang panjang banget supaya kelihatan bagaimana brat membungkus kalimat panjang jadi banyak baris dan tetap masuk ke dalam frame stiker tanpa terpotong sedikit pun ya'],
  ['8-daun', 'tugas tka matematika fisika kimia biologi sejarah geografi ekonomi sosiologi bahasa indonesia bahasa inggris seni budaya pjok prakarya kewirausahaan'],
]

for (const [nama, teks] of kasus) {
  // ukuran stiker asli (320) + metadata, seperti yang dikirim bot
  const { buffer: png320, info: i320 } = await renderBratFrame(teks, { size: 320 })
  const sticker = await toStickerBuffer(png320, { packName: 'Columbina', packPublish: 'Sample', emojis: ['✍️'] })
  fs.writeFileSync(`${OUT}/${nama}-stiker.webp`, sticker)
  fs.writeFileSync(`${OUT}/${nama}-320.png`, png320)

  // versi besar untuk dilihat jelas
  const { buffer: big, info } = await renderBratFrame(teks, { size: 1000 })
  fs.writeFileSync(`${OUT}/${nama}.png`, big)

  const fontNormal = 1000 * (BRAT_FONT_PX / 512) // ukuran NORMAL pada kanvas 1000px
  const tanda = info.fontSize < fontNormal - 0.5 ? `dikecilkan dari ${fontNormal.toFixed(0)}px` : 'ukuran normal'
  console.log(`${nama}: ${info.fontSize.toFixed(1)}px@1000 (${tanda}) | ${info.lines.length} baris | muat: ${info.muat} | skalaAman ${info.skalaAman.toFixed(2)}`)
}

console.log('\nfile:', fs.readdirSync(OUT).length, 'berkas di', OUT)
