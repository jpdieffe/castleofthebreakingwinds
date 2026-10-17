# Test results - October 17, 2026


## Configurable quick slots

- Both touch quick slots accept Magic Arrow, Heal, Fireball, healing potion or mana potion. Selecting a spell/pack potion offers explicit slot-1/slot-2 assignment, independently of casting/drinking. Buttons show icon artwork, slot number and live potion quantity, with accessible action names and current aiming state.
- Assignments persist in browser local storage; malformed saved values fall back to defaults. Per-player choices do not alter the companion's controls. Full health/mana, depleted potions, insufficient mana, death and paused play disable unusable quick actions without preventing assignment.
- **29 engine/network checks passed. 15 mobile browser cases passed across Chrome and WebKit** (3 platform-specific skips). The initial two new end-to-end cases expected the word "Fireball" in a log that actually reports "casts at Ogre for 14"; both passed on targeted rerun with the correct combat-log assertion. No game-code change was needed.
- **7 desktop/responsive inventory, layout and targeting cases passed.** Five passed initially; two were interrupted when the shared test server stopped and passed after restarting it. Includes real two-client WebRTC and independent guest slot assignment preserved through reconnect.
- Production build and diff checks passed. Screenshots: [icon slots](screenshots/quick-slot-icons.png), [potion assignment](screenshots/quick-slot-pack.png). Browser profiles are not physical-phone tests.


## Mobile-reference map style

- Matched the reference BoardView palette, rounded trees, pale dungeon floors, beveled gray wall faces, dark unexplored/solid-rock background, muted player outline and injured-enemy health bars. The desktop minimap uses the same terrain palette.
- Hamlet buildings use the reference's red-roof resources with preserved image proportions; fountain and stair icons follow its assignments. Added signs for the actual online trade/rest point and exits.
- Safe settlements are fully explored, including resumed solo sessions. Dangerous areas retain exploration. Existing collision tiles, routes and procedural dungeon generator are retained; this is a map presentation adaptation, not a port of the native campaign layouts.
- Validation: **29 engine/network tests passed**, **11 mobile browser tests passed** (3 platform-specific skips as documented below), **2 responsive layout tests passed**, **3 targeting tests passed**. Includes two-client WebRTC co-op, guest projectiles, movement, purchases and reconnect.
- Production build passed; phone-sized production preview checked for town/dungeon rendering, rotation and movement with no runtime errors. Visual evidence: [town](screenshots/map-style-town.png), [dungeon](screenshots/map-style-dungeon.png), [landscape](screenshots/map-style-landscape.png).

## Mobile browser interface

- `npm test`: **28 passed**. `npx playwright test --headed`: **34 passed** (2.8 minutes). Existing solo, WebRTC, dedicated-server, inventory, layout and targeting regressions passed.
- Mobile suite: **11 passing cases** across Android Chrome and iPhone WebKit profiles, with **3 platform-specific skips**. The combined run passed 10 cases; its Chrome unsupported-API fixture was corrected to disable the API after PeerJS's prefix shim initialized, and the affected case passed on rerun. This was a test-fixture correction, not an application failure.
- Both browser engines passed portrait/landscape layout, actual touch taps, zoomed aiming and walking, diagonal/held movement, release stopping, inventory selection and purchase, potion use, spell mana checks, Hero, Journal, menu navigation and solo refresh. Viewports included 390x844, 360x640, 320x568, 844x390 and 667x375; map tiles stayed square, page overflow was absent, and primary controls met 44px touch-target checks.
- Android Chrome passed real two-client WebRTC Host/Join, ready, movement, aimed shots, independent purchases and guest-refresh recovery. Real CDP multi-touch pinch and long-press input did not accidentally walk or cast.
- This Windows WebKit build exposes **no `RTCPeerConnection` API**. Its real-WebRTC case is explicitly skipped, not counted as a pass. A separate two-client test passed over the retained WebSocket transport, including movement, shots and refresh. Chromium skips that WebKit-specific case; WebKit skips CDP multi-touch. Both engines verify an immediate unsupported-browser message with solo still available.
- All **457 Part I icon PNGs** match the mobile reference's corrected images pixel-for-pixel. The corrected extractor excludes NE resource alignment padding before decoding the transparency mask. Existing saves display corrected player and creature sprites without resetting progress.
- TypeScript and production build passed. Screenshots: [portrait aiming](screenshots/mobile-portrait.png), [landscape](screenshots/mobile-landscape.png), [inventory](screenshots/mobile-pack.png), [spellbook](screenshots/mobile-spells.png), [co-op](screenshots/mobile-coop.png).

