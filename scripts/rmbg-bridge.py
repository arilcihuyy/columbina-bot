# Bridge remove background untuk bot WA (dipanggil dari src/features/rmbg.js).
# Mesin: rembg (https://github.com/danielgatis/rembg) — model u2net, ONNX, offline
# setelah model terunduh sekali ke ~/.rembg/models/.
#
# Pakai: rmbg-bridge.py <input> <output.png> [model]
# stdout: JSON ringkas { ok, ms, width, height, bytes }  (log lain → stderr)
import json
import os
import sys
import time


def main():
    if len(sys.argv) < 3:
        print(json.dumps({'ok': False, 'error': 'usage: rmbg-bridge.py <in> <out.png> [model]'}))
        return 2
    src, dst = sys.argv[1], sys.argv[2]
    # default u2netp: VPS kecil (911MB RAM) tidak cukup — u2net penuh (176MB model, RSS ±800MB)
    # bikin VM-nya freeze total (kejadian nyata 2026-10-05, butuh reboot manual).
    model = sys.argv[3] if len(sys.argv) > 3 else os.environ.get('RMBG_MODEL', 'u2netp')

    t0 = time.time()
    # import berat (onnxruntime) di sini, bukan di level modul, supaya argumen
    # salah tetap bisa dijawab dengan JSON yang rapi
    from rembg import remove, new_session
    from PIL import Image
    t_import = time.time()

    session = new_session(model)
    t_load = time.time()

    inp = Image.open(src)
    out = remove(inp, session=session)
    out.save(dst, format='PNG')
    t_done = time.time()

    print(json.dumps({
        'ok': True,
        'model': model,
        'width': out.size[0],
        'height': out.size[1],
        'bytes': os.path.getsize(dst),
        'import_s': round(t_import - t0, 2),
        'load_s': round(t_load - t_import, 2),
        'ms': round((t_done - t_load) * 1000),
    }))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as e:  # noqa: BLE001 — semua error dikirim sebagai JSON
        print(json.dumps({'ok': False, 'error': f'{type(e).__name__}: {e}'}))
        sys.exit(1)
