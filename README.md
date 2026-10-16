# Castle of the Winds - Two-Player Expedition

Play at **https://jpdieffe.github.io/castleofthebreakingwinds/**.

1. Enter your name and choose **Host expedition**.
2. Send your friend the six-character room code or **Copy invite** link.
3. Your friend opens the page, enters a name and code, and chooses **Join**.
4. Both choose **Ready to adventure**.

No Node process, server address, router setup, or installation is needed to play. The host browser runs the world; the companion connects using a reliable WebRTC data channel. PeerJS's free public service handles matchmaking. Its configured STUN/TURN services help establish connections, and a relay may carry traffic when direct connectivity fails. Free infrastructure availability and restrictive networks can affect connection success.

Keep the host tab open and its computer awake. Disconnects pause combat. Refreshing the same tab restores the expedition and reconnects the companion. Host saves are kept in that tab's session storage every two seconds and on page exit. Closing the tab or clearing browser storage can lose progress. There is no host migration. Guest seats remain reserved during disconnects; **Leave** releases the seat. Host **Leave** ends the expedition.

A browser reconstruction using artwork, map planes and story resources recovered from `Castle1/CASTLE1.EXE`. Both players move independently; enemies act every 1.4 seconds. Includes melee, spells, potions, shared experience, upgrades, shops, revival, shared exploration, 14 connected areas and Hrungnir.

This is a playable reconstruction, not a complete faithful port of the original executable. Combat balance, procedural dungeons, area connections and multiplayer are new. See [recovery details](archive/RECOVERY.md).

## Controls

| Action | Control |
| --- | --- |
| Move | WASD / arrows, or click an explored tile |
| Diagonal movement | Home / End / Page Up / Page Down |
| Melee | Bump enemy or Space |
| Magic Arrow / Heal / Fireball | 1 / 2 / 3 |
| Health / mana potion | H / Q |
| Stairs / rest at well | E |
| Revive adjacent partner | R, costs one healing potion |
| Inventory / shop | I |
| Original story journal | J |

Both adventurers must be alive and within three tiles of the stairs to travel. Menus do not pause combat. Shops and free restoration are available near the well in safe areas.

## Development and verification

Requires Node 24+. Google Chrome is needed for browser tests and the two-window launcher.

```powershell
npm ci
npm run dev
npm test
npm run test:e2e:headed
npm run build
```

Development serves the static client at `http://localhost:5173/castleofthebreakingwinds/`. Browser co-op still uses public matchmaking. `npm run play:two` opens two separate visible Chrome browsers against the published GitHub page and joins them; it does not start a game server. Set `GAME_URL` to test another deployed or locally served client.

`tests/peer.spec.ts` exercises real WebRTC through public PeerJS matchmaking. It needs outbound internet access. Engine tests and the retained dedicated-server suite also run. See [test plan](qa/TEST-PLAN.md) and [results](qa/RESULTS.md).

## GitHub Pages

The existing Pages site publishes `main/docs`. Run `npm run build` and commit the generated `docs/` with source changes. The published page defaults to browser-hosted co-op; no secrets or private backend are needed.

## Optional dedicated server

The former Node/WebSocket mode is retained for compatibility and its regression tests. `npm start` serves the built client on port 8787. In the lobby's **Advanced: dedicated server**, replace `peer` with `ws://localhost:8787/ws` (local development) or a deployed `wss://.../ws` endpoint. Both clients must choose that same endpoint. The default remains browser co-op even when a Node server serves the page.

Dedicated-server settings: `PORT` (8787), `DATA_DIR` (`.game-data`), and `ALLOWED_ORIGINS`. It stores room saves on disk and exposes `/health` and `/ws`. These settings do not apply to browser-hosted expeditions.
