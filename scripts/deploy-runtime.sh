#!/usr/bin/env sh
set -eu

plugin_dir="${OBSIDIAN_PLUGIN_DIR:-/Users/laszlo/Library/Mobile Documents/iCloud~md~obsidian/Documents/Laszlo Mattern/.obsidian/plugins/word-goal-webhook}"

mkdir -p "$plugin_dir"
cp main.js manifest.json styles.css "$plugin_dir/"

rm -rf \
	"$plugin_dir/node_modules" \
	"$plugin_dir/main.ts" \
	"$plugin_dir/package.json" \
	"$plugin_dir/package-lock.json" \
	"$plugin_dir/tsconfig.json" \
	"$plugin_dir/.DS_Store"

printf 'Deployed runtime files to %s\n' "$plugin_dir"
