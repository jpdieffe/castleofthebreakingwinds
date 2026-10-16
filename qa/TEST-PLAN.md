# Castle of the Winds co-op test plan

Tested on October 16, 2026, on Windows with Node 24.14 and desktop Google Chrome. Two independent browser contexts are used, each with its own storage and WebSocket connection. The headed run opens visible client windows. The multiplayer transport is real WebSocket traffic over loopback, not a mock or BroadcastChannel.

## Run the checks

```powershell
npm ci
npm test
npm run test:e2e:headed
npm run build
```

The browser suite starts a separate, ephemeral game server for each scenario. Playwright starts Vite if it is not already running. Chrome must be installed. Screenshots and failure traces go in `test-results/`; the HTML report is in `playwright-report/`.

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

All automated cases must pass, TypeScript and the production build must pass, and both initial-area screenshots must display the original graphics and distinct adventurers. The local launcher must open two clients on the production build and the health endpoint must respond.

Before internet hosting, repeat connection/reconnection from two separate external networks, test the actual TLS proxy and WSS endpoint, and check persistent disk behavior on that host. These are environment-specific checks, not covered by local results. Long-session balance, every original spell/item, and exact original-game parity are outside this reconstructed campaign's coverage.
