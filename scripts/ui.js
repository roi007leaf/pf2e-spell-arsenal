import { MODULE_ID, DEFAULT_RULES, validateRules, isInstant, hasTemplate, displayDuration, DURATION_UNITS } from './rules.js';
import { inferSpellRule, resolveSpellDrop } from './spell-parser.js';
import { openSpellDetails } from './spell-details.js';

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export class SpellArsenalConfig extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: 'spell-arsenal-config', classes: ['spell-arsenal'], window: { title: 'Spell Arsenal — Spell Mappings', resizable: true }, position: { width: 1060, height: 560 } };

  async _renderHTML() {
    if (!game.user.isGM) return '<p>GM access required.</p>';
    const rules = validateRules(game.settings.get(MODULE_ID, 'rules'));
    let presets = [];
    if (globalThis.tileArsenal) {
      const data = await tileArsenal.utils.getConfigurations();
      presets = Object.values(data.configurations).map(p => p.name).sort();
    }
    return `<p>Visual effects only. Cast spells and place their regions normally. Damage triggers run when damage is applied.</p>
      <div class="spell-drop-zone" tabindex="0">Drag a spell, wand or scroll here from a character sheet or compendium. Its spell data fills the mapping automatically.</div>
      <p class="status" data-drop-status aria-live="polite"></p>
      <p class="status">${game.users.activeGM?.id === game.user.id ? 'Active GM: automation runs here.' : 'Automation runs in active GM session.'} Tile Arsenal ${game.modules.get('tile-arsenal')?.active ? 'enabled' : 'required'}.</p>
      <label><input type="checkbox" name="automation" ${game.settings.get(MODULE_ID, 'enabled') ? 'checked' : ''}> Enable automation</label>
      <datalist id="spell-arsenal-presets">${presets.map(p => `<option value="${escape(p)}"></option>`).join('')}</datalist>
      <table><thead><tr><th>On</th><th>Spell name</th><th>Trigger</th><th>Tile Arsenal effect</th><th>Stage</th><th>Duration</th><th>Picker cells</th><th>Show region overlay only while editing</th><th></th></tr></thead>
      <tbody>${rules.map(r => this.row(r)).join('')}</tbody></table>
      <p class="status">Area: spell region; spells without an area use touching-cell picker. Damage: damaged token. Cast: caster. Instant spells have no duration; their brief visual playback is cleaned up separately. Non-instant area duration 0 stays until region deleted. Cells applies to picker only. Maximum area: 120 cells.</p>
      <footer><button type="button" data-action="add">Add mapping</button><button type="button" data-action="save">Save mappings</button><button type="button" data-action="defaults">Load defaults</button><button type="button" data-action="cleanup">Pause & clear effects</button></footer>`;
  }

  row(rule) {
    const duration = displayDuration(rule);
    const picker = rule.kind === 'area' && !hasTemplate(rule);
    return `<tr data-id="${escape(rule.id)}" data-source-uuid="${escape(rule.sourceUuid ?? '')}" data-has-template="${hasTemplate(rule)}"><td><input type="checkbox" name="enabled" ${rule.enabled ? 'checked' : ''} aria-label="Enable mapping"></td>
      <td><div class="spell-name-control"><input name="spell" value="${escape(rule.spell)}" aria-label="Spell name"><button type="button" data-action="details" title="Open spell details" aria-label="Open spell details"><i class="fas fa-book-open" aria-hidden="true"></i></button></div></td>
      <td><select name="kind" aria-label="Trigger">${[['area', 'Area'], ['damage', 'Damage'], ['caster', 'Cast']].map(([k, label]) => `<option value="${k}" ${rule.kind === k ? 'selected' : ''}>${label}</option>`).join('')}</select></td>
      <td><input name="effect" list="spell-arsenal-presets" value="${escape(rule.effect)}" aria-label="Tile Arsenal effect"></td>
      <td><select name="stageMode" aria-label="Stage mode"><option value="auto" ${rule.stageMode !== 'fixed' ? 'selected' : ''}>Auto buildup</option><option value="fixed" ${rule.stageMode === 'fixed' ? 'selected' : ''}>Fixed</option></select><input type="number" name="stage" min="1" step="1" value="${rule.stage}" ${rule.stageMode !== 'fixed' ? 'disabled hidden' : ''} aria-label="Fixed stage"></td>
      <td><label><input type="checkbox" name="instant" ${isInstant(rule) ? 'checked' : ''}> Instant</label><input type="number" name="duration" min="0" step="any" value="${isInstant(rule) ? 0 : duration.value}" ${isInstant(rule) ? 'hidden' : ''} aria-label="Duration amount"><select name="durationUnit" ${isInstant(rule) ? 'hidden' : ''} aria-label="Duration unit">${Object.keys(DURATION_UNITS).map(unit => `<option value="${unit}" ${unit === duration.unit ? 'selected' : ''}>${unit}</option>`).join('')}</select></td>
      <td><span data-cell-source ${picker ? 'hidden' : ''}>${rule.kind === 'area' ? 'From template' : '—'}</span><input type="number" name="squares" min="1" max="120" step="1" value="${rule.squares}" ${picker ? '' : 'hidden'} aria-label="Manual picker cells"></td>
      <td><input type="checkbox" name="highlight" ${rule.highlight ? 'checked' : ''} ${rule.kind === 'area' ? '' : 'disabled'} title="Hides the colored region overlay outside Region controls; spell visuals remain visible." aria-label="Show region overlay only while editing"></td>
      <td><button type="button" data-action="remove" aria-label="Remove mapping">×</button></td></tr>`;
  }

  _replaceHTML(html, content) {
    content.innerHTML = html;
    content.onchange = event => {
      if (event.target.name === 'stageMode') { const input = event.target.closest('tr').querySelector('[name="stage"]'); input.disabled = input.hidden = event.target.value !== 'fixed'; }
      if (event.target.name === 'instant') { const row = event.target.closest('tr'), input = row.querySelector('[name="duration"]'); input.hidden = event.target.checked; row.querySelector('[name="durationUnit"]').hidden = event.target.checked; input.value = event.target.checked ? 0 : (Number(input.value) || 1); }
      if (event.target.name === 'kind') {
        const row = event.target.closest('tr'), area = event.target.value === 'area';
        const picker = area && row.dataset.hasTemplate !== 'true';
        row.querySelector('[name="squares"]').hidden = !picker;
        const label = row.querySelector('[data-cell-source]'); label.hidden = picker; label.textContent = area ? 'From template' : '—';
        row.querySelector('[name="highlight"]').disabled = !area;
      }
    };
    content.ondragover = event => { if (game.user.isGM) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; content.classList.add('drag-over'); } };
    content.ondragleave = event => { if (!content.contains(event.relatedTarget)) content.classList.remove('drag-over'); };
    content.ondrop = async event => {
      event.preventDefault(); event.stopPropagation(); content.classList.remove('drag-over');
      if (!game.user.isGM) return;
      try {
        const item = await resolveSpellDrop(event, CONFIG.Item.documentClass);
        const data = await tileArsenal.utils.getConfigurations();
        const { rule, summary } = inferSpellRule(item, data.configurations, foundry.utils.randomID());
        const rows = [...content.querySelectorAll('tbody tr')];
        const duplicate = rows.find(row => row.querySelector('[name="spell"]').value.trim().toLowerCase() === rule.spell.trim().toLowerCase());
        if (duplicate) { duplicate.querySelector('[name="spell"]').focus(); throw new Error(`${rule.spell} already has a mapping. Existing overrides preserved.`); }
        const blank = rows.find(row => !row.querySelector('[name="spell"]').value.trim() && !row.querySelector('[name="effect"]').value.trim());
        if (blank) blank.outerHTML = this.row(rule);
        else content.querySelector('tbody').insertAdjacentHTML('beforeend', this.row(rule));
        content.querySelector('[data-drop-status]').textContent = `${rule.spell}: ${summary}. Review, then Save mappings.`;
      } catch (error) { ui.notifications.warn(error.message); }
    };
    content.onclick = async event => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action || !game.user.isGM) return;
      try {
        if (action === 'details') { const row = event.target.closest('tr'); await openSpellDetails(row.querySelector('[name="spell"]').value, row.dataset.sourceUuid); }
        if (action === 'remove') event.target.closest('tr').remove();
        if (action === 'add') content.querySelector('tbody').insertAdjacentHTML('beforeend', this.row({ ...DEFAULT_RULES[0], id: foundry.utils.randomID(), spell: '', effect: '', enabled: true }));
        if (action === 'defaults') content.querySelector('tbody').innerHTML = DEFAULT_RULES.map(r => this.row(r)).join('');
        if (action === 'save') {
          const rules = validateRules([...content.querySelectorAll('tbody tr')].map(row => {
            const value = name => row.querySelector(`[name="${name}"]`).value;
            const checked = name => row.querySelector(`[name="${name}"]`).checked;
            return { id: row.dataset.id, spell: value('spell'), sourceUuid: row.dataset.sourceUuid, effect: value('effect'), kind: value('kind'), hasTemplate: row.dataset.hasTemplate === 'true', instant: checked('instant'), duration: Number(value('duration')) * DURATION_UNITS[value('durationUnit')], durationUnit: value('durationUnit'), stage: Number(value('stage')), stageMode: value('stageMode'), squares: Number(value('squares')), enabled: checked('enabled'), highlight: checked('highlight') };
          }));
          const data = await tileArsenal.utils.getConfigurations();
          for (const rule of rules.filter(r => r.enabled)) {
            const preset = Object.values(data.configurations).find(p => p.name?.trim().toLowerCase() === rule.effect.toLowerCase());
            if (!preset || !Object.values(preset.configs ?? {}).some(c => rule.stageMode === 'auto' || c.stage === rule.stage)) throw new Error(`${rule.effect}: preset or stage ${rule.stage} unavailable.`);
          }
          await game.settings.set(MODULE_ID, 'rules', rules);
          await game.settings.set(MODULE_ID, 'enabled', content.querySelector('[name="automation"]').checked);
          await game.modules.get(MODULE_ID).api.synchronize();
          ui.notifications.info('Spell Arsenal mappings saved.');
        }
        if (action === 'cleanup') { await game.modules.get(MODULE_ID).api.clearEffects(); await this.render(true); }
      } catch (error) { ui.notifications.error(error.message); console.error('Spell Arsenal configuration', error); }
    };
  }
}
