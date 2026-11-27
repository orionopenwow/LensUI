"""Draws the installer artwork in src-tauri/windows/ (committed; rerun after a logo change).

    python tools/installer/make_art.py

Obsidian Monochrome (DESIGN.md): #09090b / #fafafa, Arial, the full-colour Lens mark.
  nsis-sidebar.bmp  164x314  NSIS welcome and finish pages (left panel)
  nsis-header.bmp   150x57   NSIS page header (left of the page title, white header)
  wix-banner.bmp    493x58   MSI top banner (the title is drawn over its left part)
  wix-dialog.bmp    493x312  MSI welcome and finish background (text over the right part)
Needs Pillow and Arial (Windows ships it).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src-tauri" / "windows"
LOGO = Image.open(ROOT / "docs" / "brand" / "lens-1024.png").convert("RGBA")
FONTS = Path("C:/Windows/Fonts")

INK = (9, 9, 11)
INK_2 = (20, 20, 24)
PAPER = (250, 250, 250)
MUTED = (161, 161, 170)
LINE = (39, 39, 42)


def font(size, bold=False):
    return ImageFont.truetype(str(FONTS / ("arialbd.ttf" if bold else "arial.ttf")), size)


def logo(size):
    return LOGO.resize((size, size), Image.LANCZOS)


def dark_panel(w, h):
    """Vertical #141418 -> #09090b, the app's chrome."""
    im = Image.new("RGB", (w, h), INK)
    d = ImageDraw.Draw(im)
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(round(INK_2[i] + (INK[i] - INK_2[i]) * t) for i in range(3))
        d.line([(0, y), (w, y)], fill=c)
    return im


def centered(d, text, y, w, f, fill, x0=0):
    tw = d.textlength(text, font=f)
    d.text((x0 + (w - tw) / 2, y), text, font=f, fill=fill)


def sidebar_art(w=164, h=314):
    im = dark_panel(w, h)
    m = logo(76)
    im.paste(m, ((w - 76) // 2, 70), m)
    d = ImageDraw.Draw(im)
    centered(d, "Lens", 160, w, font(28, True), PAPER)
    centered(d, "A calm, themeable", 198, w, font(12), MUTED)
    centered(d, "desktop for Windows", 214, w, font(12), MUTED)
    d.line([(w - 1, 0), (w - 1, h)], fill=LINE)
    centered(d, "Open source  \u00b7  MIT", h - 30, w, font(10), (113, 113, 122))
    return im


def save(im, name):
    OUT.mkdir(parents=True, exist_ok=True)
    im.convert("RGB").save(OUT / name, "BMP")
    print("wrote", (OUT / name).relative_to(ROOT), im.size)


def main():
    save(sidebar_art(), "nsis-sidebar.bmp")

    hd = Image.new("RGB", (150, 57), (255, 255, 255))
    m = logo(36)
    hd.paste(m, (12, 10), m)
    ImageDraw.Draw(hd).text((56, 16), "Lens", font=font(22, True), fill=INK)
    save(hd, "nsis-header.bmp")

    bn = Image.new("RGB", (493, 58), (255, 255, 255))
    m = logo(38)
    bn.paste(m, (493 - 38 - 12, 10), m)
    ImageDraw.Draw(bn).line([(0, 57), (493, 57)], fill=(228, 228, 231))
    save(bn, "wix-banner.bmp")

    dl = Image.new("RGB", (493, 312), (255, 255, 255))
    dl.paste(sidebar_art(164, 312), (0, 0))
    save(dl, "wix-dialog.bmp")


if __name__ == "__main__":
    main()
