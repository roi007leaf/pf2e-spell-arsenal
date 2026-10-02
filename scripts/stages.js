const FLAGS = ['spellArsenalArea', 'spellArsenalDamage', 'spellArsenalCaster'];
const TYPES = ['Tile', 'AmbientLight', 'AmbientSound', 'Region'];
export function stageRecords(scene, effect, levelId, offset, now = Date.now()) {
  return TYPES.flatMap(type => [...scene.getEmbeddedCollection(type)].flatMap(doc => {
    const data = FLAGS.map(flag => doc.flags.world?.[flag]).find(data =>
      data?.owner?.startsWith('pf2e-spell-arsenal:') && data.effect === effect && data.levelId === levelId && data.offset === offset && (!data.expiresAt || data.expiresAt > now));
    return data ? [{ doc, type, data }] : [];
  }));
}
export function chooseStage(records, source, stages, mode, fixed) {
  if (mode === 'fixed') return fixed;
  const own = records.filter(r => r.data.source === source);
  if (own.length) return Math.max(...own.map(r => r.data.stage));
  const current = Math.max(0, ...records.map(r => r.data.stage));
  return stages.find(stage => stage > current) ?? stages.at(-1);
}
export async function replaceOverlaps(scene, records, source) {
  const superseded = new Map();
  for (const { data } of records) {
    if (data.source === source || !data.regionId) continue;
    const region = scene.regions.get(data.regionId);
    if (!region || !scene.regions.has(region.id ?? data.regionId)) continue;
    if (!superseded.has(region)) superseded.set(region, { ...(region.flags.world?.spellArsenalSuperseded ?? {}) });
    superseded.get(region)[`${data.levelId}:${data.offset}`] = true;
  }
  for (const [region, cells] of superseded) if ([...scene.regions.values()].includes(region)) await region.update({ 'flags.world.spellArsenalSuperseded': cells });
  for (const type of TYPES) {
    const live = new Set([...scene.getEmbeddedCollection(type)].map(doc => doc.id));
    const ids = records.filter(r => r.type === type && r.data.source !== source && live.has(r.doc.id)).map(r => r.doc.id);
    if (ids.length) await scene.deleteEmbeddedDocuments(type, [...new Set(ids)]);
  }
}
