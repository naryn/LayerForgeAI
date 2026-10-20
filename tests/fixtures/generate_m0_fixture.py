#!/usr/bin/env python3
"""Generate the synthetic 100+ layer PSD used by the M0 browser round trip.

This is deliberately synthetic: it exercises layer counts, grouping and full
document rendering, not Photoshop fidelity. Acceptance still needs a real,
approved design sample.
"""

from pathlib import Path

from PIL import Image, ImageDraw
from psd_tools import PSDImage

WIDTH = 1024
HEIGHT = 768
GROUPS = 5
LAYERS_PER_GROUP = 25
OUTPUT = Path(__file__).with_name("m0-synthetic-125-layers.psd")


def solid_layer(index: int) -> Image.Image:
    image = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    column = index % 10
    row = (index // 10) % 8
    left = 24 + column * 96
    top = 24 + row * 88
    color = (
        (index * 37 + 60) % 256,
        (index * 71 + 30) % 256,
        (index * 113 + 90) % 256,
        220,
    )
    draw.rectangle((left, top, left + 84, top + 68), fill=color)
    draw.rectangle((left + 8, top + 8, left + 30, top + 24), fill=(255, 255, 255, 200))
    return image


def main() -> None:
    psd = PSDImage.new("RGB", (WIDTH, HEIGHT), color=(24, 26, 32))
    index = 0
    for group_index in range(GROUPS):
        group = psd.create_group(name=f"section_{group_index + 1:02d}")
        for _ in range(LAYERS_PER_GROUP):
            group.create_pixel_layer(
                solid_layer(index),
                name=f"original_layer_{index + 1:03d}",
                top=0,
                left=0,
                opacity=235,
            )
            index += 1
    psd.save(OUTPUT)
    reopened = PSDImage.open(OUTPUT)
    layer_count = sum(1 for _ in reopened.descendants())
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size} bytes, {layer_count} non-root layers)")


if __name__ == "__main__":
    main()
