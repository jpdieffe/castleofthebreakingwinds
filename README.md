# Castle of the Winds — Two-Player Expedition

A browser reconstruction using artwork, map planes and story resources recovered from `Castle1/CASTLE1.EXE`. The previous isometric game has been replaced. The original executable remains intact, and the previous working source is backed up locally under `archive/pre-rebuild/`.

Two players share one authoritative WebSocket server. Both can move independently; enemies act every 1.4 seconds. The game includes melee, three spells, potions, loot, shared experience, inventory upgrades, shops, revival, shared exploration, 14 connected areas and a final Hrungnir encounter. A disconnect pauses combat. Refresh reconnects the same player, and the server saves room state every five seconds.

This is a playable co-op reconstruction, not the entire original game ported faithfully. The fixed map data, artwork and narrative were recovered; combat balance, generated dungeons, area connections and multiplayer are new. See [recovery details](archive/RECOVERY.md) for exact provenance and limitations.

## Run on this computer

Requires Node 24+ and Google Chrome for the automatic two-window launcher.

```powershell
npm ci
npm run play:two
```

This builds the client, starts the server on port 8787, opens two separate Chrome clients, creates a room, joins both players and readies them. The terminal prints the room code and local/LAN URLs. Keep the process and this computer running. Ctrl+C stops the server and those clients.

For just the server and built client:

```powershell
npm run build
npm start
```

Open **http://localhost:8787/**. Create an expedition in one browser, join its code in another, then both choose Ready. A partner on the same network can open `http://YOUR-LAN-IP:8787/`; use the LAN address when copying an invite for another device. Windows Firewall may need to allow Node on your private network. No router ports or firewall rules are changed automatically. LAN addresses do not provide internet access.

During development, `npm run dev` starts the server plus Vite at `http://localhost:5173/castleofthebreakingwinds/`.

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

## Saves and server settings

Room saves are written atomically under `.game-data/`. Keep that directory to retain progress. Reconnect keys are stored in each client's session storage; only hashes are persisted on the server. Closing the entire browser context can discard the reconnect key. Disconnected seats remain reserved until the player returns or the room expires after 24 hours of inactivity; use Leave to release a seat deliberately.

| Variable | Default / purpose |
| --- | --- |
| `PORT` | `8787` |
| `DATA_DIR` | `.game-data`, must be on persistent storage for durable saves |
| `ALLOWED_ORIGINS` | Local Vite origins plus `https://jpdieffe.github.io`; the server's own origin is also accepted |
| `VITE_GAME_SERVER` | Optional client build-time `wss://.../ws` endpoint |

`GET /health` returns server health. WebSockets connect at `/ws`. The server also serves the production `docs/` client. It accepts player intentions, not client-supplied positions, damage, gold or prices. Public deployments should sit behind TLS and use a persistent disk; this task runs locally as requested.

## GitHub Pages

GitHub Pages publishes the client from `main/docs` at **https://jpdieffe.github.io/castleofthebreakingwinds/**. The game server runs on this computer for now. The Pages lobby links to the local game at `http://localhost:8787/`; on another computer, that address refers to that computer, so use the host's LAN URL for same-network play. For future internet play, deploy the Node server behind HTTPS/WSS, set `VITE_GAME_SERVER` before building (or enter the endpoint in Game server), and publish `docs/` through the existing Pages setup. A remote friend's browser cannot reach this computer's localhost through the Pages URL.

## Verification

```powershell
npm test
npm run test:e2e:headed
npm run build
```

[Test plan](qa/TEST-PLAN.md) · [Recorded results](qa/RESULTS.md) · [Executable recovery](archive/RECOVERY.md)

Original Castle of the Winds: Rick Saada / SaadaSoft. Original artwork: Paul Canniff. Publisher: Epic MegaGames.
