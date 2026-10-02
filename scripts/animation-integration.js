import { MODULE_ID } from './rules.js';
import { systemAdapter } from './systems.js';
const sources = new Map();
export function rememberAnimationRegion(region) {
  const name = systemAdapter().regionName(region);
  if (name) sources.set(region.uuid, name);
  if (sources.size > 1000) sources.delete(sources.keys().next().value);
}
export function replacesAnimation(effect) {
  if (!game.settings.get(MODULE_ID, 'enabled')) return false;
  const data = effect.data;
  if (typeof data?.file !== 'string' || !data.file.startsWith('autoanimations.templatefx.')) return false;
  if (typeof data.source !== 'string' || !/^Scene\.[^.]+\.Region\.[^.]+$/.test(data.source)) return false;
  const region = fromUuidSync(data.source);
  const name = region ? systemAdapter().regionName(region) : sources.get(data.source) ?? data.name;
  return Boolean(name && game.settings.get(MODULE_ID, 'rules').some(rule => rule.enabled && rule.kind === 'area' && rule.effect && rule.spell.trim().toLowerCase() === name.trim().toLowerCase()));
}
export function preventMappedAnimation(data) {
  return replacesAnimation({ data }) ? false : undefined;
}
export async function suppressMappedAnimations() {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
  const manager = globalThis.Sequencer?.EffectManager;
  if (!manager) return;
  const effects = manager.getEffects().filter(replacesAnimation);
  if (effects.length) await manager.endEffects({ effects });
}
