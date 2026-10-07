![Columbina Bot](assets/columbina/banner.jpg)

# 🌙 Columbina Bot

**Bot WhatsApp lengkap dalam satu perintah setup.** Stiker (foto, video, teks, brat animasi), hapus background, downloader 15+ platform, dan pemeriksa link — tanpa database, tanpa framework berat, tanpa build step.

[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen?logo=node.js)](https://nodejs.org)
[![Baileys](https://img.shields.io/badge/baileys-7.0.0--rc14-25D366?logo=whatsapp)](https://github.com/whiskeysockets/Baileys)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![PRs](https://img.shields.io/badge/PRs-welcome-success)](CONTRIBUTING.md)

```bash
git clone https://github.com/arilcihuyy/columbina-bot.git
cd columbina-bot
npm install && npm run setup       # wizard: tanya nama, nomor, prefix → siap jalan
npm start
```

Wizard-nya benar-benar mengantar kamu sampai bot hidup — cek Node & ffmpeg, bikin `.env`, apply patch Baileys, jalankan diagnosa, sampai bantu login WhatsApp (kode pairing atau QR).

> **English:** A batteries-included WhatsApp bot on Baileys — stickers (image/video/text/animated brat), background remover, 15+ platform downloaders, and a shortlink inspector. Node ≥ 20. Run `npm install && npm run setup && npm start`. Docs are in Indonesian; the wizard speaks for itself.

---

## ✨ Kenapa bot ini

- **Setup satu perintah.** `npm run setup` menulis konfigurasi, memeriksa dependensi sistem, dan memberi tahu persis kalau ada yang kurang.
- **Diagnosa sendiri.** `npm run doctor` memeriksa Node, ffmpeg, yt-dlp, font, folder kerja, izin tulis, dan konfigurasi — lengkap dengan saran perbaikan.
- **Tanpa database.** Sesi WhatsApp disimpan sebagai file, state kecil (pending foto TikTok, dsb.) disimpan di memori. Clone → jalan.
- **Ringan untuk VPS kecil.** Semua proses berat (`rmbg`, `arbg`) dijalankan sebagai child process dengan `nice`, jadi koneksi Baileys tidak ikut putus saat CPU penuh.
- **Tes beneran, bukan tes kosong.** `npm run test:all` menguji 8 modul: konversi media, layout menu, multi-prefix, render stiker, parser foto TikTok, pesan sekali-lihat, dan `ytmp3`.
- **Gratis & terbuka.** MIT. Tanpa telemetri. Tidak ada server milik pengembang yang ikut campur.

---

## 📋 Daftar perintah

Prefix default `!` (bisa diganti, bahkan multi-prefix: `!`, `.`, `/`).

### 🎨 Stiker

| Perintah | Alias | Fungsi |
|---|---|---|
| `!sticker` | `!s`, `!stiker`, `!sgif` | Foto/video → stiker. Reply mediaya, atau kirim media dengan caption `!sticker Nama Pack` |
| `!brat` | `!ttp`, `!t2s`, `!textsticker` | Teks → stiker gaya **brat** (latar putih, huruf tebal) |
| `!animatedtext` | `!atts`, `!attp`, `!bratanim` | Teks → stiker brat **animasi** (efek zoom halus) |
| `!toimg` | `!toimage`, `!img`, `!png` | Stiker → foto PNG |
| `!rmbg` | `!removebg`, `!nobg` | Hapus background, lokal & gratis (model rembg di server sendiri) |
| `!arbg` | `!adobebg`, `!bgadobe` | Hapus background lewat Adobe Express — kualitas paling rapi |

### 📥 Downloader

| Perintah | Alias | Fungsi |
|---|---|---|
| `!tiktok` | `!tt`, `!ttdl` | Video / foto / audio TikTok (tanpa watermark) |
| `!preview` | `!prw`, `!pv` | Preview video TikTok **sekali lihat** (view once) |
| `!youtube` | `!yt`, `!ytdl` | Video YouTube (batas resolusi & ukuran aman) |
| `!ytmp3` | `!yta` | Audio YouTube → MP3 |
| `!instagram` | `!ig`, `!reels` | Post / reel / carousel Instagram |
| `!facebook` | `!fb`, `!fbdl` | Video Facebook & Reel |
| `!twitter` | `!tw`, `!x` | Video/gambar Twitter/X |
| `!pinterest` | `!pin` | Gambar/video Pinterest |
| `!pixiv` | `!px` | Ilustrasi Pixiv |
| `!bilibili` | `!bili` | Video Bilibili |
| `!douyin` | `!dy` | Video Douyin |
| `!rednote` | `!xhs` | Video/gambar RedNote (Xiaohongshu) |
| `!soundcloud` | `!sc` | Lagu SoundCloud → MP3 |
| `!spotify` | `!sp` | Ambil lagu dari link Spotify |
| `!applemusic` | `!am` | Ambil lagu dari link Apple Music |

### 🛠 Tools

| Perintah | Alias | Fungsi |
|---|---|---|
| `!cek` | `!ceklink`, `!jelas` | Lihat **tujuan asli** sebuah link tanpa membukanya (anti-shortlink/scam, ikut redirect lewat Tor) |
| `!menu` | `!help`, `!h`, `!?` | Tampilkan menu |

Kirim `!menu` di WhatsApp untuk melihat versi yang sudah disesuaikan dengan konfigurasimu.

---

## 🚀 Pemasangan

### 1. Yang wajib ada

| Kebutuhan | Kenapa | Cara pasang (Ubuntu/Debian) |
|---|---|---|
| **Node.js ≥ 20** | menjalankan bot | `curl -fsSL https://deb.nodesource.com/setup_20.x \| sudo -E bash - && sudo apt install -y nodejs` |
| **ffmpeg** | semua konversi media | `sudo apt install -y ffmpeg` |

Wizard & `npm run doctor` akan mengingatkan kalau salah satunya belum ada.

### 2. Jalankan wizard

```bash
git clone https://github.com/arilcihuyy/columbina-bot.git
cd columbina-bot
npm install          # otomatis menjalankan patch Baileys (lihat catatan di bawah)
npm run setup        # ← wizard
```

Wizard menanyakan sedikit hal saja:

1. **Nama bot** (dipakai di menu & paket stiker)
2. **Prefix** — `!` (default), atau beberapa sekaligus seperti `!.`
3. **Nomor pemilik** — pengaman supaya hanya kamu yang bisa memakai bot
4. **Nomor HP untuk login** — dapat kode pairing, atau kosongkan untuk QR
5. Setelah itu: `.env` ditulis, patch Baileys diterapkan, diagnosa dijalankan,
   dan bot bisa langsung dinyalakan dari wizard.

### 3. Login WhatsApp

- **Kode pairing (disarankan):** isi nomor HP kamu di wizard, lalu di HP buka
  *WhatsApp → Perangkat Tertaut → Tautkan Perangkat → Tautkan dengan nomor telepon*
  dan masukkan 8 karakter yang muncul di terminal.
- **QR:** kosongkan nomor, lalu scan QR yang tampil di terminal.

Sesi tersimpan di `sessions/` supaya tidak perlu login ulang. **Folder ini berisi
kredensial akunmu — jangan pernah di-commit atau dibagikan** (sudah ada di `.gitignore`).

### 4. Jalankan

```bash
npm start            # jalan biasa
npm run dev          # auto-restart saat file berubah (pakai --watch)
```

---

## ⚙️ Konfigurasi

Semua lewat `.env` (lihat [`.env.example`](.env.example) — lengkap dengan komentar).
Yang paling sering dipakai:

| Variabel | Default | Fungsi |
|---|---|---|
| `BOT_NAME` | `Columbina Bot` | Nama bot di menu & paket stiker |
| `PREFIX` | `!` | Prefix command. `!` satu karakter; `!.` berarti `!` dan `.`; `!!,.` multi-karakter |
| `OWNER_NUMBER` | *(kosong)* | Nomor pemilik (62xxx). Kosong = semua orang boleh pakai command |
| `PAIRING_NUMBER` | *(kosong)* | Nomor untuk kode pairing; kosong = login QR |
| `LOG_LEVEL` | `info` | `silent` … `trace` |
| `RESPOND_TO_SELF` | `false` | Balas pesan yang dikirim dari nomor sendiri? |
| `SESSION_PATH` | `./sessions` | Lokasi sesi login |
| `MENU_BANNER` | `image` | `image` (gambar), `text` (ASCII), `off` |
| `MENU_BANNER_IMAGE_FILE` | `assets/columbina/banner.jpg` | Ganti banner menu |
| `MENU_STYLE` | `math` | `math` (judul bold-italic unicode) atau `plain` |
| `MENU_FOOTER` | kata pertama `BOT_NAME` | Teks paling bawah menu |
| `BOT_TEMP_DIR` | `./tmp` | Folder kerja. **Jangan arahkan ke `/tmp`** (bisa terhapus saat proses jalan) |

Fitur opsional punya variabelnya sendiri — `YT_COOKIES_PATH`, `IG_COOKIE`,
`RMBG_PYTHON`, `LINKCHECK_TOR`, dan lain-lain. Semuanya dijelaskan di
[`.env.example`](.env.example).

---

## 🧩 Fitur opsional (pilih sesuai kebutuhan)

<details>
<summary><b>YouTube di VPS</b> — kenapa sering gagal & cara mengatasinya</summary>

IP datacenter biasanya diblokir YouTube ("Sign in to confirm you're not a bot").
Solusinya memberi yt-dlp cookie dari browser yang sudah login:

1. Pasang ekstensi Chrome **Get cookies.txt LOCALLY**, buka `youtube.com`, export.
2. Taruh file di server (mis. `./cookies/youtube.txt`).
3. Set `YT_COOKIES_PATH=./cookies/youtube.txt`, restart bot.

Butuh biner `yt-dlp`:

```bash
pipx install yt-dlp        # atau: uv tool install yt-dlp
# atau unduh binary resmi dari github.com/yt-dlp/yt-dlp/releases
```

Kalau binary-nya tidak ada di `PATH`, isi `YTDLP_PATH`.
</details>

<details>
<summary><b>Instagram</b> — "postnya private/dihapus" padahal publik</summary>

Instagram menutup akses anonim dari IP server. Isi `IG_COOKIE` dengan cookie
session browser yang sudah login: DevTools (F12) → Network → klik request ke
`instagram.com` → copy header `cookie:` → tempel di `.env`.
</details>

<details>
<summary><b>!rmbg (hapus background lokal)</b></summary>

```bash
python3 -m venv ~/rembg-venv
~/rembg-venv/bin/pip install rembg onnxruntime
```

Bot otomatis mencari `~/rembg-venv/bin/python`. Kalau ditaruh di tempat lain,
set `RMBG_PYTHON`. Model default `u2netp` (ringan, cocok VPS 1 GB RAM);
ganti ke `u2net` lewat `RMBG_MODEL=u2net` kalau server kamu kuat.
</details>

<details>
<summary><b>!arbg (Adobe Express — kualitas terbaik)</b></summary>

Butuh `xvfb` dan Chrome/Chromium di server, plus **login Adobe sekali**:

```bash
sudo apt install -y xvfb
```

Prosesnya memakai profil Chrome khusus supaya sesi login Adobe tersimpan dan
tidak mengganggu browser lain. Jalankan sekali secara manual dengan tampilan
(`xvfb-run`), login, lalu sesi itu dipakai bot seterusnya. Fitur ini berat
(±40–60 detik per gambar), jadi hanya untuk yang benar-benar butuh hasil rapi.
</details>

<details>
<summary><b>!cek (anti-shortlink)</b> — lewat Tor</summary>

`!cek` mengikuti rantai redirect untuk melihat tujuan asli sebuah link. Supaya
tidak cepat diblokir Cloudflare, secara default ia lewat Tor di
`127.0.0.1:9050`:

```bash
sudo apt install -y tor && sudo systemctl enable --now tor
```

Kalau tidak mau pakai Tor, set `LINKCHECK_TOR=` (kosong) untuk koneksi langsung.
</details>

---

## 🩺 Diagnosa & tes

```bash
npm run doctor       # periksa environment — ada saran perbaikan tiap masalah
npm run doctor -- --json   # output JSON (untuk otomatisasi/monitoring)
npm run test:all     # 8 modul tes: media, menu, prefix, stiker, TikTok, prw, yt
```

`npm run doctor` memeriksa: versi Node, ffmpeg & ffprobe, yt-dlp, font stiker,
folder kerja, izin tulis, file konfigurasi, sampai apakah nomor pemilik sudah
diisi. Setiap masalah disertai perintah perbaikan.

---

## 📁 Struktur proyek

```
src/
├── index.js              # entry: koneksi Baileys, router pesan
├── config.js             # baca .env → CONFIG
├── core/parser.js        # pesan mentah → ctx (text, args, quoted media)
├── commands/             # 1 file = 1 command (tipis, hanya parsing + balas)
├── features/             # logika murni (bebas framework): media, brat, tiktok, …
│   ├── media.js          # image/video → webp sticker, webp → png
│   ├── brat.js           # render teks → stiker brat (+ animasi)
│   ├── fonts.js          # daftar font stiker
│   ├── youtube.js        # pembungkus yt-dlp
│   ├── viewonce.js       # pengiriman pesan sekali-lihat + pelacakan ACK
│   └── linkcheck.js      # penelusur redirect (lewat Tor)
└── utils/                # helper kecil (log, dll)

scripts/
├── setup.js              # ⭐ wizard setup
├── doctor.js             # diagnosa environment
├── patch-baileys.js      # patch kecil pada Baileys (lihat catatan)
├── test-*.js             # tes per modul
└── rmbg-bridge.py        # jembatan Python ↔ rembg
```

### Menambah command baru

```js
// src/commands/ping.js
export default {
  name: 'ping',
  aliases: [],
  description: 'Tes bot hidup',
  usage: '!ping',
  async execute(ctx) {
    await ctx.reply('pong!')
  },
}
```

Daftarkan di `src/commands/index.js`, dan kalau ingin muncul di menu tambahkan
ke `SECTIONS` di `src/commands/help.js`. Objek `ctx` menyediakan
`reply()`, `send()`, `sendMedia()`, `react()`, `typing()`, `args`, `rawArgs`,
`quoted` (media yang dibalas), `sender`, `isGroup`, dan `pushName`.

---

## 🖥 Jalan 24/7

<details>
<summary><b>pm2</b> (paling cepat)</summary>

```bash
npm i -g pm2
pm2 start src/index.js --name columbina-bot
pm2 save && pm2 startup      # ikut hidup setelah reboot
pm2 logs columbina-bot
```
</details>

<details>
<summary><b>systemd</b> (tanpa tool tambahan)</summary>

```ini
# /etc/systemd/system/columbina-bot.service
[Unit]
Description=Columbina Bot
After=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/columbina-bot
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now columbina-bot
journalctl -u columbina-bot -f
```
</details>

> **Tips VPS kecil (1 vCPU / 1 GB RAM):** jangan arahkan `BOT_TEMP_DIR` ke `/tmp`
> (sering dibersihkan otomatis oleh sistem), dan jangan pakai `u2net` penuh untuk
> `!rmbg`. Bot sudah menjalankan proses beratnya dengan `nice` supaya koneksi
> WhatsApp tidak ikut putus.

---

## 🔧 Kalau ada masalah

| Gejala | Sebab & solusi |
|---|---|
| Bot tidak merespons sama sekali | Pastikan `OWNER_NUMBER` cocok dengan nomor pengirim, bot sudah login, dan `RESPOND_TO_SELF` sesuai kebutuhan |
| `Connection Closed` / bot putus-putus saat memproses gambar | Server kehabisan CPU/RAM. Pakai `RMBG_MODEL=u2netp`, dan pastikan tidak ada proses lain yang berebut CPU |
| YouTube: "Sign in to confirm you're not a bot" | Pasang `yt-dlp` + isi `YT_COOKIES_PATH` (lihat bagian fitur opsional) |
| Instagram selalu "post private/dihapus" | Isi `IG_COOKIE` |
| Stiker yang dikirim tidak bergerak | Video sumber terlalu panjang/berat — coba video lebih pendek. Untuk stiker teks animasi pakai `!animatedtext` |
| Emoji di stiker teks muncul kotak | CDN emoji tidak terjangkau — cek koneksi, atau set `TWEMOJI_BASE` |
| Lupa mau lihat mana yang salah | `npm run doctor` dulu — hampir semua masalah environment terdeteksi di situ |
| Ingin laporan detail | Set `LOG_LEVEL=debug`, jalankan ulang, baca log |

Masih bingung? Buka [issue](https://github.com/arilcihuyy/columbina-bot/issues)
dengan output `npm run doctor` — **hapus dulu nomor & JID** dari log.

---

## 🔐 Keamanan & privasi

- `sessions/` = kunci akun WhatsApp kamu. Jangan pernah dibagikan.
- `.env`, `cookies/`, `sessions/`, `tmp/` sudah masuk `.gitignore`.
- Isi `OWNER_NUMBER` supaya bot tidak dipakai orang lain.
- Bot tidak mengirim data apa pun ke pengembang. Semua berjalan di mesinmu.
- Detail lengkap: [SECURITY.md](SECURITY.md).

---

## 📝 Catatan teknis

- **Patch Baileys** (`scripts/patch-baileys.js`) dijalankan otomatis saat
  `npm install`. Ini memperbaiki deteksi tipe media saat mengirim stiker/jalur
  media pada `@whiskeysockets/baileys`. Kalau `node_modules` dipasang ulang,
  jalankan `npm run postinstall`.
- **`toimg`** memakai `ffmpeg webp → png` sungguhan, jadi hasilnya benar-benar
  gambar (banyak bot lain di sini menghasilkan webp lagi).
- **Stiker teks** dirender dengan `@napi-rs/canvas` + font yang tersedia di
  sistem, lalu dibungkus metadata paket stiker via `node-webpmux`.
- **Font komersial tidak disertakan.** Arial © Monotype — kalau mau memakainya,
  taruh `ARIAL.TTF` di `assets/fonts/` (sudah di-ignore git). Yang ikut repo:
  Archivo Narrow (SIL OFL).
- **Downloader** membaca halaman publik platform; kalau platform berubah,
  penyesuaian kecil di `src/features/` biasanya cukup.

---

## 🙏 Kredit & asal-usul

Bot ini **ditulis bersama AI agent** ([Hermes Agent](https://github.com/NousResearch/hermes-agent)
dari Nous Research) — agent yang menulis kode, menjalankan tes, dan beriterasi
sampai semua fitur lolos; arah produk, pengujian nyata di perangkat, dan
keputusan akhir dipegang oleh pemilik repo. Struktur bot, wizard setup,
diagnosa, dan dokumentasi ini adalah hasil kolaborasi itu.

Fitur inti media & downloader awalnya diadaptasi dari
[Haruna-Bot](https://github.com/ClayzaAubert/Haruna-Bot), lalu ditulis ulang
tanpa dependency framework-nya.

Terima kasih untuk Baileys dan semua pustaka open source yang dipakai.

---

## 📄 Lisensi

[MIT](LICENSE) © 2026 Aril — silakan pakai, ubah, dan sebarkan.

> Bot ini memakai protokol WhatsApp Web tidak resmi (Baileys). Pakailah dengan
> wajar: bukan untuk spam atau blast. Risiko pemblokiran nomor ada di tangan
> pemakai.