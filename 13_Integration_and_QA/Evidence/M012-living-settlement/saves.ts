// M012 browser probe saves: Node-made worlds restored by the game from localStorage.
import { writeFileSync } from 'node:fs';
import { GameSession } from '../Astrix/Game/src/app/session';
import { GENERATOR_V2, surfaceAt } from '../Astrix/Game/src/sim/world';
import { findFieldSpot } from '../Astrix/Game/src/sim/homestead';

function build(rules: 2 | 3, upto: number) {
  const s = GameSession.genesis(1337, GENERATOR_V2);
  const send = (c: any) => s.dispatch({ schema: 3, id: s.commandId(c.type, c.type === 'mark_field' ? `${c.x},${c.z}` : ''), expectedRevision: s.world.revision, ...c });
  if (!send({ type: 'found_homestead', rules }).ok) throw new Error('found');
  const spot = findFieldSpot(s.world, 6, 6, 'flax')!; if (!send({ type: 'mark_field', ...spot }).ok) throw new Error('field');
  while (s.world.life!.tick < upto) if (!send({ type: 'tick', ticks: 1 }).ok) throw new Error('tick');
  return s;
}
const out: Record<string, unknown> = {};
for (const [name, rules, tick, ax, az, heading] of [
  ['pen', 3, 305, -27.5, -7.5, Math.PI], ['door', 2, 305, -33.5, -8.5, Math.PI],
] as const) {
  const s = build(rules, tick);
  const y = surfaceAt(s.world, Math.floor(ax), Math.floor(az));
  out[name] = {
    tick, rules, hash: s.stateHash, seq: s.nextSequence, anchor: [s.world.homestead!.anchorX, s.world.homestead!.anchorZ],
    storage: {
      'astrix:entered:v1': '1',
      'astrix:m002:v3:seed:1337': JSON.stringify({ schema: 3, seed: 1337, snapshot: s.snapshot, journal: s.journal }),
      'astrix:avatar:v1:seed:1337:gen:2': JSON.stringify({ x: ax, y, z: az, heading, health: 100, stamina: 1, safe: { x: ax, y, z: az } }),
    },
  };
}
writeFileSync('/projects/sandbox/.kiro/artifacts/screenshots/probe/m012-saves.json', JSON.stringify(out));
console.log(Object.fromEntries(Object.entries(out).map(([k, v]: any) => [k, { tick: v.tick, rules: v.rules, hash: v.hash, seq: v.seq, anchor: v.anchor, bytes: v.storage['astrix:m002:v3:seed:1337'].length }])));
