# Word Goal Webhook

An [Obsidian](https://obsidian.md) plugin that tracks your daily word count, fires a webhook when you hit your goal, and shows a GitHub-style writing heatmap in the sidebar.

---

## Features

- **Daily word tracking** — counts only *new* words written today, not the total length of your files. Survives Obsidian restarts and mobile sync.
- **Webhook notification** — sends a POST request to any URL when you reach your daily goal.
- **Sidebar heatmap** — a compact vertical heatmap of the current year, live today counter, dual streak pills, and a subtle goal-met marker on successful days.
- **Detail modal** — full stats view with year navigation, five stat cards, a horizontal heatmap, and a monthly bar chart.
- **Status bar dot** — a small dot in the status bar that lerps from grey to your chosen colour as you approach the goal.
- **8 colour presets** — pick a heatmap colour from the settings panel.
- **Daily Stats importer** — migrate existing history from the [obsidian-daily-stats](https://github.com/dhruvik7/obsidian-daily-stats) plugin with one command.

---

## Installation

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/viszkit/obsidian-writing-streak/releases).
2. Copy them into your vault at:
   ```
   <vault>/.obsidian/plugins/word-goal-webhook/
   ```
3. Run
```bash
npm install
npm run build
```
4. Reload Obsidian and enable the plugin under **Settings → Community plugins**.
5. Choose Webhook destination and color

### Build from source

```bash
git clone https://github.com/viszkit/obsidian-writing-streak.git
cd obsidian-writing-streak
npm install
npm run build
```

Then copy `main.js`, `manifest.json`, and `styles.css` into your vault's plugin folder as above.

---

## Usage

### Sidebar

The heatmap panel opens automatically in the right sidebar on startup. Each cell represents one week-column of the current year; intensity reflects how many words you wrote that day relative to your personal maximum. Days where you met your goal get a tiny corner marker. Hover a cell to see the date and exact word count.

The sidebar streak area separates the two concepts clearly:
- **Writing streak** — consecutive days with any writing at all
- **Goal met streak** — consecutive days where you reached your daily goal

If you have not written yet today, the current streak can still reflect the streak up to yesterday.

The **⤢ expand button** in the top-right corner opens the full detail modal.

### Detail modal

Open it via the expand button or the command **Open writing stats**. Use the ← → arrows to browse previous years. The modal shows:

| Stat | Description |
|---|---|
| Total words | All words written in the selected year |
| Days written | Number of days with at least one word |
| Daily average | Total ÷ days written |

The full heatmap keeps the same layout as before, but the month labels above it are removed so the grid stays visually aligned.

### Commands

| Command | Description |
|---|---|
| Open writing heatmap | Reveal the sidebar panel |
| Open writing stats | Open the full detail modal |
| Show today's word count | Quick notice with today's count vs. goal |
| Import history from Daily Stats plugin | One-time migration from obsidian-daily-stats |

### Webhook

When you reach your daily goal, the plugin fires a `POST` request with a JSON body:

```json
{
  "event": "daily_word_goal_reached",
  "goal": 500,
  "actual": 512,
  "date": "2026-03-27",
  "timestamp": "2026-03-27T14:23:01.000Z"
}
```

---

## Settings

| Setting | Default | Description |
|---|---|---|
| Webhook URL | *(empty)* | The endpoint to POST to when the goal is reached |
| Daily word goal | `500` | Number of new words needed to trigger the webhook |
| Heatmap colour | Green `#39d353` | Choose from 8 presets: Green, Teal, Blue, Purple, Pink, Orange, Yellow, Red |
| Goal-met visual cue | `On` | Show or hide the small marker on heatmap days where the goal was met |

---

## Data

All data is stored in your vault at `.obsidian/plugins/word-goal-webhook/data.json`. Per-file word snapshots are persisted so your count survives restarts and mobile sync. The plugin saves immediately whenever the app goes to the background.

Word counts use local timezone dates throughout — no UTC drift.

---

## Importing from Daily Stats

If you previously used [obsidian-daily-stats](https://github.com/dhruvik7/obsidian-daily-stats), run the command **Import history from Daily Stats plugin**. It reads that plugin's `data.json`, converts its date format, and merges the history into this plugin — skipping any days you already have data for.

---

## License

MIT
