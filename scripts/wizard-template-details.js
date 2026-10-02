const WIZARD_ID = 'pf2e-aztecs-template-wizard';

export function wizardTemplateDetails(item) {
  const module = globalThis.game?.modules?.get(WIZARD_ID);
  if (!module?.active || !module.api?.readAutomation || !item) return [];
  try {
    const saved = module.api.readAutomation(item);
    if (!saved?.enabled) return [];
    const automation = module.api.resolveAutomationHeightening?.(saved, item) ?? saved;
    const details = [];
    if (automation.contiguous?.enabled) {
      const count = Number(automation.contiguous.count);
      if (Number.isInteger(count) && count > 0) details.push(`Wizard: ${count} contiguous cells`);
    }
    for (const shape of automation.templateShape?.shapes ?? []) {
      const size = Number(shape?.size);
      if (!Number.isFinite(size) || size <= 0) continue;
      const type = shape.type === 'circle' ? 'burst' : shape.type;
      if (!['burst', 'emanation', 'line', 'ring', 'square', 'cone'].includes(type)) continue;
      const width = Number(shape.width);
      const inner = Number(shape.innerRadius);
      const label = type === 'line' && Number.isFinite(width) && width > 0 ? `${size} × ${width} ft line`
        : type === 'ring' && Number.isFinite(inner) && inner > 0 ? `${inner}–${size} ft ring`
        : `${size} ft ${type}`;
      details.push(`Wizard: ${label}`);
    }
    return [...new Set(details)];
  } catch (error) {
    console.warn('Spell Arsenal: Template Wizard details unavailable', error);
    return [];
  }
}
