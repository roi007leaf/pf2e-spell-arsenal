import { stageRecords, chooseStage, replaceOverlaps } from './stages.js';
import { spellAreaInfo } from './spell-parser.js';
import { wizardHandlesPlacement, wizardRegionSpell, wizardPlacementPending, wizardFlagsChanged, WIZARD_ID } from './template-wizard.js';

const documentTypes = ['Tile', 'AmbientLight', 'AmbientSound', 'Region'];
const ownershipFlags = { area: 'spellArsenalArea', damage: 'spellArsenalDamage', caster: 'spellArsenalCaster' };
const authorized = () => game.user.isGM && game.users.activeGM?.id === game.user.id;
const normalized = value => String(value ?? '').trim().toLowerCase();
let pendingWork = Promise.resolve();

export async function runSpellEffect(kind, settings, owner) {
  if (!authorized()) return;
  if (!game.modules.get('tile-arsenal')?.active || !globalThis.tileArsenal) throw new Error('Enable Tile Arsenal first.');
  const library = await tileArsenal.utils.getConfigurations();
  const preset = Object.values(library.configurations).find(entry => normalized(entry.name) === normalized(settings.EFFECT_NAME));
  if (!preset?.toDocumentData) throw new Error(`Tile Arsenal effect "${settings.EFFECT_NAME}" is unavailable.`);
  const stages = [...new Set(Object.values(preset.configs ?? {}).map(entry => entry.stage))].sort((a, b) => a - b);
  if (!stages.length || (settings.STAGE_MODE === 'fixed' && !stages.includes(settings.STAGE))) throw new Error('Select an available Tile Arsenal stage.');
  const parts = Object.values(preset.configs ?? {}).filter(part => settings.STAGE_MODE !== 'fixed' || part.stage === settings.STAGE);
  if (parts.some(part => !documentTypes.includes(part.type) || (kind !== 'area' && part.type === 'Region')))
    throw new Error('This Tile Arsenal effect contains unsupported document types for the selected trigger.');
  const runner = new SpellVisualRunner(kind, settings, owner, preset, stages);
  try { await runner.start(); }
  catch (error) { await runner.stop(); throw error; }
  return runner;
}

class SpellVisualRunner {
  constructor(kind, settings, owner, preset, stages) {
    Object.assign(this, { kind, settings, owner, preset, stages });
    this.flag = ownershipFlags[kind];
    this.enabled = true;
    this.hooks = [];
    this.timers = new Map();
    this.received = new Set();
    this.finished = new Set();
    this.deadlines = new Map();
    this.queue = Promise.resolve();
  }

  report(error) {
    console.error('Spell Arsenal', error);
    ui.notifications.error(`${this.settings.SPELL_NAME}: ${error.message}`);
  }

  listen(event, handler) { this.hooks.push([event, Hooks.on(event, handler)]); }

  submit(job, propagate = false) {
    const task = pendingWork.then(() => this.enabled && authorized() ? job() : undefined);
    pendingWork = task.catch(error => { if (!propagate) this.report(error); });
    this.queue = pendingWork;
    return propagate ? task : pendingWork;
  }

  owned(scene, source) {
    return documentTypes.flatMap(type => [...scene.getEmbeddedCollection(type)].flatMap(document => {
      const data = document.flags?.world?.[this.flag];
      return data?.owner === this.owner && (!source || data.source === source || data.regionId === source || data.messageId === source)
        ? [{ type, document, data }] : [];
    }));
  }

  async erase(scene, source) {
    if (!authorized()) return;
    const entries = this.owned(scene, source);
    for (const type of documentTypes) {
      const ids = entries.filter(entry => entry.type === type).map(entry => entry.document.id);
      if (ids.length) await scene.deleteEmbeddedDocuments(type, ids);
    }
  }

  matches(region) {
    if (region.flags?.world?.[this.flag]) return false;
    const origin = region.flags?.[game.system.id]?.origin;
    return normalized(origin?.name ?? region.message?.item?.name ?? wizardRegionSpell(region)?.name) === normalized(this.settings.SPELL_NAME);
  }

  visible(region) {
    return canvas.ready && region.parent === canvas.scene && canvas.level && (!region.levels?.size || region.levels.has(canvas.level.id));
  }

  lifetime(region) {
    const managed = region?.flags?.[WIZARD_ID];
    return region && !this.settings.INSTANT && game.modules.get(WIZARD_ID)?.active && (managed?.originUuid || managed?.managed)
      ? 0 : this.settings.DURATION_SECONDS;
  }

