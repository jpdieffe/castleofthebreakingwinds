# Castle1 executable recovery

The original `Castle1/CASTLE1.EXE` was read without modification. SHA-256:

`e90d202717882449196cc087bc2231d2c94a17a553c4b5dfa4c91ed4c718c3b0`

The old project, including its uncommitted source edits at the start of this work, is preserved locally in `archive/pre-rebuild/`. That backup is ignored by Git. The old application is no longer compiled or loaded.

## What was recovered

- All 32 NE segments and a linear 16-bit x86 disassembly of executable segments.
- 894 Windows resources: 457 icons, 236 icon groups, 98 bitmaps, 34 cursors and 34 cursor groups, 14 dialogs, 3 menus, 15 narrative resources, 2 drawing resources and 1 raw-data resource.
- All 457 icon images and 98 bitmap images decoded to PNG, preserving the original pixel artwork. Full contact sheets are in this directory.
- Seven fixed map tile planes from the map initialization routines in segments 25–31, including the burned hamlet. Original tile bytes and flags are in `public/classic/maps.json`; the co-op campaign currently uses six of those planes.
- The 15 original narrative resources in `public/classic/stories.json`, viewable through Journal.
- Printable strings with executable file offsets, segment metadata and relocation chains in `archive/recovered/`.

This is resource/data recovery plus disassembly and selected reconstruction. It is **not** recovery of the original C source, and the disassembly contains embedded data regions that a linear disassembler displays as instructions. Monster names appear in recovered strings, but the complete monster/item behavior tables have not been decoded. No claim of a complete decompilation or exact original combat mechanics is made.

## Map loader reconstruction from local bytes

At the beginning of segments 25–30, the loop loads one byte from `CS:SI`, writes it to `DS:DI`, advances DI by 3 and SI by 1. DI starts at `0x0ce2`. The loop count and SI reveal the map plane's source and size. Fixed maps use a 64-byte source row stride even when the displayed map is narrower. Segment 31 recognizes `0xff` followed by a flags byte before copying subsequent tiles. The map reset routine at segment 11, `0x1b04`–`0x1b16`, clears `0x3000` bytes, consistent with 64×64×3 bytes.

| Segment | Tile source offset | Copy count | Display columns × copied rows | Area label used here |
| --- | --- | --- | --- | --- |
| 25 | `0x015a` | `0x0700` | 27 × 28 | A Tiny Hamlet |
| 26 | `0x00b1` | `0x0700` | 27 × 28 | Burned Hamlet |
| 27 | `0x0119` | `0x0a00` | 48 × 40 | The Wilderness |
| 28 | `0x01ce` | `0x0a00` | 48 × 40 | The Mine Entrance |
| 29 | `0x00b1` | `0x0580` | 24 × 22 | A Small Village |
| 30 | `0x00f2` | `0x0a00` | 48 × 40 | The Fortress Approach |
| 31 | `0x0211` | `0x0600` | 24 × 24 | The Fortress |

Segment 25's final unused row padding extends beyond its initialized bytes; the recovery script supplies zero padding. Map rendering, terrain interpretation, building-to-bitmap assignments and the co-op exits are reconstructed; the preserved raw planes allow further correction without repeating extraction. Original additional object records and scripted interactions are retained in the binary dump but not completely ported.

Segment 11's dungeon code is present in the disassembly. The new generator guarantees connected rooms and uses an MS C-style random sequence. It is **not** an instruction-for-instruction translation and does not reproduce original saved games. The co-op campaign uses eight newly generated dungeon floors plus six recovered fixed areas. The original complete quest and inventory systems are not implemented.

## October 17 mobile reference corrections

The local `CastleWinds_Mobile` reference supplied the corrected icon-DIB sizing logic in `tools/extract_original.py`, creature assignments in `Bestiary.java`, player portrait IDs in `Game.java`, and weapon/item assignments in `Catalog.java`. The online extractor now calculates the actual header, palette, XOR plane and AND-mask payload size, excluding trailing NE resource-table alignment padding. Including that padding had shifted Pillow's transparency-mask lookup and produced black bars or missing pixels. All 457 re-extracted Part I icons were compared pixel-for-pixel against the reference's corrected icons; all matched.

The renderer uses the original male/female player icons 401/403, short sword 245, leather armor 215, healing potion 227 and corrected existing creature-family icons. Saved enemy icons are repaired for display by name, without changing their stats or location. The native reference's Java game engine and registered Part II content are not loaded by the browser game.

## Inventory artwork and layout

Resources of type 261, IDs 1 and 2, are standard Windows Metafile drawings created with Microsoft Draw. `scripts/recover-inventory.py` reads them directly from the executable and exports the original polylines, ellipses, rectangles, colors and equipment guide lines as `public/classic/inventory-1.svg` and `inventory-2.svg` (25 shapes each). The browser inventory uses drawing 1. These are recovered drawings, not traced screenshots or newly drawn substitutes.

The equipment-slot arrangement and separate Floor/Store and Small Pack panes were compared with this [original Castle1 inventory screenshot](https://shrines.rpgclassics.com/pc/castle1/images/howtopics/inventory.gif). The converter uses the [Microsoft WMF specification](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/). The new UI retains this reconstruction's existing sword/armor upgrades, potion counts and gold. Empty accessory slots are visual placeholders; drag-and-drop equipment, weight/bulk limits, item naming and the original full item system remain unimplemented.

An audit of `makeWorld(42)` found zero raw-tile differences between each of the six fixed areas and its recovered plane (using the original 64-byte source stride). This verifies use of the recovered tile data, not complete original gameplay fidelity: terrain meanings, building assignments, exits, encounters, scripts and dungeon generation still have the limitations described above. The burned-hamlet plane is recovered but not used in the current route.

## Reproduce

Requires Python with Pillow; Capstone is needed only for the assembly listings.

```powershell
python -m pip install Pillow
python -m pip install capstone --target .tools/python
python scripts/extract-classic.py
python scripts/recover-executable.py
python scripts/recover-content.py
python scripts/recover-maps.py
python scripts/recover-inventory.py
```

Generated binary and assembly dumps are ignored by Git but remain in this workspace. The decoded game assets and map/story JSON are tracked. [The Castle of the Winds Shrine's technical research](https://castleofthewinds.com/technical.html) provided useful leads; the fixed-map offsets above were established from this local executable's loader instructions rather than copied from that page.

Original game and content credits: Rick Saada / SaadaSoft; artwork Paul Canniff; publisher Epic MegaGames. Original content is not relicensed by this reconstruction.
