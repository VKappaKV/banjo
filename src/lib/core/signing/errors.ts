export const signingErrorCodes = {
	userRejected: 4001,
	tooManyTransactions: 4201,
	invalidRequest: 4300,
	invalidSignDataScope: 4600,
	failedSignDataDecoding: 4602,
	invalidSignDataSigner: 4603,
	badSignDataJson: 4609,
	failedDomainAuthentication: 4610,
} as const;

export class SigningError extends Error {
	constructor(
		message: string,
		public readonly code: number = signingErrorCodes.invalidRequest,
		public readonly data?: unknown,
	) {
		super(message);
		this.name = "SigningError";
	}
}

export function toSigningError(error: unknown): SigningError {
	if (error instanceof SigningError) {
		return error;
	}

	if (error instanceof Error) {
		const errorWithMetadata = error as Error & { code?: unknown; cause?: unknown };
		const code = typeof errorWithMetadata.code === "number"
			? errorWithMetadata.code
			: typeof errorWithMetadata.cause === "number"
				? errorWithMetadata.cause
				: signingErrorCodes.invalidRequest;

		return new SigningError(error.message, code);
	}

	return new SigningError("Invalid Request", signingErrorCodes.invalidRequest, error);
}
