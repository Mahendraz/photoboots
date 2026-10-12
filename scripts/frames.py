"""
Olah gambar latar frame hasil generate (PNG besar) menjadi aset web:
  public/frames/<id>.webp        1200×1800, untuk pratinjau & ekspor
  public/frames/<id>-kecil.webp  240×360, untuk thumbnail pemilih frame

Pakai: python scripts/frames.py <folder-png> [id ...]
"""
import sys
from pathlib import Path
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public" / "frames"
SIZES = {"": ((1200, 1800), 74), "-kecil": ((240, 360), 70)}


def cover(im: Image.Image, w: int, h: int) -> Image.Image:
    k = max(w / im.width, h / im.height)
    r = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    x = (r.width - w) // 2
    y = (r.height - h) // 2
    return r.crop((x, y, x + w, y + h))


def main():
    src = Path(sys.argv[1])
    only = set(sys.argv[2:])
    OUT.mkdir(parents=True, exist_ok=True)
    for f in sorted(src.glob("*.png")):
        if only and f.stem not in only:
            continue
        im = Image.open(f).convert("RGB")
        for suffix, ((w, h), q) in SIZES.items():
            dst = OUT / f"{f.stem}{suffix}.webp"
            cover(im, w, h).save(dst, "WEBP", quality=q, method=6)
        print(f"{f.stem}: {(OUT / f'{f.stem}.webp').stat().st_size // 1024} KB + {(OUT / f'{f.stem}-kecil.webp').stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
