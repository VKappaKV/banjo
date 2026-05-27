import type { LedgerDeviceInfo, LedgerProvider } from "../runtime";

export class MockLedgerProvider implements LedgerProvider {
	devices: LedgerDeviceInfo[] = [{ vendorId: 1, productName: "Mock Ledger" }];
	addresses = new Map<number, string>();
	signature = new Uint8Array(64).fill(9);
	rejectMessage?: string;
	closed = false;

	async listLedgerDevices(): Promise<LedgerDeviceInfo[]> {
		return this.devices;
	}

	async getAddressAndPublicKey(slot: number): Promise<{ address: string; publicKey?: Uint8Array }> {
		const address = this.addresses.get(slot);

		if (!address) {
			throw new Error(`Missing mock ledger address for slot ${slot}`);
		}

		return { address };
	}

	async signTransaction(): Promise<Uint8Array> {
		if (this.rejectMessage) {
			throw new Error(this.rejectMessage);
		}

		return this.signature;
	}

	async signData(): Promise<Uint8Array> {
		if (this.rejectMessage) {
			throw new Error(this.rejectMessage);
		}

		return this.signature;
	}

	async close(): Promise<void> {
		this.closed = true;
	}
}
