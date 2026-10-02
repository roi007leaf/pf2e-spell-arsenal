export const isDndSpell = item => item?.type === 'spell' && typeof item.system?.level === 'number';
export const activities = item => item?.system?.activities?.values ? [...item.system.activities.values()] : Object.values(item?.system?.activities ?? {});
export function dndSpellData(item) {
  const system = item.system;
  const damage = activities(item).filter(a => a.type !== 'heal').flatMap(a => [...(a.damage?.parts ?? []), ...(a.damage?.includeBase && system.damage?.base ? [system.damage.base] : [])]);
  const types = [...new Set(damage.flatMap(part => [...(part.types ?? [])]).map(type => type === 'lightning' ? 'electricity' : type))];
  const units = { round: 'rounds', minute: 'minutes', hour: 'hours', day: 'days' };
  const duration = system.duration ?? {};
  const value = duration.units === 'inst' ? '' : units[duration.units] && Number(duration.value) > 0 ? `${duration.value} ${units[duration.units]}` : 'until removed';
  return { type: 'spell', name: item.name, uuid: item.uuid, system: { slug: system.slug, description: system.description,
    damage: Object.fromEntries(types.map((type, i) => [i, { type, kinds: ['damage'] }])), duration: { value }, traits: { value: [] } } };
}
export function dndTemplateDetails(item) {
  const targets = [item.system?.target?.template, ...activities(item).map(a => a.target?.template)].filter(t => t?.type);
  return [...new Set(targets.map(t => `${t.count && Number(t.count) !== 1 ? `${t.count} × ` : ''}${t.size || 'Variable'}${t.width ? ` × ${t.width}` : ''}${t.height ? ` × ${t.height}` : ''} ${t.units || 'ft'} ${t.type}`))];
}
export function dndRegionSpell(region) {
  const uuid = region.flags?.dnd5e?.item;
  return uuid && globalThis.fromUuidSync ? fromUuidSync(uuid) : null;
}
export function dndMessageSpell(message) {
  return message?.getAssociatedItem?.({ scaled: true }) ?? message?.item ?? null;
}
export function annotateDndCast(activity, config) {
  if (globalThis.game?.system?.id !== 'dnd5e' || activity.item?.type !== 'spell') return;
  const level = activity.getRollData?.().item?.level ?? activity.item.system.level;
  config.data.flags ??= {};
  config.data.flags.world ??= {};
  config.data.flags.world.spellArsenalCast = { itemUuid: activity.item.uuid, name: activity.item.name, spellLevel: level };
}
export function annotateDndDamage(actor, amount, updates, options) {
  if (game.system.id !== 'dnd5e' || !game.settings.get('spell-arsenal', 'enabled')) return;
  const message = options.originatingMessage ?? options.origin;
  const spell = dndMessageSpell(message);
  if (!isDndSpell(spell)) return;
  const hp = actor.system.attributes.hp;
  const nextValue = updates['system.attributes.hp.value'] ?? updates.system?.attributes?.hp?.value ?? hp.value;
  const nextTemp = updates['system.attributes.hp.temp'] ?? updates.system?.attributes?.hp?.temp ?? hp.temp ?? 0;
  if (Number(hp.value) + Number(hp.temp ?? 0) <= Number(nextValue) + Number(nextTemp)) return;
  if (!game.settings.get('spell-arsenal', 'rules').some(r => r.enabled && r.kind === 'damage' && r.spell.trim().toLowerCase() === spell.name.trim().toLowerCase())) return;
  updates['flags.world.spellArsenalDamageEvent'] = { id: foundry.utils.randomID(), itemUuid: spell.uuid, name: spell.name, spellLevel: spell.system.level, actorId: actor.id };
}
export function forwardDndDamage(actor, changes, options) {
  const event = changes['flags.world.spellArsenalDamageEvent'] ?? changes.flags?.world?.spellArsenalDamageEvent;
  if (!event) return;
  options.spellArsenalDamageEvent = event;
  delete changes['flags.world.spellArsenalDamageEvent'];
  if (changes.flags?.world) {
    delete changes.flags.world.spellArsenalDamageEvent;
    if (!Object.keys(changes.flags.world).length) delete changes.flags.world;
    if (!Object.keys(changes.flags).length) delete changes.flags;
  }
}
export function dndDefaultRules() {
  let version;
  try { version = game.settings.get('dnd5e', 'rulesVersion'); } catch { version = 'modern'; }
  return version === 'legacy' ? DND_LEGACY_RULES : DND_DEFAULT_RULES;
}
import { DND_DEFAULT_RULES, DND_LEGACY_RULES } from './dnd-default-rules.js';
export { DND_DEFAULT_RULES, DND_LEGACY_RULES };

