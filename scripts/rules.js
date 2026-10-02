export const MODULE_ID = 'pf2e-spell-arsenal';
export function isInstant(rule) { return rule.instant ?? (rule.duration === 5); }
export const DURATION_UNITS = { seconds: 1, rounds: 6, minutes: 60, hours: 3600 };
export function displayDuration(rule) {
  const unit = rule.durationUnit ?? (rule.duration > 0 && rule.duration % 60 === 0 ? 'minutes' : 'seconds');
  return { unit, value: rule.duration / (DURATION_UNITS[unit] ?? 1) };
}
export function hasTemplate(rule) {
  return rule.hasTemplate ?? ['fireball', 'scatter scree', 'grim tendrils', 'breathe fire'].includes(rule.spell?.trim().toLowerCase());
}
export const DEFAULT_RULES = [
  { id: 'caustic-blast', enabled: true, kind: 'damage', spell: 'Caustic Blast', effect: 'Acid', duration: 5, stage: 1, squares: 4, highlight: false },
  { id: 'scatter-scree', enabled: true, kind: 'area', spell: 'Scatter Scree', effect: 'Earthquake', duration: 0, stage: 1, squares: 4, highlight: true },
  { id: 'fireball', enabled: true, kind: 'area', spell: 'Fireball', effect: 'Fire', duration: 5, stage: 1, squares: 4, highlight: false },
  { id: 'grease', enabled: true, kind: 'area', spell: 'Grease', effect: 'Grease', duration: 60, durationUnit: 'minutes', instant: false, stage: 1, squares: 4, highlight: true },
  { id: 'grim-tendrils', enabled: true, kind: 'caster', spell: 'Grim Tendrils', effect: 'Unholy Light', duration: 5, stage: 1, squares: 4, highlight: false }
];

export function validateRules(rules) {
  if (!Array.isArray(rules) || rules.length > 100) throw new Error('Supply at most 100 spell mappings.');
  const ids = new Set(), triggers = new Set();
  return rules.map(rule => {
    if (!rule || typeof rule !== 'object') throw new Error('Invalid spell mapping.');
    if (rule.id === 'grease' && rule.spell === 'Grease' && rule.duration === 0 && rule.instant === undefined && rule.durationUnit === undefined) rule = { ...rule, duration: 60, durationUnit: 'minutes', instant: false };
    const spell = typeof rule.spell === 'string' ? rule.spell.trim() : '';
    const effect = typeof rule.effect === 'string' ? rule.effect.trim() : '';
    if (!spell || (rule.enabled && !effect) || !['area', 'damage', 'caster'].includes(rule.kind)) throw new Error('Each enabled mapping needs spell, effect and trigger.');
    if (typeof rule.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(rule.id) || ids.has(rule.id)) throw new Error('Mapping IDs must be unique.');
    ids.add(rule.id);
    const stageMode = rule.stageMode ?? 'auto';
    if (!['auto', 'fixed'].includes(stageMode)) throw new Error('Stage mode must be auto or fixed.');
    if (typeof rule.enabled !== 'boolean' || typeof rule.highlight !== 'boolean') throw new Error('Invalid mapping toggle.');
    const trigger = `${rule.kind}:${spell.toLowerCase()}`;
    if (rule.enabled && triggers.has(trigger)) throw new Error(`Duplicate enabled trigger for ${spell}.`);
    if (rule.enabled) triggers.add(trigger);
    if (!Number.isFinite(rule.duration) || rule.duration < 0 || rule.duration > 2147483 || (!isInstant(rule) && rule.kind !== 'area' && rule.duration === 0)) throw new Error('Duration must be positive; area effects may use 0 for permanent.');
    if (!Number.isInteger(rule.stage) || rule.stage < 1) throw new Error('Stage must be a positive integer.');
    if (!Number.isInteger(rule.squares) || rule.squares < 1 || rule.squares > 120) throw new Error('Choose 1–120 touching cells.');
    return { id: rule.id, enabled: rule.enabled, kind: rule.kind, spell, sourceUuid: typeof rule.sourceUuid === 'string' ? rule.sourceUuid : '', effect, hasTemplate: hasTemplate(rule), duration: isInstant(rule) ? 0 : rule.duration, durationUnit: displayDuration(rule).unit, instant: isInstant(rule), stage: rule.stage, stageMode, squares: rule.squares, highlight: rule.highlight };
  });
}

export function runtimeSettings(rule) {
  return { SPELL_NAME: rule.spell, EFFECT_NAME: rule.effect, INSTANT: isInstant(rule), DURATION_SECONDS: isInstant(rule) ? 5 : rule.duration,
    STAGE: rule.stage, STAGE_MODE: rule.stageMode ?? 'auto', FREEFORM_SQUARES: rule.squares, REGION_HIGHLIGHT_ONLY_WHILE_EDITING: rule.highlight, TILE_ELEVATION_OFFSET: 0.1 };
}
