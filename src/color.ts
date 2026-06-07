export const LEVEL_ALPHA = [0, 0.3, 0.5, 0.75, 1.0];

export function normalizeHexColor(value: string): string | null {
	const trimmed = value.trim();
	const match = trimmed.match(/^#?([0-9a-fA-F]{6})$/);
	return match ? `#${match[1].toLowerCase()}` : null;
}

export function hexToRgba(hex: string, alpha: number): string {
	const match = hex.match(/\d+/g);
	if (match && hex.startsWith("rgb")) {
		return `rgba(${match[0]}, ${match[1]}, ${match[2]}, ${alpha})`;
	}
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function lerpColor(from: string, to: string, t: number): string {
	const f = [parseInt(from.slice(1, 3), 16), parseInt(from.slice(3, 5), 16), parseInt(from.slice(5, 7), 16)];
	const tC = [parseInt(to.slice(1, 3), 16), parseInt(to.slice(3, 5), 16), parseInt(to.slice(5, 7), 16)];
	const r = Math.round(f[0] + (tC[0] - f[0]) * t);
	const g = Math.round(f[1] + (tC[1] - f[1]) * t);
	const b = Math.round(f[2] + (tC[2] - f[2]) * t);
	return `rgb(${r}, ${g}, ${b})`;
}

export function getOverachieverColors(color: string): Record<string, string> {
	return {
		"--wg-overachiever-center": lerpColor(color, "#ffffff", 0.45),
		"--wg-overachiever-mid": lerpColor(color, "#ffffff", 0.15),
		"--wg-overachiever-edge": color,
		"--wg-overachiever-border": hexToRgba(lerpColor(color, "#ffffff", 0.55), 0.8),
		"--wg-overachiever-border-strong": hexToRgba(color, 0.95),
		"--wg-overachiever-glow": hexToRgba(color, 0.75),
		"--wg-overachiever-glow-soft": hexToRgba(color, 0.3),
	};
}
