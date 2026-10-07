#!/usr/bin/env node
// CLI mandiri: hapus background via Adobe Express (Firefly) — kualitas tinggi.
//
//   xvfb-run -a node scripts/adobe-rmbg.mjs <input.jpg|png> <output.png>
//
// Env:
//   ADOBE_PROFILE     profil Chrome berisi sesi login Adobe (default ~/adobe-rmbg-profile)
//   ADOBE_EXECUTABLE  binary chrome (default /usr/bin/google-chrome)
//
// Exit 0 = sukses (output.png ada). Exit 1 = gagal; baris terakhir stderr berformat
//   ADOBE_ERR:<KODE>: <pesan>  supaya pemanggil bisa memetakan error.
//
// ⚠️ Pelajaran 2026-10-05 (bug nyata):
//   Tombol "Download" hasilnya adalah <sp-button> (Spectrum web component) di dalam
//   shadow DOM. `getByRole('button', {name:/download/i})` TIDAK cocok dengannya
//   (sering kena elemen "Download" lain yang tersembunyi, atau tidak match sama
//   sekali) → pakai walk shadow-DOM manual: cari elemen dengan textContent 'Download'
//   persis, visible (rect > 5px), dan aria-disabled != 'true'.
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const [input, output] = process.argv.slice(2)
const t0 = Date.now()

function fail(code, msg) {
  console.error(`ADOBE_ERR:${code}: ${msg}`)
  process.exit(1)
}

if (!input || !output) fail('USAGE', 'node adobe-rmbg.mjs <input> <output.png>')
if (!fs.existsSync(input)) fail('NO_INPUT', `file tidak ada: ${input}`)

const profile = process.env.ADOBE_PROFILE || path.join(os.homedir(), 'adobe-rmbg-profile')
const executable = process.env.ADOBE_EXECUTABLE || '/usr/bin/google-chrome'
if (!fs.existsSync(profile)) fail('NO_PROFILE', `profil Chrome tidak ada: ${profile}`)
if (!fs.existsSync(executable)) fail('NO_CHROME', `chrome tidak ada: ${executable}`)

const URL_TOOL = 'https://new.express.adobe.com/tools/remove-background'
const LOGIN_MARKERS = ['accounts.adobe.com', 'signin', 'login', 'auth.adobe.com']

const ctx = await chromium.launchPersistentContext(profile, {
  executablePath: executable,
  headless: false,
  viewport: { width: 1100, height: 750 },
  args: [
    '--no-sandbox', '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    // ⚠️ WAJIB: --disable-gpu-compositing. Di VPS (CPU beda dari dev), saat
    // klik Download Adobe merender hasil full-res → kompositor GPU (swiftshader)
    // crash → page/context mati → "Target page, context or browser has been
    // closed" (gagal ~2/3 run tanpa flag ini; 0/3→3/3 dengan flag ini, 2026-10-05).
    '--disable-gpu-compositing',
    // ⚠️ Matikan Memory Saver / tab discarding: di VPS (RAM sempit), Chrome bisa
    // diam-diam membuang tab yang sedang download → PAGE_CLOSED tanpa crash dummy
    // ("Target page, context or browser has been closed" ~2/3 run). Dev tidak kena
    // karena swap 8GB. (2026-10-05)
    '--disable-features=TabDiscarding',
    '--disable-background-tab-freezing',
    '--disable-backgrounding-occluded-windows',
    // ⚠️ JANGAN tambah flag "hemat" lain: --disable-background-networking membuat
    // Adobe Express tidak pernah menampilkan tombol Download (proses hasil macet).
  ],
  ignoreDefaultArgs: ['--enable-automation'],
})

let downloadArmed = false
const dlWaiters = new Set()

