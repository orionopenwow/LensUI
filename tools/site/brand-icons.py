"""Builds favicon.ico and the Tauri app icon set from the renders made by tools/site/brand.mjs.

Small sizes (<= 32 px) come from the simplified logo, larger ones from the 1024 px master render.
Run: python3 tools/site/brand-icons.py   (needs Pillow)
"""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[2]
brand = root / "docs/brand"
icons = root / "src-tauri/icons"
big = Image.open(brand / "lens-1024.png").convert("RGBA")
small = Image.open(brand / "lens-small-256.png").convert("RGBA")


def at(size: int) -> Image.Image:
    src = small if size <= 32 else big
    return src.resize((size, size), Image.LANCZOS)


# Website favicon: 16, 32, 48 in one .ico
at(48).save(brand / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)], append_images=[at(16), at(32)])

# Tauri: the files tauri.conf.json lists, plus the Windows Store tiles and a macOS .icns
tauri = {
    "32x32.png": 32, "128x128.png": 128, "128x128@2x.png": 256, "icon.png": 512,
    "Square30x30Logo.png": 30, "Square44x44Logo.png": 44, "Square71x71Logo.png": 71, "Square89x89Logo.png": 89,
    "Square107x107Logo.png": 107, "Square142x142Logo.png": 142, "Square150x150Logo.png": 150,
    "Square284x284Logo.png": 284, "Square310x310Logo.png": 310, "StoreLogo.png": 50,
}
for name, size in tauri.items():
    at(size).save(icons / name)
ico_sizes = [16, 24, 32, 48, 64, 128, 256]
at(256).save(icons / "icon.ico", format="ICO", sizes=[(s, s) for s in ico_sizes], append_images=[at(s) for s in ico_sizes if s != 256])
big.resize((1024, 1024), Image.LANCZOS).save(icons / "icon.icns", format="ICNS")
print(f"favicon.ico and {len(tauri) + 2} Tauri icons written")
