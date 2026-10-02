import { containedSpell } from './spell-parser.js';
import { MODULE_ID } from './rules.js';
export const WIZARD_ID = 'pf2e-aztecs-template-wizard';
export function wizardHandlesPlacement(item) {
  const module = game.modules.get(WIZARD_ID);
  if (!module?.active || !module.api?.readAutomation || !item) return false;
  const automation = module.api.readAutomation(item);
  return Boolean(automation?.enabled && (automation.contiguous?.enabled || automation.templateShape?.shapes?.length));
}
export function wizardRegionSpell(region) {
  if (!game.modules.get(WIZARD_ID)?.active) return null;
  const uuid = region.flags[WIZARD_ID]?.originUuid ?? region.flags[WIZARD_ID]?.managed?.itemUuid ?? region.flags[WIZARD_ID]?.contiguousPlacement?.itemUuid ?? region.flags[game.system?.id ?? 'pf2e']?.origin?.uuid;
  if (!uuid) return null;
  const item = fromUuidSync(uuid);
  return containedSpell(item);
}
export function wizardFlagsChanged(changes) {
  return Boolean(changes.flags?.[WIZARD_ID]) || Object.keys(changes).some(key => key.startsWith(`flags.${WIZARD_ID}.`));
}
export function wizardPlacementPending(region) {
  if (!game.modules.get(WIZARD_ID)?.active) return false;
  const flags = region.flags[WIZARD_ID];
  if (flags?.managed) return false;
  if (flags?.contiguousPlacement?.pending) return true;
  const item = wizardRegionSpell(region) ?? region.message?.item;
  const automation = item && game.modules.get(WIZARD_ID)?.api?.readAutomation?.(item);
  return Boolean(automation?.enabled && automation.contiguous?.enabled && automation.contiguous.count > 1);
}

export function replacesWizardTexture(tile) {
  if (!game.modules.get(WIZARD_ID)?.active || !game.settings.get(MODULE_ID, 'enabled')) return false;
  const uuid = tile.flags?.[WIZARD_ID]?.attachedToRegion;
  const region = uuid ? fromUuidSync(uuid) : null;
  if (!region) return false;
  const spell = wizardRegionSpell(region);
  const name = spell?.name ?? region.flags?.[game.system.id]?.origin?.name;
  return Boolean(name && game.settings.get(MODULE_ID, 'rules').some(rule => rule.enabled && rule.kind === 'area' && rule.effect && rule.spell.trim().toLowerCase() === name.trim().toLowerCase()));
}
export async function syncWizardTextures(scene) {
  for (const tile of scene.tiles ?? []) {
    if (scene.tiles?.has && !scene.tiles.has(tile.id)) continue;
    const saved = tile.flags.world?.spellArsenalWizardVisual;
    if (replacesWizardTexture(tile)) {
      if (!saved || tile.alpha !== 0) await tile.update({ alpha: 0, 'flags.world.spellArsenalWizardVisual': saved ?? { alpha: tile.alpha ?? 1 } });
    } else if (saved) {
      await tile.update({ alpha: saved.alpha, 'flags.world.-=spellArsenalWizardVisual': null });
    }
  }
}
