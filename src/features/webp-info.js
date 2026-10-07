// Baca info file WebP langsung dari chunk-nya (tanpa ffmpeg).
//
// Kenapa perlu? ffmpeg TIDAK bisa membaca WebP ANIMASI — `ffprobe` cuma bilang
// "image data not found" dan ukuran 0×0 walau file-nya sehat. Jadi verifikasi
// stiker animasi (jumlah frame, ukuran kanvas, ada ANIM/ANMF) harus dari chunk.
import sharp from 'sharp'

const CHUNK_ANIM = 'ANIM'
const CHUNK_ANMF = 'ANMF'
const CHUNK_VP8X = 'VP8X'

/** @returns {{isWebp:boolean,isAnimated:boolean,frames:number,width:number,height:number,chunks:string[],size:number}} */
export function parseWebpInfo(buffer) {
  const info = { isWebp: false, isAnimated: false, frames: 0, width: 0, height: 0, chunks: [], size: buffer?.length ?? 0 }
  if (!Buffer.isBuffer(buffer) || buffer.length < 20) return info
  if (buffer.subarray(0, 4).toString() !== 'RIFF' || buffer.subarray(8, 12).toString() !== 'WEBP') return info
  info.isWebp = true

  let i = 12
  while (i + 8 <= buffer.length) {
    const tag = buffer.subarray(i, i + 4).toString('latin1')
    const size = buffer.readUInt32LE(i + 4)
    info.chunks.push(tag)

    if (tag === CHUNK_VP8X && i + 8 + 10 <= buffer.length) {
      const flags = buffer[i + 8]
      info.isAnimated = info.isAnimated || (flags & 0x02) !== 0
      // kanvas = 24-bit little-endian dikurangi 1
      info.width = (buffer.readUIntLE(i + 12, 3) & 0xffffff) + 1
      info.height = (buffer.readUIntLE(i + 15, 3) & 0xffffff) + 1
    }
    if (tag === CHUNK_ANIM) info.isAnimated = true
    if (tag === CHUNK_ANMF) info.frames += 1

    i += 8 + size + (size % 2) // chunk ganjil dipad 1 byte
  }
  if (!info.frames) info.frames = info.isWebp ? 1 : 0
  return info
}

/**
 * Info dari libvips (sharp) — pembanding independen untuk chunk parser.
 * @returns {Promise<{width:number,height:number,pages:number,loop:number|null,hasAlpha:boolean,format:string}>}
 */
export async function sharpWebpInfo(buffer) {
  const meta = await sharp(buffer, { animated: true }).metadata()
  return {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    pages: meta.pages ?? 1,
    loop: meta.loop ?? null,
    hasAlpha: !!meta.hasAlpha,
    format: meta.format ?? '',
  }
}

/** Ringkas untuk log: "animasi 5 frame 320×320 39.0 KB". */
export function describeWebp(buffer) {
  const i = parseWebpInfo(buffer)
  const kb = ((buffer?.length ?? 0) / 1024).toFixed(1)
  return `${i.isAnimated ? `animasi ${i.frames} frame` : 'statis'} ${i.width}×${i.height} ${kb} KB`
}
