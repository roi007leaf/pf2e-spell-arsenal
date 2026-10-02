# Spell Arsenal

Bring your spells to life with automatic **Tile Arsenal** visuals in Foundry VTT. Supports **Pathfinder 2e, Starfinder 2e, and D&D 5e**.

Inspired by [Lunatic Dice’s video](https://www.youtube.com/watch?v=w0UHqiM_6U8).

## What it does

- Start with curated spell defaults, or drag spells from sheets and compendiums into the editor.
- Read spell templates and durations, with suggested Tile Arsenal effects.
- Trigger visuals when a spell is cast, its area is placed, or its damage is applied.
- Use the placed area’s actual shape and covered cells.
- Match visual stages to spell rank or cast level, or choose repeated-cast buildup or a fixed stage.
- Open spell details and customize each mapping’s effect, duration, and trigger.
- Suppress overlapping Automated Animations template effects for mapped spells.

Spell Arsenal handles visuals. Your game system handles saves, damage, conditions, and spell resources.

## Requirements

- **Foundry VTT v14**
- **PF2e, SF2e, or D&D 5e** (D&D 5e version **6.0.5+**)
- **Tile Arsenal 1.1.0+**, installed and enabled
- A square or hex grid and an active GM online

## Install

In Foundry’s **Add-on Modules → Install Module**, paste this manifest URL:

```text
https://github.com/roi007leaf/spell-arsenal/releases/download/0.1.1/module.json
```

Enable **Spell Arsenal** and **Tile Arsenal** in your world. This is an early prerelease; [feedback and bug reports](https://github.com/roi007leaf/spell-arsenal/issues) are welcome.

## Quick start

1. Open **Settings → Configure Spell Arsenal** as GM.
2. Use the defaults, or drag in a spell to add a mapping.
3. Review the suggested effect, trigger, and duration, then click **Save mappings**.
4. Cast the spell and place its area or apply its damage as usual.

Use **Add missing defaults** to add catalog mappings while keeping your customizations. D&D defaults follow your world’s 2014 or 2024 Rules Version setting. Not every spell has a suitable automatic visual; you can configure additional spells yourself.

## Customize your visuals

**Triggers:** Area follows a placed spell region; Damage plays on the damaged token; Cast plays on the caster. Spells without a template can use a picker for touching cells.

**Duration:** Instant spells get brief visual playback. Lasting spells can use a duration in seconds, rounds, minutes, hours, or days. Timers use real time. Lasting areas with duration zero remain until their source region is deleted.

**Stages:** Spell rank uses the available stage closest to the cast rank or level. Cantrips use stage 1. Cast buildup increases the stage when the same effect is cast again in an occupied cell. Fixed lets you choose manually.

**Cleanup:** Delete the source region to remove its visuals, or use **Pause & clear effects** to stop automation and clear generated effects across scenes.

## Current limitations

- Gridless scenes are unsupported.
- Imported suggestions may need adjustment, especially for unusual spells or localized duration text.
- D&D concentration changes and damage undo do not automatically clear visuals. Delete the source region or use **Pause & clear effects**.

## Credits

Inspired by **Lunatic Dice**. Artwork and sounds come from your installed **Tile Arsenal** module and are not bundled here.
