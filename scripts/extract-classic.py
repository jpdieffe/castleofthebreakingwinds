"""Extract original Windows NE icon resources; source executable is never modified.
Run: python scripts/extract-classic.py (requires Pillow).
"""
from pathlib import Path
import hashlib
import json
import struct
from io import BytesIO
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
source = root / 'Castle1' / 'CASTLE1.EXE'
data = source.read_bytes()
u16 = lambda at: struct.unpack_from('<H', data, at)[0]
ne = struct.unpack_from('<I', data, 0x3c)[0]
assert data[ne:ne+2] == b'NE', 'Expected a Windows NE executable'
table = ne + u16(ne + 0x24)
shift = u16(table)
pos = table + 2
out = root / 'public' / 'classic'
out.mkdir(parents=True, exist_ok=True)
icons = []
while u16(pos):
    kind, count = u16(pos), u16(pos + 2)
    pos += 8
    for _ in range(count):
        offset, size, _, rid = struct.unpack_from('<HHHH', data, pos)
        pos += 12
        if kind != 0x8003:
            continue
        blob = data[offset << shift:(offset + size) << shift]
        if len(blob) < 40 or struct.unpack_from('<I', blob)[0] != 40:
            continue
        width, double_height = struct.unpack_from('<ii', blob, 4)
        height = double_height // 2
        planes, bpp = struct.unpack_from('<HH', blob, 12)
        # CastleWinds_Mobile fixed this: NE alignment padding is not part of the
        # icon. Including it makes ICO decoders read the transparency mask late.
        colors = struct.unpack_from('<I', blob, 32)[0]
        palette = (colors or (1 << bpp)) if bpp <= 8 else 0
        payload = 40 + palette * 4 + (((width * bpp + 31) // 32) * 4 + ((width + 31) // 32) * 4) * height
        assert payload <= len(blob)
        blob = blob[:payload]
        ico = struct.pack('<HHHBBBBHHII', 0, 1, 1, width % 256, height % 256,
                          0, 0, planes, bpp, len(blob), 22) + blob
        im = Image.open(BytesIO(ico)).convert('RGBA')
        number = rid & 0x7fff
        im.save(out / f'{number}.png')
        icons.append((number, im))
sheet = Image.new('RGB', (16 * 64, ((len(icons) + 15) // 16) * 78), '#bdbdbd')
draw = ImageDraw.Draw(sheet)
for i, (number, im) in enumerate(icons):
    x, y = (i % 16) * 64, (i // 16) * 78
    sheet.paste(im.resize((48, 48), Image.Resampling.NEAREST), (x + 8, y), im.resize((48, 48), Image.Resampling.NEAREST))
    draw.text((x + 12, y + 51), str(number), fill='black')
sheet.save(root / 'archive' / 'classic-contact-sheet.png')
(out / 'manifest.json').write_text(json.dumps({
    'source': 'Castle1/CASTLE1.EXE', 'sha256': hashlib.sha256(data).hexdigest(),
    'credit': 'Castle of the Winds — Rick Saada / SaadaSoft; original artwork Paul Canniff; published by Epic MegaGames.',
    'icons': [number for number, _ in icons]
}, indent=2), encoding='utf-8')
print(f'Extracted {len(icons)} original icons.')
