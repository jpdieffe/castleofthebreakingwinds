# Castle of the Winds co-op test plan

Windows, Node 24, and desktop Google Chrome. The default game now uses browser-hosted WebRTC, with public PeerJS matchmaking. Browser tests use independent storage contexts and real data channels. The older dedicated-server regression suite remains separate.

## Mobile browser acceptance

`npx playwright test --config playwright.mobile.config.ts` runs the touch suite with Android Chrome and iPhone WebKit device profiles. Test portrait and landscape at 390x844, 360x640, 320x568, 844x390 and 667x375. Require no page overflow, square map tiles, visible status/actions, and movement/action targets at least 44 CSS pixels in both dimensions. Test zoomed tap coordinates, empty-floor Magic Arrow shots, cancellation, diagonal movement, held movement and release, rotation and saved-session refresh.

Use only touch controls to select and buy equipment, drink a potion, inspect the updated counts, select a spell with a mana check, cast/aim, read Hero/Journal and leave via the menu. Keep the inventory action and close controls visible in landscape. Two mobile browser clients must host/join with a code, ready, move, fire arrows, buy items independently and recover after guest refresh. Chromium additionally exercises real CDP multi-touch pinch and long press, asserting no accidental walking/casting.

WebKit is an automated browser-engine check, not a physical iPhone/Safari certification. Physical-device browser chrome, notches, virtual keyboards, different-network ICE negotiation and background suspension still need device testing. The native Android reference is read-only; these tests do not install or modify its APK or phone data.

## Classic inventory

`tests/inventory.spec.ts` checks the recovered drawing loads, all 15 equipment/container positions, actual equipment and empty slots, safe display of player names, purchases and price increases, affordability, potion use, live quantities and vitals, and all exit controls. Small-window tests cover 1280x600, 390x844, 360x640 and 844x390; inventory content can scroll vertically while the close button stays visible, with no horizontal overflow. The Floor pane replaces the Store away from the well. The WebRTC purchase/healing case keeps both inventories open, checks guest purchase synchronization, independent player inventories and host potion use reaching the guest.

## Magic Arrow targeting

`tests/targeting.spec.ts` verifies button/hotkey crosshair selection without an immediate cast, empty-floor shots with mana cost and no walking, visible cyan projectile pixels on the canvas, repeated shots, Escape/right-click/other-action cancellation, normal walking after cancellation, cancellation of an existing walk destination, and low-mana feedback. A real WebRTC guest fires while both clients verify the visible projectile and the host-authoritative mana cost. Engine cases cover range, the first enemy along the selected path, unrelated nearer monsters, walls, diagonal corners, invalid coordinates, cooldowns and effect expiry.

## Viewport layout acceptance cases

`tests/layout.spec.ts` checks the actual bounding boxes of the map and spell toolbar at seven desktop, short-window, and phone sizes. Neither page overflow nor map distortion is allowed. Click-to-walk must continue to hit the intended tile after resizing. A live two-client co-op case also checks both health bars and touch controls. At heights below 500 pixels, the decorative header and adventure log are hidden to prioritize gameplay; the map and spell controls remain available.

## Solo acceptance cases

`tests/solo.spec.ts` verifies immediate Play solo startup without PeerJS matchmaking traffic, one-player UI, walking, refresh recovery, unmodified hamlet-to-wilderness travel, autonomous enemies, spell damage and XP, defeat, automatic solo restart, and leaving the expedition. Engine tests also cover solo admission, disconnect pausing, restart mode preservation, and compatibility with older co-op saves.

## Browser-hosted acceptance cases

`tests/peer.spec.ts` opens real clients and contacts the same public matchmaking service as the published game. It verifies:

- Host/Join with a six-character code; both players ready and move independently.
- Actual open RTC data channels, sent/received messages, and a successful ICE candidate pair.
- Unknown room and third-player rejection without affecting the existing party.
- Guest refresh restores identity and position; host refresh restores its saved world and the companion reconnects.
- Closing a guest pauses simulation time; its seat is reserved until it resumes with its secret token.
- Explicit guest Leave releases the seat; a replacement joins without moving the host. Host Leave ends the session.
- Enemies move without player input; guest spell damage, mana and shared experience agree on both clients.
- Purchases, healing, revival, boss victory and restart synchronize over WebRTC.
- Real movement from the recovered hamlet into the wilderness, including map snapshots exceeding 16 KB.
- Host simulation advances while another room is foregrounded; independent expeditions remain isolated.
- Forged coordinates, unsupported actions and client-supplied state cannot change host authority; command floods disconnect the sender.
- Matchmaking reconnect preserves the existing data channel and does not create another simulation clock.

