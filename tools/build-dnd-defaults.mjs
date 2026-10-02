import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inferSpellRule } from '../scripts/spell-parser.js';
import { dndSpellData, activities } from '../scripts/dnd5e.js';
import { matchSpellVisual } from '../scripts/spell-matching.js';

const [catalogFile, configFile] = process.argv.slice(2);
if (!catalogFile || !configFile) throw new Error('Usage: node tools/build-dnd-defaults.mjs <exported catalog.json> <Tile Arsenal configs.json>');
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const catalog = JSON.parse(readFileSync(catalogFile, 'utf8'));
const configurations = JSON.parse(readFileSync(configFile, 'utf8')).configurations;
const audit = [], defaults = { spells: [], spells24: [] }, seen = { spells: new Set(), spells24: new Set() };
for (const { pack, source, item } of catalog.sort((a, b) => a.pack.localeCompare(b.pack) || a.item.name.localeCompare(b.item.name))) {
  if (!Object.hasOwn(defaults, pack) || item.type !== 'spell') throw new Error('Unexpected catalog record');
  item.uuid = `Compendium.dnd5e.${pack}.Item.${item._id}`;
  const id = `${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 55)}-${pack === 'spells' ? '14' : '24'}`;
  const { rule } = inferSpellRule(item, configurations, id);
  const match = matchSpellVisual(dndSpellData(item));
  const preset = Object.values(configurations).find(p => p.name === match.effect);
  const reasons = [];
  if (match.confidence === 'review') reasons.push(match.reason);
  if (match.effect && !preset) reasons.push('Preset not installed');
  if (preset && Object.values(preset.configs).some(p => !['Tile', 'AmbientLight', 'AmbientSound', 'Region'].includes(p.type) || (rule.kind !== 'area' && p.type === 'Region')))
    reasons.push('Preset contains unsupported document types for this trigger');
  if (rule.kind === 'caster') reasons.push('Target/object placement needs manual review');
  const duration = item.system.duration ?? {};
  const concentration = new Set(item.system.properties ?? []).has('concentration');
  if (rule.kind === 'area' && concentration) reasons.push('Concentration expiration is not linked to cleanup');
  if (duration.units !== 'inst' && (!['round', 'minute', 'hour', 'day'].includes(duration.units) || !Number.isFinite(Number(duration.value)) || Number(duration.value) <= 0))
    reasons.push('Variable or open-ended duration requires review');
  if (!rule.instant && rule.duration > 2147483) reasons.push('Duration exceeds timer limit');
  const templates = [item.system.target?.template, ...activities(item).map(a => a.target?.template)].filter(t => t?.type);
  let maxCells = 0;
  for (const template of templates) {
    const unit = template.units || 'ft';
    const multiplier = { ft: 1, m: 3.28084, mi: 5280, km: 3280.84 }[unit];
    const size = Number(template.size), count = Number(template.count || 1), width = Number(template.width || 5);
    if (!multiplier || !(size > 0) || !(count > 0) || !(width > 0)) { reasons.push('Variable or unsupported template dimensions require review'); continue; }
    const cells = size * multiplier / 5;
    const area = ['sphere', 'radius', 'cylinder', 'circle'].includes(template.type) ? Math.PI * cells ** 2 : template.type === 'cone' ? Math.PI * cells ** 2 / 4
      : template.type === 'line' ? cells * width * multiplier / 5 : ['cube', 'square'].includes(template.type) ? cells ** 2 : NaN;
    if (!Number.isFinite(area)) reasons.push(`Unsupported template type: ${template.type}`);
    else maxCells = Math.max(maxCells, area * count);
  }
  if (maxCells > 120) reasons.push('Base area likely exceeds the 120-cell visual limit');
  if (seen[pack].has(item.name.toLowerCase())) reasons.push('Duplicate spell name within rules version');
  const enabled = Boolean(preset && match.confidence !== 'review' && reasons.length === 0);
  if (enabled) {
    rule.effect = match.effect; rule.enabled = true; rule.sourceUuid = item.uuid; rule.stageMode = 'auto';
    rule.stage = Math.min(...Object.values(preset.configs).map(p => p.stage));
    if (rule.kind === 'damage') { rule.instant = true; rule.duration = 0; rule.highlight = false; }
    defaults[pack].push(rule); seen[pack].add(item.name.toLowerCase());
  }
  audit.push({ spell: item.name, edition: pack === 'spells' ? '2014' : '2024', uuid: item.uuid, source, effect: match.effect,
    trigger: rule.kind, templates: rule.templateDetails.join(' / '), status: enabled ? 'enabled' : match.effect ? 'review' : 'unmatched', reason: reasons.join('; ') || match.reason });
}
writeFileSync(path.join(root, 'scripts/dnd-default-rules.js'), `// Generated from D&D 5e 6.0.5, release-6.0.5 (3ee48de), and Tile Arsenal 1.1.1.\nexport const DND_LEGACY_RULES = ${JSON.stringify(defaults.spells, null, 2)};\nexport const DND_DEFAULT_RULES = ${JSON.stringify(defaults.spells24, null, 2)};\n`);
const quote = value => `"${String(value).replaceAll('"', '""')}"`;
writeFileSync(path.join(root, 'docs/dnd-spell-visual-audit.csv'), ['spell,edition,uuid,source,effect,trigger,templates,status,reason', ...audit.map(row => Object.values(row).map(quote).join(','))].join('\n') + '\n');
const editions = ['2014', '2024'].map(edition => ({ edition, spells: audit.filter(r => r.edition === edition).length,
  enabled: audit.filter(r => r.edition === edition && r.status === 'enabled').length, review: audit.filter(r => r.edition === edition && r.status === 'review').length,
  unmatched: audit.filter(r => r.edition === edition && r.status === 'unmatched').length }));
const presets = Object.values(configurations).map(p => ({ name: p.name, preview: p.img, textures: [...new Set(Object.values(p.configs).flatMap(c => [c.config?.['texture.src']].flat(Infinity)).filter(Boolean))], stages: [...new Set(Object.values(p.configs).map(c => c.stage))], types: [...new Set(Object.values(p.configs).map(c => c.type))],
  legacySpells: defaults.spells.filter(r => r.effect === p.name).length, modernSpells: defaults.spells24.filter(r => r.effect === p.name).length }));
writeFileSync(path.join(root, 'docs/dnd-preset-audit.json'), JSON.stringify({ dnd5e: '6.0.5', sourceTag: 'release-6.0.5', sourceCommit: '3ee48de02f8f6f7b2638c9f6cf3e9540c9c181cc', tileArsenal: '1.1.1', spells: audit.length, editions, presets }, null, 2) + '\n');
console.log(JSON.stringify({ spells: audit.length, editions }));
