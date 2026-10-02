// Visual suggestions use structured PF2e/SF2e spell data, never execute descriptions.
const visuals = { fire: 'Fire', cold: 'Frost', acid: 'Acid', electricity: 'Lightning Field', sonic: 'Earthquake', force: 'Force Barrier', vitality: 'Holy Light', void: 'Unholy Light' };

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
  const kind = slug === 'grease' || system.area ? 'area' : damage.length ? 'damage' : 'caster';
  const durationText = String(system.duration?.value ?? '').trim();
  const match = durationText.match(/^(?:up to\s+)?(\d+)\s*(rounds?|minutes?|hours?|days?)$/i);
  const seconds = match ? Number(match[1]) * ({ round: 6, minute: 60, hour: 3600, day: 86400 }[match[2].toLowerCase().replace(/s$/, '')]) : 0;
  const lasting = seconds > 0 || system.duration?.sustained || /unlimited|until|permanent/i.test(durationText);
  const stages = preset ? Object.values(preset.configs ?? {}).filter(p => (kind === 'area' ? ['Tile', 'AmbientLight', 'AmbientSound', 'Region'] : ['Tile', 'AmbientLight', 'AmbientSound']).includes(p.type)).map(p => p.stage) : [];
  const stage = stages.length ? Math.min(...stages) : 1;
  const supported = preset && Object.values(preset.configs ?? {}).filter(p => p.stage === stage).every(p => (kind === 'area' ? ['Tile', 'AmbientLight', 'AmbientSound', 'Region'] : ['Tile', 'AmbientLight', 'AmbientSound']).includes(p.type));
  const rule = { id, spell: item.name, kind, hasTemplate: Boolean(system.area), effect: preset?.name ?? '', enabled: Boolean(supported), stage,
    instant: !lasting,
    duration: lasting ? (seconds > 0 && seconds <= 2147483 ? seconds : kind === 'area' ? 0 : 5) : 0,
    squares: 4, highlight: kind === 'area' && lasting };
  const summary = [system.area ? `${system.area.value} ft ${system.area.type}` : 'No system area', types.length ? types.join(', ') : 'No damage', durationText || 'Instant'];
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
