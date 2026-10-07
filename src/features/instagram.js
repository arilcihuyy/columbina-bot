// Downloader Instagram (post/reel/carousel) — port dari Haruna-Bot,
// dibersihkan dari dependency framework. 3 strategi berlapis:
// 1) mobile API, 2) HTML embed, 3) GraphQL internal.
import axios from 'axios'
import { randomBytes } from 'crypto'
import { ScraprService } from './dlmux.js'

// Cadangan kalau 3 strategi utama gagal (port scrapr: downreels).
const igScraperFallback = new ScraprService({
  label: 'Instagram',
  referer: 'https://www.instagram.com/',
  prefer: ['video', 'image'],
  chain: [['downreels', 'instagram-downreels', { referer: 'https://www.instagram.com/' }]],
})

const GENERIC_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const commonHeaders = { 'user-agent': GENERIC_UA, 'sec-gpc': '1', 'sec-fetch-site': 'same-origin', 'x-ig-app-id': '936619743392459' }
const mobileHeaders = { 'x-ig-app-locale': 'en_US', 'x-ig-device-locale': 'en_US', 'x-ig-mapped-locale': 'en_US', 'user-agent': 'Instagram 275.0.0.27.98 Android (33/13; 280dpi; 720x1423; Xiaomi; Redmi 7; onclite; qcom; en_US; 458229237)', 'accept-language': 'en-US', 'x-fb-http-engine': 'Liger', 'x-fb-client-ip': 'True', 'x-fb-server-cluster': 'True', 'content-length': '0' }
const embedHeaders = { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8', 'Accept-Language': 'en-GB,en;q=0.9', 'Cache-Control': 'max-age=0', 'Dnt': '1', 'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"', 'Sec-Ch-Ua-Mobile': '?0', 'Sec-Ch-Ua-Platform': '"macOS"', 'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Site': 'none', 'Sec-Fetch-User': '?1', 'Upgrade-Insecure-Requests': '1', 'User-Agent': GENERIC_UA }

// Kalau IG_COOKIE diisi (cookie session browser yang sudah login IG), semua
// request anonim berubah jadi "login" — ini jalan keluar saat Instagram
// memblokir akses anon dari IP server/data center.
const IG_COOKIE = process.env.IG_COOKIE || ''
const auth = (headers = {}) => (IG_COOKIE ? { ...headers, cookie: IG_COOKIE } : headers)

const getNumberFromQuery = (name, data) => { const s = data?.match(new RegExp(name + '=(\\d+)'))?.[1]; if (+s) return +s }
const getObjectFromEntries = (name, data) => { const obj = data?.match(new RegExp('\\["' + name + '",.*?,({.*?}),\\d+\\]'))?.[1]; return obj && JSON.parse(obj) }

class InstagramService {
  async _primary(rawUrl) {
    const url = rawUrl.trim()
    const postId = this._extractPostId(url)
    const shareId = this._extractShareId(url)
    const storyMatch = url.match(/\/stories\/([^/]+)\/(\d+)/)

    if (shareId) {
      const resolved = await this._resolveShareLink(shareId)
      if (!resolved) throw new Error('Gagal resolve share link Instagram.')
      return this.resolve(resolved)
    }
    if (!postId && !storyMatch) throw new Error('URL Instagram tidak valid.')
    if (postId) return this._getPost(postId)
    throw new Error('Story Instagram tidak didukung tanpa cookies.')
  }

  _extractPostId(url) { return url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/)?.[1] ?? null }
  _extractShareId(url) { return url.match(/instagram\.com\/share\/(?:p\/|reel\/)?([A-Za-z0-9_-]+)/)?.[1] ?? null }

  async _resolveShareLink(shareId) {
    try {
      const res = await axios.get(`https://www.instagram.com/share/${shareId}/`, { headers: auth({ 'user-agent': 'curl/7.88.1' }), maxRedirects: 5, timeout: 10_000, validateStatus: () => true })
      return res.headers?.location ?? res.request?.res?.responseUrl ?? null
    } catch { return null }
  }

  async _getMediaId(id) {
    try {
      const url = new URL('https://i.instagram.com/api/v1/oembed/')
      url.searchParams.set('url', `https://www.instagram.com/p/${id}/`)
      const { data } = await axios.get(url.toString(), { headers: auth(mobileHeaders), timeout: 10_000 })
      return data?.media_id ?? null
    } catch { return null }
  }

  async _requestMobileApi(mediaId) {
    try {
      const { data } = await axios.get(`https://i.instagram.com/api/v1/media/${mediaId}/info/`, { headers: auth(mobileHeaders), timeout: 12_000 })
      return data?.items?.[0] ?? null
    } catch { return null }
  }

  // Ambil JSON pohon "shortcode_media" dari HTML embed (format yang dipakai
  // Instagram sekarang: `<script>... "shortcode_media":{...} ...</script>`).
  // JSON-nya di-escape di dalam string, jadi harus unescape dulu, lalu kurung
  // kurawalnya dihitung supaya tidak salah potong.
  _parseShortcodeMedia(html) {
    // JSON di dalam script itu di-escape dua lapis: \" untuk kutip, \/ untuk
    // garis miring. Kalau \/ tidak dibersihkan, URL CDN-nya jadi tidak valid.
    const unescaped = String(html)
      .replace(/\\u002F/gi, '/')
      .replace(/\\\//g, '/')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
    const key = '"shortcode_media":'
    const idx = unescaped.indexOf(key)
    if (idx === -1) return null
    const start = idx + key.length
    let depth = 0
    for (let i = start; i < unescaped.length; i++) {
      const c = unescaped[i]
      if (c === '{') depth++
      else if (c === '}') {
        depth--
        if (depth === 0) {
          try { return JSON.parse(unescaped.slice(start, i + 1)) } catch { return null }
        }
      }
    }
    return null
  }

  async _requestHTML(id) {
    try {
      const { data: html } = await axios.get(`https://www.instagram.com/p/${id}/embed/captioned/`, { headers: auth(embedHeaders), timeout: 12_000 })
      // cara lama: preloader "init" + contextJSON (sering kosong sekarang)
      const rawMatch = html?.match?.(/"init",\[\],\[(.*?)\]\]?,/)
      if (rawMatch) {
        try {
          const embedData = JSON.parse(rawMatch[1])
          if (embedData?.contextJSON) return JSON.parse(embedData.contextJSON)
        } catch { /* lanjut ke cara baru */ }
      }
      // cara baru: pohon shortcode_media langsung dari embed
      const media = this._parseShortcodeMedia(html)
      return media ? { gql_data: { shortcode_media: media } } : null
    } catch { return null }
  }

  async _getGQLParams(id) {
    try {
      const { data: html } = await axios.get(`https://www.instagram.com/p/${id}/`, { headers: auth(embedHeaders), timeout: 12_000 })
      const siteData = getObjectFromEntries('SiteData', html)
      const polarisSiteData = getObjectFromEntries('PolarisSiteData', html)
      const webConfig = getObjectFromEntries('DGWWebConfig', html)
      const pushInfo = getObjectFromEntries('InstagramWebPushInfo', html)
      const lsd = getObjectFromEntries('LSD', html)?.token || randomBytes(8).toString('base64url')
      const csrf = getObjectFromEntries('InstagramSecurityConfig', html)?.csrf_token
      const anon_cookie = [csrf && `csrftoken=${csrf}`, polarisSiteData?.device_id && `ig_did=${polarisSiteData.device_id}`, 'wd=1280x720', 'dpr=2', polarisSiteData?.machine_id && `mid=${polarisSiteData.machine_id}`, 'ig_nrcb=1'].filter(Boolean).join('; ')
      return {
        headers: { 'x-ig-app-id': webConfig?.appId || '936619743392459', 'X-FB-LSD': lsd, 'X-CSRFToken': csrf, 'X-Bloks-Version-Id': getObjectFromEntries('WebBloksVersioningID', html)?.versioningID, 'x-asbd-id': '129477', cookie: anon_cookie },
        body: { __d: 'www', __a: '1', __s: '::' + Math.random().toString(36).substring(2).replace(/\d/g, '').slice(0, 6), __hs: siteData?.haste_session || '20126.HYP:instagram_web_pkg.2.1...0', __req: 'b', __ccg: 'EXCELLENT', __rev: pushInfo?.rollout_hash || '1019933358', __hsi: siteData?.hsi || '7436540909012459023', __dyn: randomBytes(154).toString('base64url'), __csr: randomBytes(154).toString('base64url'), __user: '0', __comet_req: getNumberFromQuery('__comet_req', html) || '7', av: '0', dpr: '2', lsd, jazoest: getNumberFromQuery('jazoest', html) || Math.floor(Math.random() * 10000), __spin_r: siteData?.__spin_r || '1019933358', __spin_b: siteData?.__spin_b || 'trunk', __spin_t: siteData?.__spin_t || Math.floor(Date.now() / 1000) },
      }
    } catch { return null }
  }

  async _requestGQL(id) {
    try {
      const params = await this._getGQLParams(id)
      if (!params) return null
      const { data } = await axios.post('https://www.instagram.com/graphql/query',
        new URLSearchParams({ ...params.body, fb_api_caller_class: 'RelayModern', fb_api_req_friendly_name: 'PolarisPostActionLoadPostQueryQuery', variables: JSON.stringify({ shortcode: id, fetch_tagged_user_count: null, hoisted_comment_id: null, hoisted_reply_id: null }), server_timestamps: true, doc_id: '8845758582119845' }).toString(),
        { headers: auth({ ...embedHeaders, ...params.headers, 'content-type': 'application/x-www-form-urlencoded', 'X-FB-Friendly-Name': 'PolarisPostActionLoadPostQueryQuery' }), timeout: 15_000 })
      return { gql_data: data?.data ?? null }
    } catch { return null }
  }

  _extractOldPost(data, id) {
    const shortcodeMedia = data?.gql_data?.shortcode_media || data?.gql_data?.xdt_shortcode_media
    const sidecar = shortcodeMedia?.edge_sidecar_to_children
    if (sidecar) {
      const items = sidecar.edges.filter((e) => e.node?.display_url).map((e) => ({ type: e.node?.is_video && e.node?.video_url ? 'video' : 'image', url: e.node?.is_video && e.node?.video_url ? e.node.video_url : e.node.display_url, thumb: e.node.display_url }))
      if (items.length) return { type: 'carousel', items, id }
    }
    if (shortcodeMedia?.video_url) return { type: 'video', url: shortcodeMedia.video_url, filename: `instagram_${id}.mp4` }
    if (shortcodeMedia?.display_url) return { type: 'image', url: shortcodeMedia.display_url, filename: `instagram_${id}.jpg` }
  }

  _extractNewPost(data, id) {
    const carousel = data.carousel_media
    if (carousel) {
      const items = carousel.filter((e) => e?.image_versions2).map((e) => {
        const isVideo = !!e.video_versions
        const imageUrl = e.image_versions2.candidates[0].url
        const url = isVideo ? e.video_versions.reduce((a, b) => a.width * a.height < b.width * b.height ? b : a).url : imageUrl
        return { type: isVideo ? 'video' : 'image', url, thumb: imageUrl }
      })
      if (items.length) return { type: 'carousel', items, id }
    }
    if (data.video_versions) {
      const best = data.video_versions.reduce((a, b) => a.width * a.height < b.width * b.height ? b : a)
      return { type: 'video', url: best.url, filename: `instagram_${id}.mp4` }
    }
    if (data.image_versions2?.candidates) return { type: 'image', url: data.image_versions2.candidates[0].url, filename: `instagram_${id}.jpg` }
  }

  async _getPost(id) {
    const hasData = (d) => d && d.gql_data !== null && d?.gql_data?.xdt_shortcode_media !== null
    let data = null
    try {
      const mediaId = await this._getMediaId(id)
      if (mediaId) data = await this._requestMobileApi(mediaId)
      if (!hasData(data)) data = await this._requestHTML(id)
      if (!hasData(data)) data = await this._requestGQL(id)
    } catch (err) { console.warn('[IG] getPost error:', err?.message) }
    if (!data) throw new Error('Gagal mengambil data. Post mungkin private atau dihapus.')
    const result = data?.gql_data !== undefined ? this._extractOldPost(data, id) : this._extractNewPost(data, id)
    if (!result) throw new Error('Tidak bisa extract media dari post ini.')
    return result
  }

  // Jalur utama dulu (parser embed sendiri). Kalau gagal — Instagram cukup sering
  // mengganti format halaman — baru pakai scraper cadangan dari scrapr (downreels).
  async resolve(rawUrl) {
    try {
      return await this._primary(rawUrl)
    } catch (err) {
      try {
        const alt = await igScraperFallback.resolve(rawUrl)
        if (alt?.items?.length) {
          if (alt.items.length > 1) {
            return { type: 'carousel', id: 'ig', items: alt.items.map((i) => ({ type: i.type, url: i.url, thumb: i.url })) }
          }
          const stamp = Date.now()
          return alt.kind === 'video'
            ? { type: 'video', url: alt.url, filename: `instagram_${stamp}.mp4` }
            : { type: 'image', url: alt.url, filename: `instagram_${stamp}.jpg` }
        }
      } catch {
        /* cadangan ikut gagal: lempar error aslinya */
      }
      throw err
    }
  }

  async toBuffer(url) {
    try {
      // jaring pengaman: buang backslash escape (\https:\/\/...) kalau ada
      const clean = String(url).replace(/\\\//g, '/').replace(/^\\+/, '')
      const { data } = await axios.get(clean, { responseType: 'arraybuffer', timeout: 60_000, headers: { 'user-agent': GENERIC_UA, referer: 'https://www.instagram.com/' }, maxContentLength: 200 * 1024 * 1024 })
      return Buffer.from(data)
    } catch (err) { throw new Error(`Gagal download media Instagram (${err.response?.status ?? 'timeout'}).`) }
  }
}

export const instagramService = new InstagramService()
