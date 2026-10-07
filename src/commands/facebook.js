import { facebookService } from '../features/facebook.js'

export default {
  name: 'facebook',
  aliases: ['fb', 'fbdl', 'facebookdl'],
  description: 'Download video Facebook/reel',
  usage: '!facebook <url>',

  async execute(ctx) {
    const url = (ctx.args.find((a) => a.includes('facebook.com') || a.includes('fb.watch')) || ctx.args[0] || '').trim()
    if (!url) return ctx.reply('Usage: `!facebook <url>`')

    await ctx.typing()
    await ctx.react('⏳')
    try {
      const result = await facebookService.resolve(url)
      const buf = await facebookService.toBuffer(result.url)
      const caption = result.title
        ? `${result.title}${result.hasHd ? '\n📺 HD tersedia' : ''}`
        : ''
      const kind = result.type === 'image' ? 'image' : 'video'
      await ctx.sendMedia(kind, buf, caption, { mimetype: kind === 'image' ? 'image/jpeg' : 'video/mp4' })
      await ctx.react('✅')
    } catch (err) {
      await ctx.react('❌')
      await ctx.reply(`❌ ${err.message}`)
    }
  },
}
