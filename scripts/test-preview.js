// Tes fitur preview (sekali lihat) — offline dulu, jaringan opsional.
//
//   node scripts/test-preview.js            → tes logika + bentuk pesan + alur command
//   node scripts/test-preview.js --real URL → tambah resolve + download asli
import 'dotenv/config'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { generateWAMessageContent } from '@whiskeysockets/baileys'
import previewCommand, { pickUrl } from '../src/commands/preview.js'
import { sendViewOnce, waitAck, wrapViewOnceV2 } from '../src/features/viewonce.js'
import { tiktokService } from '../src/features/tiktok.js'
import { parseMessage } from '../src/core/parser.js'
import { findCommand } from '../src/commands/index.js'

process.env.PRW_ACK_TIMEOUT_MS = '400' // tes jangan nunggu 15 detik

let fail = 0
const ok = (cond, label, extra = '') => {
  if (cond) console.log(`  ✅ ${label}${extra ? ` — ${extra}` : ''}`)
  else { console.log(`  ❌ ${label}${extra ? ` — ${extra}` : ''}`); fail++ }
}

// Socket tiruan. Penting: ack SUKSES dari server datang sebagai node
// `CB:ack,class:message` di `ws` (Baileys tidak meneruskannya ke messages.update) —
// tiruan ini meniru perilaku itu supaya tes mencerminkan kenyataan.
function makeSock({ ackMode = 'server' } = {}) {
  const handlers = {}
  const wsHandlers = {}
  const relayed = []
  const emitter = (store) => ({
    on: (e, h) => { (store[e] ||= []).push(h) },
    off: (e, h) => { store[e] = (store[e] || []).filter((x) => x !== h) },
    emit: (e, arg) => (store[e] || []).forEach((h) => h(arg)),
  })
  const sock = {
    user: { id: '62812:8@s.whatsapp.net' },
    waUploadToServer: async () => ({ mediaUrl: 'https://mmg.whatsapp.net/fake', directPath: '/v/fake' }),
    ev: emitter(handlers),
    ws: emitter(wsHandlers),
    relayMessage: async (jid, message, opts) => {
      relayed.push({ jid, message, opts })
      const id = opts.messageId
      if (ackMode === 'server' || ackMode === 'delivery') {
        setTimeout(() => sock.ws.emit('CB:ack,class:message', { tag: 'ack', attrs: { id, t: '123' } }), 5)
      }
      if (ackMode === 'delivery') {
        setTimeout(() => sock.ev.emit('messages.update', [{ key: { id }, update: { status: 3 } }]), 10)
      }
      if (ackMode === 'error') {
        setTimeout(() => sock.ws.emit('CB:ack,class:message', { tag: 'ack', attrs: { id, error: '421' } }), 5)
      }
    },
  }
  return { sock, relayed }
}

const fakeUpload = async () => ({ mediaUrl: 'https://mmg.whatsapp.net/fake', directPath: '/v/fake' })

// ── 1. logika pengambilan URL ────────────────────────────────
console.log('\n[1] pickUrl()')
const T = 'https://www.tiktok.com/@user/video/7412345678901234567'
ok(pickUrl([T]) === T, 'URL dari argumen')
ok(pickUrl([], `cek nih ${T} keren`) === T, 'URL dari pesan yang di-quote')
ok(pickUrl([T, 'https://youtu.be/abc']) === T, 'TikTok menang kalau ada 2 link')
ok(pickUrl([], '') === '', 'kosong → kosong')
ok(pickUrl(['https://x.com/a/status/1']).includes('x.com'), 'link non-tiktok tetep ke-ekstrak (ditolak di command)')

// ── 2. bentuk pesan sekali lihat ─────────────────────────────
console.log('\n[2] bentuk pesan sekali lihat')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prw-'))
const mp4 = path.join(tmp, 'sample.mp4')
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=15', '-t', '2', '-pix_fmt', 'yuv420p', mp4])
const buf = fs.readFileSync(mp4)

