// Tes command YouTube: pemilihan mode audio/video + (opsional) eksekusi asli.
//   node scripts/test-ytmp3.js                 → tes logika saja (instan)
//   node scripts/test-ytmp3.js --real <url>    → sekalian download mp3 lewat command
import 'dotenv/config'
import youtube, { parseYtArgs } from '../src/commands/youtube.js'

const U = 'https://youtu.be/iUTXjrs40pg'
const cases = [
  ['ytmp3', [U], true],
  ['yta', [U], true],
  ['yt', [U], false],
  ['ytdl', [U], false],
  ['youtube', ['audio', U], true],
  ['youtube', ['mp3', U], true],
  ['youtube', [U], false],
  ['youtube', ['video', U], false],
  ['yta', ['video', U], false],
]

let fail = 0
console.log('=== tes logika parseYtArgs ===')
for (const [cmd, args, want] of cases) {
  const got = parseYtArgs(cmd, args)
  const ok = got.audioOnly === want && got.url === U
  if (!ok) fail++
  console.log(`${ok ? '✅' : '❌'} !${cmd} ${args.join(' ')} → audio=${got.audioOnly} (harap ${want}) url=${got.url ? 'ok' : 'KOSONG'}`)
}
console.log(fail ? `\n${fail} tes gagal ❌` : '\nSEMUA TES LOGIKA LULUS ✅')

if (process.argv.includes('--real')) {
  const url = process.argv[process.argv.indexOf('--real') + 1] || U
  console.log('\n=== eksekusi asli lewat command (mock ctx) ===')
  const sent = []
  const ctx = {
    command: 'ytmp3', args: [url],
    reply: async (t) => { sent.push({ text: String(t) }) },
    react: async () => {}, typing: async () => {},
    sendMedia: async (kind, buf, caption, opts = {}) => {
      sent.push({ kind, bytes: buf.length, mimetype: opts.mimetype, magic: buf.subarray(0, 4).toString('hex'), caption })
    },
  }
  await youtube.execute(ctx)
  for (const s of sent) console.log('  ', JSON.stringify(s).slice(0, 160))
  const media = sent.find((s) => s.kind)
  const ok = media?.kind === 'audio' && media?.mimetype === 'audio/mpeg'
  console.log(ok ? '\nHASIL: kirim AUDIO (mp3) ✅' : '\nHASIL: bukan audio ❌')
  if (!ok) fail++
}
process.exit(fail ? 1 : 0)
