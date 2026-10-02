import { pf2eAdapter } from './pf2e.js';
import { dnd5eAdapter, isDndSpell } from './dnd5e.js';

// Item shape also selects adapters for offline catalog generation.
export function systemAdapter(item) {
  return isDndSpell(item) || item?.system?.activities || (!item && globalThis.game?.system?.id === 'dnd5e') ? dnd5eAdapter : pf2eAdapter;
}
