"""Convert Castle1's two inventory WMF drawings to SVG, preserving their coordinates.

This intentionally supports only records present in resource type 261. It reads the
original EXE directly; no third-party image library or screenshot tracing is used.
Record definitions: https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/
"""
from pathlib import Path
import struct

root = Path(__file__).resolve().parents[1]
data = (root / 'Castle1/CASTLE1.EXE').read_bytes()
u16 = lambda b, p: struct.unpack_from('<H', b, p)[0]
ne = struct.unpack_from('<I', data, 0x3c)[0]
table = ne + u16(data, ne + 0x24)
shift, pos = u16(data, table), table + 2
drawings = []
while u16(data, pos):
    kind, count = u16(data, pos), u16(data, pos + 2)
    pos += 8
    for _ in range(count):
        offset, size, _, rid = struct.unpack_from('<HHHH', data, pos)
        pos += 12
        if kind == 0x8000 + 261:
            drawings.append((rid & 0x7fff, data[offset << shift:(offset + size) << shift]))

for rid, blob in drawings:
    objects, paths, stack = {}, [], []
    pen, brush = ('pen', '#000000', 8, 0), ('brush', '#ffffff')
    origin, extent, cursor = (0, 0), (1, 1), 18
    while cursor + 6 <= len(blob):
        size, op = struct.unpack_from('<IH', blob, cursor)
        assert size >= 3 and cursor + size * 2 <= len(blob)
        args = blob[cursor + 6:cursor + size * 2]
        words = struct.unpack('<' + 'h' * (len(args) // 2), args)
        cursor += size * 2
        if op == 0:
            break
        if op in (0x2fa, 0x2fc):  # CREATEPENINDIRECT / CREATEBRUSHINDIRECT
            color_at = 6 if op == 0x2fa else 2
            color = '#' + args[color_at:color_at + 3].hex()
            obj = ('pen', color, max(8, abs(words[1])), words[0]) if op == 0x2fa else ('brush', color if words[0] == 0 else 'none')
            slot = next(i for i in range(256) if i not in objects)
            objects[slot] = obj
        elif op == 0x12d:  # SELECTOBJECT
            obj = objects[words[0]]
            if obj[0] == 'pen': pen = obj
            else: brush = obj
        elif op == 0x1f0:  # DELETEOBJECT
            del objects[words[0]]
        elif op == 0x20b: origin = (words[1], words[0])
        elif op == 0x20c: extent = (words[1], words[0])
        elif op == 0x1e: stack.append((pen, brush))
        elif op == 0x127:
            assert words[0] == -1
            pen, brush = stack.pop()
        elif op in (0x325, 0x418, 0x41b):
            stroke = 'none' if pen[3] == 5 else pen[1]
            style = f'stroke="{stroke}" stroke-width="{pen[2]}"'
            if pen[3] == 2: style += ' stroke-dasharray="8 24"'
            if op == 0x325:
                assert len(words) == 1 + words[0] * 2
                points = ' '.join(f'{words[i]},{words[i + 1]}' for i in range(1, len(words), 2))
                paths.append(f'<polyline points="{points}" fill="none" {style}/>')
            else:
                bottom, right, top, left = words
                if op == 0x418:
                    shape = f'ellipse cx="{(left + right) / 2:g}" cy="{(top + bottom) / 2:g}" rx="{(right - left) / 2:g}" ry="{(bottom - top) / 2:g}"'
                else:
                    shape = f'rect x="{left}" y="{top}" width="{right - left}" height="{bottom - top}"'
                paths.append(f'<{shape} fill="{brush[1]}" {style}/>')
        elif op not in (0x626, 0x103, 0x201, 0x209, 0x107, 0x104, 0x106, 0x102):
            raise ValueError(f'Unsupported WMF record {op:#x}')
        # Other records are Micro Draw comments and drawing modes. The resources
        # contain only solid/hollow brushes, copy-pen strokes, and no text.
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{origin[0]} {origin[1]} {extent[0]} {extent[1]}" preserveAspectRatio="none">\n'
    svg += '<!-- Original Castle of the Winds inventory artwork, resource 261; Rick Saada / SaadaSoft, Paul Canniff. -->\n'
    svg += '\n'.join(paths) + '\n</svg>\n'
    (root / f'public/classic/inventory-{rid}.svg').write_text(svg, encoding='utf-8')
    print(f'Recovered inventory drawing {rid}: {len(paths)} vector shapes')
assert len(drawings) == 2
