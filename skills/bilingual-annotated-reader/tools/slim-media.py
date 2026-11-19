#!/usr/bin/env python3
"""slim-media.py — 精读页图片瘦身（发布前必做）

把 data/config.json 的 figureAssets（still / anim）与 data/meta.json 的 cover.asset
所指的 jpg / png 素材转成 WebP 并按显示尺寸收敛，然后回写这两个数据文件。
原图留在 assets/ 里不动（只是不再被引用），所以任何时候都能改回 JSON 回滚。

用法：
  python3 tools/slim-media.py                    # 当前项目
  python3 tools/slim-media.py ../p1 ../p2        # 多个项目
  python3 tools/slim-media.py --all ..           # 目录下每个含 data/config.json 的项目
  python3 tools/slim-media.py --dry              # 只算不改（含不写文件）
  python3 tools/slim-media.py --backup .bak       # 动手前先把 assets 备份一份
  python3 tools/slim-media.py --gif              # 顺便优化动图（需要 ffmpeg）

依赖：Pillow（pip install pillow）。没有就退出 2，并打印安装命令。
动图优化另需 ffmpeg，用 FFMPEG=/path/to/ffmpeg 指定；没有就跳过并提示。

预算（默认值，可用参数覆盖）：
  照片（jpg 来）长边 ≤ 1600px、图稿（png 来）长边 ≤ 2000px；
  单图目标 ≤ 260 KB，逼不到就降到质量地板（照片 70 / 图稿 76）。
  转完比原图小不到 8% 的，保持原样、不换名字。
"""

import argparse
import io
import json
import math
import os
import shutil
import sys

try:
    from PIL import Image, ImageChops, ImageStat
except ImportError:
    print("缺少 Pillow。先装：\n  python3 -m venv .venv && .venv/bin/pip install pillow\n"
          "（或用你自己的 venv，把解释器路径加到 PATH）", file=sys.stderr)
    sys.exit(2)

PHOTO_QS = [78, 74, 70]
DIAGRAM_QS = [84, 80, 76]
TARGET_KB = 260
MIN_GAIN = 0.08
EXTS = (".jpg", ".jpeg", ".png")


def psnr(a, b):
    d = ImageChops.difference(a.convert("RGB"), b.convert("RGB"))
    st = ImageStat.Stat(d)
    mse = sum(x * x for x in st.rms) / 3
    return 99.0 if mse == 0 else 10 * math.log10(255 * 255 / mse)


def encode(im, q):
    b = io.BytesIO()
    im.save(b, "WEBP", quality=q, method=6)
    return b.getvalue()


def convert(src, max_w, is_photo):
    """返回 (bytes, q, dims, psnr)；不改动源文件。"""
    im = Image.open(src)
    orig_dims = im.size
    if im.width > max_w:
        h = max(1, round(im.height * max_w / im.width))
        im = im.resize((max_w, h), Image.LANCZOS)
    work = im.convert("RGBA") if im.mode in ("RGBA", "LA", "P") else im.convert("RGB")

    best_q, best = 0, None
    for q in (PHOTO_QS if is_photo else DIAGRAM_QS):
        data = encode(work, q)
        best_q, best = q, data
        if len(data) <= TARGET_KB * 1024:
            break

    # 全不透明的 RGBA 走 RGB 编码更小
    if work.mode == "RGBA" and work.getchannel("A").getextrema() == (255, 255):
        rgb = work.convert("RGB")
        for q in (DIAGRAM_QS if not is_photo else PHOTO_QS):
            data = encode(rgb, q)
            if len(data) < len(best):
                best_q, best, work = q, data, rgb
            if len(data) <= TARGET_KB * 1024:
                break

    out = Image.open(io.BytesIO(best))
    return best, best_q, orig_dims, out.size, psnr(work, out)


def refs_of(proj):
    cfg_p = os.path.join(proj, "data/config.json")
    meta_p = os.path.join(proj, "data/meta.json")
    if not os.path.isfile(cfg_p):
        return None
    cfg = json.load(open(cfg_p, encoding="utf-8"))
    meta = json.load(open(meta_p, encoding="utf-8")) if os.path.isfile(meta_p) else {}
    refs = []
    for a in (cfg.get("figureAssets") or {}).values():
        if isinstance(a, dict):
            for k in ("still", "anim"):
                if a.get(k) and a[k].lower().endswith(EXTS):
                    refs.append((a, k))
    if isinstance(meta.get("cover"), dict) and (meta["cover"].get("asset") or "").lower().endswith(EXTS):
        refs.append((meta["cover"], "asset"))
    return cfg, meta, refs


def backup_assets(proj, dest_root):
    name = os.path.basename(os.path.abspath(proj))
    dest = os.path.join(dest_root, name)
    if os.path.isdir(dest):
        print(f"  · 备份已存在，跳过：{dest}")
        return
    shutil.copytree(os.path.join(proj, "assets"), dest)
    print(f"  · 已备份 assets → {dest}")


