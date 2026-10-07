// Uji resolver link dari terminal (tanpa WhatsApp):
//   node scripts/cek.js https://sfl.gl/z0iiF
//   node scripts/cek.js https://bit.ly/xxxx
import { resolveLink } from '../src/features/linkcheck.js'
import { formatReport } from '../src/commands/cek.js'

const url = process.argv[2]
if (!url) {
  console.error('pakai: node scripts/cek.js <link>')
  process.exit(1)
}

const t0 = Date.now()
try {
  const r = await resolveLink(url, { log: (m) => console.log(`  · ${m}`) })
  console.log('')
  console.log(formatReport(r))
  console.log('')
  console.log(`— ${r.hops} lompatan, ${r.gates} gerbang, ${Date.now() - t0}ms, via tor: ${r.viaTor}`)
} catch (err) {
  console.error('GAGAL:', err.message)
  process.exit(1)
}
