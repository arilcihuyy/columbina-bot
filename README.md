# 🌙 Columbina Bot

**A batteries-included WhatsApp bot, set up with a single command.** Stickers (image, video, text, animated brat), background removal, downloaders for 15+ platforms, and a link inspector — no database, no heavy framework, no build step.

[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen?logo=node.js)](https://nodejs.org)
[![Baileys](https://img.shields.io/badge/baileys-7.0.0--rc14-25D366?logo=whatsapp)](https://github.com/whiskeysockets/Baileys)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![PRs](https://img.shields.io/badge/PRs-welcome-success)](CONTRIBUTING.md)

```bash
git clone https://github.com/arilcihuyy/columbina-bot.git
cd columbina-bot
npm install && npm run setup       # wizard: bot name, number, prefix → ready to run
npm start
```

The wizard actually carries you all the way to a live bot: it checks Node and ffmpeg, writes `.env`, applies the Baileys patch, runs diagnostics, and helps you link WhatsApp (pairing code or QR).

---

## ✨ Why this bot

- **One-command setup.** `npm run setup` writes your config, verifies system dependencies, and tells you exactly what is missing when something is off.
- **It diagnoses itself.** `npm run doctor` checks Node, ffmpeg, yt-dlp, fonts, working directories, write permissions, and configuration — and every problem comes with a suggested fix.
- **No database.** The WhatsApp session is stored as files, and small state (pending TikTok photos, and so on) lives in memory. Clone it, run it.
- **Easy on small VPS instances.** Every heavy job (`rmbg`, `arbg`) runs as a `nice`-d child process, so a saturated CPU never drops the Baileys connection.
- **Real tests, not empty ones.** `npm run test:all` exercises 8 modules: media conversion, menu layout, multi-prefix routing, sticker rendering, the TikTok photo parser, view-once messages, and `ytmp3`.
- **Free and open.** MIT. No telemetry. No developer-owned server in the middle.

---

## 📋 Commands

Default prefix is `!` — changeable, and you can enable several at once (`!`, `.`, `/`).

### 🎨 Stickers

| Command | Aliases | What it does |
|---|---|---|
| `!sticker` | `!s`, `!stiker`, `!sgif` | Photo/video → sticker. Reply to the media, or send it with the caption `!sticker Pack Name` |
| `!brat` | `!ttp`, `!t2s`, `!textsticker` | Text → sticker in the **brat** style (white background, bold type) |
| `!animatedtext` | `!atts`, `!attp`, `!bratanim` | Text → **animated** brat sticker (slow zoom effect) |
| `!toimg` | `!toimage`, `!img`, `!png` | Sticker → PNG image |
| `!rmbg` | `!removebg`, `!nobg` | Remove the background, locally and for free (rembg model on your own server) |
| `!arbg` | `!adobebg`, `!bgadobe` | Remove the background through Adobe Express — the cleanest cutouts |

### 📥 Downloaders

| Command | Aliases | What it does |
|---|---|---|
| `!tiktok` | `!tt`, `!ttdl` | TikTok video / photo / audio (no watermark) |
| `!preview` | `!prw`, `!pv` | TikTok video preview as a **view-once** message |
| `!youtube` | `!yt`, `!ytdl` | YouTube video (safe resolution and size caps) |
| `!ytmp3` | `!yta` | YouTube audio → MP3 |
| `!instagram` | `!ig`, `!reels` | Instagram post / reel / carousel |
| `!facebook` | `!fb`, `!fbdl` | Facebook video and Reels |
| `!twitter` | `!tw`, `!x` | Twitter/X video and images |
| `!pinterest` | `!pin` | Pinterest images and video |
| `!pixiv` | `!px` | Pixiv illustrations |
| `!bilibili` | `!bili` | Bilibili video |
| `!douyin` | `!dy` | Douyin video |
| `!rednote` | `!xhs` | RedNote (Xiaohongshu) video and images |
| `!soundcloud` | `!sc` | SoundCloud track → MP3 |
| `!spotify` | `!sp` | Grab a track from a Spotify link |
| `!applemusic` | `!am` | Grab a track from an Apple Music link |

### 🛠 Tools

| Command | Aliases | What it does |
|---|---|---|
| `!cek` | `!ceklink`, `!jelas` | Reveal the **real destination** of a link without opening it (anti-shortlink / anti-scam, follows redirects over Tor) |
| `!menu` | `!help`, `!h`, `!?` | Show the menu |

Send `!menu` inside WhatsApp to see the version rendered with your own configuration.

---

## 🚀 Installation

### 1. Prerequisites

| Requirement | Why | How to install (Ubuntu/Debian) |
|---|---|---|
| **Node.js ≥ 20** | runs the bot | `curl -fsSL https://deb.nodesource.com/setup_20.x \| sudo -E bash - && sudo apt install -y nodejs` |
| **ffmpeg** | every media conversion | `sudo apt install -y ffmpeg` |

The wizard and `npm run doctor` will warn you if either one is missing.

### 2. Run the wizard

```bash
git clone https://github.com/arilcihuyy/columbina-bot.git
cd columbina-bot
npm install          # automatically runs the Baileys patch (see the notes below)
npm run setup        # ← the wizard
```

It only asks a few things:

1. **Bot name** (used in the menu and in sticker pack names)
2. **Prefix** — `!` (default), or several at once such as `!.`
3. **Owner number** — a guard so that only you can drive the bot
4. **Phone number for login** — gets you a pairing code, or leave it empty for QR
5. After that: `.env` is written, the Baileys patch is applied, a diagnostic runs,
   and the bot can be started straight from the wizard.

### 3. Link WhatsApp

- **Pairing code (recommended):** enter your phone number in the wizard, then on your phone open
  *WhatsApp → Linked Devices → Link a Device → Link with phone number* and type the 8 characters shown in the terminal.
- **QR:** leave the number empty, then scan the QR printed in the terminal.

The session is saved in `sessions/` so you never have to log in twice. **That folder
holds your account credentials — never commit it or share it** (it is already listed in `.gitignore`).

### 4. Run it

```bash
npm start            # normal run
npm run dev          # auto-restart on file changes (uses --watch)
```

---

## ⚙️ Configuration

Everything is configured through `.env` (see [`.env.example`](.env.example) — the full list, with comments). The ones you will actually touch:

| Variable | Default | Purpose |
|---|---|---|
| `BOT_NAME` | `Columbina Bot` | Bot name in the menu and in sticker pack names |
| `PREFIX` | `!` | Command prefix. `!` = one character; `!.` = both `!` and `.`; `!!,.` = multi-character |
| `OWNER_NUMBER` | *(empty)* | Owner number (62xxx). Empty = anyone may use commands |
| `PAIRING_NUMBER` | *(empty)* | Number used for the pairing code; empty = QR login |
| `LOG_LEVEL` | `info` | `silent` … `trace` |
| `RESPOND_TO_SELF` | `false` | Reply to messages sent from your own number? |
| `SESSION_PATH` | `./sessions` | Where the login session is stored |
| `MENU_BANNER` | `image` | `image` (picture), `text` (ASCII), or `off` |
| `MENU_BANNER_IMAGE_FILE` | `assets/columbina/banner.jpg` | Swap out the menu banner |
| `MENU_STYLE` | `math` | `math` (bold-italic unicode headings) or `plain` |
| `MENU_FOOTER` | first word of `BOT_NAME` | Text at the very bottom of the menu |
| `BOT_TEMP_DIR` | `./tmp` | Working directory. **Do not point it at `/tmp`** (it can be wiped mid-job) |

Optional features have their own variables — `YT_COOKIES_PATH`, `IG_COOKIE`,
`RMBG_PYTHON`, `LINKCHECK_TOR`, and others. All of them are documented in
[`.env.example`](.env.example).

---

## 🧩 Optional features (enable only what you need)

<details>
<summary><b>YouTube on a VPS</b> — why it often fails and how to fix it</summary>

Datacenter IPs are usually blocked by YouTube ("Sign in to confirm you're not a bot").
The fix is to give yt-dlp cookies from a browser that is already signed in:

1. Install the Chrome extension **Get cookies.txt LOCALLY**, open `youtube.com`, export.
2. Put the file on your server (e.g. `./cookies/youtube.txt`).
3. Set `YT_COOKIES_PATH=./cookies/youtube.txt` and restart the bot.

You also need the `yt-dlp` binary:

```bash
pipx install yt-dlp        # or: uv tool install yt-dlp
# or download the official binary from github.com/yt-dlp/yt-dlp/releases
```

If the binary is not on your `PATH`, set `YTDLP_PATH`.
</details>

<details>
<summary><b>Instagram</b> — "the post is private/deleted" on a public post</summary>

Instagram blocks anonymous access from server IPs. Fill `IG_COOKIE` with a logged-in
browser session cookie: DevTools (F12) → Network → click a request to
`instagram.com` → copy the `cookie:` header → paste it into `.env`.
</details>

<details>
<summary><b>!rmbg (local background removal)</b></summary>

```bash
python3 -m venv ~/rembg-venv
~/rembg-venv/bin/pip install rembg onnxruntime
```

The bot looks for `~/rembg-venv/bin/python` automatically. If you put it somewhere
else, set `RMBG_PYTHON`. The default model is `u2netp` (light, a good fit for a 1 GB
VPS); switch to `u2net` with `RMBG_MODEL=u2net` if your server can take it.
</details>

<details>
<summary><b>!arbg (Adobe Express — best quality)</b></summary>

Needs `xvfb` and Chrome/Chromium on the server, plus a **one-time Adobe login**:

```bash
sudo apt install -y xvfb
```

It uses a dedicated Chrome profile so that the Adobe session persists and does not
disturb any other browser. Run it manually once with a display (`xvfb-run`), log in,
and the bot reuses that session from then on. This feature is heavy
(~40–60 seconds per image), so it is only for when you genuinely need the cleanest cutout.
</details>

<details>
<summary><b>!cek (anti-shortlink)</b> — over Tor</summary>

`!cek` follows the redirect chain to reveal where a link really goes. To avoid being
rate-limited by Cloudflare, it goes through Tor at `127.0.0.1:9050` by default:

```bash
sudo apt install -y tor && sudo systemctl enable --now tor
```

If you would rather not use Tor, set `LINKCHECK_TOR=` (empty) for a direct connection.
</details>

---

## 🩺 Diagnostics & tests

```bash
npm run doctor             # inspect the environment — every issue comes with a fix
npm run doctor -- --json   # JSON output (for automation/monitoring)
npm run test:all           # 8 test modules: media, menu, prefix, stickers, TikTok, prw, yt
```

`npm run doctor` checks the Node version, ffmpeg and ffprobe, yt-dlp, sticker fonts,
the working directory, write permissions, config files, and whether an owner number is
set. Every failure comes with the command that fixes it.

---

## 📁 Project layout

```
src/
├── index.js              # entry: Baileys connection, message router
├── config.js             # reads .env → CONFIG
├── core/parser.js        # raw message → ctx (text, args, quoted media)
├── commands/             # one file per command (thin: parsing + reply only)
├── features/             # pure logic, framework-free: media, brat, tiktok, …
│   ├── media.js          # image/video → webp sticker, webp → png
│   ├── brat.js           # render text → brat sticker (+ animation)
│   ├── fonts.js          # sticker font registry
│   ├── youtube.js        # yt-dlp wrapper
│   ├── viewonce.js       # view-once delivery + ACK tracking
│   └── linkcheck.js      # redirect tracer (over Tor)
└── utils/                # small helpers (logging, etc.)

scripts/
├── setup.js              # ⭐ setup wizard
├── doctor.js             # environment diagnostics
├── patch-baileys.js      # small patch on Baileys (see notes)
├── test-*.js             # per-module tests
└── rmbg-bridge.py        # Python ↔ rembg bridge
```

### Adding a new command

```js
// src/commands/ping.js
export default {
  name: 'ping',
  aliases: [],
  description: 'Check that the bot is alive',
  usage: '!ping',
  async execute(ctx) {
    await ctx.reply('pong!')
  },
}
```

Register it in `src/commands/index.js`, and if you want it to show up in the menu, add
it to `SECTIONS` in `src/commands/help.js`. The `ctx` object provides `reply()`,
`send()`, `sendMedia()`, `react()`, `typing()`, `args`, `rawArgs`, `quoted` (the media
being replied to), `sender`, `isGroup`, and `pushName`.

---

## 🖥 Running 24/7

<details>
<summary><b>pm2</b> (quickest)</summary>

```bash
npm i -g pm2
pm2 start src/index.js --name columbina-bot
pm2 save && pm2 startup      # comes back up after a reboot
pm2 logs columbina-bot
```
</details>

<details>
<summary><b>systemd</b> (no extra tooling)</summary>

```ini
# /etc/systemd/system/columbina-bot.service
[Unit]
Description=Columbina Bot
After=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/columbina-bot
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now columbina-bot
journalctl -u columbina-bot -f
```
</details>

> **Small VPS tip (1 vCPU / 1 GB RAM):** do not point `BOT_TEMP_DIR` at `/tmp`
> (the system clears it on its own schedule), and skip the full `u2net` model for
> `!rmbg`. The bot already runs its heavy work under `nice` so the WhatsApp
> connection is not dropped along with it.

---

## 🔧 Troubleshooting

| Symptom | Cause & fix |
|---|---|
| The bot never responds | Make sure `OWNER_NUMBER` matches the sender's number, that the bot is logged in, and that `RESPOND_TO_SELF` is set the way you want |
| `Connection Closed` / the bot keeps dropping while processing images | The server is out of CPU/RAM. Use `RMBG_MODEL=u2netp` and make sure nothing else is competing for CPU |
| YouTube: "Sign in to confirm you're not a bot" | Install `yt-dlp` and set `YT_COOKIES_PATH` (see the optional features section) |
| Instagram always says "post private/deleted" | Set `IG_COOKIE` |
| The sticker you sent does not move | The source video is too long or too heavy — try a shorter clip. For animated text stickers use `!animatedtext` |
| Emoji show up as boxes in text stickers | The emoji CDN is unreachable — check your connection, or set `TWEMOJI_BASE` |
| No idea what is wrong | Run `npm run doctor` first — almost every environment problem shows up there |
| You want a detailed report | Set `LOG_LEVEL=debug`, restart, and read the logs |

Still stuck? Open an [issue](https://github.com/arilcihuyy/columbina-bot/issues) with
your `npm run doctor` output — **strip out the phone numbers and JIDs first.**

---

## 🔐 Security & privacy

- `sessions/` is the key to your WhatsApp account. Never share it.
- `.env`, `cookies/`, `sessions/`, and `tmp/` are already in `.gitignore`.
- Set `OWNER_NUMBER` so that nobody else can drive your bot.
- The bot sends no data to the developer. Everything runs on your machine.
- Full details: [SECURITY.md](SECURITY.md).

---

## 📝 Technical notes

- **The Baileys patch** (`scripts/patch-baileys.js`) runs automatically on
  `npm install`. It fixes media-type detection when sending stickers/media paths in
  `@whiskeysockets/baileys`. If you reinstall `node_modules`, run `npm run postinstall`.
- **`toimg`** performs a real `ffmpeg webp → png` conversion, so the result is an actual
  image — plenty of other bots at this point just hand you a webp again.
- **Text stickers** are rendered with `@napi-rs/canvas` using the fonts available on
  your system, then wrapped in sticker-pack metadata through `node-webpmux`.
- **Commercial fonts are not bundled.** Arial © Monotype — if you want to use it, drop
  `ARIAL.TTF` into `assets/fonts/` (already git-ignored). What ships in the repo is
  Archivo Narrow (SIL OFL).
- **Downloaders** read public platform pages; when a platform changes, a small
  adjustment in `src/features/` is usually enough.

---

> This bot uses the unofficial WhatsApp Web protocol (Baileys). Use it reasonably:
> not for spam or blasting. The risk of a number ban rests with the user.
