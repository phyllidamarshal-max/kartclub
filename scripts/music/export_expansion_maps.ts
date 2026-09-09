import { mkdirSync, writeFileSync } from 'node:fs';
import { NEW_MAPS } from '../../shared/map-expansion.ts';
import { getLevel } from '../../shared/levels.ts';

const target = new URL('../../output/music/expansion-v7/', import.meta.url);
mkdirSync(target, { recursive: true });
writeFileSync(new URL('maps.json', target), JSON.stringify(NEW_MAPS.map(({ id, name, baseId, landmark, brief }) => ({
  id, name, baseId, landmark, brief, biome: getLevel(id).biome,
})), null, 2) + '\n');
console.log(`Exported ${NEW_MAPS.length} new-map music briefs.`);
