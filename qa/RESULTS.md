# Test results - October 18, 2026


## Selectable game pace

- Solo and Host now offer Real-time (default) or Turn-based. Guests inherit the host setting. Turn-based co-op gives each living player one action in either order, then enemies act once. Wait or the period key passes an action; blocked/rejected actions are free. Downed companions do not hold up turns. Held directions and distant map taps cannot advance extra turns automatically.
- Pace, round number and acted-player IDs survive reconnects and saves; restart retains the selected pace. Older saves remain real-time. The same rules run in browser hosts and the optional dedicated server. Inventory, shop and spell controls respect already-spent turns.
- **42 engine/network tests passed**, covering idle time, enemy phases, failed actions, duplicate commands, downed players/revival, spells, mana, purchases, travel, restart, partial-turn reconnect and server persistence.
- **40 desktop/co-op browser cases passed** across the full run and targeted follow-up. The full run passed 39/40; its only failure asserted the old real-time-only help text. After updating that assertion to the new instructions, the case passed. Real WebRTC clients verified host choice, guest inheritance and refreshing either client during a partial turn.
- **24 mobile browser cases passed; 4 platform-specific cases skipped.** Chrome exercised real WebRTC, WebKit exercised solo turns and the retained WebSocket transport. Windows WebKit does not provide WebRTC or the Chromium pinch protocol. These are browser device profiles, not physical-device certification.
- TypeScript, production build and diff checks passed. [Creation screen](screenshots/pace-creation.png).

## Three-line mobile combat log

- The latest three messages now occupy three fixed rows, including short landscape screens. New messages remove the oldest row without moving the controls.
- Android Chrome and iPhone WebKit layout cases passed. Production-build checks in both engines verified message order, live rollover after potion use, and visible log/controls at 320x568, 390x844, 667x375, 568x320 and 844x390. Build and diff checks passed.

## Mobile-reference shop interface

- Replaced the inventory's store list with a dedicated native-style shop: actual location name, balance, Buy/Sell tabs, four-column pixel-art grid, selected item details and a separate commit button. Portrait and landscape follow the reference IconPopup layout. Existing online stock/prices remain; this is not a full native catalog or bank/weight-system port.
- Added authoritative potion resale (3 gold each), equipped-item protection, empty-quantity and range checks, live price/balance updates, and refresh persistence. Trade opens from the touch action, desktop E or the inventory link. Quick slots and equipment display remain synchronized.
- **34 engine/network tests passed**, **37 desktop/co-op browser tests passed**, and **19 distinct mobile browser cases passed** across the main run and targeted follow-ups. Three existing platform skips remain: Windows WebKit lacks WebRTC and Chromium's pinch protocol; its two-client WebSocket coverage passes.
- An initial WebKit shop case did not open via simulated mouse input. Shop tests now use actual taps on touch profiles. Both iPhone shop cases passed three consecutive repetitions (6/6), and both Android shop cases passed again. The initial desktop shop fixture also incorrectly tried a hidden touch button; it was corrected to use desktop E. These failed attempts are not counted as passes.
- Two independent clients verified purchases and potion sales over real WebRTC and retained WebSockets, with the buyer's state synchronized and the companion's belongings unchanged. Screen-fit checks cover 320x568, 390x844, 667x375, 844x390 and desktop. TypeScript, production build and diff checks passed.
- A production smoke check caught a buy immediately after walking being silently ignored by the movement cooldown. The commit button now stays disabled until the authoritative next-action time. Both phone shop suites (4 cases), both two-client transaction cases, and an actual walk-to-shop production check passed after this fix; consecutive sales no longer need artificial test delays.
- Reference comparison screenshots: [portrait](screenshots/shop-portrait.png), [landscape](screenshots/shop-landscape.png). Tests use browser device emulation on Windows, not physical Android/iPhone hardware.

## Direct mobile map import (supersedes the earlier style-only update)

- Replaced active geometry with the native Java reference's 13 Part I maps: northern hamlet, three mine floors, Bjarnarhaven and eight fortress floors. All **19,619 terrain cells**, decorations, named places and entity positions were exported from the unmodified mobile engine. An independent second Java export produced zero differences. Source hashes are recorded in `shared/mobile-maps.json`.
- Matched burned-farm spawn, road widths, footprints, shop/sanctuary doors, gates, mine/fortress stairs, river/bridge, signs, native line-of-sight and shared fog. Full-density canvas rendering preserves building bitmap detail; 34 CSS-pixel default tiles follow the native view.
- **33 engine/network tests passed**, including exact export equality, all exits reachable, native service coordinates, sight blocking and legacy map migration. **35 desktop/responsive browser cases passed** across the main run and targeted follow-up: the main run passed 33/34; its one failure retained an old companion spawn expectation (12 instead of 17), which was corrected and passed. The additional migration browser test passed.
- **15 mobile browser cases passed**, with the existing 3 platform-specific skips. The first run exposed missing road/bridge handling in click-to-walk; those types were added and the full mobile suite passed. Includes real two-client WebRTC, movement, purchases at the imported shop, quick slots and reconnect.
- Both clients walked from the farm to the mine using real controls. Dedicated-server clients traversed every native area and return route, then defeated the boss. A legacy browser save migrated once, retained gold/equipment/potions/quick slots, backed up the old campaign and preserved subsequent movement through another refresh.
- Visual production checks: [hamlet](screenshots/native-map-hamlet.png), [mine](screenshots/native-map-mine.png), [city](screenshots/native-map-city.png), [city landscape](screenshots/native-map-city-landscape.png). Build and diff checks passed.

The exported world uses fixed seed 42/difficulty 1, not the seed of an arbitrary native saved game. Native quest gating, bank/sage services, full item catalog, traps/secrets and Part II are not implemented by this layout import. Online combat and simplified item mechanics remain. Legacy map exploration/enemies/ground loot are rebuilt; adventurer stats and equipment are preserved. These browser checks do not certify physical-phone behavior.


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
