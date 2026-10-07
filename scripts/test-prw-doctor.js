// Uji offline prw-doctor: pastikan diagnosa jalan tanpa error (socket tiruan,
// tanpa jaringan). Bukan untuk membuktikan pengiriman — itu tugas run di VPS.
import { EventEmitter } from 'events'
import { runPrwDoctor } from '../src/features/prw-doctor.js'

const fakeUpload = async () => ({
  url: 'https://mmg.whatsapp.net/d/f/FAKE',
  directPath: '/v/t62.7118-24/FAKE',
  mediaKey: Buffer.alloc(32, 1),
  fileEncSha256: Buffer.alloc(32, 2),
  fileSha256: Buffer.alloc(32, 3),
  fileLength: 999,
})

const ev = new EventEmitter()
const ws = new EventEmitter()
const sent = []
const stanzas = []

const sock = {
  ev,
  ws,
  user: { id: '628123:8@s.whatsapp.net', lid: '999888777@lid' },
  logger: { debug() {}, info() {}, warn() {}, error() {}, child() { return this } },
  waUploadToServer: fakeUpload,
  sendNode(node) { stanzas.push(node) },
  async sendMessage(jid, content) {
    sent.push({ kind: Object.keys(content)[0], jid })
    return { key: { id: 'ID' + sent.length, remoteJid: jid } }
  },
  async relayMessage(jid, message, opts) {
    sent.push({ kind: Object.keys(message)[0], jid, opts })
    return opts?.messageId
  },
}

process.env.PRW_ACK_TIMEOUT_MS = '300' // biar tes cepat (tidak ada ACK di mock)
const results = await runPrwDoctor(sock)

console.log('\n--- pesan yang "dikirim":', JSON.stringify(sent.map((s) => s.kind)))
console.log('--- varian uji:', JSON.stringify(results))
const expect = ['A-teks', 'B-video-biasa', 'C-viewonce-v2', 'D-viewonce-ctx-luar', 'E-viewonce-gambar']
const labels = results.map((r) => r.split(':')[0])
const ok = expect.every((e, i) => labels[i] === e) && results.every((r) => !r.includes('THROW'))
console.log(ok ? '\n✅ doctor jalan tanpa error' : '\n❌ ada varian yang error')
process.exit(ok ? 0 : 1)
