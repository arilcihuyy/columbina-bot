# src/vendor/scrapr — kode pihak ketiga

Modul di folder ini diambil apa adanya (hampir verbatim) dari repo publik:

- Sumber: https://github.com/coflyn/scrapr
- Lisensi: MIT (lihat repo asal)
- Tanggal ambil: 2026-09-25

Tujuannya: melengkapi fitur downloader bot untuk platform yang belum ada
(Twitter/X, Pinterest, Pixiv, Bilibili, Douyin, RedNote, SoundCloud) dan jadi
jalur cadangan untuk platform yang sudah ada (TikTok, Instagram, Facebook).

Setiap file disalin dari `lib/<platform>/<metode>/index.js` di repo asal, lalu
hanya ditambah komentar header. Logika aslinya tidak diubah, supaya gampang
dibandingkan dengan upstream saat ada perubahan.

## Modul yang diambil

| Berkas | Asal | Dipakai untuk |
| --- | --- | --- |
| `twitter-direct.cjs` | `lib/twitter/direct` | jalur utama Twitter/X (fxtwitter) |
| `twitter-tweeload.cjs` | `lib/twitter/tweeload` | cadangan Twitter/X |
| `pinterest-direct.cjs` | `lib/pinterest/direct` | Pinterest |
| `pixiv-ajax.cjs` | `lib/pixiv/ajax` | Pixiv |
| `bilibili-direct.cjs` | `lib/bilibili/direct` | Bilibili |
| `douyin-direct.cjs` | `lib/douyin/direct` | Douyin |
| `rednote-direct.cjs` | `lib/rednote/direct` | RedNote/Xiaohongshu |
| `soundcloud-klickaud.cjs` | `lib/soundcloud/klickaud` | SoundCloud (MP3 utuh) |
| `tiktok-snaptik.cjs` | `lib/tiktok/snaptik` | cadangan TikTok |
| `tiktok-ssstik.cjs` | `lib/tiktok/ssstik` | cadangan TikTok |
| `instagram-downreels.cjs` | `lib/instagram/downreels` | cadangan Instagram |
| `facebook-snapsave.cjs` | `lib/facebook/snapsave` | cadangan Facebook |

## Modul yang TIDAK diambil (sudah diuji dari server ini)

| Asal | Alasan |
| --- | --- |
| `lib/youtube/*` (ytmp3, yt-dlp, play-dl, ytdl-core) | Hanya pembungkus API pihak ketiga, tanpa pilihan kualitas/cookies. `yt-dlp` milik bot sudah lebih lengkap. |
| `lib/spotify/*`, `lib/applemusic/*`, `lib/bandcamp/*` | Mati dari IP server: CAPTCHA (soundloaders), 403, atau cuma mengembalikan gambar cover. Fitur musik bot memakai jalur sendiri (lihat `features/spotify.js`). |
| `lib/threads/threadster` | Tidak menemukan tautan media sama sekali saat diuji. |
| `lib/tiktok/savetik` | Butuh browser sungguhan (puppeteer headful). |
| `lib/tiktok/tikdownloader`, `lib/instagram/indown`, `lib/instagram/snapsave`, `lib/tiktok/tiktokio` | 403 dari IP server (paling-paling sementara; bisa dicoba lagi nanti). |
| `lib/instagram/snapinsta` | Butuh playwright + browser binary (~300MB) dan tetap timeout. |

Catatan keamanan: file `.cjs` di sini hanya dipanggil lewat `loadScraper()` di
`src/features/dlmux.js`, tidak pernah menerima input mentah dari pengguna
selain URL yang sudah divalidasi pola.