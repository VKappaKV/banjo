import type { CryptoProvider } from "../runtime";

export class BrowserCryptoProvider implements CryptoProvider {
	readonly subtle = globalThis.crypto?.subtle;

	async supportsNonExtractableEd25519(): Promise<boolean> {
		try {
			await globalThis.crypto.subtle.generateKey({ name: "Ed25519" }, false, ["sign"]);
			return true;
		} catch {
			return false;
		}
	}
}
