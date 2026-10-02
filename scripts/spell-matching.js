const themes = {
  Grease: ['grease'], 'Debris (Stone)': ['scatter-scree'], Spiderweb: ['web'],
  Overgrowth: ['entangling-flora', 'gluttonous-growth', 'flourishing-flora'],
  Sand: ['scouring-sand', 'shifting-sand', 'glass-sand', 'control-sand'],
  Smoke: ['mist', 'solid-fog', 'obscuring-mist', 'fog-cloud'], 'Haze (Deathly)': ['darkness', 'ravenous-darkness', 'consuming-darkness', 'sanguine-mist'],
  Lava: ['volcanic-eruption'], Rift: ['fiendish-rift'], Earthquake: ['earthquake'],
  'Holy Light': ['holy-light'], 'Unholy Light': ['grim-tendrils'],
  'Magic Light': ['light', 'everlight', 'revealing-light'], Runes: ['sigil', 'message-rune', 'temporary-glyph'],
  Portal: ['gate', 'space-fold-gate', 'ravenous-portal', 'forest-of-gates'],
  'Force Barrier': ['wall-of-force', 'force-cage'], Pillar: ['pillars-of-sand'],
  Flooding: ['deluge', 'whirlpool', 'wall-of-water'], 'Magic Platform': ['moonlight-bridge']
};
const elemental = { acid: 'Acid', cold: 'Frost', electricity: 'Lightning Field', fire: 'Fire', bleed: 'Blood' };
export function matchSpellVisual(item) {
  const slug = item.system?.slug || item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  for (const [effect, slugs] of Object.entries(themes)) if (slugs.includes(slug)) return { effect, reason: `Curated ${slug} visual theme`, confidence: 'curated' };
  const parts = Object.values(item.system?.damage ?? {}).filter(part => {
    const kinds = new Set(part.kinds ?? ['damage']);
    return kinds.has('damage');
  });
  const types = [...new Set(parts.map(part => part.type))];
  if (types.length === 1 && elemental[types[0]]) return { effect: elemental[types[0]], reason: `Single ${types[0]} damage type`, confidence: 'elemental' };
  const options = [...new Set(types.map(type => elemental[type]).filter(Boolean))];
  return { effect: options.length === 1 ? options[0] : '', reason: types.length > 1 ? `Mixed damage types: ${types.join(', ')}` : 'No suitable supported visual theme', confidence: 'review' };
}
