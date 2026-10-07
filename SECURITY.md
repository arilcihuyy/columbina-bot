# Kebijakan Keamanan

## Melaporkan kerentanan

Kalau kamu menemukan masalah keamanan, **jangan** buka issue publik. Kirim
laporan lewat salah satu jalur ini:

- GitHub Security Advisory (tab **Security** → *Report a vulnerability*), atau
- pesan pribadi ke pemilik repo (lihat profil [@arilcihuyy](https://github.com/arilcihuyy)).

Sertakan: versi Node, langkah reproduksi, dan dampaknya. Kami berusaha membalas
dalam beberapa hari.

## Hal penting sebelum kamu menjalankan bot ini

Bot ini memakai **nomor WhatsApp pribadimu** lewat Baileys (WhatsApp Web
protocol, tidak resmi). Pahami risikonya:

1. **Folder `sessions/` = kunci akunmu.** Isinya kredensial sesi WhatsApp.
   - Jangan pernah di-commit, dikirim ke orang lain, atau di-upload ke cloud publik.
   - Kalau bocor, orang lain bisa memakai sesi itu. Segera logout dari
     *WhatsApp → Linked Devices* dan hapus foldernya.
   - Folder ini sudah masuk `.gitignore` — jangan diubah.
2. **`.env` berisi nomor & cookie pribadimu.** Sama, jangan di-commit
   (sudah masuk `.gitignore`).
3. **Isi `OWNER_NUMBER`.** Kalau dibiarkan kosong, siapa pun yang tahu nomor
   bot bisa memakai semua command — termasuk downloader berat dan `!arbg`
   yang memakai resource servermu.
4. **Pemakaian tidak resmi berisiko ban.** Baileys bukan API resmi WhatsApp.
   Pemakaian agresif (spam, blast, nomor baru langsung kirim banyak pesan)
   bisa membuat nomor diblokir. Pakai wajar.
5. **Scalper pihak ketiga.** Fitur downloader (`!tiktok`, `!instagram`, dst.)
   mengambil halaman publik dari platform pihak ketiga. Kalau platform mengubah
   struktur atau memblokir IP server, fitur bisa gagal — itu wajar, bukan bug
   keamanan.
6. **Tidak ada telemetri.** Bot ini tidak mengirim data ke server mana pun milik
   pengembang. Semua data (sesi, temp, cookie) berjalan di mesinmu sendiri.
   Satu-satunya koneksi keluar adalah ke layanan yang kamu minta
   (platform download, Adobe Express untuk `!arbg`, CDN emoji, dsb).

## Yang TIDAK kami lakukan

- Tidak menyimpan data pengguna di server kami.
- Tidak menyertakan font berlisensi komersial (Arial © Monotype) di repo —
  kalau kamu mau memakainya, taruh sendiri di `assets/fonts/` (sudah
  di-ignore oleh git).

## Versi yang didukung

Hanya versi terbaru di branch `main` yang menerima perbaikan keamanan.