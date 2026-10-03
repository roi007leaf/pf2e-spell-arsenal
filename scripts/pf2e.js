import { wizardTemplateDetails } from './wizard-template-details.js';
import { DEFAULT_RULES } from './default-rules.js';
import { restoreWizardTextures, wizardRegionSpell, wizardHandlesPlacement, wizardHandlesAreaAutomation, wizardPlacementPending, wizardFlagsChanged, WIZARD_ID } from './template-wizard.js';
export function pf2eAreaInfo(item) {
  const system = item?.system ?? {};
  const description = String(system.description?.value ?? '');
  const shapes = new Set(['burst', 'cone', 'cube', 'cylinder', 'emanation', 'line', 'ring', 'square']);
  const templates = [];
  for (const match of description.matchAll(/@Template\[([^\]]+)\]/gi)) {
    const parameters = {};
    match[1].split('|').forEach((part, index) => {
      const separator = part.indexOf(':');
      if (separator < 0 && index === 0) parameters.type = part.trim();
      else if (separator >= 0) parameters[part.slice(0, separator).trim()] = part.slice(separator + 1).trim();
    });
    if (!shapes.has(parameters.type) || !parameters.distance) continue;
    if (!(Number(parameters.distance) > 0) && !parameters.distance.startsWith('resolve(')) continue;
    if (parameters.width && !(Number(parameters.width) > 0)) continue;
    templates.push(parameters);
  }
  const text = description.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ');
  const count = text.match(/\b(\d+)\s+contiguous\s+5[-\s](?:foot|ft)\s+squares\b/i);
  const squares = count && Number(count[1]) >= 1 && Number(count[1]) <= 120 ? Number(count[1]) : undefined;
  const details = templates.map(template => template.type === 'line'
    ? `${Number(template.distance) > 0 ? template.distance : 'Variable'} × ${template.width ?? 1} ft line`
    : `${Number(template.distance) > 0 ? template.distance : 'Variable'} ft ${template.type}`);
  if (system.area) details.unshift(`${system.area.value} ft ${system.area.type}`);
  const wizard = wizardTemplateDetails(item);
  details.push(...wizard);
  return { hasTemplate: Boolean(system.area) || templates.length > 0 || wizard.length > 0, squares, templateDetails: [...new Set(details)],
    summary: wizard.length ? wizard.join(' / ') : system.area ? `${system.area.value} ft ${system.area.type}` : templates.length ? `Description templates: ${templates.map(template => `${Number(template.distance) > 0 ? template.distance : 'variable'} ft ${template.type}`).join(' / ')}`
      : squares ? `${squares} contiguous cells from description` : 'No spell template' };
}
export function pf2eContainedSpell(item) {
  if (item?.type === 'spell') return item;
  if (item?.type !== 'consumable') return null;
  const stored = item.system?.spell;
  const supplied = Object.getOwnPropertyDescriptor(item, 'embeddedSpell')?.value;
  if (!stored && !supplied) return null;
  const spell = item.actor ? item.embeddedSpell ?? stored ?? supplied : stored ?? supplied;
  return spell?.type === 'spell' ? spell : null;
}
export const pf2eAdapter = {
  defaults: () => DEFAULT_RULES,
  normalizeSpell: item => item,
  areaInfo: pf2eAreaInfo,
  containedSpell: pf2eContainedSpell,
  resolveContainedSpell: async item => pf2eContainedSpell(item),
  registerHooks() {},
  restoreTextures: restoreWizardTextures,
  regionSpell(region) {
    const origin = region.flags?.[globalThis.game?.system?.id ?? 'pf2e']?.origin;
    return region.message?.item ?? (globalThis.fromUuidSync ? wizardRegionSpell(region) ?? (origin?.uuid ? fromUuidSync(origin.uuid) : null) : null);
  },
  regionName(region) { return region.flags?.[globalThis.game?.system?.id ?? 'pf2e']?.origin?.name ?? this.regionSpell(region)?.name; },
  regionOrigin: region => region.flags?.[game.system.id]?.origin,
  areaCastActions(spell) {
    if (spell.isAttack && spell.rollAttack) return [{ id: 'attack', run: () => spell.rollAttack(new Event('click')) }];
    return spell.damageKinds?.has('damage') && spell.rollDamage ? [{ id: 'damage', run: () => spell.rollDamage(new Event('click')) }] : [];
  },
  areaEnemy(spell, caster, token) {
    return spell.actor?.isEnemyOf ? spell.actor.isEnemyOf(token.actor) : Boolean(caster && [-1, 1].includes(caster.disposition) && token.disposition === -caster.disposition);
  },
  handlesAreaAutomation: wizardHandlesAreaAutomation,
  handlesAreaSaves: () => Boolean(game.modules.get('pf2e-toolbelt')?.active),
  areaDamageSpell: message => message.flags?.[game.system.id]?.context?.type === 'damage-roll' ? message.item : null,
  areaActions(spell, token) {
    const save = spell.system?.defense?.save?.statistic;
    const dc = spell.statistic?.dc?.value ?? spell.spellcasting?.statistic?.dc?.value;
    const actions = [];
    if (save && Number.isFinite(dc) && token.actor.saves?.[save]?.roll) actions.push({ id: 'save', label: `Roll ${save} save (DC ${dc})`, run: () => token.actor.saves[save].roll({ dc: { value: dc }, item: spell }) });
    if (spell.damageKinds?.has('damage') && spell.rollDamage) actions.push({ id: 'damage', label: 'Roll spell damage', run: () => spell.rollDamage(new Event('click')) });
    return actions;
  },
  regionCastSpell(region) {
    const spell = this.regionSpell(region);
    const origin = this.regionOrigin(region) ?? region.message?.flags?.[game.system.id]?.origin;
    const optionRank = origin?.rollOptions?.find(value => /^origin:item:rank:\d+$/.test(value))?.split(':').at(-1);
    const rank = Number(origin?.castRank ?? optionRank);
    return spell && Number.isInteger(rank) && rank > 0 ? spell.loadVariant?.({ castRank: rank }) ?? spell : spell;
  },
  messageOrigin: message => message.flags?.[game.system.id]?.origin,
  reverted: message => Boolean(message.flags?.[game.system.id]?.appliedDamage?.isReverted),
  messageEvent(message, kind) {
    const flags = message.flags?.[game.system.id];
    if (kind === 'damage') {
      const applied = flags?.appliedDamage;
      if (flags?.context?.type !== 'damage-taken' || !applied || applied.isHealing || applied.isReverted || !applied.updates?.some(change =>
        change.value > 0 && ['system.attributes.hp.value', 'system.attributes.hp.temp', 'system.attributes.hp.sp.value'].includes(change.path))) return null;
    } else if (message.isRoll || (flags?.context?.type && flags.context.type !== 'spell-cast') || !flags?.origin?.rollOptions?.includes('origin:action:slug:cast-a-spell')) return null;
    return message;
  },
  listenDamage() {},
  handlesPlacement: wizardHandlesPlacement,
  placementPending: wizardPlacementPending,
  regionFlagsChanged: wizardFlagsChanged,
  lifetime(region, settings) {
    const managed = region?.flags?.[WIZARD_ID];
    return region && !settings.INSTANT && game.modules.get(WIZARD_ID)?.active && (managed?.originUuid || managed?.managed) ? 0 : settings.DURATION_SECONDS;
  },
  placementFlags: message => ({ [game.system.id]: { messageId: message.id, origin: { ...message.item.getOriginData?.(), name: message.item.name } } }),
  preferredSpell: items => items.find(item => item.flags?.[WIZARD_ID]?.automation?.enabled)
};