def slim_gifs(proj, refs):
    ff = os.environ.get("FFMPEG") or shutil.which("ffmpeg")
    if not ff:
        print("  · --gif 需要 ffmpeg；本机没找到，跳过动图")
        return []
    rows = []
    cfg, _, _ = refs_of(proj) or (None, None, None)
    if not cfg:
        return rows
    gifs = []
    for a in (cfg.get("figureAssets") or {}).values():
        if isinstance(a, dict) and (a.get("anim") or "").lower().endswith(".gif"):
            gifs.append(a)
    for a in gifs:
        src = os.path.join(proj, "assets", a["anim"])
        if not os.path.isfile(src):
            continue
        tmp = src + ".slim.gif"
        os.system(
            f'"{ff}" -hide_banner -loglevel error -y -i "{src}" '
            f'-vf "fps=12,scale=1200:-1:flags=lanczos,split[s0][s1];'
            f'[s0]palettegen=max_colors=128:stats_mode=diff[p];'
            f'[s1][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" '
            f'-loop 0 "{tmp}"'
        )
        before, after = os.path.getsize(src), os.path.getsize(tmp) if os.path.isfile(tmp) else 0
        if after and after < before * (1 - MIN_GAIN):
            shutil.move(tmp, src)
            rows.append((os.path.basename(src), before, after, "gif 重编码"))
        elif os.path.isfile(tmp):
            os.remove(tmp)
    return rows


def do_project(proj, args, rows):
    got = refs_of(proj)
    if got is None:
        print(f"{proj}: 没有 data/config.json，跳过")
        return rows
    cfg, meta, refs = got
    if args.backup:
        backup_assets(proj, args.backup)

    print(f"\n{os.path.basename(os.path.abspath(proj))}")
    for a, k in refs:
        name = a[k]
        src = os.path.join(proj, "assets", name)
        if not os.path.isfile(src):
            rows.append((proj, name, "缺失素材", 0, 0))
            continue
        is_photo = name.lower().endswith((".jpg", ".jpeg"))
        data, q, odims, dims, db = convert(src, args.photo_max if is_photo else args.diagram_max, is_photo)
        before = os.path.getsize(src)
        after = len(data)
        if after >= before * (1 - MIN_GAIN):
            print(f"  keep  {name:<22} {before // 1024:>5}K → {after // 1024:>3}K  (收益不足，不动)")
            rows.append((proj, name, "keep", before, after))
            continue
        out_name = os.path.splitext(os.path.basename(name))[0] + ".webp"
        out_path = os.path.join(os.path.dirname(src), out_name)
        if not args.dry:
            with open(out_path, "wb") as f:
                f.write(data)
            a[k] = out_name
        print(f"  webp  {name:<22} {before // 1024:>5}K → {after // 1024:>3}K  "
              f"q{q} {db:.1f}dB  {odims[0]}x{odims[1]} → {dims[0]}x{dims[1]}"
              + ("  (dry)" if args.dry else ""))
        rows.append((proj, f"{name} → {out_name}", "webp", before, after))

    if args.gif and not args.dry:
        for r in slim_gifs(proj, refs):
            print(f"  gif   {r[0]:<22} {r[1] // 1024:>5}K → {r[2] // 1024:>3}K")

    if not args.dry:
        json.dump(cfg, open(os.path.join(proj, "data/config.json"), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=2)
        if meta:
            json.dump(meta, open(os.path.join(proj, "data/meta.json"), "w", encoding="utf-8"),
                      ensure_ascii=False, indent=2)
    return rows


def main():
    ap = argparse.ArgumentParser(add_help=True, description="精读页图片瘦身（转 WebP + 尺寸收敛）")
    ap.add_argument("projects", nargs="*", help="项目目录，默认当前目录")
    ap.add_argument("--all", metavar="DIR", help="处理 DIR 下所有含 data/config.json 的项目")
    ap.add_argument("--dry", action="store_true", help="只算不改")
    ap.add_argument("--photo-max", type=int, default=1600)
    ap.add_argument("--diagram-max", type=int, default=2000)
    ap.add_argument("--backup", metavar="DIR", help="动手前把 assets 备份到 DIR")
    ap.add_argument("--gif", action="store_true", help="顺便优化动图（需 ffmpeg）")
    args = ap.parse_args()

    targets = list(args.projects) or ["."]
    if args.all:
        targets = [os.path.join(args.all, d) for d in sorted(os.listdir(args.all))
                   if os.path.isfile(os.path.join(args.all, d, "data/config.json"))]

    rows = []
    for p in targets:
        rows = do_project(os.path.abspath(p), args, rows)

    ok = [r for r in rows if r[2] in ("webp", "keep")]
    converted = [r for r in rows if r[2] == "webp"]
    before = sum(r[3] for r in converted)
    after = sum(r[4] for r in converted)
    missing = [r for r in rows if r[2] == "缺失素材"]
    print()
    if converted:
        pct = 0 if before == 0 else (1 - after / before) * 100
        print(f"合计：{len(converted)} 张转 WebP，{before // 1024}K → {after // 1024}K（−{pct:.0f}%）")
    else:
        print("没有需要转换的图（已是 webp 或收益不足）")
    if missing:
        print("缺素材：" + "、".join(f"{r[0]}/{r[1]}" for r in missing), file=sys.stderr)
        sys.exit(1)
    if args.dry:
        print("（--dry：以上数字未落盘）")
    print("下一步：node tools/publish.mjs → 站点侧 python3 tools/import_readers.py --force → build/check")


if __name__ == "__main__":
    main()
