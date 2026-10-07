// Satu tempat untuk SEMUA file sementara bot.
//
// ⚠️ JANGAN kembali memakai `os.tmpdir()` langsung untuk kerja (write/read file).
// Kejadian nyata 2026-09-15: dir kerja bot di /tmp dihapus saat bot masih jalan
// (bersih-bersih /tmp) → bot tetap `online` tapi SEMUA konversi gagal
// `ENOENT: no such file or directory, open '/tmp/wa-lite-bot/xxxxxxxx.img'`
// sampai bot di-restart.
//
// Aturan sekarang (dua lapis, jangan dilepas salah satu):
//  1. Semua kerja tulis-baca file ada di folder MILIK PROJECT (`./tmp`), bukan /tmp
//     → tidak bisa disentuh pembersih /tmp (systemd-tmpfiles-clean, cron, cleanup manual).
//  2. Folder kerja dibuat BARU tiap pemakaian (`workDir()`) dan dihapus di `finally`
//     → kalau isinya hilang karena sebab apa pun, pemakaian berikutnya tetap jalan
//       tanpa perlu restart bot (self-healing).
//
// Bisa dipindah lewat env `BOT_TEMP_DIR` (mis. ke disk lain kalau project penuh).
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Root project = dua tingkat di atas src/features/ (path dari lokasi file, bukan cwd,
// supaya tetap benar walau pm2 jalan dengan cwd lain).
const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))

export const TEMP_ROOT = process.env.BOT_TEMP_DIR
  ? path.resolve(process.env.BOT_TEMP_DIR)
  : path.join(PROJECT_ROOT, 'tmp')

/** Dir kerja baru (unik) di dalam TEMP_ROOT. Buat sendiri kalau belum ada. */
export function workDir(prefix = 'work-') {
  fs.mkdirSync(TEMP_ROOT, { recursive: true })
  return fs.mkdtempSync(path.join(TEMP_ROOT, prefix))
}

/** Hapus dir kerja. Aman dipanggil walau dirnya sudah hilang. */
export function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* biarkan */ }
}

/** Tulis buffer ke dir kerja sambil mengembalikan path-nya (hemat satu mkdir). */
export function writeTemp(dir, name, data) {
  const p = path.join(dir, name)
  fs.writeFileSync(p, data)
  return p
}
