"""Reproducible NE resource/data recovery and 16-bit disassembly.
Optional: python -m pip install capstone --target .tools/python
"""
from pathlib import Path
import struct
import json
import re
import sys

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / '.tools' / 'python'))
data = (root / 'Castle1' / 'CASTLE1.EXE').read_bytes()
out = root / 'archive' / 'recovered'
out.mkdir(parents=True, exist_ok=True)
u16 = lambda at: struct.unpack_from('<H', data, at)[0]
ne = struct.unpack_from('<I', data, 0x3c)[0]
table, shift = ne + u16(ne + 0x22), u16(ne + 0x32)
segments = []
relocations = []
try:
    from capstone import Cs, CS_ARCH_X86, CS_MODE_16
    decoder = Cs(CS_ARCH_X86, CS_MODE_16)
    decoder.skipdata = True
except ImportError:
    decoder = None
for i in range(u16(ne + 0x1c)):
    sector, size, flags, alloc = struct.unpack_from('<HHHH', data, table + i * 8)
    offset = sector << shift
    blob = data[offset:offset + (size or 65536)]
    (out / f'segment-{i+1:02}.bin').write_bytes(blob)
    segments.append(dict(segment=i+1, offset=offset, size=len(blob), flags=flags, allocation=alloc))
    if flags & 0x100:
        reloc_start = offset + len(blob)
        for j in range(u16(reloc_start)):
            typ, rflags, chain, target, value = struct.unpack_from('<BBHHH', data, reloc_start + 2 + j * 8)
            seen = set()
            while chain != 0xffff and chain < len(blob)-1 and chain not in seen:
                seen.add(chain)
                relocations.append(dict(segment=i+1, at=chain, type=typ, flags=rflags, target=target, value=value))
                if rflags & 4:
                    break
                chain = struct.unpack_from('<H', blob, chain)[0]
    if decoder and not flags & 1:
        (out / f'segment-{i+1:02}.asm').write_text('\n'.join(
            f'{ins.address:04x}: {ins.mnemonic:8} {ins.op_str}' for ins in decoder.disasm(blob, 0)
        ), encoding='utf-8')
(out / 'segments.json').write_text(json.dumps(segments, indent=2))
(out / 'relocations.json').write_text(json.dumps(relocations, indent=2))
(out / 'strings.txt').write_text('\n'.join(
    f'{m.start():08x} {m.group().decode("ascii")}' for m in re.finditer(rb'[\x20-\x7e]{5,}', data)
), encoding='utf-8')
pos = ne + u16(ne + 0x24)
rshift, pos = u16(pos), pos + 2
resources, strings = [], {}
while u16(pos):
    kind, count = u16(pos), u16(pos + 2)
    pos += 8
    for _ in range(count):
        sector, length, flags, rid = struct.unpack_from('<HHHH', data, pos)
        pos += 12
        blob = data[sector << rshift:(sector + length) << rshift]
        resource_type, number = kind & 0x7fff, rid & 0x7fff
        resources.append(dict(type=resource_type, id=number, offset=sector << rshift, size=len(blob)))
        if resource_type != 3:
            (out / f'resource-{resource_type}-{number}.bin').write_bytes(blob)
        if resource_type == 6:
            cursor = 0
            for index in range(16):
                size = blob[cursor]
                cursor += 1
                if size:
                    strings[(number - 1) * 16 + index] = blob[cursor:cursor+size].decode('cp1252')
                cursor += size
(out / 'resources.json').write_text(json.dumps(resources, indent=2))
(out / 'string-table.json').write_text(json.dumps(strings, indent=2), encoding='utf-8')
print(f'Recovered {len(segments)} segments, {len(resources)} resources and {len(strings)} resource strings; disassembly: {bool(decoder)}')
