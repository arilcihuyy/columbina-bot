// Command debug: uji pengiriman pesan sekali lihat di chat ini sendiri.
// Hasilnya ditulis ke /tmp/prw-doctor.log (lihat src/features/prw-doctor.js).
// Disembunyikan dari menu (hidden: true).
export default {
  name: 'prwdoctor',
  hidden: true,
  description: 'Diagnosa pengiriman view once (debug)',
  usage: '!prwdoctor',

  async execute(ctx) {
    await ctx.reply('🔬 Mulai diagnosa view once di chat ini. Tunggu ±2 menit, lalu lihat hasilnya.')
    const { runPrwDoctor } = await import('../features/prw-doctor.js')
    try {
      const results = await runPrwDoctor(ctx.sock, ctx.jid)
      await ctx.reply(`🔬 Selesai:\n${results.map((r) => `• ${r}`).join('\n')}`)
    } catch (err) {
      await ctx.reply(`🔬 Diagnosa gagal: ${err.message}`)
    }
  },
}