These are browser-engine/device-profile tests on this computer, not tests on physical Android/iPhone hardware. In particular, Safari WebRTC on an actual iPhone, cross-network connectivity, virtual-keyboard behavior and background suspension remain unverified. The native Android project's full item/quest/spell engine was not ported; this change adapts the current online campaign and fixes artwork. The reference project was read without modifying it or deploying to its connected phone.

## Classic inventory update

- Recovered both original type-261 inventory WMF drawings directly from `CASTLE1.EXE`, exporting 25 vector shapes per drawing. Compared the displayed equipment arrangement with the original Castle1 inventory screenshot linked in [recovery notes](../archive/RECOVERY.md).
- Inventory and layout browser checks: **4 passed**. Verified equipment and empty slots, recovered art loading, purchases, changing upgrade prices, affordability, potion use, live quantities/gold/vitals, safe player-name rendering, exit controls, Floor/Store switching and responsive dialog bounds. Tested inventory at 1280x600, 390x844, 360x640 and 844x390. Existing map/spell layout checks also passed.
- Affected WebRTC, solo, journal/help/mobile and Magic Arrow regression cases: **4 passed**. Both co-op clients kept inventory open; guest purchases and host potion use synchronized, while each inventory retained its own player's items and gold.
- Dedicated-server inventory purchase regression: **1 passed**.
- TypeScript and production build passed. Visual review: [desktop](screenshots/inventory-desktop.png), [phone](screenshots/inventory-phone.png). On narrow screens, the inventory body scrolls vertically while its title bar and close button stay visible.
- Read-only map audit: all six fixed areas had **zero raw-tile differences** from their recovered planes. Eight dungeon floors still use the reconstruction's generator; original scripted progression and full inventory mechanics are not ported.

This update changes inventory presentation and exposes existing potion actions. Equipment upgrades still equip automatically. Empty accessory slots do not add drag-and-drop, new item types, or weight/bulk mechanics. Engine rules and map generation were unchanged; the earlier 28 engine/network passes are the existing baseline, not a new test run for this update.

## Magic Arrow targeting update

- `npm test`: **28 passed**. Aimed arrows spend mana on empty-floor shots, stop at walls and the first monster, enforce range and cooldown, reject invalid coordinates and insufficient mana, and expire their shared visual effects.
- `npx playwright test --headed`: **32 passed**, 3.8 minutes. This includes all layout, dedicated-server, WebRTC, solo and targeting cases.
- Targeting checks verified crosshair and selected-button feedback, visible projectile pixels, repeated empty-floor shots without movement, cancellation of queued walking, Escape/right-click cancellation, and low-mana feedback. Two independent WebRTC clients both displayed the guest's projectile and agreed on mana and position.
- TypeScript and production build passed. Screenshots: [solo aiming](screenshots/aiming-solo.png), [guest aiming](screenshots/aiming-guest.png).

The host resolves damage when a shot is accepted; both clients animate its path. The spell costs 3 MP, has a six-tile range, and stays selected until cancelled. The existing one-computer and network coverage limits below still apply.

## Viewport layout update

- `npx playwright test tests/layout.spec.ts --headed`: **2 passed**, 17.6 seconds.
- Checked 1366x768, 1280x600, 880x700, 1920x1080, 390x844, 360x640, and 844x390. The spell toolbar and entire map fit without page scrolling, the map retains its aspect ratio, and mouse clicks select the intended tile after resizing.
- Real WebRTC co-op checks at five small viewport sizes verified both health bars, all spells, and the complete map remain visible. Touch movement and inventory opening/closing also passed.
- TypeScript and production build passed. Screenshots: [desktop](screenshots/fit-desktop.png), [phone co-op](screenshots/fit-phone-coop.png).


