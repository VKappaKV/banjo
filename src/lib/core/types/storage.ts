export interface SeedData {
	id: number;
	data?: ArrayBuffer;
	iv?: Uint8Array;
	salt?: Uint8Array;
	credentialId?: string;
}
