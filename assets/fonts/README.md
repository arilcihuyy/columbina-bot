Font di folder ini dipakai untuk membuat stiker brat (`!brat`, `!animatedtext`).

## Archivo Narrow — `ArchivoNarrow.ttf`
- Sumber: Google Fonts (https://fonts.google.com/specimen/Archivo+Narrow)
- Lisensi: **SIL Open Font License 1.1** (boleh dipakai & disebar ulang, termasuk
  ikut di repo ini)
- Alasan dipakai: bentuk hurufnya paling dekat dengan **Arial Narrow** yang dipakai
  situs brat asli — huruf `t` potongannya miring, `a` punya ekor melengkung.

## Kenapa bukan Arial Narrow asli?
Arial Narrow adalah font **komersial milik Monotype**. Tidak boleh disebar ulang,
jadi tidak bisa disimpan di repo publik. Kalau kamu punya lisensinya sendiri
(mis. dari Windows), taruh file `ArialNarrow.ttf` di folder ini — otomatis terdaftar
dan dipakai lebih dulu (atur lewat `BRAT_FONT=Arial Narrow` di `.env`).

Font lain yang terdeteksi otomatis juga bisa ditaruh di sini (format `.ttf`/`.otf`),
lalu pilih dengan `BRAT_FONT=<Nama Keluarga Font>`.
