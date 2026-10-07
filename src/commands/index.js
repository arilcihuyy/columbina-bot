// Registry command: tinggal tambah file baru di folder ini + daftarkan di sini.
import sticker from './sticker.js'
import brat from './brat.js'
import animatedtext from './animatedtext.js'
import toimg from './toimg.js'
import rmbg from './rmbg.js'
import arbg from './arbg.js'
import tiktok from './tiktok.js'
import youtube from './youtube.js'
import instagram from './instagram.js'
import facebook from './facebook.js'
import preview from './preview.js'
import prwdoctor from './prwdoctor.js'
import cek from './cek.js'
import twitter from './twitter.js'
import pinterest from './pinterest.js'
import pixiv from './pixiv.js'
import bilibili from './bilibili.js'
import douyin from './douyin.js'
import rednote from './rednote.js'
import soundcloud from './soundcloud.js'
import spotify from './spotify.js'
import applemusic from './applemusic.js'
import help from './help.js'

export const commands = [
  sticker, brat, animatedtext, toimg, rmbg, arbg,
  tiktok, youtube, instagram, facebook,
  twitter, pinterest, pixiv, bilibili, douyin, rednote,
  soundcloud, spotify, applemusic,
  preview, prwdoctor, cek, help,
]

export const commandMap = new Map()
for (const cmd of commands) {
  commandMap.set(cmd.name, cmd)
  for (const alias of cmd.aliases ?? []) commandMap.set(alias, cmd)
}

export function findCommand(name) {
  return commandMap.get(name?.toLowerCase()) ?? null
}
