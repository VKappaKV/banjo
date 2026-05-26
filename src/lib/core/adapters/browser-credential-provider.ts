import type { CredentialProvider } from "../runtime";

export class BrowserCredentialProvider implements CredentialProvider {
	async getCredential(options?: CredentialRequestOptions): Promise<Credential | null> {
		return navigator.credentials.get(options);
	}

	async createCredential(options?: CredentialCreationOptions): Promise<Credential | null> {
		return navigator.credentials.create(options);
	}
}
