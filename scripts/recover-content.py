"""Decode DIB bitmap resources and retain original narrative resources."""
from pathlib import Path
from io import BytesIO
import struct
import json
from PIL import Image, ImageDraw
root = Path(__file__).resolve().parents[1]
out = root / 'public' / 'classic'
recovered = root / 'archive' / 'recovered'
images = []
for path in recovered.glob('resource-2-*.bin'):
    blob = path.read_bytes()
    size = struct.unpack_from('<I', blob)[0]
    if size != 40:
        continue
    bpp = struct.unpack_from('<H', blob, 14)[0]
    colors = struct.unpack_from('<I', blob, 32)[0] or ((1 << bpp) if bpp <= 8 else 0)
    bmp = b'BM' + struct.pack('<IHHI', len(blob) + 14, 0, 0, 14 + size + colors * 4) + blob
    im = Image.open(BytesIO(bmp)).convert('RGB')
    rid = int(path.stem.split('-')[-1])
    im.save(out / f'bitmap-{rid}.png')
    images.append((rid, im))
images.sort()
sheet = Image.new('RGB', (1000, ((len(images) + 5) // 6) * 150), '#bdbdbd')
draw = ImageDraw.Draw(sheet)
for i, (rid, im) in enumerate(images):
    x, y = i % 6 * 166, i // 6 * 150
    preview = im.copy()
    preview.thumbnail((160, 120))
    sheet.paste(preview, (x, y))
    draw.text((x + 3, y + 125), f'{rid}: {im.width} x {im.height}', fill='black')
sheet.save(root / 'archive' / 'bitmap-contact-sheet.png')
stories = []
for path in sorted(recovered.glob('resource-260-*.bin'), key=lambda p: int(p.stem.split('-')[-1])):
    stories.append({'id': int(path.stem.split('-')[-1]), 'text': path.read_bytes().rstrip(b'\0').decode('cp1252')})
(out / 'stories.json').write_text(json.dumps(stories, indent=2), encoding='utf-8')
print(f'Decoded {len(images)} bitmaps and {len(stories)} narrative resources.')
