// Pendaftaran font sendiri (custom) untuk canvas.
//
// Kenapa perlu? Brat aslinya pakai **Arial Narrow** (lihat src/features/brat.js).
// Arial Narrow itu font KOMERSIAL milik Monotype — tidak boleh disebar ulang, jadi
// tidak bisa ditaruh di repo publik. Yang gratis & paling mirip bentuknya:
//   - Archivo Narrow (lisensi SIL OFL) → huruf 't' potongannya MIRING dan 'a' punya
//     ekor melengkung, sama seperti Arial. Ini pengganti terdekat.
//   - Nimbus Sans Narrow (URW, GPL/free) → klon Helvetica: 't' rata, 'G' berspur.
//     Lebarnya sama (metrik cocok), tapi bentuk hurufnya gaya Helvetica.
//
// Cara pakai: taruh file .ttf/.otf di `assets/fonts/`, otomatis terdaftar di canvas.
// Urutan prioritas diambil dari env BRAT_FONT (dipisah koma) lalu daftar cadangan.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { GlobalFonts } from '@napi-rs/canvas'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const FONT_DIR = process.env.BRAT_FONT_DIR || path.resolve(__dirname, '../../assets/fonts')

/** Nama keluarga font yang berhasil didaftarkan dari assets/fonts. */
export const registeredFamilies = []

function registerDir(dir) {
  if (!fs.existsSync(dir)) return
  for (const file of fs.readdirSync(dir)) {
    if (!/\.(ttf|otf|ttc)$/i.test(file)) continue
    const full = path.join(dir, file)
    try {
      // nama keluarga diambil dari isi font; tambahkan juga nama dari nama file
      const fromFile = file.replace(/\.(ttf|otf|ttc)$/i, '')
      GlobalFonts.registerFromPath(full, fromFile)
      registeredFamilies.push(fromFile)
    } catch (err) {
      console.warn(`[font] gagal daftar ${file}: ${err.message}`)
    }
  }
}

registerDir(FONT_DIR)

/** Daftar keluarga font yang tersedia di canvas (sistem + custom). */
export const availableFamilies = () => GlobalFonts.families.map((f) => f.family)

/**
 * Susun daftar font-family CSS: env BRAT_FONT dulu, lalu cadangan — tapi hanya
 * yang benar-benar ADA di canvas (biar yang terpakai jelas), ditutup `sans-serif`.
 */
export function fontStack(envValue, fallback = []) {
  const generik = new Set(['sans-serif', 'serif', 'monospace'])
  const daftar = [...new Set([
    ...String(envValue || '').split(',').map((s) => s.trim()).filter(Boolean),
    ...fallback,
    ...registeredFamilies,
  ])]

  const ada = new Set(availableFamilies())
  const konkret = daftar.filter((f) => !generik.has(f) && ada.has(f))
  const umum = daftar.filter((f) => generik.has(f))
  const terpakai = [...new Set([...konkret, ...umum])]
  // pastikan selalu ada penutup generik
  if (!terpakai.some((f) => generik.has(f))) terpakai.push('sans-serif')
  return terpakai.map((f) => (generik.has(f) ? f : `"${f}"`)).join(', ')
}
