export interface FetchJson {
	<T = unknown>(url: string, init?: RequestInit): Promise<T>;
}
