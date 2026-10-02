// Adapted from Lunatic Dice v14 macros. See README credits.
import { stageRecords, chooseStage, replaceOverlaps } from './stages.js';
import { wizardHandlesPlacement, wizardRegionSpell, wizardPlacementPending, wizardFlagsChanged, syncWizardTextures, WIZARD_ID } from './template-wizard.js';
let workQueue = Promise.resolve();
export async function runSpellEffect(kind, settings, owner, forceOff = false, legacyOwner) {
  const {
    SPELL_NAME, EFFECT_NAME, DURATION_SECONDS, INSTANT = false, STAGE = 1, STAGE_MODE = 'auto',
    TILE_ELEVATION_OFFSET = 0.1, FREEFORM_SQUARES = 4,
    REGION_HIGHLIGHT_ONLY_WHILE_EDITING = false
  } = settings;
  const SYSTEM_ID = game.system.id;
  const prefixes = { damage: "__spellArsenalDamage_", area: "__spellArsenalArea_", caster: "__spellArsenalCaster_" };
  const flag = kind === "area" ? "spellArsenalArea" : kind === "damage" ? "spellArsenalDamage" : "spellArsenalCaster";
  const key = prefixes[kind] + owner;
  const lock = key + ":busy";
  const label = `${SPELL_NAME} → ${EFFECT_NAME}`;
  const activeGM = () => game.user.isGM && game.users.activeGM?.id === game.user.id;
  const sameName = name => typeof name === "string" && name.trim().toLowerCase() === SPELL_NAME.trim().toLowerCase();
  const report = error => { console.error(label, error); ui.notifications.error(`${label}: ${error.message}`); };
  if (!game.user.isGM) return ui.notifications.warn("Spell Arsenal requires the active GM.");
  if (globalThis[lock]) return ui.notifications.info(`${label}: a change is already in progress.`);
  globalThis[lock] = true;
  try {
    const signature = JSON.stringify(["lunatic-v3", kind, SYSTEM_ID, settings]);
    const legacyKey = kind === "caster" && legacyOwner ? prefixes.caster + legacyOwner : key;
    const previous = globalThis[key] ?? globalThis[legacyKey];
    if (previous) {
      if (previous.stop) await previous.stop();
      else {
        // Replace a pre-v3 listener without disturbing another saved macro.
        previous.enabled = false;
        for (const [event, id] of previous.hooks ?? []) Hooks.off(event, id);
        if (previous.hookId !== undefined) Hooks.off("createChatMessage", previous.hookId);
        for (const timer of previous.timers?.values() ?? []) clearTimeout(timer);
        await previous.queue;
        for (const scene of game.scenes) { await removeCopies(scene); await restoreHighlights(scene); }
        delete globalThis[legacyKey];
        delete globalThis[key];
      }
      if (forceOff) {
        // Effects removed.
        return;
      }
    }
    if (forceOff) return;
    if (!activeGM()) return ui.notifications.warn("Spell Arsenal requires the active GM.");
    if (!["pf2e", "sf2e"].includes(SYSTEM_ID) || Number(game.release.generation) !== 14)
      throw new Error("Spell Arsenal requires PF2e or SF2e on Foundry v14.");
    if (!game.modules.get("tile-arsenal")?.active || !globalThis.tileArsenal)
      throw new Error("Enable Tile Arsenal first.");
    if (![SPELL_NAME, EFFECT_NAME].every(value => typeof value === "string" && value.trim()))
      throw new Error("SPELL_NAME and EFFECT_NAME must be nonempty names.");
    if (!Number.isFinite(DURATION_SECONDS) || (kind === "area" ? DURATION_SECONDS < 0 : DURATION_SECONDS <= 0))
      throw new Error(`DURATION_SECONDS must be ${kind === "area" ? "zero or a positive number" : "a positive number"}.`);
    if (DURATION_SECONDS > 2147483) throw new Error("DURATION_SECONDS must not exceed 2147483 seconds.");
    if (!Number.isInteger(STAGE) || STAGE < 1) throw new Error("STAGE must be a positive whole number.");
    if (kind === "area" && (!Number.isInteger(FREEFORM_SQUARES) || FREEFORM_SQUARES < 1 || FREEFORM_SQUARES > 120))
      throw new Error("FREEFORM_SQUARES must be a whole number from 1 to 120.");
    if (kind === "area" && typeof REGION_HIGHLIGHT_ONLY_WHILE_EDITING !== "boolean")
      throw new Error("REGION_HIGHLIGHT_ONLY_WHILE_EDITING must be true or false.");
    if (kind === "damage" && !Number.isFinite(TILE_ELEVATION_OFFSET))
      throw new Error("TILE_ELEVATION_OFFSET must be a finite number.");
    const presets = await tileArsenal.utils.getConfigurations();
    const preset = Object.values(presets.configurations).find(p =>
      p.name?.trim().toLowerCase() === EFFECT_NAME.trim().toLowerCase());
    if (!preset?.toDocumentData) throw new Error(`Tile Arsenal preset "${EFFECT_NAME}" was not found.`);
    const stages = [...new Set(Object.values(preset.configs ?? {}).map(part => part.stage))].sort((a, b) => a - b);
    const parts = Object.values(preset.configs ?? {}).filter(part => STAGE_MODE === 'auto' || part.stage === STAGE);
    if (!parts.length) throw new Error(`${EFFECT_NAME} has no stage ${STAGE}. Choose a stage available for this preset.`);
    const unsupported = parts.find(part => !types().includes(part.type));
    if (unsupported) throw new Error(`${EFFECT_NAME} contains unsupported ${unsupported.type} documents.`);

    const state = {
      signature, enabled: true, hooks: [], timers: new Map(), seen: new Set(), expired: new Set(),
      queue: Promise.resolve(), pickerTask: null, cancelPicker: null, partial: null, stop
    };
    globalThis[key] = state;
    try {
      // Interrupted temporary effects are owned by Spell Arsenal, and are safe to remove.
      await removePartialRegions();
      for (const scene of game.scenes) {
        if (kind !== "area" || DURATION_SECONDS > 0) await removeCopies(scene);
        if (kind === "area") {
          await restoreHighlights(scene, undefined, DURATION_SECONDS === 0 && REGION_HIGHLIGHT_ONLY_WHILE_EDITING);
          // Timed effects play only for regions created after this activation, on every scene.
          if (DURATION_SECONDS > 0) for (const region of scene.regions) if (matches(region)) state.expired.add(region.uuid);
        }
      }
      if (kind === "area") installArea(); else installToken();
      if (kind === "area") {
        // Serialize startup recovery with region hooks too; otherwise both can fill the same cells.
        const startup = state.queue.then(recover);
        state.queue = startup.catch(report);
        await startup;
      }
    } catch (error) {
      // A failed cleanup stays registered so OFF can retry it (including through Mega).
      try { await stop(); } catch (cleanupError) { report(cleanupError); }
      throw error;
    }
    const usage = kind === "damage" ? `Apply damage from ${SPELL_NAME} normally.`
      : kind === "caster" ? `Cast ${SPELL_NAME} normally.` : `Place the spell's area normally; spells without an area use the square picker.`;
    return state;

    function on(event, callback) { state.hooks.push([event, Hooks.on(event, callback)]); }
    function enqueue(job, cleanup = false) {
      workQueue = workQueue.then(() => activeGM() && (cleanup || state.enabled) ? job() : undefined).catch(report);
      state.queue = workQueue;
      return state.queue;
    }
    function seen(id) {
      if (state.seen.has(id)) return true;
      state.seen.add(id);
      if (state.seen.size > 500) state.seen.delete(state.seen.values().next().value);
      return false;
    }
    async function stop(cleanup = true) {
      state.enabled = false;
      for (const [event, id] of state.hooks) Hooks.off(event, id);
      state.hooks.length = 0;
      for (const timer of state.timers.values()) clearTimeout(timer);
      state.timers.clear();
      state.cancelPicker?.();
      await state.pickerTask;
      await state.queue;
      if (!cleanup || !activeGM()) { if (globalThis[key] === state) delete globalThis[key]; return; }
      // Also retain the direct reference if deleting an interrupted region failed after its marker was cleared.
      if (state.partial && state.partial.parent.regions.has(state.partial.id)) await state.partial.delete();
      state.partial = null;
      await removePartialRegions();
      for (const scene of game.scenes) { await removeCopies(scene); await restoreHighlights(scene); }
      if (globalThis[key] === state) delete globalThis[key];
    }

    function installToken() {
      on("createChatMessage", message => {
        if (!state.enabled || !activeGM()) return;
        const flags = message.flags[SYSTEM_ID];
        const spell = message.item;
        if (!spell?.isOfType("spell") || !sameName(spell.name)) return;
        if (kind === "damage") {
          const applied = flags?.appliedDamage;
          if (flags?.context?.type !== "damage-taken" || !applied || applied.isHealing || applied.isReverted) return;
          if (!applied.updates?.some(update => update.value > 0 &&
            ["system.attributes.hp.value", "system.attributes.hp.temp", "system.attributes.hp.sp.value"].includes(update.path))) return;
        } else if (message.isRoll || (flags?.context?.type && flags.context.type !== "spell-cast") ||
          !flags?.origin?.rollOptions?.includes("origin:action:slug:cast-a-spell")) return;
        if (seen(message.id)) return;
        let token = message.token;
        if (!token && kind === "caster" && message.actor) {
          const candidates = (canvas.tokens?.placeables ?? []).filter(t =>
            t.actor?.id === message.actor.id && t.document.level === canvas.level?.id);
          if (candidates.length === 1) token = candidates[0].document;
        }
        if (!token) return ui.notifications.warn(`${label}: could not identify the ${kind === "damage" ? "damaged token" : "caster"}.`);
        // Capture position at the event; never follow token movement.
        const center = token.getCenterPoint(), elevation = token.elevation, levelId = token.level;
        enqueue(() => playToken(message, token, center, elevation, levelId));
      });
      if (kind === "damage") on("updateChatMessage", message => {
        if (message.flags[SYSTEM_ID]?.appliedDamage?.isReverted)
          enqueue(async () => { for (const scene of game.scenes) await removeCopies(scene, message.id); }, true);
      });
    }

    async function playToken(message, token, center, elevation, levelId) {
      const scene = token.parent, level = canvas.level;
      if (!canvas.ready || canvas.scene !== scene || level?.id !== levelId)
        throw new Error("View the token's scene and level to play the effect.");
      if (canvas.grid.isGridless) throw new Error("A square or hex grid is required.");
      const reverted = () => kind === "damage" && message.flags[SYSTEM_ID]?.appliedDamage?.isReverted;
      if (reverted()) return;
      const offset = canvas.grid.getOffset(center), gridCenter = canvas.grid.getCenterPoint(offset);
      const cell = `${offset.i}:${offset.j}`, effect = EFFECT_NAME.trim().toLowerCase();
      const records = stageRecords(scene, effect, levelId, cell);
      const stage = chooseStage(records, message.id, stages, STAGE_MODE, STAGE);
      const bundle = new Map();
      for (const [type, rows] of preset.toDocumentData(offset, stage)) {
        if (!types().includes(type)) throw new Error(`${EFFECT_NAME} contains unsupported ${type} documents.`);
        bundle.set(type, rows.map(raw => {
          const doc = copy(raw, { messageId: message.id, source: message.id, offset: cell, effect, levelId, stage, expiresAt: Date.now() + DURATION_SECONDS * 1000 });
          doc.name = `${label} (${message.id})`;
          doc.x = Math.round(doc.x + center.x - gridCenter.x);
          doc.y = Math.round(doc.y + center.y - gridCenter.y);
          doc.elevation = kind === "caster" ? doc.elevation + elevation - level.elevation.base
            : elevation + (type === "Tile" ? TILE_ELEVATION_OFFSET : 0);
          doc.levels = [levelId];
          return doc;
        }));
      }
      try {
        for (const [type, data] of bundle) if (data.length) await scene.createEmbeddedDocuments(type, data);
      } catch (error) { await removeCopies(scene, message.id); throw error; }
      if (!state.enabled || !activeGM() || reverted()) { await removeCopies(scene, message.id); return; }
      if (STAGE_MODE === 'auto') await replaceOverlaps(scene, records, message.id);
      state.timers.set(message.id, setTimeout(() => {
        state.timers.delete(message.id);
        enqueue(() => removeCopies(scene, message.id), true);
      }, DURATION_SECONDS * 1000));
    }

    function onViewedLevel(region) {
      return canvas.ready && region.parent === canvas.scene && canvas.level
        && (!region.levels.size || region.levels.has(canvas.level.id));
    }
    function coveredOffsets(region) {
      const coverage = region.getCoverage(canvas.level);
      if (coverage) return coverage.covered;
      const bounds = region.bounds.clone().fit(canvas.dimensions.rect).pad(1);
      const [i0, j0, i1, j1] = canvas.grid.getOffsetRange(bounds);
      if ((i1 - i0) * (j1 - j0) > 10000) throw new Error("The region is too large for Spell Arsenal.");
      const offsets = [];
      for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++)
        if (region.polygonTree.testPoint(canvas.grid.getCenterPoint({ i, j }), 0.75)) offsets.push({ i, j });
      return offsets;
    }
    async function fill(region, keepExisting = false) {
      const scene = region.parent;
      const building = Boolean(region.flags.world?.spellArsenalPlacement);
      const wizardLifetime = !INSTANT && game.modules.get(WIZARD_ID)?.active && Boolean(region.flags[WIZARD_ID]?.originUuid || region.flags[WIZARD_ID]?.managed);
      if (!scene.regions.has(region.id) || wizardPlacementPending(region) || !matches(region) || !onViewedLevel(region) || state.expired.has(region.uuid)) return;
      if (canvas.grid.isGridless) throw new Error("A square or hex grid is required.");
      const offsets = coveredOffsets(region);
      await syncWizardTextures(scene);
      if (offsets.length > 120) throw new Error("This area exceeds the 120-square limit.");
      const keep = new Set();
      if (keepExisting) {
        const covered = new Set(offsets.map(o => `${o.i}:${o.j}`));
        for (const type of types()) for (const doc of scene.getEmbeddedCollection(type)) {
          const data = doc.flags.world?.[flag];
          if (data?.owner === owner && data.regionId === region.id && covered.has(data.offset)) keep.add(data.offset);
        }
      }
      const level = canvas.level;
      const ground = Math.max(level.elevation.base, Number.isFinite(region.elevation.bottom) ? region.elevation.bottom : level.elevation.base);
      const bundle = new Map();
      const replaced = [];
      for (const offset of offsets) {
        if (region.flags.world?.spellArsenalSuperseded?.[`${level.id}:${offset.i}:${offset.j}`]) continue;
        if (keep.has(`${offset.i}:${offset.j}`)) continue;
        const cell = `${offset.i}:${offset.j}`, effect = EFFECT_NAME.trim().toLowerCase();
        const records = stageRecords(scene, effect, level.id, cell);
        const stage = chooseStage(records, region.id, stages, STAGE_MODE, STAGE);
        const own = records.find(r => r.data.source === region.id);
        const expiresAt = wizardLifetime ? 0 : own?.data.expiresAt ?? (DURATION_SECONDS > 0 ? Date.now() + DURATION_SECONDS * 1000 : 0);
        replaced.push(...records);
        for (const [type, rows] of preset.toDocumentData(offset, stage)) {
          if (!types().includes(type)) throw new Error(`${EFFECT_NAME} contains unsupported ${type} documents.`);
          if (!bundle.has(type)) bundle.set(type, []);
          for (const raw of rows) {
            const doc = copy(raw, { regionId: region.id, source: region.id, offset: cell, effect, levelId: level.id, stage, expiresAt });
            doc.name = `${label} (${region.id})`;
            doc.levels = [level.id];
            doc.hidden = region.hidden;
            doc.elevation = type === "Region" ? { bottom: ground, top: ground, topInclusive: true } : ground;
            bundle.get(type).push(doc);
          }
        }
      }
      await removeCopies(scene, region.id, keep);
      if (!state.enabled || !activeGM() || !scene.regions.has(region.id) || !onViewedLevel(region)) return;
      try {
        for (const [type, data] of bundle) if (data.length) await scene.createEmbeddedDocuments(type, data);
        if (!scene.regions.has(region.id) || wizardPlacementPending(region)) { await removeCopies(scene, region.id); return; }
        if (STAGE_MODE === 'auto') await replaceOverlaps(scene, replaced, region.id);
        if (REGION_HIGHLIGHT_ONLY_WHILE_EDITING) {
          const saved = region.flags.world?.spellArsenalHighlight;
          if (scene.regions.has(region.id) && (!saved || saved.owner === owner) && region.visibility !== CONST.REGION_VISIBILITY.LAYER)
            await region.update({ visibility: CONST.REGION_VISIBILITY.LAYER,
              "flags.world.spellArsenalHighlight": saved ?? { owner, visibility: region.visibility } });
        }
      } catch (error) { await removeCopies(scene, region.id); await restoreHighlights(scene, region.id); throw error; }
      if (!state.enabled || !activeGM() || !scene.regions.has(region.id)) {
        await removeCopies(scene, region.id); await restoreHighlights(scene, region.id); return;
      }
      if (DURATION_SECONDS > 0 && !wizardLifetime && !building && !state.timers.has(region.uuid)) {
        state.timers.set(region.uuid, setTimeout(() => {
          state.expired.add(region.uuid);
          state.timers.delete(region.uuid);
          enqueue(async () => { await removeCopies(scene, region.id); await restoreHighlights(scene, region.id); }, true);
        }, DURATION_SECONDS * 1000));
      }
    }
    async function recover() {
      for (const scene of game.scenes) {
        const orphans = new Set(types().flatMap(type => [...scene.getEmbeddedCollection(type)]
          .filter(doc => doc.flags.world?.[flag]?.owner === owner)
          .map(doc => doc.flags.world[flag].regionId)).filter(id => !scene.regions.has(id) || !matches(scene.regions.get(id))));
        for (const id of orphans) await removeCopies(scene, id);
        await restoreHighlights(scene, undefined, true);
      }
      if (canvas.ready) for (const region of [...canvas.scene.regions]) if (matches(region)) await fill(region);
    }

    async function pickArea(message) {
      const scene = canvas.scene, level = canvas.level, caster = message.token;
      if (!canvas.ready || !caster || caster.parent !== scene || caster.level !== level?.id)
        throw new Error("View the caster's scene and level before choosing squares.");
      if (canvas.grid.isGridless) throw new Error("A square or hex grid is required.");
      const chosen = [], pickerTag = `${owner}:${message.id}`;
      let region = null, complete = false;
      // Foundry v14's own picker supports scoped cancellation via its preview document.
      state.cancelPicker = () => {
        if (canvas.regions?._placementContext?.preview?.document?.flags.world?.spellArsenalPicker === pickerTag)
          canvas.regions._cancelPlacement();
      };
      const touching = (a, b) => canvas.grid.isSquare ? Math.abs(a.i - b.i) + Math.abs(a.j - b.j) === 1
        : canvas.grid.getAdjacentOffsets(b).some(c => c.i === a.i && c.j === a.j);
      try {
        ui.notifications.info(`${label}: click ${FREEFORM_SQUARES} touching squares, one at a time. Escape cancels.`);
        while (chosen.length < FREEFORM_SQUARES && state.enabled && activeGM()) {
          const selection = await canvas.regions.placeRegion({
            name: SPELL_NAME, displayMeasurements: false, color: game.user.color,
            shapes: [{ type: "grid", offsets: [{ i: 0, j: 0 }] }],
            flags: { world: { spellArsenalPicker: pickerTag } }
          }, { create: false });
          if (!selection || !state.enabled || !activeGM()) return;
          if (canvas.scene !== scene || canvas.level?.id !== level.id) throw new Error("The scene or level changed during placement.");
          const offset = selection.shapes[0].toObject().offsets[0];
          if (chosen.some(p => p.i === offset.i && p.j === offset.j)) continue;
          if (chosen.length && !chosen.some(p => touching(offset, p))) {
            ui.notifications.warn(`${label}: that square must touch one you already chose.`); continue;
          }
          chosen.push({ i: offset.i, j: offset.j });
          const shapes = [{ type: "grid", offsets: [...chosen] }];
          if (region) await region.update({ shapes });
          else {
            [region] = await scene.createEmbeddedDocuments("Region", [{
              name: SPELL_NAME, shapes, color: game.user.color.toString(), levels: [level.id],
              elevation: { bottom: caster.elevation, top: caster.elevation, topInclusive: true },
              visibility: REGION_HIGHLIGHT_ONLY_WHILE_EDITING ? CONST.REGION_VISIBILITY.LAYER : CONST.REGION_VISIBILITY.ALWAYS,
              highlightMode: "coverage", ownership: { [message.author.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
              flags: { world: { spellArsenalPlacement: { owner },
                ...(REGION_HIGHLIGHT_ONLY_WHILE_EDITING ? { spellArsenalHighlight: { owner, visibility: CONST.REGION_VISIBILITY.ALWAYS } } : {}) },
                [SYSTEM_ID]: { messageId: message.id, origin: { ...message.item.getOriginData(), name: message.item.name } } }
            }]);
            state.partial = region;
          }
        }
        if (state.enabled && activeGM() && region && chosen.length === FREEFORM_SQUARES) {
          await region.update({ "flags.world.-=spellArsenalPlacement": null });
          complete = state.enabled && activeGM();
          if (complete) enqueue(() => fill(region, true));
        }
      } finally {
        state.cancelPicker = null;
        if (!complete && region && scene.regions.has(region.id)) await region.delete();
        state.partial = null;
      }
    }
    function installArea() {
      on("createRegion", region => { if (matches(region)) enqueue(() => fill(region)); });
      on("updateRegion", (region, changes) => {
        if (matches(region) && (["shapes", "elevation", "levels", "hidden", "restriction", "_shapeConstraints"].some(k => k in changes) || wizardFlagsChanged(changes)))
          enqueue(async () => {
            const shapesOnly = !["elevation", "levels", "hidden", "restriction", "_shapeConstraints"].some(k => k in changes);
            if (onViewedLevel(region)) await fill(region, shapesOnly); else await removeCopies(region.parent, region.id);
          });
      });
      on("deleteRegion", region => {
        if (region.flags.world?.[flag]) return;
        enqueue(async () => {
          clearTimeout(state.timers.get(region.uuid)); state.timers.delete(region.uuid); state.expired.delete(region.uuid);
          await removeCopies(region.parent, region.id);
        }, true);
      });
      on("canvasReady", () => enqueue(recover));
      on("createChatMessage", message => {
        const flags = message.flags[SYSTEM_ID], spell = message.item;
        if (!state.enabled || !activeGM() || message.isRoll || !spell?.isOfType("spell") || !sameName(spell.name) || spell.system.area) return;
        if (!flags?.origin?.rollOptions?.includes("origin:action:slug:cast-a-spell") || (flags.context?.type && flags.context.type !== "spell-cast")) return;
        if (wizardHandlesPlacement(spell)) return;
        if (state.pickerTask) return ui.notifications.warn(`${label}: finish the current area placement first.`);
        if (seen(message.id)) return;
        const task = pickArea(message).catch(report).finally(() => { if (state.pickerTask === task) state.pickerTask = null; });
        state.pickerTask = task;
      });
    }
  } catch (error) { throw error; }
  finally { delete globalThis[lock]; }

  function types() { return kind === "area" ? ["Tile", "AmbientLight", "AmbientSound", "Region"] : ["Tile", "AmbientLight", "AmbientSound"]; }
  function matches(region) {
    if (region.flags.world?.[flag]) return false;
    const origin = region.flags[SYSTEM_ID]?.origin;
    return (origin?.type === "spell" && sameName(origin.name ?? region.message?.item?.name)) || sameName(wizardRegionSpell(region)?.name);
  }
  function copy(raw, data) {
    const doc = foundry.utils.expandObject(foundry.utils.deepClone(raw));
    delete doc._id; delete doc.flags?.["tile-arsenal"];
    doc.flags ??= {}; doc.flags.world ??= {}; doc.flags.world[flag] = { owner, ...data };
    return doc;
  }
  async function removeCopies(scene, sourceId, keep) {
    const results = await Promise.allSettled(types().map(async type => {
      const ids = scene.getEmbeddedCollection(type).filter(doc => {
        const data = doc.flags.world?.[flag];
        return data?.owner === owner && (!sourceId || (data.regionId ?? data.messageId) === sourceId) && !keep?.has(data.offset);
      }).map(doc => doc.id);
      if (ids.length) await scene.deleteEmbeddedDocuments(type, ids);
    }));
    const failed = results.find(result => result.status === "rejected");
    if (failed) throw failed.reason;
  }
  async function restoreHighlights(scene, regionId, keepMatching = false) {
    if (kind !== "area") return;
    for (const region of [...scene.regions]) {
      const saved = region.flags.world?.spellArsenalHighlight;
      if (saved?.owner !== owner || (regionId && region.id !== regionId)) continue;
      if (keepMatching && matches(region)) continue;
      const update = { "flags.world.-=spellArsenalHighlight": null };
      if (region.visibility === CONST.REGION_VISIBILITY.LAYER) update.visibility = saved.visibility;
      await region.update(update);
    }
  }
  async function removePartialRegions() {
    if (kind !== "area") return;
    for (const scene of game.scenes) for (const region of [...scene.regions])
      if (region.flags.world?.spellArsenalPlacement?.owner === owner) await region.delete();
  }
}
