import type { FetchJson } from "../runtime";

export const browserFetchJson: FetchJson = async <T = unknown>(url: string, init?: RequestInit) => {
	const response = await fetch(url, init);

	if (!response.ok) {
		throw new Error(`Fetch failed with status ${response.status}`);
	}

	return (await response.json()) as T;
};