Combat setups use a saved host-world fixture, loaded before connection. They do not expose production cheat controls. The hamlet-to-wilderness route uses the unmodified world and actual keyboard input. Engine rules are also checked independently below. Two browsers on one computer establish real WebRTC, but do not prove connectivity between different home routers or mobile carriers. TURN-only connections and mobile browser suspension require separate physical-device checks.

## Run the checks

```powershell
npm ci
npm test
npm run test:e2e:headed
npm run build
```

The dedicated-server browser suite starts an ephemeral Node server per scenario; the WebRTC suite does not start a game server. Playwright starts Vite if it is not already running. Chrome must be installed. Screenshots and failure traces go in `test-results/`; the HTML report is in `playwright-report/`.

## Engine and network cases

| Case | Expected result |
| --- | --- |
| One player; two players, only one ready; third join | Simulation waits until exactly two are ready; third player is rejected |
| Valid steps, action burst, fractional/NaN/oversized steps | Server applies valid cooldown-limited steps; invalid coordinates never teleport |
| Walls, diagonal corners, occupied tile | No clipping or player overlap |
| Door bump and next step | Door opens for everyone; first action opens, second enters |
| Idle players near an enemy | Enemy moves on its own, no faster than one action per 1.4 seconds |
| Disconnect and reconnect | Simulation time and combat freeze; resume does not apply catch-up damage |
| Melee kill and repeated action | One death, one drop, one shared XP reward |
| Magic Arrow, Fireball, insufficient mana, wall between target | Correct cost, range and area damage; no cast through walls or without mana |
| Potions, Heal and full health/mana | Stats clamp at maximum; unnecessary consumables are preserved |
| Downed player, distant revive, no potion, adjacent revive | Downed player cannot act; revival requires proximity and a potion |
| Both players down; restart; boss killed | Shared defeat and victory; restart resets equipment and requires readiness |
| Both clients contend for one treasure | Exactly one collection, no duplicated currency |
| Stairs with distant partner; round trip | Whole party must be nearby and alive; previously visited state is retained |
| Shop range, funds and client-supplied price | Server decides cost and eligibility |
| Exploration and snapshot | Both players reveal the shared map; other areas are omitted from snapshots |
| Replace a departed companion | Existing adventurer keeps position; replacement spawns nearby |
| Level-up while partner is down | XP is shared without a free revival |
| Deterministic RNG | Repeatable bounded sequence |
| All 14 areas, three seeds | Walkable spawns, companion space, reachable exits and final boss |
| Real WebSocket messages | Independent identities, capacity enforcement, isolation, invalid JSON rejection, forged-token rejection |
| Restart server from disk save | Same reconnect key restores equipment; plaintext key is absent from save files |
| Unapproved browser origin | Upgrade rejected with HTTP 403 |

## Two-client browser cases

1. Create and join from separate clients, choose Ready, walk independently, inspect partner cards and both map screenshots.
2. Try an unknown room and a third client. Check visible error messages and the original party remains active.
3. Walk both players from their original hamlet spawn to the northern exit using actual keyboard controls, with no fixture edits. Travel into the recovered wilderness together.
4. Stand still near an enemy. Observe independent movement timing, attack with the keyboard, and confirm the partner receives the kill log and XP.
5. Cast spells, heal, drink a potion, buy at a well, and compare authoritative stats with the partner's UI.
6. Move toward the same treasure at the same time. Confirm one winner, distinct positions and shared door state.
7. Revive a fallen partner, trigger total defeat, and restart from either client.
8. Reload one client. Then interrupt its network, verify the partner's pause screen and frozen clock, restore the connection, and verify identity and gold survive.
9. Exercise all 13 area transitions in both clients, then kill the final boss and verify both victory screens.
10. Read the 15 recovered story entries, open help, resize to 390×844, use touch movement, inspect map proportions/HP and check horizontal overflow and JavaScript errors.
11. Leave a room, join a replacement companion, and resume the same expedition.