export const dnd5eAdapter = {
  defaults: dndDefaultRules,
  restoreTextures: async () => {},
  normalizeSpell: dndSpellData,
  areaInfo(item) {
    const templateDetails = dndTemplateDetails(item);
    return { hasTemplate: templateDetails.length > 0, templateDetails, summary: templateDetails.join(' / ') || 'No spell template' };
  },
  containedSpell(item) {
    if (item?.type === 'spell') return item;
    const casts = activities(item).filter(a => a.type === 'cast');
    return casts.length === 1 && casts[0].cachedSpell?.type === 'spell' ? casts[0].cachedSpell : null;
  },
  async resolveContainedSpell(item) {
    const spell = this.containedSpell(item);
    if (spell) return spell;
    const casts = activities(item).filter(a => a.type === 'cast' && a.spell?.uuid);
    return casts.length === 1 ? fromUuid(casts[0].spell.uuid) : null;
  },
  registerHooks() {
    Hooks.on('dnd5e.preCreateUsageMessage', annotateDndCast);
    Hooks.on('dnd5e.preApplyDamage', annotateDndDamage);
    Hooks.on('preUpdateActor', forwardDndDamage);
  },
  regionSpell: dndRegionSpell,
  regionName(region) { return this.regionSpell(region)?.name ?? region.flags?.dnd5e?.origin?.name ?? region.message?.item?.name; },
  regionOrigin: region => ({ castRank: region.flags?.dnd5e?.spellLevel }),
  messageOrigin: message => message.flags?.dnd5e?.origin,
  reverted: () => false,
  messageEvent(message, kind) {
    const cast = message.flags?.world?.spellArsenalCast;
    if (!cast || kind === 'damage') return null;
    return { id: message.id, item: dndMessageSpell(message), token: message.getAssociatedToken?.(), actor: message.getAssociatedActor?.(),
      flags: { dnd5e: { origin: { castRank: cast.spellLevel } } } };
  },
  listenDamage(listen, emit) {
    listen('updateActor', (actor, changes, options) => {
      const event = options.spellArsenalDamageEvent;
      if (!event || event.actorId !== actor.id) return;
      const tokens = actor.isToken ? [actor.token] : (canvas.tokens?.placeables ?? []).filter(t => t.actor?.id === actor.id).map(t => t.document);
      for (const token of tokens.filter(t => t?.parent === canvas.scene && t.level === canvas.level?.id)) {
        const item = { type: 'spell', name: event.name, system: { level: event.spellLevel }, isCantrip: event.spellLevel === 0 };
        emit({ id: `${event.id}:${token.id}`, item, flags: { dnd5e: { origin: { castRank: event.spellLevel } } } }, token);
      }
    });
  },
  handlesPlacement: () => false,
  placementPending: () => false,
  regionFlagsChanged: () => false,
  lifetime: (region, settings) => settings.DURATION_SECONDS,
  placementFlags: message => ({ dnd5e: { messageId: message.id, origin: { name: message.item.name }, item: message.item.uuid, spellLevel: message.flags?.dnd5e?.origin?.castRank } }),
  preferredSpell: () => null
};
