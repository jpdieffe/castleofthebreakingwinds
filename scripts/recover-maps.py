"""Recover fixed map byte planes directly from the original map loader routines.
Offsets are verified against segment 25–31 disassembly; maps retain 64-byte stride.
"""
from pathlib import Path
import json
import struct
from PIL import Image, ImageDraw
root = Path(__file__).resolve().parents[1]
recovered = root / 'archive' / 'recovered'
specs = [
    (25, 0x15a, 0x700, 27, 28, 'A Tiny Hamlet'),
    (26, 0xb1, 0x700, 27, 28, 'Burned Hamlet'),
    (27, 0x119, 0xa00, 48, 40, 'The Wilderness'),
    (28, 0x1ce, 0xa00, 48, 40, 'The Mine Entrance'),
    (29, 0xb1, 0x580, 24, 22, 'A Small Village'),
    (30, 0xf2, 0xa00, 48, 40, 'The Fortress Approach'),
    (31, 0x211, 0x600, 24, 24, 'The Fortress'),
]
maps = []
for segment, offset, count, width, height, name in specs:
    blob = (recovered / f'segment-{segment:02}.bin').read_bytes()
    # The hamlet's unused final row padding extends past initialized segment bytes.
    blob += bytes(max(0, offset + count - len(blob)))
    raw, flags, cursor, flag = [], [], offset, 6
    while len(raw) < count:
        tile = blob[cursor]
        cursor += 1
        if segment == 31 and tile == 255:
            flag = blob[cursor]
            cursor += 1
            continue
        raw.append(tile)
        flags.append(flag)
    # Some descriptors extend beyond the initialized map plane; retain the actual rows.
    rows = (count + 63) // 64
    maps.append(dict(segment=segment, sourceOffset=offset, name=name, width=width,
                     height=rows, stride=64, tiles=raw, flags=flags))
    im = Image.new('RGB', (width * 16, rows * 16), 'black')
    draw = ImageDraw.Draw(im)
    for y in range(rows):
        for x in range(width):
            tile = raw[y * 64 + x]
            color = {0:'#000000',3:'#9d8438',4:'#009b00',5:'#005b00',6:'#0000aa',86:'#999999'}.get(tile, '#ab6655')
            draw.rectangle((x*16,y*16,x*16+15,y*16+15), fill=color)
            if tile not in [0,3,4,5,6]:
                draw.text((x*16,y*16), str(tile), fill='white', font_size=8)
    im.save(root / 'archive' / f'map-{segment}.png')
(root / 'public' / 'classic' / 'maps.json').write_text(json.dumps(maps, separators=(',', ':')))
print('Recovered seven fixed tile planes, including the original hamlet and wilderness.')
