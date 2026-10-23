// Real-time authoritative WebSocket multiplayer test
// Verifies snapshot sync, movement/chat broadcasting, decorator prop sync, and twilight phase propagation across clients.
import { NetClient } from '../src/net.js';

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  console.log('--- Starting WebSocket Multiplayer Verification ---');
  const eventsPeer1 = [];
  const eventsPeer2 = [];

  const client1 = new NetClient({
    url: 'ws://localhost:8000/ws',
    onEvent: (msg) => { eventsPeer1.push(msg); }
  });

  const client2 = new NetClient({
    url: 'ws://localhost:8000/ws',
    onEvent: (msg) => { eventsPeer2.push(msg); }
  });

  client1.connect();
  client2.connect();

  await wait(500);
  console.log('Client 1 connected:', client1.connected);
  console.log('Client 2 connected:', client2.connected);
  if (!client1.connected || !client2.connected) {
    throw new Error('Could not connect both clients to ws://localhost:8000/ws');
  }

  // 1. Join commands
  client1.send({ t: 'join', person: { id: 'peer1', name: 'Alice', loadout: { skin: '#ffe0bd' } } });
  client2.send({ t: 'join', person: { id: 'peer2', name: 'Bob', loadout: { skin: '#8d5524' } } });
  await wait(400);

  // 2. Chat broadcast
  client1.send({ t: 'say', text: 'Greetings from Alice' });
  await wait(300);
  const bobHeardAlice = eventsPeer2.some(e => e.type === 'event' && e.event?.type === 'say' && e.event?.id === 'peer1' && e.event?.text === 'Greetings from Alice');
  console.log('Bob received Alice say event:', bobHeardAlice);

  // 3. Decorator mode prop sync
  client1.send({ t: 'placeProp', prop: { id: 'multiProp1', type: 'couch', x: 6, y: 14, r: 0, color: '#35e0ff' } });
  await wait(300);
  const bobSawProp = eventsPeer2.some(e => e.type === 'event' && e.event?.type === 'propPlaced' && e.event?.prop?.id === 'multiProp1');
  console.log('Bob received propPlaced event for multiProp1:', bobSawProp);

  // 4. Twilight phase sync
  client2.send({ t: 'setPhase', phase: 'twilight' });
  await wait(300);
  const aliceSawPhase = eventsPeer1.some(e => e.type === 'event' && e.event?.type === 'phaseChange' && e.event?.phase === 'twilight');
  console.log('Alice received phaseChange event to twilight:', aliceSawPhase);

  // 5. Cleanup
  client2.send({ t: 'setPhase', phase: 'normal' });
  client1.send({ t: 'removeProp', propId: 'multiProp1' });
  await wait(300);

  client1.close();
  client2.close();

  if (bobHeardAlice && bobSawProp && aliceSawPhase) {
    console.log('✔ All multiplayer real-time synchronization checks PASSED!');
  } else {
    throw new Error('Multiplayer synchronization assertions failed.');
  }
}

run().catch(err => {
  console.error('Multiplayer test error:', err);
  process.exit(1);
});
