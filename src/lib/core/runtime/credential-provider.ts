export interface CredentialProvider {
	getCredential(options?: CredentialRequestOptions): Promise<Credential | null>;
	createCredential(options?: CredentialCreationOptions): Promise<Credential | null>;
}
