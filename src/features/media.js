// Fitur media: konversi gambar/video -> stiker webp, dan stiker -> png.
// Di-port dari Haruna-Bot (github.com/ClayzaAubert/Haruna-Bot) lalu dibersihkan
// dari dependency framework-nya (#helpers/logger, #environment/settings).
import fs from 'fs'
import path from 'path'
import ffmpeg from 'fluent-ffmpeg'
import webp from 'node-webpmux'
import sharp from 'sharp'
import { fileTypeFromBuffer } from 'file-type'
import { CONFIG } from '../config.js'
import { workDir, cleanup } from './tmpdir.js'

// ⚠️ Dir kerja dibuat BARU tiap konversi lalu dihapus di `finally`, dan SEMUA-nya
// ada di `./tmp` (lihat src/features/tmpdir.js) — bukan /tmp. Jangan diubah:
// pola lama "dir tetap di /tmp, dibuat sekali saat modul dimuat" bikin bot tampak
// hidup tapi semua stiker/foto mati ENOENT sampai restart (kejadian 2026-09-15).

function runFfmpeg(tmpIn, tmpOut, outputOptions, toFormat) {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(tmpIn)
      .on('error', reject)
      .on('end', () => resolve(true))
      .addOutputOptions(outputOptions)
    if (toFormat) cmd.toFormat(toFormat)
    cmd.save(tmpOut)
  })
}

// ─── Konversi dasar ─────────────────────────────────────────────────────────

// Gambar (jpg/png/dll) -> webp sticker (320x320, transparan, 15fps)
export async function imageToWebp(media) {
  const dir = workDir()
  const tmpOut = path.join(dir, 'out.webp')
  const tmpIn = path.join(dir, 'in.img')
  try {
    fs.writeFileSync(tmpIn, media)
    await runFfmpeg(
      tmpIn, tmpOut,
      ['-vcodec', 'libwebp', '-vf', "scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15,pad=320:320:-1:-1:color=white@0.0,split[a][b];[a]palettegen=reserve_transparent=on:transparency_color=ffffff[p];[b][p]paletteuse"],
      'webp'
    )
    return fs.readFileSync(tmpOut)
  } finally {
    cleanup(dir)
  }
}

// Video -> webp sticker animasi (maks 5 detik)
export async function videoToWebp(media) {
  const dir = workDir()
  const tmpOut = path.join(dir, 'out.webp')
  const tmpIn = path.join(dir, 'in.vid')
  try {
    fs.writeFileSync(tmpIn, media)
    await runFfmpeg(
      tmpIn, tmpOut,
      ['-vcodec', 'libwebp', '-vf', "scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15,pad=320:320:-1:-1:color=white@0.0,split[a][b];[a]palettegen=reserve_transparent=on:transparency_color=ffffff[p];[b][p]paletteuse",
        '-loop', '0', '-ss', '00:00:00.0', '-t', '00:00:05.0', '-preset', 'default', '-an', '-vsync', '0'],
      'webp'
    )
    return fs.readFileSync(tmpOut)
  } finally {
    cleanup(dir)
  }
}

// Stiker webp -> png (frame pertama). INI perbaikan dari Haruna yang toimg-nya
// salah (webp diubah ke webp lagi, bukan ke gambar).
//
// ⚠️ ffmpeg 6.1.1 TIDAK bisa membaca webp ANIMASI (stiker gerak): decoder native-nya
// membuang chunk ANIM/ANMF → "image data not found" → 0 frame → ffmpeg keluar
// `code 69` ("Conversion failed!") walau stikernya sehat. Keluhan nyata 2026-10-05:
// `!toimg` gagal HANYA pada stiker animasi, stiker statis baik-baik saja.
// sharp/libvips membaca keduanya (frame pertama = perilaku standar bot WA),
// jadi sharp dipakai lebih dulu; ffmpeg tetap jadi cadangan (mis. kalau build sharp
// tidak punya dukungan webp). Catatan lama: jangan pakai toFormat('png') — sebagian
// build ffmpeg tidak punya muxer png, ekstensi .png sudah cukup (infer ke image2).
export async function webpToPng(media) {
  try {
    return await sharp(media, { pages: 1 }).png().toBuffer()
  } catch (sharpErr) {
    const dir = workDir()
    const tmpOut = path.join(dir, 'out.png')
    const tmpIn = path.join(dir, 'in.webp')
    try {
      fs.writeFileSync(tmpIn, media)
      await runFfmpeg(tmpIn, tmpOut, ['-frames:v', '1'], null)
      return fs.readFileSync(tmpOut)
    } catch (ffErr) {
      throw new Error(`Gagal baca stiker (${sharpErr.message.split('\n')[0]} / ${ffErr.message.split('\n')[0]})`)
    } finally {
      cleanup(dir)
    }
  }
}

