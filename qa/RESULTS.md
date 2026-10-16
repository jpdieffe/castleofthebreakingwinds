# Test results — October 16, 2026

- `npm test`: **22 passed**, 0 failed. Includes engine rules, map connectivity at three seeds, live WebSocket protocol checks and save/restart recovery.
- `npm run test:e2e:headed`: **11 passed**, 0 failed, in 38.7 seconds. Opened two independent visible Chrome clients per scenario, plus a third where needed.
- `npm run build`: TypeScript and Vite production build pass.
- Production launcher verified: two independent Chrome windows opened and joined the same running expedition. `GET /health`, the root client, the LAN client address, recovered map JSON and an original sprite all returned HTTP 200 from port 8787.
- Removed the retired Phaser/Firebase dependency stack; the remaining production dependency is `ws`.

The browser suite covered actual hamlet-to-wilderness movement without fixture changes, automatic enemy movement, synchronized combat and inventory, loot contention, revives, network loss/recovery, all 14 area loads, victory, mobile layout and replacing a companion. Full details and reproducible commands are in [TEST-PLAN.md](TEST-PLAN.md).

Issues found and fixed during verification: unreachable exits in a disconnected outdoor region; fortress floor/door interpretation; wrong recovered map width/height orientation; a room broadcast scheduling issue; a replacement companion moving the existing player; shared level-up incorrectly reviving a fallen partner; distorted mobile map proportions and hidden mobile health bars.

The 14-area transition scenario uses server-side fixtures to position the party near each exit and to prepare the final encounter. It proves travel and state synchronization, not a full unaided campaign completion. Internet/WAN play and a second physical device were not tested. The selected run mode is this computer as the server, with LAN access available while it remains running.

Screenshots retained in [screenshots/](screenshots/): both tested desktop clients, the mobile layout, the shared victory screen, and both production-launcher clients. The server and two production clients were left running at the user's request; `.game-data/local-session.json` records the current PID, room code and address.