// 2a. jalur lama (bug: viewOnceMessage v1) — dipakai sebagai pembanding
const builtV1 = await generateWAMessageContent(
  { video: buf, mimetype: 'video/mp4', caption: 'tes', viewOnce: true, seconds: 2, width: 320, height: 240 },
  { upload: fakeUpload, jid: '62812@s.whatsapp.net' },
)
ok(!!builtV1.viewOnceMessage, 'jalur lama → viewOnceMessage (v1)')

// 2b. jalur baru: isi media TANPA flag, wrapper v2 dipasang manual
const content = await generateWAMessageContent(
  { video: buf, mimetype: 'video/mp4', seconds: 2, width: 320, height: 240 },
  { upload: fakeUpload, jid: '62812@s.whatsapp.net' },
)
ok(!!content.videoMessage && !content.viewOnceMessage, 'konten media polos (tanpa wrapper)')
content.videoMessage.viewOnce = true
const wrapped = wrapViewOnceV2(content)
ok(!!wrapped.viewOnceMessageV2?.message?.videoMessage, 'dibungkus viewOnceMessageV2')
ok(wrapped.viewOnceMessageV2.message.videoMessage.viewOnce === true, 'viewOnce: true ada DI DALAM media')
ok(!wrapped.viewOnceMessage, 'tidak ada wrapper versi lama')
ok(!!wrapped.viewOnceMessageV2.message.videoMessage.fileSha256, 'media ter-enkripsi (sha256 ada)')

// ── 3. sendViewOnce() + waitAck() ────────────────────────────
console.log('\n[3] sendViewOnce() & waitAck()')
const { sock: sockAck, relayed } = makeSock({ ackMode: 'server' })
const sent = await sendViewOnce(sockAck, '123@g.us', 'video', buf, { mimetype: 'video/mp4', seconds: 2, width: 320, height: 240 })
ok(relayed.length === 1, 'dikirim lewat relayMessage')
ok(relayed[0].jid === '123@g.us', 'ke jid yang benar', relayed[0].jid)
ok(!!relayed[0].message.viewOnceMessageV2?.message?.videoMessage, 'payload = viewOnceMessageV2.videoMessage')
ok(relayed[0].opts?.messageId === sent.key.id, 'messageId konsisten', sent.key.id)

const ackServer = await waitAck(sockAck, sent.key.id, 2000)
ok(ackServer?.ok === true && ackServer.status === 2, 'ack server (CB:ack,class:message) kebaca → ok', JSON.stringify(ackServer))
ok(ackServer?.delivered === false, 'tanpa receipt → delivered=false (jujur, bukan diklaim sampai)')

const { sock: sockDeliv } = makeSock({ ackMode: 'none' })
setTimeout(() => {
  sockDeliv.ws.emit('CB:ack,class:message', { tag: 'ack', attrs: { id: 'd1', t: '123' } })
  sockDeliv.ev.emit('messages.update', [{ key: { id: 'd1' }, update: { status: 3 } }])
}, 20)
const ackDeliv = await waitAck(sockDeliv, 'd1', 2000, { requireDelivery: true })
ok(ackDeliv?.ok === true && ackDeliv.status === 3 && ackDeliv.delivered === true, 'receipt HP (status 3) kebaca → delivered', JSON.stringify(ackDeliv))

// requireDelivery: server terima tapi receipt tidak turun → tetap ok, delivered=false
const { sock: sockSlow } = makeSock({ ackMode: 'none' })
setTimeout(() => sockSlow.ws.emit('CB:ack,class:message', { tag: 'ack', attrs: { id: 's1', t: '123' } }), 20)
const ackSlow = await waitAck(sockSlow, 's1', 250, { requireDelivery: true })
ok(ackSlow?.ok === true && ackSlow.delivered === false, 'requireDelivery: timeout receipt tetap ok (status 2)', JSON.stringify(ackSlow))

const { sock: sockReceipt } = makeSock({ ackMode: 'none' })
setTimeout(() => sockReceipt.ev.emit('message-receipt.update', [{ key: { id: 'x1' }, receipt: { userJid: '62899@s.whatsapp.net' } }]), 20)
const ackR = await waitAck(sockReceipt, 'x1', 2000)
ok(ackR?.ok === true && ackR.status === 3, 'ACK grup (message-receipt.update) kebaca', JSON.stringify(ackR))