// ─── EXIF / metadata pack sticker ───────────────────────────────────────────

// Tempel metadata pack (nama pack, publisher, emoji) ke buffer webp.
// Teknik byte-exif ini diambil dari Haruna-Bot / ekosistem bot WA.
// Dipakai juga oleh fitur teks→stiker (src/features/brat.js).
export async function attachStickerExif(webpBuffer, metadata = {}) {
  const { data, mimetype } = { data: webpBuffer, mimetype: 'image/webp' }
  if (!/webp/.test(mimetype) && !/image/.test(mimetype) && !/video/.test(mimetype)) {
    throw new Error('Format media tidak didukung untuk sticker.')
  }

  const opt = {
    packId: metadata.packId ?? 'https://wa.me/',
    packName: metadata.packName ?? CONFIG.botName,
    packPublish: metadata.packPublish ?? CONFIG.botName,
    packEmail: metadata.packEmail ?? '',
    packWebsite: metadata.packWebsite ?? '',
    androidApp: metadata.androidApp ?? '',
    iOSApp: metadata.iOSApp ?? '',
    emojis: metadata.emojis ?? ['🤖'],
    isAvatar: metadata.isAvatar ?? 0,
  }

  const json = {
    'sticker-pack-id': opt.packId,
    'sticker-pack-name': opt.packName,
    'sticker-pack-publisher': opt.packPublish,
    'sticker-pack-publisher-email': opt.packEmail,
    'sticker-pack-publisher-website': opt.packWebsite,
    'android-app-store-link': opt.androidApp,
    'ios-app-store-link': opt.iOSApp,
    emojis: opt.emojis,
    'is-avatar-sticker': opt.isAvatar,
  }

  const exifAttr = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00])
  const jsonBuff = Buffer.from(JSON.stringify(json), 'utf-8')
  const exif = Buffer.concat([exifAttr, jsonBuff])
  exif.writeUIntLE(jsonBuff.length, 14, 4)

  const dir = workDir()
  const tmpOut = path.join(dir, 'out.webp')
  const tmpIn = path.join(dir, 'in.webp')
  try {
    fs.writeFileSync(tmpIn, data)
    const img = new webp.Image()
    await img.load(tmpIn)
    img.exif = exif
    await img.save(tmpOut)
    return fs.readFileSync(tmpOut)
  } finally {
    cleanup(dir)
  }
}

// ─── API utama ──────────────────────────────────────────────────────────────

// Buffer media apa pun (gambar/video/webp) -> buffer stiker webp siap kirim
export async function toStickerBuffer(buffer, meta = {}) {
  const type = await fileTypeFromBuffer(buffer)
  if (!type) throw new Error('Tidak bisa deteksi tipe file.')

  let webpBuffer
  if (/webp/.test(type.mime)) webpBuffer = buffer
  else if (/image/.test(type.mime)) webpBuffer = await imageToWebp(buffer)
  else if (/video/.test(type.mime)) webpBuffer = await videoToWebp(buffer)
  else throw new Error('Cuma gambar/video yang bisa jadi stiker.')

  return attachStickerExif(webpBuffer, meta)
}

/** Untuk webp yang sudah final (mis. hasil teks→stiker animasi): hanya tempel metadata. */
export async function finalizeSticker(webpBuffer, meta = {}) {
  return attachStickerExif(webpBuffer, meta)
}
