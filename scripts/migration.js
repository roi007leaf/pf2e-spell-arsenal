export const LEGACY_MODULE_ID = 'pf2e-spell-arsenal';
const MODULE_ID = 'spell-arsenal';
const FLAGS = ['spellArsenalArea', 'spellArsenalDamage', 'spellArsenalCaster', 'spellArsenalPlacement', 'spellArsenalHighlight'];

function storedSetting(storage, key) {
  const entry = storage.get(key);
  if (!entry) return undefined;
  const value = entry.value;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

export async function migrateLegacyModule() {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id || game.settings.get(MODULE_ID, 'legacyMigrated')) return;
  if (game.modules?.get(LEGACY_MODULE_ID)?.active) return;
  const storage = game.settings.storage.get('world');
  for (const key of ['rules', 'enabled']) {
    if (storage.get(`${MODULE_ID}.${key}`)) continue;
    const value = storedSetting(storage, `${LEGACY_MODULE_ID}.${key}`);
    if (value !== undefined) await game.settings.set(MODULE_ID, key, value);
  }
  for (const scene of game.scenes) {
    for (const type of ['Tile', 'AmbientLight', 'AmbientSound', 'Region']) {
      const updates = [];
      for (const doc of scene.getEmbeddedCollection(type)) {
        const update = { _id: doc.id };
        for (const flag of FLAGS) {
          const owner = doc.flags?.world?.[flag]?.owner;
          if (owner?.startsWith(`${LEGACY_MODULE_ID}:`)) update[`flags.world.${flag}.owner`] = `${MODULE_ID}:${owner.slice(LEGACY_MODULE_ID.length + 1)}`;
        }
        if (Object.keys(update).length > 1) updates.push(update);
      }
      if (updates.length) await scene.updateEmbeddedDocuments(type, updates);
    }
  }
  await game.settings.set(MODULE_ID, 'legacyMigrated', true);
}
