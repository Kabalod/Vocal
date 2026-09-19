from __future__ import annotations

import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
CARDS = ROOT / "public" / "archive" / "cards"
DESK = ROOT / "public" / "archive" / "desk"
CARDS.mkdir(parents=True, exist_ok=True)
DESK.mkdir(parents=True, exist_ok=True)


def hex_color(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def grain(image: Image.Image, seed: int, amount: int = 18) -> Image.Image:
    rng = random.Random(seed)
    noise = Image.new("L", image.size)
    pixels = noise.load()
    width, height = image.size
    for y in range(0, height, 2):
        for x in range(0, width, 2):
            tone = rng.randint(0, 255)
            pixels[x, y] = tone
            if x + 1 < width:
                pixels[x + 1, y] = tone
            if y + 1 < height:
                pixels[x, y + 1] = tone
                if x + 1 < width:
                    pixels[x + 1, y + 1] = tone
    noise = noise.filter(ImageFilter.GaussianBlur(0.6))
    overlay = Image.merge("RGB", (noise, noise, noise))
    return Image.blend(image, overlay, amount / 255)


def paint_card(index: int) -> Image.Image:
    image = Image.new("RGB", (768, 1024), hex_color("#1A1228"))
    draw = ImageDraw.Draw(image, "RGBA")

    if index == 1:
        draw.ellipse((-160, -60, 520, 500), fill=(*hex_color("#3D2A6B"), 184))
        draw.ellipse((320, 520, 920, 1040), fill=(*hex_color("#0B0714"), 200))
        draw.polygon([(0, 640), (220, 520), (420, 860), (768, 700), (768, 1024), (0, 1024)], fill=(*hex_color("#8B7CFF"), 40))
    elif index == 2:
        image.paste(hex_color("#120A1C"), [0, 0, 768, 1024])
        draw.polygon([(-40, 80), (820, 240), (700, 1100), (-80, 860)], fill=(*hex_color("#2A1F3D"), 255))
        draw.ellipse((260, 90, 780, 510), fill=(*hex_color("#8B7CFF"), 56))
        draw.ellipse((-140, 680, 420, 1040), fill=(*hex_color("#C4B5FD"), 30))
    elif index == 3:
        image.paste(hex_color("#0B0714"), [0, 0, 768, 1024])
        draw.ellipse((44, 90, 724, 770), fill=(*hex_color("#1A1228"), 255))
        draw.ellipse((164, 210, 604, 650), fill=(*hex_color("#2A1F3D"), 255))
        draw.ellipse((274, 320, 494, 540), fill=(*hex_color("#3D2A6B"), 216))
        draw.ellipse((-36, 740, 804, 1060), fill=(*hex_color("#8B7CFF"), 26))
    elif index == 4:
        draw.ellipse((-40, 50, 460, 670), fill=(*hex_color("#3D2A6B"), 255))
        draw.ellipse((320, 320, 860, 920), fill=(*hex_color("#2A1F3D"), 255))
        draw.ellipse((220, 80, 580, 320), fill=(*hex_color("#C4B5FD"), 36))
    elif index == 5:
        image.paste(hex_color("#0B0714"), [0, 0, 768, 1024])
        draw.rectangle((0, 0, 768, 240), fill=(*hex_color("#2A1F3D"), 255))
        draw.rectangle((0, 240, 768, 520), fill=(*hex_color("#1A1228"), 255))
        draw.rectangle((0, 520, 768, 780), fill=(*hex_color("#3D2A6B"), 178))
        draw.rectangle((0, 780, 768, 1024), fill=(*hex_color("#120A1C"), 255))
        draw.polygon([(0, 500), (260, 430), (500, 610), (768, 540), (768, 700), (0, 640)], fill=(*hex_color("#8B7CFF"), 30))
    elif index == 6:
        image.paste(hex_color("#120A1C"), [0, 0, 768, 1024])
        draw.ellipse((400, -200, 1040, 360), fill=(*hex_color("#8B7CFF"), 72))
        draw.ellipse((-280, 740, 440, 1220), fill=(*hex_color("#0B0714"), 255))
        for i in range(8):
            y = 140 + i * 90
            draw.arc((40, y, 420, y + 260), 200, 340, fill=(*hex_color("#C4B5FD"), 20), width=22)
    elif index == 7:
        draw.polygon([(768, 0), (768, 420), (0, 820), (0, 0)], fill=(*hex_color("#2A1F3D"), 255))
        draw.polygon([(0, 700), (768, 280), (768, 1024), (0, 1024)], fill=(*hex_color("#0B0714"), 184))
        draw.ellipse((60, 100, 460, 420), fill=(*hex_color("#62DBC6"), 20))
    elif index == 8:
        image.paste(hex_color("#0B0714"), [0, 0, 768, 1024])
        draw.rectangle((0, 0, 384, 1024), fill=(*hex_color("#1A1228"), 255))
        draw.ellipse((164, 172, 604, 852), fill=(*hex_color("#3D2A6B"), 204))
        draw.ellipse((-40, 40, 280, 320), fill=(*hex_color("#8B7CFF"), 40))
        draw.ellipse((470, 710, 810, 1010), fill=(*hex_color("#C4B5FD"), 26))
    elif index == 9:
        draw.ellipse((-20, 0, 820, 360), fill=(*hex_color("#2A1F3D"), 255))
        draw.polygon(
            [(-20, 380), (200, 300), (280, 560), (120, 820), (40, 980), (260, 1040), (420, 880), (620, 680), (820, 860), (780, 1024), (-20, 1024)],
            fill=(*hex_color("#0B0714"), 255),
        )
        draw.ellipse((360, 380, 760, 900), fill=(*hex_color("#62DBC6"), 18))
    else:
        image.paste(hex_color("#120A1C"), [0, 0, 768, 1024])
        draw.ellipse((-76, 360, 844, 1080), fill=(*hex_color("#3D2A6B"), 140))
        draw.ellipse((20, 40, 500, 560), fill=(*hex_color("#8B7CFF"), 52))
        draw.ellipse((360, 160, 720, 600), fill=(*hex_color("#C4B5FD"), 30))

    return grain(image, seed=index * 17 + 3).filter(ImageFilter.GaussianBlur(0.4))


def paint_desk() -> Image.Image:
    image = Image.new("RGB", (1920, 1200), hex_color("#0B0714"))
    draw = ImageDraw.Draw(image, "RGBA")
    for x in range(1920):
        mix = x / 1919
        r = int(11 + (26 - 11) * mix)
        g = int(7 + (18 - 7) * mix)
        b = int(20 + (40 - 20) * mix)
        draw.line([(x, 0), (x, 1199)], fill=(r, g, b))
    draw.ellipse((-280, -100, 760, 460), fill=(*hex_color("#8B7CFF"), 14))
    draw.ellipse((1200, 780, 2160, 1300), fill=(*hex_color("#2A1F3D"), 140))
    return grain(image, seed=18, amount=14)


def save_webp(image: Image.Image, path: Path) -> None:
    image.save(path, "WEBP", quality=78, method=6)


def main() -> None:
    total = 0
    for index in range(1, 11):
        save_webp(paint_card(index), CARDS / f"{index:02d}.webp")
        total += 1
    save_webp(paint_desk(), DESK / "desk.webp")
    print(f"wrote {total} card webp + desk")


if __name__ == "__main__":
    main()
