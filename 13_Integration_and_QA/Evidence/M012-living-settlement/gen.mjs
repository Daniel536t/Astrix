import { readFileSync, writeFileSync } from 'node:fs';
const saves = JSON.parse(readFileSync('/projects/sandbox/.kiro/artifacts/screenshots/probe/m012-saves.json', 'utf8'));
const [tpl, name, out, extra] = process.argv.slice(2);
const cfg = { name, storage: saves[name].storage, ...JSON.parse(extra ?? '{}') };
writeFileSync(out, readFileSync(tpl, 'utf8').replace('/*CFG*/null', JSON.stringify(cfg)));
console.log('wrote', out);