## Solo play update

- Engine/network checks: **25 passed**, including one-player simulation, defeat/restart and older-save compatibility.
- WebRTC co-op regression cases: **13 passed**.
- Solo browser cases: **3 passed**. Verified immediate start with no matchmaking traffic, one-character UI, movement, refresh recovery, travel to the wilderness, autonomous enemies, spells and XP, defeat, restart and Leave.
- TypeScript and production build: passed.

The solo route test initially issued its first post-refresh move before the saved action cooldown expired. The test now waits for that cooldown; gameplay rules were retained. Solo is a local browser session and does not register a matchmaking room. The existing two-player mode still waits for both adventurers.

Solo screenshot: [wilderness](screenshots/solo-wilderness.png).

## Earlier co-op baseline

Browser-hosted co-op is now the default. The host runs the shared game engine; guests send intentions over real WebRTC channels. PeerJS Cloud provides public matchmaking.

- `npm test`: **22 passed**. Engine rules, map connectivity, and retained dedicated-server protocol/persistence tests.
- `npx playwright test tests/peer.spec.ts --headed`: **12 passed** in 1.6 minutes. After adding a final matchmaking-reconnect regression and its guard, the targeted headed run passed that **13th scenario** in 8.7 seconds.
- The retained `multiplayer.spec.ts` suite: **11 passed** during the combined headed run. Includes all 14 area loads, mobile UI, combat, inventory, revival and dedicated-server recovery.
- `npm run build`: TypeScript and Vite production build pass.
- `npm audit fix`: compatible dependency updates applied; **0 known vulnerabilities** reported.
- GitHub Pages deployed implementation commit `3afc375` successfully. The live page returned HTTP 200 with the new build, and `npm run play:two` joined two independent visible Chrome processes on that HTTPS page over WebRTC. Both reached REAL TIME; the former local game server was stopped. Screenshots are retained below.

The WebRTC tests opened independent Chrome contexts, contacted the public matchmaking service, and asserted actual data-channel traffic and a successful ICE candidate pair. They exercised Host/Join, code-only invite copying, movement, unknown/full rooms, guest and host refresh, disconnect pausing, reserved-seat recovery, replacement companions, host termination, autonomous enemies, spells, purchases, healing, revival, victory, restart, background hosting, independent rooms, forged inputs and flood rejection. An additional test deliberately closed the matchmaking socket and verified that the game continued with exactly one simulation worker.

Verification found and fixed a map-transfer issue: PeerJS JSON serialization rejects messages above 16 KB. BinaryPack now chunks larger state messages. The unmodified hamlet-to-wilderness test confirms that the new area reaches both clients. Matchmaking reconnection now avoids creating duplicate simulation timers. Returning visitors' old local-server sessions no longer override the new default.

An early browser attempt was blocked by the execution sandbox's outbound-network restriction; it was repeated with network access. One intermediate full-suite run had a lobby interruption while source edits triggered Vite reloads. Its reconnect scenario passed in the subsequent uninterrupted WebRTC suite. Final successful results above do not count these interrupted runs as passes.

Combat and rare-state browser cases use saved-world fixtures. The hamlet-to-wilderness route uses the unmodified map and real keyboard input. The older all-area test positions the party near exits; it does not establish a complete unaided campaign playthrough.

These runs used one physical computer. Public internet matchmaking was exercised, but two different home networks, relay-only connectivity, Firefox/Safari and mobile background suspension were not tested. The host tab and computer must remain open and awake; there is no host migration. Session storage supports refresh recovery, not guaranteed recovery after closing the host tab.

See [TEST-PLAN.md](TEST-PLAN.md) for reproduction. `npm run play:two` opens two independent Chrome processes on the published GitHub page without starting a game server; screenshots are written to `qa/screenshots/peer-host.png` and `peer-guest.png`, and local launch details to `.game-data/peer-session.json`.
