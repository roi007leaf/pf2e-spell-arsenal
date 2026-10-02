import { containedSpell } from './spell-parser.js';
export async function openSpellDetails(name, sourceUuid) {
  let spell;
  if (sourceUuid) {
    try { spell = containedSpell(await fromUuid(sourceUuid)); } catch { /* Fall back when original item was removed. */ }
  }
  if (spell?.name?.trim().toLowerCase() !== name.trim().toLowerCase()) spell = null;
  if (!spell) {
    const packs = [...game.packs].filter(pack => pack.documentName === 'Item' && /spells/i.test(pack.collection));
    for (const pack of packs) {
      const index = await pack.getIndex({ fields: ['type'] });
      const entry = index.find(item => item.type === 'spell' && item.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (entry) { spell = await pack.getDocument(entry._id); break; }
    }
  }
  if (!spell?.sheet) throw new Error(`Spell details unavailable for ${name}. Drop its spell again to link the source.`);
  await spell.sheet.render(true);
}
