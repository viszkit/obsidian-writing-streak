# Writing Tracker Heatmap Streaks 3.3.10

## What's Changed

- Fixed a sync race that could reset today's live counter to zero after sleep or a vault sync, while leaving the heatmap total intact.
- Repaired affected current-day counters from their persisted history and preserved subsequent writing progress.

**Full Changelog:** https://github.com/viszkit/obsidian-writing-streak/compare/3.3.9...3.3.10
