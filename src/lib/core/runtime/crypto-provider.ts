export interface CryptoProvider {
	supportsNonExtractableEd25519(): Promise<boolean>;
	readonly subtle?: SubtleCrypto;
}