  async start() {
    this.listen('createChatMessage', message => this.handleMessage(message));
    if (this.kind === 'damage') this.listen('updateChatMessage', message => {
      if (message.flags?.[game.system.id]?.appliedDamage?.isReverted)
        this.submit(async () => { for (const scene of game.scenes) await this.erase(scene, message.id); });
    });
    if (this.kind === 'area') {
      this.listen('createRegion', region => { if (this.matches(region)) this.submit(() => this.renderRegion(region)); });
      this.listen('updateRegion', (region, changes) => {
        if (this.matches(region) && (['shapes', 'elevation', 'levels', 'hidden', 'restriction', '_shapeConstraints'].some(key => key in changes) || wizardFlagsChanged(changes)))
          this.submit(() => this.renderRegion(region));
      });
      this.listen('deleteRegion', region => {
        if (region.flags?.world?.[this.flag]) return;
        this.submit(async () => {
          clearTimeout(this.timers.get(region.id)); this.timers.delete(region.id);
          this.deadlines.delete(region.id); this.finished.delete(region.uuid);
          await this.erase(region.parent, region.id);
        });
      });
      this.listen('canvasReady', () => this.submit(() => this.recover()));
    }
    await this.submit(async () => {
      for (const scene of game.scenes) {
        if (this.kind !== 'area') await this.erase(scene);
        else {
          const sources = new Map(this.owned(scene).map(entry => [entry.data.regionId, entry]));
          for (const [source, entry] of sources) {
            const region = scene.regions.get(source);
            if (!region || !this.matches(region)) { await this.erase(scene, source); continue; }
            if (entry.data.expiresAt && this.lifetime(region) > 0) this.armExpiry(scene, source, entry.data.expiresAt);
          }
          for (const region of scene.regions) {
            if (region.flags?.world?.spellArsenalPlacement?.owner === this.owner) await region.delete();
            else if (this.matches(region) && this.lifetime(region) > 0 && !this.owned(scene, region.id).length) {
              this.finished.add(region.uuid);
              await this.restoreOverlay(region);
            }
          }
        }
      }
      if (this.kind === 'area') await this.recover();
    }, true);
  }

  async recover() {
    for (const region of canvas.scene?.regions ?? []) if (this.matches(region)) {
      const existing = this.owned(region.parent, region.id);
      if (this.lifetime(region) > 0 && !existing.length && !this.deadlines.has(region.id)) { this.finished.add(region.uuid); continue; }
      await this.renderRegion(region);
    }
  }

  handleMessage(message) {
    if (!this.enabled || !authorized()) return;
    const spell = message.item;
    if (!(spell?.type === 'spell' || spell?.isOfType?.('spell')) || normalized(spell.name) !== normalized(this.settings.SPELL_NAME)) return;
    const flags = message.flags?.[game.system.id];
    if (this.kind === 'damage') {
      const applied = flags?.appliedDamage;
      if (flags?.context?.type !== 'damage-taken' || !applied || applied.isHealing || applied.isReverted || !applied.updates?.some(change =>
        change.value > 0 && ['system.attributes.hp.value', 'system.attributes.hp.temp', 'system.attributes.hp.sp.value'].includes(change.path))) return;
    } else if (message.isRoll || (flags?.context?.type && flags.context.type !== 'spell-cast') || !flags?.origin?.rollOptions?.includes('origin:action:slug:cast-a-spell')) return;
    if (this.received.has(message.id)) return;
    this.received.add(message.id);
    if (this.received.size > 500) this.received.delete(this.received.values().next().value);
    if (this.kind === 'area') {
      if (spellAreaInfo(spell).hasTemplate || wizardHandlesPlacement(spell) || this.pickerTask) return;
      this.pickerTask = this.pickCells(message).catch(error => this.report(error)).finally(() => { this.pickerTask = null; });
      return;
    }
    const candidates = (canvas.tokens?.placeables ?? []).filter(token => token.actor?.id === message.actor?.id && token.document.level === canvas.level?.id);
    const token = message.token ?? (this.kind === 'caster' && candidates.length === 1 ? candidates[0].document : null);
    if (!token) return;
    const snapshot = { center: token.getCenterPoint(), elevation: token.elevation, levelId: token.level };
    this.submit(() => this.renderToken(message, token, snapshot));
  }

