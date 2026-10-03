import { systemAdapter } from './systems.js';

const jobs = new Map();
let serial = 0;
export const animationName = rule => `${rule.kind === 'area' ? 'template:' : rule.kind === 'damage' ? 'damage:' : ''}${rule.spell.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
export function triggerIntegrationEnabled() {
  return Boolean(game.modules.get('trigger-animations')?.active && game.modules.get('trigger-engine')?.active &&
    game.settings.get('spell-arsenal', 'triggerAnimations') && globalThis.triggerAnimations?.api?.runFromTrigger);
}

export async function dispatchTileVisual(rule, render) {
  if (!triggerIntegrationEnabled()) return render();
  const api = triggerAnimations.api;
  const name = animationName(rule);
  const match = api.matchTrigger(name);
  // Other animation entries are already driven by Trigger Engine's native events.
  // Only dispatch our entry here; disabled entries never fall back to standalone rendering.
  if (!match?.id?.includes('spell-arsenal-')) return;
  const id = `spell-arsenal-job:${++serial}`;
  jobs.set(id, { ruleId: rule.id, render });
  try { await api.runFromTrigger({ name, options: [id], userInputs: [], user: game.user }); }
  finally { jobs.delete(id); }
}

export function createTileArsenalNode(Base) {
  return class TileArsenalNode extends Base {
    static get type() { return 'spell-arsenal-tile'; }
    static get category() { return 'action'; }
    static get defineInputs() { return [
      { key: 'mapping', type: 'text', label: 'Spell Arsenal mapping ID' },
      { key: 'options', type: 'text', isArray: true, label: 'Animation options' }
    ]; }
    get headerColor() { return '#c99032'; }
    get title() { return 'Tile Arsenal'; }
    get subtitle() { return 'Spell Arsenal mapping'; }
    get icon() { return { unicode: '\uF72B' }; }
    async _execute() {
      if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return false;
      const options = await this.getInputValue('options') ?? [];
      const mapping = await this.getInputValue('mapping');
      const id = options.find(value => jobs.has(value));
      const job = jobs.get(id);
      if (job && job.ruleId === mapping) {
        jobs.delete(id); // Each dispatch can render once, even if the graph repeats this node.
        await job.render();
      }
      return this.executeNext('out');
    }
  };
}

export function tileAnimationEntries(rules) {
  return rules.map(rule => ({
    id: `spell-arsenal-${rule.id}`, name: `${rule.spell} — Tile Arsenal`, folder: 'Spell Arsenal', priority: 0,
    tags: ['spell-arsenal'], nodes: [
      { id: 'start', type: 'animation-event', position: { x: 0, y: 0 }, inputs: { name: { value: animationName(rule) } }, outs: { out: { connection: 'tile:ins:in' } } },
      { id: 'tile', type: 'spell-arsenal-tile', position: { x: 320, y: 0 }, inputs: {
        mapping: { value: rule.id }, options: { connection: 'start:outputs:options' }
      } }
    ]
  }));
}

export function registerTriggerIntegration() {
  Hooks.on('triggerEngine.registerNodes', register => {
    if (!game.modules.get('trigger-animations')?.active) return;
    register('trigger-animations', 'anim-trigger', [createTileArsenalNode(globalThis.triggerEngine.TriggerNode)]);
  });
  Hooks.on('triggerEngine.registerTriggers', register => {
    if (!game.modules.get('trigger-animations')?.active) return;
    let enabled;
    try { enabled = game.settings.get('spell-arsenal', 'triggerAnimations'); } catch {
      const stored = game.settings.storage?.get('world')?.get('spell-arsenal.triggerAnimations')?.value;
      enabled = stored === true || stored === 'true';
    }
    if (!enabled) return;
    let rules;
    try { rules = game.settings.get('spell-arsenal', 'rules'); } catch {
      const stored = game.settings.storage?.get('world')?.get('spell-arsenal.rules')?.value;
      rules = stored ? (typeof stored === 'string' ? JSON.parse(stored) : stored) : systemAdapter().defaults();
    }
    register('trigger-animations', 'anim-trigger', tileAnimationEntries(rules));
  });
}
