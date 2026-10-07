import { youtubeService } from '../features/youtube.js'

// Alias command yang artinya "ambil audionya saja" (mp3)
const AUDIO_ALIASES = new Set(['yta', 'ytmp3', 'ytmp3dl', 'yt-audio'])
// Kata kunci argumen
const AUDIO_WORDS = new Set(['audio', 'a', 'mp3', '-a', '--audio', 'sound', 'lagu'])
const VIDEO_WORDS = new Set(['video', 'v', 'mp4', '-v', '--video', 'vid'])

const isYtUrl = (s = '') => /youtu\.?be|youtube\.com/i.test(s)

// Tentukan mode + URL dari nama command yang dipakai (!yt vs !ytmp3) dan argumennya.
// Dipisah biar bisa diuji tanpa jaringan — lihat scripts/test-ytmp3.js
export function parseYtArgs(command = '', args = []) {
  const invoked = String(command).toLowerCase()
  const words = args.map((a) => String(a ?? '').toLowerCase())
  const url = String(args.find(isYtUrl) || args[0] || '').trim()

  let audioOnly = AUDIO_ALIASES.has(invoked)
  if (words.some((w) => AUDIO_WORDS.has(w))) audioOnly = true
  if (words.some((w) => VIDEO_WORDS.has(w))) audioOnly = false // kata "video" menang
  return { audioOnly, url }
}

export default {
  name: 'youtube',
  aliases: ['yt', 'ytdl', 'yta', 'ytmp3'],
  description: 'Download video YouTube, atau MP3 pakai !ytmp3',
  usage: '!yt <url> (video) | !ytmp3 <url> (MP3) | !youtube audio <url>',

  async execute(ctx) {
    const { audioOnly, url } = parseYtArgs(ctx.command, ctx.args)
    if (!url || !isYtUrl(url)) {
      return ctx.reply('Usage:\n`!yt <url>` — video (mp4, maks 720p)\n`!ytmp3 <url>` — audio (mp3)')
    }

    await ctx.typing()
    await ctx.react('⏳')
    await ctx.reply('🔍 Ambil info video dulu...')

    try {
      const info = await youtubeService.probe(url)
      await ctx.reply(`⬇️ Download ${audioOnly ? 'audio MP3' : 'video'} — ${info.title} (${info.duration})\n⏳ Bisa makan waktu, sabar ya...`)

      const { buffer, ext, title } = await youtubeService.download(url, { audioOnly })
      const caption = `${audioOnly ? '🎵' : '🎬'} ${title}`

      await ctx.sendMedia(audioOnly ? 'audio' : 'video', buffer, caption, {
        mimetype: audioOnly ? 'audio/mpeg' : 'video/mp4',
        ptt: false,
        fileName: audioOnly ? `${title}.mp3` : undefined,
      })
      await ctx.react('✅')
    } catch (err) {
      await ctx.react('❌')
      await ctx.reply(`❌ ${err.message}`)
    }
  },
}
