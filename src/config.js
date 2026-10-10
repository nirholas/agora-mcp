// Centralized env for the Agora MCP.
//
// Agora is the living agent + human economy (docs/agora.md): citizens with a
// profession and a reputation post work, do it, and earn $THREE. This server has
// two surfaces:
//   • READS over the PUBLIC three.ws Agora API (/api/agora/*) — the board, the
//     pulse, the population, a citizen's passport, the profession bit map. No key.
//   • WRITES that perform REAL on-chain AgenC actions (register / claim / complete
//     / post a bounty) signed by the CALLER'S own Solana key. The signing key never
//     leaves this process — it is never logged, stored, or transmitted; the only
//     knobs are which cluster/RPC to sign against and (optionally) a default key.
//
// Every citizen, job, and pulse comes from the live endpoints; nothing is
// computed or cached here.

export function env(key, fallback) {
	const v = process.env[key];
	return v !== undefined && String(v).trim() !== '' ? String(v).trim() : fallback;
}

// Base URL of the three.ws API. Override only when self-hosting or pointing at a
// preview deployment.
export const THREE_WS_BASE = env('THREE_WS_BASE', 'https://three.ws').replace(/\/+$/, '');

// Per-request timeout (ms). These are live reads — the Agora bridge fans out to a
// Solana RPC to reconcile a citizen's on-chain state, so give it room to ride out
// a cold edge while staying fast in practice.
export const HTTP_TIMEOUT_MS = (() => {
	const raw = env('THREE_WS_TIMEOUT_MS');
	if (raw === undefined) return 20000;
	const n = Number(raw);
	if (!Number.isFinite(n) || n <= 0) {
		throw Object.assign(new Error(`THREE_WS_TIMEOUT_MS must be a positive number (got "${raw}")`), {
			code: 'bad_config',
		});
	}
	return n;
})();

// Default cluster for the write tools. devnet settles in native SOL (synthetic
// plumbing — never another real token); mainnet escrows in the $THREE mint. A
// per-call `cluster` argument overrides this.
export const DEFAULT_CLUSTER = (() => {
	const raw = env('AGORA_CLUSTER', 'devnet').toLowerCase();
	if (raw !== 'devnet' && raw !== 'mainnet') {
		throw Object.assign(new Error(`AGORA_CLUSTER must be "devnet" or "mainnet" (got "${raw}")`), {
			code: 'bad_config',
		});
	}
	return raw;
})();

// Default signer for the write tools, as a base58-encoded 64-byte secret key. A
// per-call `secret` argument overrides this. We never bake in a key: it is the
// caller's responsibility to supply one. Reads need none.
export const DEFAULT_SECRET = env('AGORA_SECRET_KEY', '');

// Optional RPC override for the write tools. Empty → the SDK picks the public RPC
// for the selected cluster.
export const RPC_URL = env('AGORA_RPC_URL', '');

// The only coin Agora denominates in. Surfaced so write tools that escrow a
// mainnet bounty default to the canonical $THREE mint without the caller having to
// paste it. Devnet plumbing uses native SOL, never another real token.
export const THREE_MINT = 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';

// Identifies this client to the API in request logs.
export const USER_AGENT = '@three-ws/agora-mcp';
