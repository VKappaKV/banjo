export type LedgerTransportKind = "hid" | "usb";

export interface LedgerDeviceInfo {
	vendorId: number;
	productId?: number;
	productName?: string;
}

export interface LedgerProvider {
	listLedgerDevices(transport?: LedgerTransportKind): Promise<LedgerDeviceInfo[]>;
	requestLedgerDevice?(transport?: LedgerTransportKind): Promise<LedgerDeviceInfo>;
}