  async createVisuals(scene, source, cells, decorate, duration) {
    const batches = new Map();
    const previous = [];
    const existing = this.owned(scene, source);
    const deadline = duration > 0 ? this.deadlines.get(source) ?? existing.find(entry => entry.data.expiresAt)?.data.expiresAt ?? Date.now() + duration * 1000 : 0;
    if (deadline && deadline <= Date.now()) { await this.erase(scene, source); return false; }
    for (const offset of cells) {
      const cell = `${offset.i}:${offset.j}`;
      const records = stageRecords(scene, normalized(this.settings.EFFECT_NAME), canvas.level.id, cell);
      const stage = chooseStage(records, source, this.stages, this.settings.STAGE_MODE ?? 'auto', this.settings.STAGE);
      previous.push(...records);
      for (const [type, rows] of this.preset.toDocumentData(offset, stage)) {
        if (!documentTypes.includes(type) || (this.kind !== 'area' && type === 'Region')) throw new Error(`Unsupported visual document: ${type}`);
        if (!batches.has(type)) batches.set(type, []);
        for (const row of rows) {
          const data = foundry.utils.expandObject(foundry.utils.deepClone(row));
          delete data._id;
          if (data.flags) delete data.flags['tile-arsenal'];
          data.flags ??= {};
          data.flags.world ??= {};
          data.flags.world[this.flag] = { owner: this.owner, source, offset: cell, effect: normalized(this.settings.EFFECT_NAME), levelId: canvas.level.id, stage, expiresAt: deadline,
            ...(this.kind === 'area' ? { regionId: source } : { messageId: source }) };
          data.name = `${this.settings.SPELL_NAME}: ${this.settings.EFFECT_NAME}`;
          data.levels = [canvas.level.id];
          decorate(data, type, offset);
          batches.get(type).push(data);
        }
      }
    }
    await this.erase(scene, source);
    try {
      for (const [type, rows] of batches) {
        if (!this.enabled || !authorized()) return false;
        if (rows.length) await scene.createEmbeddedDocuments(type, rows);
      }
      if (!this.enabled || !authorized()) return false;
      if (this.settings.STAGE_MODE !== 'fixed') await replaceOverlaps(scene, previous, source);
    } catch (error) { await this.erase(scene, source); throw error; }
    if (deadline) this.armExpiry(scene, source, deadline);
    return true;
  }

  armExpiry(scene, source, deadline) {
    this.deadlines.set(source, deadline);
    clearTimeout(this.timers.get(source));
    this.timers.set(source, setTimeout(() => {
      this.timers.delete(source);
      this.submit(async () => {
        const region = scene.regions.get?.(source);
        if (region) this.finished.add(region.uuid);
        await this.erase(scene, source);
        if (region) await this.restoreOverlay(region);
        this.deadlines.delete(source);
      });
    }, Math.max(0, deadline - Date.now())));
  }

  async renderToken(message, token, position) {
    if (message.flags?.[game.system.id]?.appliedDamage?.isReverted) return;
    if (!canvas.ready || canvas.scene !== token.parent || canvas.level?.id !== position.levelId) return;
    if (canvas.grid.isGridless) throw new Error('Spell visuals require a grid.');
    const offset = canvas.grid.getOffset(position.center);
    const center = canvas.grid.getCenterPoint(offset);
    await this.createVisuals(token.parent, message.id, [offset], (data, type) => {
      data.x = Math.round(data.x + position.center.x - center.x);
      data.y = Math.round(data.y + position.center.y - center.y);
      data.elevation = this.kind === 'caster' ? data.elevation + position.elevation - canvas.level.elevation.base
        : position.elevation + (type === 'Tile' ? this.settings.TILE_ELEVATION_OFFSET ?? 0.1 : 0);
    }, this.settings.DURATION_SECONDS);
    if (!this.enabled || message.flags?.[game.system.id]?.appliedDamage?.isReverted) await this.erase(token.parent, message.id);
  }

