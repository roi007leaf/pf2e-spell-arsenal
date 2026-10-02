// Description markup is read as data; it is never executed.
const visuals = { fire: 'Fire', cold: 'Frost', acid: 'Acid', electricity: 'Lightning Field', sonic: 'Earthquake', force: 'Force Barrier', vitality: 'Holy Light', void: 'Unholy Light' };

export function spellAreaInfo(item) {
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
  return { hasTemplate: Boolean(system.area) || templates.length > 0, squares, templateDetails: [...new Set(details)],
    summary: system.area ? `${system.area.value} ft ${system.area.type}` : templates.length ? `Description templates: ${templates.map(template => `${Number(template.distance) > 0 ? template.distance : 'variable'} ft ${template.type}`).join(' / ')}`
      : squares ? `${squares} contiguous cells from description` : 'No spell template' };
}

export function containedSpell(item) {
  if (item?.type === 'spell') return item;
  if (item?.type !== 'consumable') return null;
  const spell = item.embeddedSpell ?? item.system?.spell;
  return spell?.type === 'spell' ? spell : null;
}

export function inferSpellRule(item, configurations, id) {
  item = containedSpell(item);
  if (!item) throw new Error('Drop a spell or a wand/scroll containing a spell.');
  const system = item.system ?? {};
  const area = spellAreaInfo(item);
  const traits = new Set(system.traits?.value ?? []);
  const damage = Object.values(system.damage ?? {}).filter(part => {
    if (!part || typeof part !== 'object') return false;
    // Prepared spell documents use Sets; source/JSON documents use arrays.
    const kinds = new Set(part.kinds ?? ['damage']);
    return !kinds.has('healing') || kinds.has('damage');
  });
  const types = [...new Set(damage.map(part => part.type).filter(Boolean))];
  const slug = system.slug || String(item.name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const special = { grease: 'Grease', 'scatter-scree': 'Earthquake', 'grim-tendrils': 'Unholy Light' };
  const candidates = special[slug] ? [special[slug]] : types.length ? types.map(type => visuals[type]).filter(Boolean) : [...traits].map(trait => visuals[trait]).filter(Boolean);
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
  const supported = preset && Object.values(preset.configs ?? {}).filter(p => p.stage === stage).every(p => (kind === 'area' ? ['Tile', 'AmbientLight', 'AmbientSound', 'Region'] : ['Tile', 'AmbientLight', 'AmbientSound']).includes(p.type));
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
  const spell = containedSpell(item);
  if (!spell) throw new Error('Only spell Items or spell-containing wands/scrolls can be imported.');
  return spell;
}
