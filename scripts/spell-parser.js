// Description markup is read as data; it is never executed.
import { matchSpellVisual } from './spell-matching.js';
import { systemAdapter } from './systems.js';
const visuals = { fire: 'Fire', cold: 'Frost', acid: 'Acid', electricity: 'Lightning Field', sonic: 'Earthquake', force: 'Force Barrier', vitality: 'Holy Light', void: 'Unholy Light' };

export function spellAreaInfo(item) { return systemAdapter(item).areaInfo(item); }
export function containedSpell(item) { return systemAdapter(item).containedSpell(item); }

export function inferSpellRule(item, configurations, id) {
  item = containedSpell(item);
  if (!item) throw new Error('Drop a spell or a wand/scroll containing a spell.');
  const original = item;
  item = systemAdapter(item).normalizeSpell(item);
  const system = item.system ?? {};
  const area = spellAreaInfo(original);
  const traits = new Set(system.traits?.value ?? []);
  const damage = Object.values(system.damage ?? {}).filter(part => {
    if (!part || typeof part !== 'object') return false;
    // Prepared spell documents use Sets; source/JSON documents use arrays.
    const kinds = new Set(part.kinds ?? ['damage']);
    return !kinds.has('healing') || kinds.has('damage');
  });
  const types = [...new Set(damage.map(part => part.type).filter(Boolean))];
  const slug = system.slug || String(item.name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const visual = matchSpellVisual(item);
  const candidates = visual.confidence !== 'review' ? [visual.effect] : types.length ? [] : [...traits].map(trait => visuals[trait]).filter(Boolean);
  const available = Object.values(configurations ?? {});
  const effects = [...new Set(candidates)].map(name => available.find(p => p.name?.toLowerCase() === name.toLowerCase())).filter(Boolean);
  const preset = effects.length === 1 ? effects[0] : null;
  const kind = slug === 'grease' || area.hasTemplate || area.squares ? 'area' : damage.length ? 'damage' : 'caster';
  const durationText = String(system.duration?.value ?? '').trim();
  const match = durationText.match(/^(?:up to\s+)?(\d+(?:\.\d+)?)\s*(seconds?|rounds?|minutes?|hours?|days?)$/i);
  const seconds = match ? Number(match[1]) * ({ second: 1, round: 6, minute: 60, hour: 3600, day: 86400 }[match[2].toLowerCase().replace(/s$/, '')]) : 0;
  const lasting = seconds > 0 || system.duration?.sustained || /sustained|unlimited|until|permanent/i.test(durationText);
  const stages = preset ? Object.values(preset.configs ?? {}).filter(p => (kind === 'area' ? ['Tile', 'AmbientLight', 'AmbientSound', 'Region'] : ['Tile', 'AmbientLight', 'AmbientSound']).includes(p.type)).map(p => p.stage) : [];
  const stage = stages.length ? Math.min(...stages) : 1;
  const supported = preset && stages.length && Object.values(preset.configs ?? {}).every(p => (kind === 'area' ? ['Tile', 'AmbientLight', 'AmbientSound', 'Region'] : ['Tile', 'AmbientLight', 'AmbientSound']).includes(p.type));
  const rule = { id, spell: item.name, sourceUuid: item.parentItem?.uuid ?? item.uuid ?? '', kind, hasTemplate: area.hasTemplate, templateDetails: area.templateDetails, effect: preset?.name ?? '', enabled: Boolean(supported), stage,
    instant: !lasting,
    duration: lasting ? (seconds > 0 && seconds <= 2147483 ? seconds : kind === 'area' ? 0 : 5) : 0,
    squares: area.squares ?? 4, highlight: kind === 'area' && lasting };
  const summary = [area.summary, types.length ? types.join(', ') : 'No damage', durationText || 'Instant'];
  if (!supported) summary.push('Choose visual effect, then enable mapping');
  if (system.duration?.sustained) summary.push('Sustained: duration override may be needed');
  return { rule, summary: summary.join(' · ') };
}

export async function resolveSpellDrop(event, ItemClass) {
  const raw = event.dataTransfer?.getData('text/plain');
  let data;
  try { data = JSON.parse(raw || '{}'); } catch { throw new Error('Drop a spell from a sheet or compendium.'); }
  if (data.type !== 'Item') throw new Error('Drop a spell Item.');
  const item = await ItemClass.fromDropData(data);
  const spell = await systemAdapter(item).resolveContainedSpell(item);
  if (!spell) throw new Error('Only spell Items or spell-containing wands/scrolls can be imported.');
  return spell;
}
