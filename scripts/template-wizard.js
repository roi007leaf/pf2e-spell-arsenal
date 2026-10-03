import { containedSpell } from './spell-parser.js';
export const WIZARD_ID = 'pf2e-aztecs-template-wizard';
export function wizardHandlesPlacement(item) {
  const module = game.modules.get(WIZARD_ID);
  if (!module?.active || !module.api?.readAutomation || !item) return false;
  const automation = module.api.readAutomation(item);
  return Boolean(automation?.enabled && (automation.contiguous?.enabled || automation.templateShape?.shapes?.length));
}
export function wizardHandlesAreaAutomation(item) {
  const module = game.modules.get(WIZARD_ID);
  if (!module?.active || !item) return false;
  const automation = module.api?.readAutomation?.(item);
  return Boolean(automation?.enabled && automation.behaviors?.some(entry => entry.disabled !== true && ['savingThrow', 'dealDamage', 'rollDice'].includes(entry.type)));
}
export function wizardRegionSpell(region) {
  if (!game.modules.get(WIZARD_ID)?.active) return null;
  const uuid = region.flags?.[WIZARD_ID]?.originUuid ?? region.flags?.[WIZARD_ID]?.managed?.itemUuid ?? region.flags?.[WIZARD_ID]?.contiguousPlacement?.itemUuid ?? region.flags?.[game.system?.id ?? 'pf2e']?.origin?.uuid;
  if (!uuid) return null;
  const item = fromUuidSync(uuid);
  return containedSpell(item);
}
export function wizardFlagsChanged(changes) {
  return Boolean(changes.flags?.[WIZARD_ID]) || Object.keys(changes).some(key => key.startsWith(`flags.${WIZARD_ID}.`));
}
export function wizardPlacementPending(region) {
  if (!game.modules.get(WIZARD_ID)?.active) return false;
  const flags = region.flags?.[WIZARD_ID];
  if (flags?.managed) return false;
  if (flags?.contiguousPlacement?.pending) return true;
  const item = wizardRegionSpell(region) ?? region.message?.item;
  const automation = item && game.modules.get(WIZARD_ID)?.api?.readAutomation?.(item);
  return Boolean(automation?.enabled && automation.contiguous?.enabled && automation.contiguous.count > 1);
}

export async function restoreWizardTextures(scene) {
  for (const tile of scene.tiles ?? []) {
    if (scene.tiles?.has && !scene.tiles.has(tile.id)) continue;
    const saved = tile.flags?.world?.spellArsenalWizardVisual;
    if (!saved) continue;
    const changes = { 'flags.world.-=spellArsenalWizardVisual': null };
    if (tile.alpha === 0 && Number.isFinite(saved.alpha)) changes.alpha = saved.alpha;
    await tile.update(changes);
  }
}
