import { decodeAddress } from "algosdk";
import type { FetchJson } from "../runtime";

const ipfsGateway = "https://ipfs.algonode.dev/ipfs/";
const templateIpfsPattern =
	/template-ipfs:\/\/\{ipfscid:(?<version>[01]):(?<codec>[a-z0-9-]+):(?<field>[a-z0-9-]+):(?<hash>[a-z0-9-]+)\}/;
const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const base32Alphabet = "abcdefghijklmnopqrstuvwxyz234567";

interface Arc3Metadata {
	image?: unknown;
}

function stripFragment(url: string): string {
	const hashIndex = url.indexOf("#");

	return hashIndex === -1 ? url : url.slice(0, hashIndex);
}

function toGatewayUrl(url: string): string {
	if (!url.startsWith("ipfs://")) {
		return stripFragment(url);
	}

	return `${ipfsGateway}${stripFragment(url).slice("ipfs://".length)}`;
}

function resolveRelativeUrl(url: string, baseUrl: string): string {
	if (url.includes(":")) {
		return url;
	}

	const base = stripFragment(baseUrl);
	const index = base.lastIndexOf("/");

	return index === -1 ? url : `${base.slice(0, index + 1)}${url}`;
}

function base58Encode(bytes: Uint8Array): string {
	const digits = [0];

	for (const byte of bytes) {
		let carry = byte;

		for (let index = 0; index < digits.length; index += 1) {
			const value = digits[index] * 256 + carry;
			digits[index] = value % 58;
			carry = Math.floor(value / 58);
		}

		while (carry > 0) {
			digits.push(carry % 58);
			carry = Math.floor(carry / 58);
		}
	}

	for (const byte of bytes) {
		if (byte !== 0) {
			break;
		}

		digits.push(0);
	}

	return digits
		.reverse()
		.map((digit) => base58Alphabet[digit])
		.join("");
}

function base32Encode(bytes: Uint8Array): string {
	let bits = 0;
	let value = 0;
	let output = "";

	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;

		while (bits >= 5) {
			output += base32Alphabet[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}

	if (bits > 0) {
		output += base32Alphabet[(value << (5 - bits)) & 31];
	}

	return output;
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
	const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
	const output = new Uint8Array(length);
	let offset = 0;

	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.length;
	}

	return output;
}

function decodeReserveAddress(address: string): Uint8Array {
	const decoded = decodeAddress(address) as { publicKey?: Uint8Array; bytes?: Uint8Array };

	return decoded.publicKey ?? decoded.bytes ?? new Uint8Array();
}

function createIpfsCid(version: string, codec: string, field: string, hash: string, reserveAddress: string): string {
	if (field !== "reserve") {
		throw new Error("Unsupported template IPFS field");
	}

	if (hash !== "sha2-256") {
		throw new Error("Unsupported template IPFS hash");
	}

	const codecCode = codec === "dag-pb" ? 0x70 : codec === "raw" ? 0x55 : undefined;

	if (codecCode === undefined) {
		throw new Error("Unsupported template IPFS codec");
	}

	if (version === "0" && codec !== "dag-pb") {
		throw new Error("CID v0 requires dag-pb codec");
	}

	const reserveBytes = decodeReserveAddress(reserveAddress);

	if (reserveBytes.length !== 32) {
		throw new Error("Reserve address must decode to 32 bytes");
	}

	const multihash = concatBytes(new Uint8Array([0x12, 0x20]), reserveBytes);

	if (version === "0") {
		return base58Encode(multihash);
	}

	return `b${base32Encode(concatBytes(new Uint8Array([0x01, codecCode]), multihash))}`;
}

export function resolveTemplateIpfsUrl(url: string, reserveAddress: string): string {
	const match = templateIpfsPattern.exec(url);

	if (!match?.groups) {
		return url;
	}

	const cid = createIpfsCid(
		match.groups.version,
		match.groups.codec,
		match.groups.field,
		match.groups.hash,
		reserveAddress,
	);

	return url.replace(match[0], `ipfs://${cid}`);
}

export async function resolveAssetUrl(
	url: string | undefined,
	reserveAddress = "",
	fetchJson?: FetchJson,
): Promise<string | undefined> {
	if (!url) {
		return undefined;
	}

	const templateResolved = url.startsWith("template-ipfs://")
		? resolveTemplateIpfsUrl(url, reserveAddress)
		: url;

	if (!templateResolved.endsWith("#arc3")) {
		return toGatewayUrl(templateResolved);
	}

	const metadataUrl = toGatewayUrl(templateResolved.slice(0, -"#arc3".length));

	if (!fetchJson) {
		return metadataUrl;
	}

	const metadata = await fetchJson<Arc3Metadata>(metadataUrl);

	if (typeof metadata.image !== "string") {
		return metadataUrl;
	}

	return toGatewayUrl(resolveRelativeUrl(metadata.image, templateResolved));
}
