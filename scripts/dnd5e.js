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
export const DND_DEFAULT_RULES = [
  ['Fireball', 'Fire', 'area', 0], ['Burning Hands', 'Fire', 'area', 0], ['Fire Bolt', 'Fire', 'damage', 0],
  ['Ray of Frost', 'Frost', 'damage', 0], ['Acid Splash', 'Acid', 'area', 0], ['Lightning Bolt', 'Lightning Field', 'area', 0],
  ['Grease', 'Grease', 'area', 60], ['Web', 'Spiderweb', 'area', 3600], ['Fog Cloud', 'Smoke', 'area', 3600]
].map(([spell, effect, kind, duration]) => ({ id: spell.toLowerCase().replaceAll(' ', '-'), spell, effect, kind, duration,
  enabled: true, instant: !duration, stage: 1, stageMode: 'auto', squares: 4, highlight: kind === 'area' && duration > 0, hasTemplate: kind === 'area' }));