// download handler: path()+copy → fallback saveAs → beri tahu semua waiter.
// Bisa di-arm ulang → retry klik Download aman (race "Target page, context or
// browser has been closed" di VPS 2026-10-05 sembuh lewat retry).
async function handleDownload(d, outputPath) {
  if (!downloadArmed) return
  downloadArmed = false
  let ok = false
  // 1) URL download → fetch via ctx.request (berbagi cookie browser).
  //    Kebal matinya tab: di VPS, klik Download kadang mematikan page/context
  //    ("Target page, context or browser has been closed") — URL sudah tertangkap
  //    sebelum itu, dan fetch berjalan di luar browser.
  try {
    const u = d.url()
    console.log('DL_URL', u.slice(0, 140))
    if (u && u.startsWith('http')) {
      const r = await ctx.request.get(u, { timeout: 60_000 })
      if (r.ok()) {
        const buf = await r.body()
        if (buf.length > 1000 && buf.subarray(0, 4).toString('hex') === '89504e47') {
          fs.writeFileSync(outputPath, buf)
          ok = true
          console.log('DOWNLOAD_OK(fetch)', buf.length, 'bytes')
        } else {
          console.log('DL_FETCH_NOT_PNG', r.status(), buf.length)
        }
      }
    }
  } catch (e) { console.log('DL_FETCH_ERR', String(e).slice(0, 140)) }
  // 2) blob: URL → fetch DI DALAM halaman (blob tidak bisa diambil dari luar browser;
  //    jalur ini lebih cepat dari path() → sering menang balapan dengan kematian tab)
  if (!ok) {
    try {
      const u = d.url()
      if (u && u.startsWith('blob:')) {
        const b64 = await page.evaluate(async (blobUrl) => {
          const r = await fetch(blobUrl)
          const b = await r.blob()
          const buf = new Uint8Array(await b.arrayBuffer())
          let bin = ''
          for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000))
          return btoa(bin)
        }, u)
        const buf = Buffer.from(b64, 'base64')
        if (buf.subarray(0, 4).toString('hex') === '89504e47') {
          fs.writeFileSync(outputPath, buf)
          ok = true
          console.log('DOWNLOAD_OK(blob-fetch)', buf.length, 'bytes')
        }
      }
    } catch (e) { console.log('DL_BLOB_ERR', String(e).slice(0, 140)) }
  }
  // 3) cadangan: path()+copy
  if (!ok) {
    try {
      const p = await d.path()
      if (p) {
        fs.copyFileSync(p, outputPath)
        ok = true
        console.log('DOWNLOAD_OK', d.suggestedFilename(), '->', outputPath)
      }
    } catch (e) { console.log('DL_PATH_ERR', String(e).slice(0, 120)) }
  }
  // 3) cadangan terakhir: saveAs
  if (!ok) {
    try {
      await d.saveAs(outputPath)
      ok = true
      console.log('DOWNLOAD_OK(saveAs)', d.suggestedFilename(), '->', outputPath)
    } catch (e2) { console.log('DL_SAVE_ERR', String(e2).slice(0, 120)) }
  }
  for (const w of dlWaiters) w(ok)
  dlWaiters.clear()
}
ctx.on('page', (p) => p.on('download', (d) => handleDownload(d, output)))

let page = ctx.pages()[0]
if (!page) page = await ctx.newPage()
page.on('download', (d) => handleDownload(d, output))
// diagnosa: kenapa page/context mati (VPS 2026-10-05: mati pas klik Download)
page.on('close', () => console.log('PAGE_CLOSED'))
page.on('crash', () => console.log('PAGE_CRASHED'))
ctx.on('disconnected', () => console.log('CTX_DISCONNECTED'))

// walk shadow-DOM: elemen dengan teks persis `label`, visible, bukan disabled
// ⚠️ HARUS fungsi asli (bukan string template) — page.evaluate(string, arg)
// mengevaluasi string sebagai ekspresi, hasilnya undefined (bug nyata 2026-10-05).
function WALK_TXT(label) {
  const hits = []
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walk(el.shadowRoot)
      const r = el.getBoundingClientRect()
      if (r.width < 5 || r.height < 5) continue
      const t = (el.textContent || '').trim()
      if (t === label && el.children.length <= 2) {
        hits.push({ tag: el.tagName, disabled: el.getAttribute('aria-disabled') })
      }
    }
  }
  walk(document)
  return hits
}

function CLICK_TXT(label) {
  let target = null
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walk(el.shadowRoot)
      const r = el.getBoundingClientRect()
      if (r.width < 5 || r.height < 5) continue
      const t = (el.textContent || '').trim()
      if (t === label && el.children.length <= 2 && !target) target = el
    }
  }
  walk(document)
  if (!target) return false
  target.click()
  return true
}

