import type { CredentialProvider } from "../runtime";

export class MockCredentialProvider implements CredentialProvider {
	lastCreateOptions?: CredentialCreationOptions;
	lastGetOptions?: CredentialRequestOptions;
	credentialId = "mock-credential-id";
	prf = new Uint8Array(32).fill(7);

	async getCredential(options?: CredentialRequestOptions): Promise<Credential | null> {
		this.lastGetOptions = options;

		return this.createPublicKeyCredential();
	}

	async createCredential(options?: CredentialCreationOptions): Promise<Credential | null> {
		this.lastCreateOptions = options;

		return this.createPublicKeyCredential();
	}

	private createPublicKeyCredential(): PublicKeyCredential {
		return {
			id: this.credentialId,
			type: "public-key",
			rawId: new TextEncoder().encode(this.credentialId).buffer,
			getClientExtensionResults: () => ({ prf: { results: { first: this.prf.buffer } } }),
		} as PublicKeyCredential;
	}
}
