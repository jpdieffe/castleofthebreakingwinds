# Test results - October 16, 2026

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
