export const AREA_TRIGGERS = { placement: 'On placement', entry: 'On entry / re-entry', turn: 'Start of turn', 'turn-end': 'End of turn', exit: 'On exit' };
export function areaMode(rule) { return rule.areaMode ?? 'auto'; }
export function areaTriggers(rule, spell) {
  if (areaMode(rule) === 'auto' && spell) return suggestAreaTriggers(spell).triggers;
  return rule.areaTriggers ?? (rule.areaAutomation === 'placement-entry' ? ['placement', 'entry'] : rule.areaAutomation === 'turn-start' ? ['turn'] : []);
}
export function suggestAreaTriggers(spell) {
  const description = spell?.system?.description?.value ?? spell?.system?.description ?? '';
  const text = String(description).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const triggers = [], evidence = [];
  for (const [trigger, pattern] of [['entry', /(?:enters?|moves? into|re-enters?) (?:the|this|an?|its) (?:area|grease|space)/i], ['turn', /start(?:s)? (?:of )?(?:(?:its|their|your|a|the) )?turn/i], ['turn-end', /end(?:s)? (?:of )?(?:(?:its|their|your|a|the) )?turn/i], ['exit', /(?:leaves?|exits?|moves? out of) (?:the|this|an?|its) (?:area|grease|space)/i]]) {
    const match = text.match(pattern); if (match) { triggers.push(trigger); evidence.push(match[0]); }
  }
  const activities = spell?.system?.activities;
  const all = activities?.values ? [...activities.values()] : Object.values(activities ?? {});
  for (const activity of all) {
    const name = activity.name ?? '';
    const before = triggers.length;
    if (/\b(enter|entry|re[ -]?enter)\b/i.test(name)) triggers.push('entry');
    if (/\bstart\s+(?:of\s+)?turn\b/i.test(name)) triggers.push('turn');
    if (/\bend\s+(?:of\s+)?turn\b/i.test(name)) triggers.push('turn-end');
    if (/\b(exit|leave)\b/i.test(name)) triggers.push('exit');
    if (/\bcast\b/i.test(name)) triggers.push('placement');
    if (triggers.length > before && name) evidence.push(name);
  }
  if (spell?.system?.defense?.save || spell?.isAttack || spell?.damageKinds?.has('damage') || all.some(activity => activity.type === 'save' || activity.type === 'attack')) triggers.push('placement');
  return { triggers: [...new Set(triggers)], evidence: [...new Set(evidence)] };
}
export function areaRepeatKey(rule, region, token, combat, spell) {
  if (!combat?.started || rule.areaRepeat === 'unrestricted') return null;
  const caster = [...(region.parent?.tokens ?? [])].find(t => t.actor?.id === spell?.actor?.id);
  const subject = rule.areaRepeat === 'caster-turn' ? caster : token;
  const combatants = combat.turns ?? [];
  const index = combatants.findIndex(c => c.tokenId === subject?.id || c.token?.id === subject?.id);
  return index < 0 ? `${combat.id}:${combat.round}:${combat.turn}` : `${combat.id}:${subject.id}:${combat.round - (combat.turn < index ? 1 : 0)}`;
}
