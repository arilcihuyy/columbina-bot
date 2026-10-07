// Entry point bot WhatsApp. Login pairing code (isi PAIRING_NUMBER di .env)
// atau QR kalau kosong. Command didaftarkan di src/commands/index.js.
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from '@whiskeysockets/baileys'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import { CONFIG, isOwnerJid } from './config.js'
import { parseMessage } from './core/parser.js'
import { findCommand } from './commands/index.js'

const logger = pino({ level: CONFIG.logLevel, timestamp: () => `,"time":"${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}"` })

let sock = null
let reconnectTimer = null

function log(msg) {
  console.log(`[${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}] ${msg}`)
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(CONFIG.sessionPath)
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: CONFIG.logLevel === 'debug' ? 'trace' : 'silent' }),
    browser: ['Wa-Lite', 'Chrome', '1.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      log('Scan QR ini dengan WhatsApp kamu (HP > Linked Devices):')
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'open') {
      log(`✅ Bot online sebagai ${sock.user?.id || '?'} — prefix ${CONFIG.prefixes.map((p) => `"${p}"`).join(' ')}`)

      // Diagnosa sekali jalan (PRW_DOCTOR=1 di .env) — hapus env-nya kalau sudah selesai
      if (process.env.PRW_DOCTOR === '1' && !global.__prwDoctorRan) {
        global.__prwDoctorRan = true
        import('./features/prw-doctor.js')
          .then(({ runPrwDoctor }) => runPrwDoctor(sock))
          .then((r) => log(`PRW doctor selesai: ${JSON.stringify(r)}`))
          .catch((err) => log(`PRW doctor gagal: ${err.message}`))
      }

      // Uji kirim stiker sekali jalan (STICKER_SELFTEST=1 di .env) — hapus setelah selesai
      if (process.env.STICKER_SELFTEST === '1' && !global.__stickerSelftestRan) {
        global.__stickerSelftestRan = true
        import('./features/sticker-selftest.js')
          .then(({ runStickerSelftest }) => runStickerSelftest(sock, process.env.STICKER_SELFTEST_JID))
          .catch((err) => log(`selftest stiker gagal: ${err.message}`))
      }
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = code !== DisconnectReason.loggedOut
      log(`Koneksi putus (${code ?? 'unknown'}). Reconnect: ${shouldReconnect}`)

      if (shouldReconnect) {
        clearTimeout(reconnectTimer)
        reconnectTimer = setTimeout(() => startBot(), 3_000)
      } else {
        log('Session di-logout dari HP. Hapus folder sessions/ lalu start ulang buat login baru.')
      }
    }
  })

  // Pairing code: muncul kalau PAIRING_NUMBER diisi dan belum login
  if (CONFIG.pairingNumber && !sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(CONFIG.pairingNumber)
        log(`🔑 Kode pairing untuk ${CONFIG.pairingNumber}: ${code?.match(/.{1,4}/g)?.join('-') || code}`)
      } catch (err) {
        log(`Gagal minta pairing code: ${err.message}`)
      }
    }, 2_000)
  }

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    for (const raw of messages) {
      try {
        await handleMessage(raw)
      } catch (err) {
        logger.error({ err }, 'handleMessage error')
      }
    }
  })
}

async function handleMessage(raw) {
  if (!raw.message) return
  if (raw.key?.fromMe && !CONFIG.respondToSelf) return
  // Abaikan status/story
  if (raw.key?.remoteJid === 'status@broadcast') return

  const ctx = parseMessage(raw, sock)
  if (!ctx || !ctx.isCommand || !ctx.command) return

  const cmd = findCommand(ctx.command)
  if (!cmd) return

  if (!isOwnerJid(ctx.sender)) {
    return ctx.reply('❌ Kamu bukan pemilik bot ini.')
  }

  log(`➡️ ${ctx.command} dari ${ctx.sender}${ctx.isGroup ? ` (gc ${ctx.jid})` : ''}`)
  try {
    await cmd.execute(ctx)
  } catch (err) {
    logger.error({ err, cmd: ctx.command }, 'command error')
    await ctx.reply(`❌ Error: ${err.message}`).catch(() => {})
  }
}

process.on('SIGINT', async () => {
  log('Shutdown...')
  clearTimeout(reconnectTimer)
  if (sock) await sock.end(undefined)
  process.exit(0)
})

log(`Wa-Lite bot — Node ${process.version}`)
log(`Owner: ${CONFIG.ownerNumber || '(semua nomor, isi OWNER_NUMBER di .env)'}`)
log(`Login mode: ${CONFIG.pairingNumber ? `pairing (${CONFIG.pairingNumber})` : 'QR'}`)
startBot().catch((err) => {
  log(`Fatal: ${err.message}`)
  process.exit(1)
})
