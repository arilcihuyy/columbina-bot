# Berkontribusi

Terima kasih sudah mau ikut merapikan bot ini. Aturannya sederhana.

## Sebelum mulai

```bash
git clone https://github.com/<username>/columbina-bot.git
cd columbina-bot
npm install          # sekaligus menjalankan patch baileys
npm run doctor       # pastikan environment kamu sehat
npm run test:all     # semua tes harus lulus sebelum kirim PR
```

## Aturan kode

- **ESM murni** (`import`/`export`), tanpa build step, tanpa framework.
- Satu command = satu file di `src/commands/`, logika murni di `src/features/`.
- Beri komentar **kenapa**, bukan **apa**. Kalau ada trik aneh, jelaskan alasannya.
- Jangan tambah dependency besar tanpa diskusi di issue dulu.
- Jangan pernah menulis data pribadi (nomor telepon, JID, cookie, token) di kode
  atau di test — pakai placeholder seperti `6281234567890`.
- Tambah/ubah command → daftarkan di `src/commands/index.js`, dan kalau perlu
  muncul di menu, tambahkan ke `SECTIONS` di `src/commands/help.js`.

## Command baru dalam 20 detik

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

Lalu `import ping from './ping.js'` dan tambahkan ke array `commands` di
`src/commands/index.js`.

## Pull request

1. Branch baru: `feat/nama-fitur` atau `fix/nama-bug`.
2. Commit kecil-kecil dengan pesan jelas (boleh bahasa Indonesia).
3. `npm run test:all` hijau, dan `npm run doctor` tidak ada ❌ baru.
4. Jelaskan **apa** yang berubah dan **kenapa** di deskripsi PR.
5. Kalau menyentuh logika stiker/menu/downloader, sertakan bukti (output tes).

## Melaporkan bug

Sertakan: versi Node (`node -v`), OS, output `npm run doctor`, dan langkah
reproduksi. Kalau ada error dari log bot, tempel bagian yang relevan —
**hapus dulu nomor telepon, JID, dan token** dari log sebelum menempel.