import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { createGameServer } from '../server/index.ts';
import type { AddressInfo } from 'node:net';

async function client(url: string) {
  const socket = new WebSocket(url), messages: any[] = [];
  socket.on('message', data => messages.push(JSON.parse(data.toString())));
  await once(socket, 'open');
  return { socket, messages, send: (message: unknown) => socket.send(JSON.stringify(message)), async wait(predicate: (m: any) => boolean) {
    const until = Date.now() + 4000;
    while (Date.now() < until) { const index = messages.findIndex(predicate); if (index >= 0) return messages.splice(index, 1)[0]; await new Promise(resolve => setTimeout(resolve, 10)); }
    throw new Error('Timed out waiting for server message');
  } };
}
test('real sockets: two-player admission, room isolation, malformed messages, token validation and reconnect', async () => {
  const app = createGameServer({ port: 0, host: '127.0.0.1', dataDir: false }); await once(app.server, 'listening');
  const url = `ws://127.0.0.1:${(app.server.address() as AddressInfo).port}/ws`;
  const clients: Awaited<ReturnType<typeof client>>[] = [];
  try {
    const a = await client(url); clients.push(a); a.send({ type: 'create', name: 'A' }); const wa = await a.wait(m => m.type === 'welcome');
    const b = await client(url); clients.push(b); b.send({ type: 'join', code: wa.code.toLowerCase(), name: 'B' }); const wb = await b.wait(m => m.type === 'welcome');
    assert.notEqual(wa.playerId, wb.playerId); assert.notEqual(wa.token, wb.token);
    const c = await client(url); clients.push(c); c.send({ type: 'join', code: wa.code, name: 'Third' }); assert.match((await c.wait(m => m.type === 'error')).message, /two players/);
    c.send({ type: 'resume', code: wa.code, token: 'forged' }); assert.match((await c.wait(m => m.type === 'error')).message, /invalid/);
    c.socket.send('{broken'); assert.match((await c.wait(m => m.type === 'error')).message, /Invalid/);
    c.send({ type: 'create', name: '<script>C</script>' }); const wc = await c.wait(m => m.type === 'welcome'); assert.notEqual(wc.code, wa.code);
    a.send({ type: 'action', action: { type: 'ready' } }); b.send({ type: 'action', action: { type: 'ready' } });
    await a.wait(m => m.type === 'state' && m.state.status === 'playing');
    const room = app.rooms.get(wa.code)!; const before = room.game.players[0].gold;
    a.send({ type: 'action', playerId: wb.playerId, action: { type: 'buy', item: 'potion', cost: -1000 } });
    await a.wait(m => m.type === 'state' && m.state.players[0].gold !== before);
    assert.equal(room.game.players[0].gold, before - 10); assert.equal(room.game.players[1].gold, 20);
    b.socket.close(); await once(b.socket, 'close'); await a.wait(m => m.type === 'state' && m.state.status === 'paused');
    const resumed = await client(url); clients.push(resumed); resumed.send({ type: 'resume', code: wa.code, token: wb.token });
    assert.equal((await resumed.wait(m => m.type === 'welcome')).playerId, wb.playerId);
    await a.wait(m => m.type === 'state' && m.state.status === 'playing');
    const other = app.rooms.get(wc.code)!; assert.equal(other.game.status, 'waiting'); assert.equal(other.game.players.length, 1);
    a.messages.length = 0;
    resumed.send({ type: 'leave' }); await a.wait(m => m.type === 'state' && m.state.players.length === 1);
    assert.equal(room.seats.length, 1);
  } finally { clients.forEach(c => c.socket.terminate()); await app.close(); }
});
test('room state survives server restart; only hashed reconnect keys reach disk', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'castle-save-'));
  let app = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir }); await once(app.server, 'listening');
  const a = await client(`ws://127.0.0.1:${(app.server.address() as AddressInfo).port}/ws`);
  a.send({ type: 'create', name: 'Persistent' }); const welcome = await a.wait(m => m.type === 'welcome');
  app.rooms.get(welcome.code)!.game.players[0].gold = 77; app.save(); a.socket.terminate(); await app.close();
  const disk = readFileSync(join(dir, readdirSync(dir).find(n => n.endsWith('.json'))!), 'utf8'); assert.ok(!disk.includes(welcome.token));
  app = createGameServer({ port: 0, host: '127.0.0.1', dataDir: dir }); await once(app.server, 'listening');
  const b = await client(`ws://127.0.0.1:${(app.server.address() as AddressInfo).port}/ws`);
  try { b.send({ type: 'resume', code: welcome.code, token: welcome.token }); await b.wait(m => m.type === 'welcome'); const state = await b.wait(m => m.type === 'state'); assert.equal(state.state.players[0].gold, 77); }
  finally { b.socket.terminate(); await app.close(); }
});
test('disallowed browser origins are rejected before the handshake', async () => {
  const app = createGameServer({ port: 0, host: '127.0.0.1', dataDir: false, origins: ['https://allowed.example'] }); await once(app.server, 'listening');
  try { const ws = new WebSocket(`ws://127.0.0.1:${(app.server.address() as AddressInfo).port}/ws`, { origin: 'https://untrusted.example' }); const [error] = await once(ws, 'error'); assert.match(error.message, /403/); }
  finally { await app.close(); }
});