const { sock: sockErr } = makeSock({ ackMode: 'none' })
setTimeout(() => sockErr.ws.emit('CB:ack,class:message', { tag: 'ack', attrs: { id: 'e1', error: '421' } }), 20)
const ackE = await waitAck(sockErr, 'e1', 2000)
ok(ackE?.ok === false && ackE.error === '421', 'penolakan server (attrs.error di ack) kebaca + alasannya', JSON.stringify(ackE))

const { sock: sockErr2 } = makeSock({ ackMode: 'none' })
setTimeout(() => sockErr2.ev.emit('messages.update', [{ key: { id: 'x2' }, update: { status: 0, messageStubParameters: ['463'] } }]), 20)
const ackE2 = await waitAck(sockErr2, 'x2', 2000)
ok(ackE2?.ok === false && ackE2.error === '463', 'penolakan server (messages.update ERROR) kebaca', JSON.stringify(ackE2))

const { sock: sockSilent } = makeSock({ ackMode: 'none' })
const ackN = await waitAck(sockSilent, 'x3', 200)
ok(ackN === null, 'tidak ada kabar → null (dianggap gagal)')

// ── 4. jalankan command dengan ctx tiruan ───────────────────
console.log('\n[4] execute() dengan ctx tiruan (tanpa WA, tanpa jaringan)')
// palsukan scraper biar tes ini offline & deterministik
const origResolve = tiktokService.resolve
const origToBuffer = tiktokService.toBuffer
tiktokService.resolve = async () => ({ type: 'video', url: 'https://v16.tiktokcdn.com/fake.mp4', author: 'tester', title: 'contoh', duration: 2, width: 320, height: 240 })
tiktokService.toBuffer = async () => buf

const makeCtx = (sock) => {
  const sent = []
  return {
    sent,
    ctx: {
      sock,
      jid: '120363238610471327@g.us',
      args: [T],
      quoted: null,
      reply: async (t) => sent.push({ reply: t }),
      react: async (e) => sent.push({ react: e }),
      typing: async () => {},
      send: async (msg) => { sent.push({ fallback: msg }); return { key: { id: 'fb-1' } } },
    },
  }
}

const { sock: sockGood, relayed: relayedGood } = makeSock({ ackMode: 'server' })
const { ctx: ctxGood, sent: sentGood } = makeCtx(sockGood)
await previewCommand.execute(ctxGood)
ok(relayedGood[0]?.message?.viewOnceMessageV2?.message?.videoMessage?.viewOnce === true,
  'command pakai viewOnceMessageV2 (bukan wrapper lama)')
ok(sentGood.some((s) => s.react === '✅'), 'react ✅ kalau server terima')
ok(!sentGood.some((s) => s.reply), 'tidak ada pesan peringatan')
ok(!sentGood.some((s) => s.fallback), 'tidak ada fallback saat jalur utama sukses')

// 4b. server menolak → jangan diam: kirim video biasa + lapor
const { sock: sockBad } = makeSock({ ackMode: 'error' })
const { ctx: ctxBad, sent: sentBad } = makeCtx(sockBad)
await previewCommand.execute(ctxBad)
const fb = sentBad.find((s) => s.fallback)?.fallback
ok(!!fb?.video, 'fallback dikirim sebagai video BIASA (bukan view once lagi)')
ok(!fb?.viewOnce, 'fallback tidak memakai wrapper view once')
ok(sentBad.some((s) => s.react === '⚠️'), 'react ⚠️ kalau gagal')
ok(sentBad.some((s) => s.reply?.includes('video biasa')), 'ada pemberitahuan jujur ke pengguna')
ok(sentBad.some((s) => s.reply?.includes('421')), 'alasan penolakan server ikut dilaporkan')