try {
  await page.goto(URL_TOOL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(3000)
  const cur = page.url()
  if (LOGIN_MARKERS.some((m) => cur.includes(m))) {
    fail('SESSION_EXPIRED', `dilempar ke halaman login (${cur.slice(0, 80)}) — sesi Adobe kedaluwarsa`)
  }

  // dismiss banner cookie — diulang-ulang sepanjang proses, karena banner bisa
  // muncul TELAT (wall consent Adobe menutup aplikasi → tombol Download tak ada).
  const BANNER_LABELS = ['Confirm my choices', 'Enable all', 'Allow all', 'Accept all', "Don't enable", 'Reject all', 'Decline']
  async function dismissBanners() {
    for (const label of BANNER_LABELS) {
      try {
        const b = page.getByRole('button', { name: label }).first()
        if (await b.isVisible({ timeout: 500 })) {
          await b.click()
          console.log('DISMISS', label)
          await page.waitForTimeout(800)
        }
      } catch { /* tidak ada banner itu — lanjut */ }
    }
  }
  await page.waitForTimeout(2500)
  await dismissBanners()
  await page.waitForTimeout(2500)

  // ── pastikan halaman TOOL benar-benar ke-mount, baru upload ─────────────
  // Pelajaran 2026-10-05 (bug nyata, ~40-50% run gagal):
  //   App express KADANG mentok di home page walau URL sudah route tool
  //   ("How would you like to start?" + Recent files + Quick edits). Tanda
  //   pembeda: input file TOOL accept-nya EKSTENSI (".jpeg,.jpg,.png,.webp,.heic"),
  //   input upload HOME accept-nya MIME ("image/png, image/jpeg"). Upload ke input
  //   home TIDAK PERNAH memproses apa pun. Jadi jangan upload sebelum tool mount.
  const HOME_MARKER = () => {
    const walk = (root, out) => {
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) walk(el.shadowRoot, out)
        const r = el.getBoundingClientRect()
        if (r.width < 5 || r.height < 5) continue
        const t = (el.textContent || '').trim()
        if (t === 'How would you like to start?') out.push(t)
      }
    }
    const out = []
    walk(document, out)
    return out
  }

  async function currentInput() {
    const inputs = page.locator('input[type=file]')
    const n = await inputs.count()
    let mime = null
    for (let i = 0; i < n; i++) {
      const acc = (await inputs.nth(i).getAttribute('accept')) || ''
      if (process.env.ADOBE_DEBUG) console.log('INPUT', i, 'accept=' + JSON.stringify(acc))
      if (/\.(jpeg|jpg|png|webp|heic)/i.test(acc)) return { el: inputs.nth(i), strict: true }
      if (/jpeg|jpg|png|webp/i.test(acc) && !mime) mime = inputs.nth(i)
    }
    // fallback MIME hanya kalau halaman TERBUKTI tool (tidak ada home marker)
    if (mime) {
      const home = await page.evaluate(HOME_MARKER).catch(() => [])
      if (!home.length) return { el: mime, strict: false }
    }
    return null
  }

  async function waitInput(ms) {
    const deadline = Date.now() + ms
    for (;;) {
      const got = await currentInput()
      if (got) return got
      if (Date.now() >= deadline) return null
      await page.waitForTimeout(2000)
    }
  }

  // klik tile "Remove background" (Quick edits) — alur masuk user asli
  const CLICK_TILE = () => {
    const labels = []
    const walk = (root) => {
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) walk(el.shadowRoot)
        const t = (el.textContent || '').trim()
        if (t === 'Remove background' && el.children.length === 0 && el.getBoundingClientRect().width > 5) labels.push(el)
      }
    }
    walk(document)
    for (const leaf of labels) {
      let cur = leaf
      while (cur && cur !== document.body) {
        const r = cur.getBoundingClientRect()
        if (r.width > 100 && r.height > 40) { cur.click(); return true }
        cur = cur.parentElement
      }
    }
    return false
  }

  // 1) kesempatan pertama: tunggu tool mount (load pertama bisa 15-20 detik)
  let inputEl = (await waitInput(20_000))?.el ?? null

  // 2) recovery: home → klik tile → fresh goto; ulang sampai input tool ada
  for (let attempt = 0; attempt < 5 && !inputEl; attempt++) {
    const markers = await page.evaluate(HOME_MARKER).catch(() => [])
    if (markers.length) {
      console.log('HOME_STATE → attempt', attempt + 1)
      const clicked = await page.evaluate(CLICK_TILE).catch(() => false)
      console.log('  tile click:', clicked)
      await page.waitForTimeout(4000)
      inputEl = (await waitInput(8000))?.el ?? null
      if (inputEl) break
    }
    console.log('  fresh goto #', attempt + 1)
    await page.goto(URL_TOOL, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {})
    await page.waitForTimeout(8000)
    await dismissBanners()
    inputEl = (await waitInput(12_000))?.el ?? null
  }
  if (!inputEl) fail('NO_TOOL', 'halaman tool Adobe Express tidak pernah ke-mount (5× percobaan)')

  await inputEl.setInputFiles({
    name: path.basename(input),
    mimeType: /\.png$/i.test(input) ? 'image/png' : 'image/jpeg',
    buffer: fs.readFileSync(input),
  })
  console.log('UPLOADED', (Date.now() - t0) / 1000, 's')

  // tunggu tombol Download siap (hasil jadi): walk shadow DOM tiap 2.5 dtk
  // (getByRole tidak cocok dengan sp-button — lihat catatan di atas file ini)
  let dlReady = false
  for (let i = 0; i < 70 && !dlReady; i++) {
    const u = page.url()
    if (LOGIN_MARKERS.some((m) => u.includes(m))) fail('SESSION_EXPIRED', 'login redirect saat proses')
    if (i % 6 === 0) await dismissBanners().catch(() => {})
    // pindai SEMUA tab (app bisa membuka tool di tab baru — tab lama tetap home page)
    const pagesNow = ctx.pages()
    for (const p of pagesNow) {
      try {
        const hits = await p.evaluate(WALK_TXT, 'Download')
        if (process.env.ADOBE_DEBUG) console.log('POLL', i, p.url().slice(0, 70), JSON.stringify(hits))
        if (hits.some((h) => h.disabled !== 'true')) { dlReady = true; break }
      } catch { /* tab mungkin lagi navigasi */ }
    }
    if (!dlReady) await page.waitForTimeout(2500)
  }

  if (!dlReady) {
    try {
      const shot = `${output}.debug.png`
      await page.screenshot({ path: shot, fullPage: false })
      const title = await page.title().catch(() => '')
      const leafTxt = await page.evaluate(() => {
        const out = []
        const walk = (root) => {
          for (const el of root.querySelectorAll('*')) {
            if (el.shadowRoot) walk(el.shadowRoot)
            const r = el.getBoundingClientRect()
            if (r.width < 5 || r.height < 5) continue
            const t = (el.textContent || '').trim()
            if (t && t.length < 50 && el.children.length === 0) out.push(t)
          }
        }
        walk(document)
        return out.slice(0, 60)
      }).catch(() => [])
      const btns = await page.evaluate(() => {
        const out = new Set()
        const walk = (root) => {
          for (const el of root.querySelectorAll('*')) {
            if (el.shadowRoot) walk(el.shadowRoot)
            const r = el.getBoundingClientRect()
            if (r.width < 5 || r.height < 5) continue
            const t = (el.textContent || '').trim()
            if (t && t.length < 40 && (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.tagName === 'SP-BUTTON')) out.add(t)
          }
        }
        walk(document)
        return [...out].slice(0, 30)
      }).catch(() => [])
      console.error(`ADOBE_ERR:NO_DOWNLOAD: Download tidak siap dalam ${Math.round((Date.now() - t0) / 1000)}s; url=${page.url()}; pages=${ctx.pages().map((p) => p.url().slice(0, 80)).join(' | ')}; title=${title}; screen=${shot}; leaf=${JSON.stringify(leafTxt)}; btns=${JSON.stringify(btns)}`)
    } catch { /* bukti visual gagal pun tak apa */ }
    fail('NO_DOWNLOAD', 'tombol Download tidak muncul')
  }
  console.log('READY_DOWNLOAD', (Date.now() - t0) / 1000, 's')

  // ── ambil hasil: ekstrak dari DOM dulu (anti-race) ─────────────────────
  // Klik Download + event download sering kalah balap (browser/page ditutup
  // atau download di-cancel saat page navigasi — kejadian ~1/3 di VPS dengan
  // error "Target page, context or browser has been closed"). Hasilnya juga
  // tampil di halaman sebagai <img blob:> atau <canvas> → fetch langsung.
  const EXTRACT_FN = async () => {
    const imgs = []
    const canvases = []
    const walk = (root) => {
      for (const el of root.querySelectorAll('img, canvas')) {
        if (el.shadowRoot) walk(el.shadowRoot)
        const w = el.naturalWidth || el.width || 0
        const h = el.naturalHeight || el.height || 0
        if (w < 400 || h < 400) continue
        if (el.tagName === 'CANVAS') canvases.push(el)
        else if ((el.src || '').startsWith('blob:')) imgs.push({ el, w, h })
      }
    }
    walk(document)
    const srt = (a, b) => b.w * b.h - a.w * a.h
    const img = imgs.sort(srt)[0]
    if (img) {
      try {
        const r = await fetch(img.el.src)
        const b = await r.blob()
        const buf = new Uint8Array(await b.arrayBuffer())
        let bin = ''
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000))
        return { kind: 'blob', data: btoa(bin), w: img.w, h: img.h }
      } catch (e) { return { kind: 'blob_err', error: String(e).slice(0, 100) } }
    }
    if (canvases.length) {
      try { return { kind: 'canvas', data: canvases[0].toDataURL('image/png') } } catch (e) { return { kind: 'canvas_err', error: String(e).slice(0, 100) } }
    }
    return { kind: 'none' }
  }

  let wrote = false
  try {
    const ex = await page.evaluate(EXTRACT_FN)
    if (ex && (ex.kind === 'blob' || ex.kind === 'canvas') && ex.data) {
      const b64 = ex.kind === 'canvas' ? ex.data.split(',')[1] : ex.data
      const buf = Buffer.from(b64, 'base64')
      if (buf.subarray(0, 4).toString('hex') === '89504e47') {
        fs.writeFileSync(output, buf)
        console.log('EXTRACTED', ex.w ? `${ex.w}x${ex.h} ` : '', fs.statSync(output).size, 'bytes')
        wrote = true
      } else {
        console.log('EXTRACT_NOT_PNG', ex.kind, (buf.length / 1024).toFixed(0) + 'KB')
      }
    } else {
      console.log('EXTRACT_FAIL', JSON.stringify(ex).slice(0, 200))
    }
  } catch (e) { console.log('EXTRACT_ERR', String(e).slice(0, 200)) }

  if (!wrote) {
    // cadangan: klik Download + retry (race intermittent — retry menang)
    for (let attempt = 1; attempt <= 5 && !wrote; attempt++) {
      console.log('DL_ATTEMPT', attempt)
      // ⚠️ blokir window.close: di VPS, app Adobe kadang MENUTUP halaman sendiri
      // tepat setelah klik Download (PAGE_CLOSED tanpa crash) → semua jalur
      // download mati. Override ini menahannya supaya download sempat selesai.
      for (const p of ctx.pages()) {
        try {
          await p.evaluate(() => {
            try { window.close = () => console.log('WINDOW_CLOSE_BLOCKED') } catch {}
          })
        } catch { /* tab mati — biarkan */ }
      }
      let clickedDl = false
      for (const p of ctx.pages()) {
        try {
          if (await p.evaluate(CLICK_TXT, 'Download')) { clickedDl = true; break }
        } catch { /* lanjut */ }
      }
      if (!clickedDl) break
      downloadArmed = true
      const ok = await new Promise((resolve) => {
        const w = (v) => resolve(v)
        dlWaiters.add(w)
        setTimeout(() => { dlWaiters.delete(w); resolve(false) }, 25_000)
      })
      if (ok) { wrote = true; break }
      await page.waitForTimeout(2000)
    }
    if (!wrote) fail('NO_DOWNLOAD', 'download gagal setelah 5 percobaan')
  }

  if (!fs.existsSync(output)) fail('NO_OUTPUT', `file hasil tidak ada: ${output}`)
  console.log('OK', fs.statSync(output).size, 'bytes', ((Date.now() - t0) / 1000).toFixed(1), 's')
} catch (e) {
  const msg = e?.message || String(e)
  if (msg.startsWith('ADOBE_ERR')) {
    console.error(msg)
  } else {
    console.error(`ADOBE_ERR:UNKNOWN: ${msg}`)
  }
  process.exit(1)
} finally {
  try { await ctx.close() } catch { /* biarkan */ }
}