  async renderRegion(region) {
    if (!region.parent.regions.has(region.id) || wizardPlacementPending(region) || this.finished.has(region.uuid)) return;
    if (!this.visible(region)) { await this.erase(region.parent, region.id); return; }
    if (canvas.grid.isGridless) throw new Error('Spell visuals require a grid.');
    const coverage = region.getCoverage(canvas.level);
    if (!coverage) throw new Error('The spell region has no grid coverage.');
    const cells = [...coverage.covered].filter(offset => !region.flags?.world?.spellArsenalSuperseded?.[`${canvas.level.id}:${offset.i}:${offset.j}`]);
    if (cells.length > 120) throw new Error('Spell areas support up to 120 cells.');
    const ground = Math.max(canvas.level.elevation.base, Number.isFinite(region.elevation.bottom) ? region.elevation.bottom : canvas.level.elevation.base);
    const created = await this.createVisuals(region.parent, region.id, cells, (data, type) => {
      data.hidden = region.hidden;
      data.elevation = type === 'Region' ? { bottom: ground, top: ground, topInclusive: true } : ground;
    }, this.lifetime(region));
    if (!created) { this.finished.add(region.uuid); await this.restoreOverlay(region); return; }
    if (!region.parent.regions.has(region.id) || !this.enabled || !authorized()) { await this.erase(region.parent, region.id); return; }
    if (this.settings.REGION_HIGHLIGHT_ONLY_WHILE_EDITING && region.visibility !== CONST.REGION_VISIBILITY.LAYER) {
      const saved = region.flags?.world?.spellArsenalHighlight;
      if (!saved || saved.owner === this.owner) await region.update({ visibility: CONST.REGION_VISIBILITY.LAYER,
        'flags.world.spellArsenalHighlight': saved ?? { owner: this.owner, visibility: region.visibility } });
    }
  }

  async restoreOverlay(region) {
    if (!authorized()) return;
    const saved = region.flags?.world?.spellArsenalHighlight;
    if (saved?.owner !== this.owner || !region.parent.regions.has(region.id)) return;
    const changes = { 'flags.world.-=spellArsenalHighlight': null };
    if (region.visibility === CONST.REGION_VISIBILITY.LAYER) changes.visibility = saved.visibility;
    await region.update(changes);
  }

  async pickCells(message) {
    const scene = canvas.scene, level = canvas.level, caster = message.token;
    if (!canvas.ready || !caster || caster.parent !== scene || caster.level !== level?.id || canvas.grid.isGridless) throw new Error('View the caster on a gridded scene before choosing cells.');
    const cells = [];
    const marker = `${this.owner}:${message.id}`;
    this.cancelPicker = () => {
      if (canvas.regions?._placementContext?.preview?.document?.flags.world?.spellArsenalPicker === marker) canvas.regions._cancelPlacement();
    };
    try {
      ui.notifications.info(`Choose ${this.settings.FREEFORM_SQUARES} touching cells. Escape cancels.`);
      while (this.enabled && authorized() && cells.length < this.settings.FREEFORM_SQUARES) {
        const preview = await canvas.regions.placeRegion({ name: this.settings.SPELL_NAME, shapes: [{ type: 'grid', offsets: [{ i: 0, j: 0 }] }], flags: { world: { spellArsenalPicker: marker } } }, { create: false });
        if (!preview || !this.enabled || !authorized()) return;
        if (canvas.scene !== scene || canvas.level?.id !== level.id) throw new Error('Placement scene changed.');
        const cell = preview.shapes[0].toObject().offsets[0];
        if (cells.some(other => other.i === cell.i && other.j === cell.j)) continue;
        const neighbors = other => canvas.grid.isSquare ? Math.abs(other.i - cell.i) + Math.abs(other.j - cell.j) === 1
          : canvas.grid.getAdjacentOffsets(other).some(adjacent => adjacent.i === cell.i && adjacent.j === cell.j);
        if (cells.length && !cells.some(neighbors)) { ui.notifications.warn('Choose a cell touching the selected area.'); continue; }
        cells.push({ i: cell.i, j: cell.j });
      }
      if (!this.enabled || !authorized()) return;
      await scene.createEmbeddedDocuments('Region', [{ name: this.settings.SPELL_NAME, shapes: [{ type: 'grid', offsets: cells }], levels: [level.id],
        color: game.user.color.toString(), elevation: { bottom: caster.elevation, top: caster.elevation, topInclusive: true },
        visibility: CONST.REGION_VISIBILITY.ALWAYS, highlightMode: 'coverage',
        flags: { [game.system.id]: { messageId: message.id, origin: { ...message.item.getOriginData(), name: message.item.name } } } }]);
    } finally { this.cancelPicker = null; }
  }

  async stop(cleanup = true) {
    this.enabled = false;
    for (const [event, id] of this.hooks) Hooks.off(event, id);
    this.hooks.length = 0;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.cancelPicker?.();
    await this.pickerTask;
    await this.queue;
    if (!cleanup || !authorized()) return;
    for (const scene of game.scenes) {
      await this.erase(scene);
      for (const region of scene.regions) await this.restoreOverlay(region);
    }
  }
}