// 4c. tanpa kabar sama sekali (server diam) → juga fallback, tidak diam-diam
const { sock: sockQuiet } = makeSock({ ackMode: 'none' })
const { ctx: ctxQuiet, sent: sentQuiet } = makeCtx(sockQuiet)
await previewCommand.execute(ctxQuiet)
ok(sentQuiet.find((s) => s.fallback)?.fallback?.video, 'tanpa ACK → fallback video biasa')
ok(sentQuiet.some((s) => s.react === '⚠️'), 'tanpa ACK → react ⚠️')

tiktokService.resolve = origResolve
tiktokService.toBuffer = origToBuffer

// ── 5. opsional: URL asli ───────────────────────────────────
const realIdx = process.argv.indexOf('--real')
if (realIdx > -1 && process.argv[realIdx + 1]) {
  const url = process.argv[realIdx + 1]
  console.log(`\n[5] resolve asli: ${url}`)
  try {
    const r = await tiktokService.resolve(url)
    console.log(`  tipe=${r.type} author=${r.author} durasi=${r.duration}s ${r.width}x${r.height}`)
    if (r.type === 'video') {
      const v = await tiktokService.toBuffer(r.url, r._cookie)
      ok(v.length > 10_000, 'video ter-download', `${(v.length / 1024 / 1024).toFixed(2)} MB`)
      ok(v.subarray(4, 8).toString() === 'ftyp', 'magic bytes = MP4', v.subarray(4, 8).toString())
      const { sock, relayed: rl } = makeSock({ ackMode: 'server' })
      const m = await sendViewOnce(sock, '123@g.us', 'video', v, {
        mimetype: 'video/mp4', seconds: r.duration, width: r.width, height: r.height,
      })
      const inner = rl[0]?.message?.viewOnceMessageV2?.message?.videoMessage
      ok(!!inner, 'video asli → viewOnceMessageV2.videoMessage')
      ok(inner?.viewOnce === true, 'flag viewOnce ada di dalam media')
      ok(Number(inner?.fileLength) === v.length, 'fileLength = ukuran asli', String(inner?.fileLength))
      ok((await waitAck(sock, m.key.id, 2000))?.ok === true, 'ACK kebaca untuk video asli')
    } else {
      console.log(`  (bukan video: ${r.type})`)
    }
  } catch (err) {
    ok(false, 'resolve asli', err.message)
  }
} else {
  console.log('\n[5] dilewati (pakai `--real <url>` buat tes jaringan)')
}

// ── 6. parser: URL dari pesan yang dibalas ──────────────────
console.log('\n[6] parser: link dari pesan yang di-quote')
const LINK = 'https://www.tiktok.com/@someone/video/7654571253134544135'
const raw = {
  key: { remoteJid: '123@g.us', fromMe: false, participant: '62811@s.whatsapp.net' },
  message: {
    extendedTextMessage: {
      text: '!prw',
      contextInfo: {
        stanzaId: 'ABC123',
        participant: '62899@s.whatsapp.net',
        quotedMessage: { extendedTextMessage: { text: `keren nih ${LINK}` } },
      },
    },
  },
}
const pctx = parseMessage(raw, {})
ok(findCommand(pctx?.command)?.name === 'preview', 'command terdeteksi + alias !prw terdaftar', pctx?.command)
ok(pctx?.quoted?.text?.includes(LINK), 'teks pesan yang di-quote terbaca')
ok(pickUrl(pctx.args, pctx.quoted.text) === LINK, 'URL ketemu dari quote → siap dipakai command')

// ── 7. command debug tidak muncul di menu ───────────────────
console.log('\n[7] menu: command debug disembunyikan')
const { buildMenu } = await import('../src/commands/help.js')
const { commands } = await import('../src/commands/index.js')
const menu = buildMenu(commands, { banner: '' })
ok(!menu.includes('prwdoctor'), '!prwdoctor tidak tampil di menu')
ok(menu.includes('preview') || menu.includes('prw'), 'command preview tetap tampil di menu')

fs.rmSync(tmp, { recursive: true, force: true })

console.log(fail ? `\n❌ ${fail} tes GAGAL\n` : '\n✅ semua tes preview lulus\n')
process.exit(fail ? 1 : 0)
