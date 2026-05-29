const THEME_KEY = "banjo-theme";

export type Theme = "light" | "dark";

export function getStoredTheme(): Theme | null {
	try {
		const stored = localStorage.getItem(THEME_KEY);
		if (stored === "light" || stored === "dark") return stored;
	} catch {
		/* localStorage unavailable */
	}
	return null;
}

export function setStoredTheme(theme: Theme): void {
	try {
		localStorage.setItem(THEME_KEY, theme);
	} catch {
		/* localStorage unavailable */
	}
}

export function applyTheme(theme: Theme): void {
	document.documentElement.classList.toggle("dark", theme === "dark");
}

export function resolveInitialTheme(): Theme {
	return getStoredTheme() ?? "light";
}
