import { instagramService } from '../features/instagram.js'

export default {
  name: 'instagram',
  aliases: ['ig', 'igdl', 'reels'],
  description: 'Download media Instagram (post/reel/carousel)',
  usage: '!instagram <url>',

  async execute(ctx) {
    const url = (ctx.args.find((a) => a.includes('instagram.com')) || ctx.args[0] || '').trim()
    if (!url) return ctx.reply('Usage: `!instagram <url>`')

    await ctx.typing()
    await ctx.react('⏳')
    try {
      const result = await instagramService.resolve(url)

      if (result.type === 'carousel') {
        // kirim semua item (maks 10 biar chat tidak kebanjiran)
        for (const item of result.items.slice(0, 10)) {
          const buf = await instagramService.toBuffer(item.url)
          await ctx.sendMedia(item.type === 'video' ? 'video' : 'image', buf, '', { mimetype: item.type === 'video' ? 'video/mp4' : 'image/jpeg' })
        }
      } else {
        const buf = await instagramService.toBuffer(result.url)
        await ctx.sendMedia(result.type, buf, '', { mimetype: result.type === 'video' ? 'video/mp4' : 'image/jpeg' })
      }

      await ctx.react('✅')
    } catch (err) {
      await ctx.react('❌')
      await ctx.reply(`❌ ${err.message}`)
    }
  },
}
