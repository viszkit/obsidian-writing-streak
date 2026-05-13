/** Format a Date as YYYY-MM-DD in LOCAL timezone (not UTC). */
export function dateToKey(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

export function todayKey(): string {
	return dateToKey(new Date());
}

export function isToday(date: Date): boolean {
	return dateToKey(date) === todayKey();
}

function runtimeLocale(): string {
	if (typeof window !== "undefined" && typeof window.navigator?.language === "string" && window.navigator.language.length > 0) {
		return window.navigator.language;
	}
	return Intl.DateTimeFormat().resolvedOptions().locale;
}

export function formatLocalizedDate(date: Date, options: Intl.DateTimeFormatOptions): string {
	return date.toLocaleDateString(runtimeLocale(), options);
}

export function formatLocalizedNumber(value: number): string {
	return value.toLocaleString(runtimeLocale());
}
