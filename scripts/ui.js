import { MODULE_ID, DEFAULT_RULES, validateRules, isInstant, hasTemplate, displayDuration, DURATION_UNITS } from './rules.js';
import { inferSpellRule, resolveSpellDrop, spellAreaInfo } from './spell-parser.js';
import { openSpellDetails, resolveSpellDetails } from './spell-details.js';

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export class SpellArsenalConfig extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: 'spell-arsenal-config', classes: ['spell-arsenal'], window: { title: 'Spell Arsenal — Spell Mappings', resizable: true }, position: { width: 1060, height: 740 } };

  async _renderHTML() {
    if (!game.user.isGM) return '<p>GM access required.</p>';
    const rules = validateRules(game.settings.get(MODULE_ID, 'rules'));
    await this.loadTemplateDetails(rules);
    let presets = [];
    if (globalThis.tileArsenal) {
      const data = await tileArsenal.utils.getConfigurations();
      presets = Object.values(data.configurations).map(p => p.name).sort();
    }
    return this.layout(rules, presets);
  }

  async loadTemplateDetails(rules) {
    await Promise.all(rules.map(async rule => {
      try {
        const spell = await resolveSpellDetails(rule.spell, rule.sourceUuid);
        if (!spell) return;
        const area = spellAreaInfo(spell);
        rule.hasTemplate = area.hasTemplate;
        rule.templateDetails = area.templateDetails;
        rule.sourceUuid = spell.parentItem?.uuid ?? spell.uuid ?? rule.sourceUuid;
      } catch (error) { console.warn('Spell Arsenal: template details unavailable', error); }
    }));
  }

  layout(rules, presets) {
    return `<div class="arsenal-toolbar"><div><strong>Spell visuals</strong><p class="status">${game.users.activeGM?.id === game.user.id ? 'Automation runs in this GM session' : 'Automation runs in the active GM session'} · Tile Arsenal ${game.modules.get('tile-arsenal')?.active ? 'ready' : 'required'}</p></div><label class="automation-switch"><input type="checkbox" name="automation" ${game.settings.get(MODULE_ID, 'enabled') ? 'checked' : ''}> Automation</label></div>
      <div class="spell-drop-zone" tabindex="0"><i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i><div><strong>Drop a spell, wand or scroll</strong><span>Spell data and description templates fill the mapping automatically.</span></div></div>
      <p class="status" data-drop-status aria-live="polite"></p>
      <label class="mapping-search"><i class="fas fa-search" aria-hidden="true"></i><input type="search" name="search" placeholder="Filter spells or effects" aria-label="Filter spell mappings"></label>
      <datalist id="spell-arsenal-presets">${presets.map(p => `<option value="${escape(p)}"></option>`).join('')}</datalist>
      <div class="mapping-list" data-mappings>${rules.map(r => this.row(r)).join('')}</div>
      <details class="mapping-help"><summary>How visuals work</summary><p>Area follows the placed spell region, using its actual covered cells (up to 120). Damage appears on the damaged token; Cast appears on the caster. Instant playback clears after five seconds. Lasting duration 0 follows the source region. Auto buildup advances with repeated casts in the same cell.</p></details>
      <footer><button type="button" data-action="add">+ Add mapping</button><button type="button" data-action="defaults">Load defaults</button><button type="button" data-action="cleanup">Pause & clear effects</button><button class="primary" type="button" data-action="save">Save mappings</button></footer>`;
  }

  row(rule) {
    const duration = displayDuration(rule);
    const picker = rule.kind === 'area' && !hasTemplate(rule);
    const templates = rule.templateDetails ?? [];
    return `<article class="mapping-card ${rule.enabled ? '' : 'is-disabled'}" data-mapping data-id="${escape(rule.id)}" data-source-uuid="${escape(rule.sourceUuid ?? '')}" data-has-template="${hasTemplate(rule)}" data-template-details="${escape(JSON.stringify(templates))}">
      <div class="mapping-heading"><input type="checkbox" name="enabled" ${rule.enabled ? 'checked' : ''} aria-label="Enable mapping"><div class="spell-name-control"><input name="spell" value="${escape(rule.spell)}" placeholder="Spell name" aria-label="Spell name"><button type="button" data-action="details" title="Open spell details" aria-label="Open spell details"><i class="fas fa-book-open" aria-hidden="true"></i></button></div><button class="remove-mapping" type="button" data-action="remove" aria-label="Remove mapping" title="Remove mapping">×</button></div>
      <div class="mapping-fields">
      <label class="mapping-field"><span>Trigger</span><select name="kind" aria-label="Trigger">${[['area', 'Area · placed region'], ['damage', 'Damage · target'], ['caster', 'Cast · caster']].map(([k, label]) => `<option value="${k}" ${rule.kind === k ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label class="mapping-field"><span>Tile Arsenal effect</span><input name="effect" list="spell-arsenal-presets" value="${escape(rule.effect)}" placeholder="Choose effect" aria-label="Tile Arsenal effect"></label>
      <div class="mapping-field"><span>Stage</span><div class="inline-controls"><select name="stageMode" aria-label="Stage mode"><option value="auto" ${rule.stageMode !== 'fixed' ? 'selected' : ''}>Auto buildup</option><option value="fixed" ${rule.stageMode === 'fixed' ? 'selected' : ''}>Fixed</option></select><input type="number" name="stage" min="1" step="1" value="${rule.stage}" ${rule.stageMode !== 'fixed' ? 'disabled hidden' : ''} aria-label="Fixed stage"></div></div>
      <div class="mapping-field"><span>Duration</span><div class="inline-controls"><label class="instant-toggle"><input type="checkbox" name="instant" ${isInstant(rule) ? 'checked' : ''}> Instant</label><input type="number" name="duration" min="0" step="any" value="${isInstant(rule) ? 0 : duration.value}" ${isInstant(rule) ? 'hidden' : ''} aria-label="Duration amount"><select name="durationUnit" ${isInstant(rule) ? 'hidden' : ''} aria-label="Duration unit">${Object.keys(DURATION_UNITS).map(unit => `<option value="${unit}" ${unit === duration.unit ? 'selected' : ''}>${unit}</option>`).join('')}</select></div></div>
      </div><div class="mapping-area"><div class="template-options"><span class="field-caption">Templates</span><div class="template-badges">${templates.length ? templates.map(label => `<span class="template-badge">${escape(label)}</span>`).join('') : `<span class="status">${hasTemplate(rule) ? 'Details unavailable — drop spell to link' : 'No spell template'}</span>`}</div></div><label class="picker-control" ${picker ? '' : 'hidden'}>Picker cells <input type="number" name="squares" min="1" max="120" step="1" value="${rule.squares}" aria-label="Manual picker cells"></label><label class="overlay-control" ${rule.kind === 'area' ? '' : 'hidden'}><input type="checkbox" name="highlight" ${rule.highlight ? 'checked' : ''} ${rule.kind === 'area' ? '' : 'disabled'}> Show overlay only while editing</label></div></article>`;
  }

  _replaceHTML(html, content) {
    content.innerHTML = html;
    const filter = () => {
      const search = content.querySelector('[name="search"]')?.value.trim().toLowerCase() ?? '';
      for (const row of content.querySelectorAll('[data-mapping]')) row.hidden = !`${row.querySelector('[name="spell"]').value} ${row.querySelector('[name="effect"]').value}`.toLowerCase().includes(search);
    };
    content.oninput = filter;
    content.onchange = event => {
      if (event.target.name === 'enabled') event.target.closest('[data-mapping]').classList.toggle('is-disabled', !event.target.checked);
      if (event.target.name === 'stageMode') { const input = event.target.closest('[data-mapping]').querySelector('[name="stage"]'); input.disabled = input.hidden = event.target.value !== 'fixed'; }
      if (event.target.name === 'instant') { const row = event.target.closest('[data-mapping]'), input = row.querySelector('[name="duration"]'); input.hidden = event.target.checked; row.querySelector('[name="durationUnit"]').hidden = event.target.checked; input.value = event.target.checked ? 0 : (Number(input.value) || 1); }
      if (event.target.name === 'kind') {
        const row = event.target.closest('[data-mapping]'), area = event.target.value === 'area';
        const picker = area && row.dataset.hasTemplate !== 'true';
        row.querySelector('.picker-control').hidden = !picker;
        row.querySelector('.overlay-control').hidden = !area;
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
        const rows = [...content.querySelectorAll('[data-mapping]')];
        const duplicate = rows.find(row => row.querySelector('[name="spell"]').value.trim().toLowerCase() === rule.spell.trim().toLowerCase());
        if (duplicate) {
          duplicate.dataset.sourceUuid = rule.sourceUuid;
          duplicate.dataset.hasTemplate = String(rule.hasTemplate);
          duplicate.dataset.templateDetails = JSON.stringify(rule.templateDetails);
          duplicate.querySelector('.template-badges').innerHTML = rule.templateDetails.length ? rule.templateDetails.map(label => `<span class="template-badge">${escape(label)}</span>`).join('') : '<span class="status">No spell template</span>';
          duplicate.querySelector('.picker-control').hidden = duplicate.querySelector('[name="kind"]').value !== 'area' || rule.hasTemplate;
          duplicate.hidden = false;
          duplicate.querySelector('[name="spell"]').focus();
          content.querySelector('[data-drop-status]').textContent = `${rule.spell}: template details refreshed. Existing overrides preserved. Save mappings to keep the link.`;
          return;
        }
        const blank = rows.find(row => !row.querySelector('[name="spell"]').value.trim() && !row.querySelector('[name="effect"]').value.trim());
        if (blank) blank.outerHTML = this.row(rule);
        else content.querySelector('[data-mappings]').insertAdjacentHTML('beforeend', this.row(rule));
        content.querySelector('[data-drop-status]').textContent = `${rule.spell}: ${summary}. Review, then Save mappings.`;
      } catch (error) { ui.notifications.warn(error.message); }
    };
    content.onclick = async event => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action || !game.user.isGM) return;
      try {
        if (action === 'details') { const row = event.target.closest('[data-mapping]'); await openSpellDetails(row.querySelector('[name="spell"]').value, row.dataset.sourceUuid); }
        if (action === 'remove') event.target.closest('[data-mapping]').remove();
        if (action === 'add') {
          content.querySelector('[name="search"]').value = '';
          filter();
          content.querySelector('[data-mappings]').insertAdjacentHTML('beforeend', this.row({ ...DEFAULT_RULES[0], id: foundry.utils.randomID(), spell: '', effect: '', enabled: true }));
          const input = content.querySelector('[data-mappings]').lastElementChild.querySelector('[name="spell"]');
          input.focus(); input.scrollIntoView({ block: 'nearest' });
        }
        if (action === 'defaults') {
          const defaults = validateRules(DEFAULT_RULES);
          await this.loadTemplateDetails(defaults);
          content.querySelector('[data-mappings]').innerHTML = defaults.map(r => this.row(r)).join(''); filter();
        }
        if (action === 'save') {
          const rules = validateRules([...content.querySelectorAll('[data-mapping]')].map(row => {
            const value = name => row.querySelector(`[name="${name}"]`).value;
            const checked = name => row.querySelector(`[name="${name}"]`).checked;
            return { id: row.dataset.id, spell: value('spell'), sourceUuid: row.dataset.sourceUuid, effect: value('effect'), kind: value('kind'), hasTemplate: row.dataset.hasTemplate === 'true', templateDetails: JSON.parse(row.dataset.templateDetails || '[]'), instant: checked('instant'), duration: Number(value('duration')) * DURATION_UNITS[value('durationUnit')], durationUnit: value('durationUnit'), stage: Number(value('stage')), stageMode: value('stageMode'), squares: Number(value('squares')), enabled: checked('enabled'), highlight: checked('highlight') };
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