Cases 4–9 use deterministic server-side test setup for rare combat states and portal positioning. They still issue actions through real browser controls and WebSockets; there are no public debug endpoints. The all-area transition test is **not** a full combat playthrough of the campaign. Case 3 separately checks unmodified gameplay navigation.

## Acceptance and limits

All automated cases must pass, TypeScript and the production build must pass, and both initial-area screenshots must display the original graphics and distinct adventurers. The peer launcher must open two clients on the deployed GitHub Pages build and complete a WebRTC session without a Node game server.

For additional network coverage, repeat connection/reconnection from two separate external networks and test relay-only connectivity. For optional dedicated hosting, also test its TLS/WSS endpoint and persistent disk. These are environment-specific checks, not covered by local results. Long-session balance, every original spell/item, and exact original-game parity are outside this reconstructed campaign's coverage.


## Configurable touch quick slots

- Fresh browser defaults: Magic Arrow in slot 1, healing potion in slot 2; icon artwork, slot numbers, potion quantities and accessible names agree.
- Select each spell and each pack potion, assign to either slot, and confirm selecting/assigning never spends mana, uses a potion or moves the player.
- Assign when mana is insufficient, HP is full, or potion quantity is zero. Assignment remains available; actual use obeys game rules.
- Cast Heal and Fireball and drink both potions using assigned slots; counts/vitals update authoritatively. Put Magic Arrow in slot 2, fire at empty ground, check no walking, and cancel aim.
- Replace assignments, rotate between portrait and short landscape, verify both assignment buttons remain reachable, and reload to verify saved choices.
- Two WebRTC clients: guest changes its slot, host retains its own choice, and guest reconnect restores its assignment.
- Invalid saved slot data falls back to defaults without crashing. Run on Chrome and WebKit phone profiles; physical phone limitations are unchanged.


## Imported native map layouts

- Run `scripts/import-mobile-maps.py` against the read-only sibling Java project. Compare all 19,619 tiles and every building/sign with the direct export; check all 13 maps' spawns and exits are reachable.
- Verify the burned-farm start (18,24), three-wide road, mine entrance (18,4), shop (10,14), sanctuary (24,14), west gate (2,16), city river/bridge and fortress entrance (10,5). Native terrain must agree with collision and touch pathfinding.
- Walk both clients north to the mine using real controls, then exercise the route 0-1-2-3-2-1-0-4-5-6-7-8-9-10-11-12; confirm arrival, return travel, two-player proximity rules, final boss and restart.
- Check native line-of-sight, retained exploration and shared party visibility. Confirm high-density building artwork and readable signs in portrait and landscape.
- Resume a legacy 14-area save. Verify one-time relocation, stats/equipment/supplies preserved, old-save backup retained, quick slots preserved and subsequent refresh does not relocate again.
- Fixed seed 42 exports intentionally do not reproduce the random seed of an arbitrary existing native save. Full native item, trap, NPC and quest mechanics remain outside this map change.


## Mobile-reference shops

- Compare against the sibling mobile project's IconPopup.java and shop screenshots: dark panel, gold title, Buy/Sell tabs, four-column pixel-art stock, selected-item highlight, details and a separate commit button. Portrait puts details below; landscape puts them beside the grid.
- Enter Trade using the phone action button, desktop E, and the inventory Trade link. Use the actual native shop name. Closing restores map focus; opening Pack/Spells afterward must not retain shop styles.
- Select without spending. Buy potions and equipment; verify authoritative gold, quantities, automatic equipment upgrades, next-upgrade price and insufficient-funds state.
- Sell owned healing/mana potions one at a time; verify gold, last-item removal, empty quantity rejection and equipped-item protection. Keep online prices and existing inventory model; full native catalog, weight, bank credit and unequipping are outside this interface change.
- Check 320x568, 390x844, 667x375, 844x390 and desktop: Close, Buy/Sell, details and commit remain visible; icons load; no horizontal overflow. Repeat on Android Chrome and iPhone WebKit browser profiles.
- Two WebRTC clients and two WebSocket clients: buy/sell on one client, confirm the other sees exactly the same player state and its own inventory remains independent. Reload and confirm persistence. Engine rejects selling outside shop range, while down, at zero quantity and during action cooldown.
