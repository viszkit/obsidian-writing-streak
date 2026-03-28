# Writing Tracker Heatmap Streaks

Writing Tracker Heatmap Streaks is an [Obsidian](https://obsidian.md) plugin that tracks the new words you write each day, sends a webhook when you hit your goal, and shows your writing history in a compact heatmap sidebar with a detailed stats view.

## Features

- Track daily new words instead of total file length.
- Send a webhook when the configured daily word goal is reached.
- View a sidebar heatmap with today's count and current streaks.
- Open a detailed stats modal with yearly history and monthly totals.
- Import past history from the `obsidian-daily-stats` plugin.

## Installation

### From community plugins

Install **Writing Tracker Heatmap Streaks** from Obsidian's community plugins browser once the plugin has been approved and published.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest GitHub release](https://github.com/viszkit/obsidian-writing-streak/releases).
2. Create this folder in your vault:

```text
<vault>/.obsidian/plugins/word-goal-webhook/
```

3. Copy the three release files into that folder.
4. Reload Obsidian.
5. Enable **Writing Tracker Heatmap Streaks** under **Settings -> Community plugins**.

## Usage

The plugin opens a sidebar heatmap on startup. Each day is shaded based on how many words you wrote relative to your strongest writing day for that year.

Commands:

- `Open writing heatmap`
- `Open writing stats`
- `Show today's word count`
- `Import history from Daily Stats plugin`

Settings:

- **Webhook URL**: endpoint to call when the daily goal is met.
- **Daily word goal**: number of new words required before the webhook fires.
- **Heatmap colour**: choose one of the built-in color presets.
- **Goal-met visual cue**: show or hide the marker on days where the goal was reached.

When the goal is reached, the plugin sends a `POST` request with a JSON payload like:

```json
{
  "event": "daily_word_goal_reached",
  "goal": 500,
  "actual": 512,
  "date": "2026-03-27",
  "timestamp": "2026-03-27T14:23:01.000Z"
}
```

## Data and privacy

- Plugin data is stored in your vault under `.obsidian/plugins/word-goal-webhook/data.json`.
- The plugin makes network requests only when you configure a webhook URL and your daily goal is reached.
- The plugin does not require an account, payment, ads, or telemetry.
- The source code in this repository is open source.

## Development

```bash
npm install
npm run build
```

Create releases by attaching `main.js`, `manifest.json`, and `styles.css` to a GitHub release whose tag matches the manifest version.

## License

[MIT](LICENSE)
