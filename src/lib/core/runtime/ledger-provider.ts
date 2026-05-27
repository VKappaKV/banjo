export type LedgerTransportKind = "hid" | "usb";

export interface LedgerDeviceInfo {
	vendorId: number;
	productId?: number;
	productName?: string;
}

export interface LedgerAccountAddress {
	address: string;
	publicKey?: Uint8Array;
}

export interface LedgerProvider {
	listLedgerDevices(transport?: LedgerTransportKind): Promise<LedgerDeviceInfo[]>;
	requestLedgerDevice?(transport?: LedgerTransportKind): Promise<LedgerDeviceInfo>;
	getAddressAndPublicKey?(slot: number): Promise<LedgerAccountAddress>;
	signTransaction?(slot: number, transactionBytes: Uint8Array): Promise<Uint8Array>;
	close?(): Promise<void>;
}
