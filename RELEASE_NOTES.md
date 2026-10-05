# Writing Tracker Heatmap Streaks 3.3.11

## What's Changed

- Failed automatic goal webhooks now retry every five minutes without interrupting offline writing with repeated error notices.
- Successful retries preserve the original goal event and notify you when delivery recovers.
- Fixed current-day totals staying inflated after text was deleted and rewritten following a sync recovery.

**Full Changelog:** https://github.com/viszkit/obsidian-writing-streak/compare/3.3.10...3.3.11
