# PF2e Spell Arsenal

Foundry v14 with PF2e or SF2e and Tile Arsenal 1.1.0+.

Enable **PF2e Spell Arsenal**, then Settings → Configure Spell Arsenal.

89 default mappings, audited against all 1,994 spell entries in PF2e 8.5.1 and all 38 Tile Arsenal 1.1.1 presets. Caustic Blast, Fireball and Grim Tendrils follow their areas; Scatter Scree uses stone debris for one minute; Grease uses four touching cells for one minute. **Add missing defaults** adds new mappings while preserving existing overrides; save to apply.

Defaults use curated visual themes or a single supported elemental damage type. Mixed damage, sustained/variable durations, rituals, uncertain target placement, oversized areas and presets requiring walls remain excluded. The complete [spell audit](docs/spell-visual-audit.csv) records enabled, review and unmatched entries; the [preset audit](docs/preset-audit.json) lists textures, stages and document types. Unmatched means no suitable automatic visual, not an unsupported PF2e spell. Custom mappings remain available. Rebuild using `node tools/build-defaults.mjs <PF2e packs/pf2e/spells directory> <Tile Arsenal assets/configs.json>` against the stated versions. Copied visual Regions have their behaviors removed.

Mappings persist as world settings. Automation starts on refresh in the active GM session. The editor supports adding/removing spells, per-rule switches, Tile Arsenal preset suggestions, stage, seconds, cell count and region highlight visibility. Area duration zero persists until region deleted. Casting a spell without a system area uses the touching-cell picker; Escape cancels placement.

Drag spell Items from character sheets or compendiums into the editor. Structured area data selects Area; damaging spells without areas select Damage; other spells select Cast. Damage types and traits suggest installed Tile Arsenal presets. Grease, Scatter Scree and Grim Tendrils have specific suggestions. Explicit English rounds/minutes/hours/days convert to visual seconds for lasting areas; sustained or open-ended areas stay until region deletion. Instant visuals default to five seconds. These timers use real time, not combat rounds. Unrecognized/localized duration text needs review. Ambiguous or unavailable effects create disabled mappings for manual choice. Existing spell mappings retain their overrides on duplicate drops. Dropped rows require Save mappings.

When structured area data is missing, description `@Template[...]` links also select Area. Place the desired template using the spell's description buttons; visuals use its actual covered cells. English contiguous 5-foot-square descriptions supply the manual picker count when no template link exists. Variable template distances are left to PF2e to resolve. Mapping cards list all unique native and description template options, including line widths. Existing mappings load these details from their linked spell or a matching spell compendium; re-dropping a spell refreshes its link and template metadata while preserving overrides. Search filters cards without excluding hidden mappings from saving.

Deleting a source region removes generated documents. Damage undo removes its visuals. Cleanup pauses automation and removes only this module's generated effects across scenes, restoring owned region highlight changes. The original source spell regions remain. Effects stay at their original positions.

Visuals only: no saves, damage, conditions, spell-slot spending or rules automation. Square and hex grids supported; gridless unsupported. Keep an active GM online for real-time cleanup. Refresh removes interrupted token effects; timed areas retain their original expiry, including in unviewed scenes. Persistent areas recover when their scene is viewed. Wizard-managed lasting areas follow their source region's lifetime. AutoAnimations template effects are suppressed for mapped spells; Wizard tile textures remain untouched. Previously hidden Wizard tiles restore their saved opacity on refresh.

## Duration and buildup

Spells without a duration are marked Instant, with no seconds field. Brief visual playback cleanup remains separate (currently five seconds); it does not represent a spell lifetime. Legacy five-second fallback mappings display as Instant. Uncheck Instant only to explicitly override a mapping as lasting.

Stages default to Spell rank, including existing automatic mappings: cantrips use stage 1; other spells use the nearest available stage at or below their cast rank, capped at preset maximum. Repeated casts do not increase rank-based stages. Choose Cast buildup for repeated-cast escalation: first active effect in a cell uses the preset's first available stage; another cast of the same effect in that scene/level/cell advances to the next available stage, capped at maximum. Overlapping cells replace prior visuals; other cells stay unchanged. Expired/deleted visuals no longer count. Region edits and recovery preserve their current stage rather than counting as casts. Superseded cells do not replay from old source regions. Choose Fixed to set a stage manually. Native Tile Arsenal placements are independent of this module's buildup.

## Credits

Inspired by [Lunatic Dice's video](https://www.youtube.com/watch?v=w0UHqiM_6U8). Tile Arsenal artwork and sounds are loaded from the installed dependency and are not bundled.

Validation: `npm test`. The rewritten runtime has automated coverage for damage, undo, buildup, template cells, region edits, deletion and Wizard recovery. The rewritten runtime still needs a Foundry smoke test.
