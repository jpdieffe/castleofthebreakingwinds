# Castle of the Winds - Solo and Co-op

Play at **https://jpdieffe.github.io/castleofthebreakingwinds/**.

## Android and iPhone browsers

The phone/tablet interface follows the native `CastleWinds_Mobile` reference: a dark portrait/landscape layout, eight-way movement pad, contextual Action/Trade/Travel button, quick Magic Arrow and potion buttons, and **Pack / Spells / Hero / Journal** tabs. Tap a direction for one step or hold it to keep walking. The center crossed-swords button attacks; enemies continue moving in real time.

Tap the map to walk, pinch or use **+ / −** to change tile size, and long-press a tile to inspect it. Magic Arrow changes map taps into aimed shots; **Cancel aim** returns to walking. Spells opens an icon picker with descriptions, mana costs and a cast button. On phones, Pack uses item icons: select an item, then use the fixed **Buy** or **Drink** button. Purchases and potion counts update without closing the screen.

The header shows your health, mana, gold and your companion's health/connection. The menu contains the co-op invite, well-rest action, help and Leave. Browser safe-area padding keeps controls clear of notches and home indicators. Solo and Host/Join use the same simulation and saved sessions as desktop. Browser co-op still requires the host to remain open and awake; locking or backgrounding a phone can suspend its browser.

All 457 Part I icons were re-extracted with the mobile project's NE-padding fix and verified pixel-for-pixel against its corrected PNGs. Creature, player, short-sword, armor and potion art assignments now follow the reference. This update adapts the online game's existing inventory and three spells; it does not port the native app's entire 310-item catalog, 37 effects or Part II campaign.

For solo play, enter your name and choose **Play solo**. The adventure starts immediately with one character. No matchmaking connection or second player is required. Enemies move in real time; you can explore, fight, use stairs, and restart after defeat. Refreshing the same tab restores progress. Closing the tab can discard the save.

For two-player co-op:

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
| Aim Magic Arrow | Click Magic Arrow or press 1, then click a map tile |
| Cancel aiming | Escape, right-click, press 1 again, or choose another action |
| Heal / Fireball | 2 / 3 |
| Health / mana potion | H / Q |
| Stairs / rest at well | E |
| Revive adjacent partner | R, costs one healing potion |
| Inventory / shop | I |
| Original story journal | J |

In co-op, both adventurers must be alive and within three tiles of the stairs to travel. Solo players use the stairs alone. Menus do not pause combat. Shops and free restoration are available near the well in safe areas.

Magic Arrow uses 3 MP per shot and travels up to six tiles toward the clicked point, including empty floor. It stops at walls or the first monster in its path. While selected, map clicks fire instead of walking; aiming stays active for repeated shots. The crosshair and highlighted button show the selected mode.

Inventory now follows the original equipment-slot layout around the character outline recovered from the executable, with separate Small Pack and Floor/Store panes. Click **Drink** to use a potion or an affordable store item to buy it beside the well. Equipment, quantities, gold and health update while the inventory stays open. **Exit!**, Escape or the close button returns to the map. Combat continues while inventory is open. The current item system still has automatic sword/armor upgrades; the empty accessory slots do not implement the original game's full equipment or drag-and-drop system.

## Development and verification

Requires Node 24+. Google Chrome is needed for browser tests and the two-window launcher.

```powershell
npm ci
npm run dev
npm test
npm run test:e2e:headed
npx playwright install webkit
npx playwright test --config playwright.mobile.config.ts
npm run build
```

Development serves the static client at `http://localhost:5173/castleofthebreakingwinds/`. Browser co-op still uses public matchmaking. `npm run play:two` opens two separate visible Chrome browsers against the published GitHub page and joins them; it does not start a game server. Set `GAME_URL` to test another deployed or locally served client.

`tests/peer.spec.ts` exercises real WebRTC through public PeerJS matchmaking. It needs outbound internet access. Engine tests and the retained dedicated-server suite also run. See [test plan](qa/TEST-PLAN.md) and [results](qa/RESULTS.md).

## GitHub Pages

The existing Pages site publishes `main/docs`. Run `npm run build` and commit the generated `docs/` with source changes. The published page defaults to browser-hosted co-op; no secrets or private backend are needed.

## Optional dedicated server

The former Node/WebSocket mode is retained for compatibility and its regression tests. `npm start` serves the built client on port 8787. In the lobby's **Advanced: dedicated server**, replace `peer` with `ws://localhost:8787/ws` (local development) or a deployed `wss://.../ws` endpoint. Both clients must choose that same endpoint. The default remains browser co-op even when a Node server serves the page.

Dedicated-server settings: `PORT` (8787), `DATA_DIR` (`.game-data`), and `ALLOWED_ORIGINS`. It stores room saves on disk and exposes `/health` and `/ws`. These settings do not apply to browser-hosted expeditions.
