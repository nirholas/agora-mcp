// Input-validation invariants for @three-ws/agora-mcp.
//
// Each tool validates its inputs and throws a coded error BEFORE doing any network
// call or importing the write SDK or touching a signer. These tests exercise only
// those early-reject paths, so they are pure: no network, no chain, no key, no SDK
// build required. (The happy paths hit the live chain and are covered by the manual
// verification in the README / task doc.)
//
// Run: node --test packages/agora-mcp/test/validation.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { def as passport } from '../src/tools/passport.js';
import { def as register } from '../src/tools/register.js';
import { def as claimTask } from '../src/tools/claim-task.js';
import { def as completeTask } from '../src/tools/complete-task.js';
import { def as postTask } from '../src/tools/post-task.js';
import { resolveSigner, pickCluster } from '../src/lib/agenc.js';

async function expectReject(promise, code) {
	try {
		await promise;
		assert.fail(`expected rejection with code "${code}"`);
	} catch (err) {
		assert.equal(err?.code, code, `expected code "${code}", got "${err?.code}" (${err?.message})`);
	}
}

// ── read-tool validation ─────────────────────────────────────────────────────

test('agora_passport rejects when no selector is supplied', async () => {
	await expectReject(passport.handler({}), 'validation_error');
});

// ── signer / cluster helpers ─────────────────────────────────────────────────

test('pickCluster normalizes and rejects bad clusters', () => {
	assert.equal(pickCluster('devnet'), 'devnet');
	assert.equal(pickCluster('MAINNET'), 'mainnet');
	assert.throws(() => pickCluster('testnet'), (e) => e.code === 'validation_error');
});

test('resolveSigner requires a key and validates its shape', () => {
	// No key anywhere → no_signer (env default is empty in the test runner).
	assert.throws(() => resolveSigner(undefined), (e) => e.code === 'no_signer');
	// Not base58.
	assert.throws(() => resolveSigner('not valid base58 !!!'), (e) => e.code === 'invalid_secret');
	// Valid base58 but wrong length (1 byte → "1" decodes to a single zero byte).
	assert.throws(() => resolveSigner('1'), (e) => e.code === 'invalid_secret');
});

test('resolveSigner derives the public key from a 64-byte secret without logging it', () => {
	// Synthetic 64-byte secret: a base58 string of 64 zero bytes is "1" * 64.
	const secret = '1'.repeat(64);
	const { secretKey, pubkey } = resolveSigner(secret);
	assert.equal(secretKey.length, 64);
	assert.equal(typeof pubkey, 'string');
	assert.ok(pubkey.length > 0);
});

// ── write-tool validation (rejects before any SDK import / signing) ──────────

test('agora_register rejects when no identity is supplied', async () => {
	await expectReject(register.handler({ professions: ['fetcher'], secret: '1'.repeat(64) }), 'validation_error');
});

test('agora_register rejects a missing signer (identity present)', async () => {
	await expectReject(register.handler({ handle: 'my-bot' }), 'no_signer');
});

test('agora_claim_task requires a taskPda', async () => {
	await expectReject(claimTask.handler({ secret: '1'.repeat(64), handle: 'my-bot' }), 'validation_error');
});

test('agora_claim_task rejects a missing signer', async () => {
	await expectReject(claimTask.handler({ taskPda: 'Task1111111111111111111111111111111111111111', handle: 'my-bot' }), 'no_signer');
});

test('agora_claim_task requires a worker identity', async () => {
	// taskPda + signer present, but no workerAgentId and no identity → validation_error.
	await expectReject(
		claimTask.handler({ taskPda: 'Task1111111111111111111111111111111111111111', secret: '1'.repeat(64) }),
		'validation_error',
	);
});

test('agora_complete_task rejects a malformed proofHash', async () => {
	await expectReject(
		completeTask.handler({ taskPda: 'Task1111111111111111111111111111111111111111', proofHash: 'deadbeef', handle: 'me', secret: '1'.repeat(64) }),
		'validation_error',
	);
});

test('agora_complete_task accepts a 0x-prefixed 64-hex proof then needs a signer', async () => {
	// Valid proof shape but no signer → no_signer (proves proof parsing passed first).
	await expectReject(
		completeTask.handler({ taskPda: 'Task1111111111111111111111111111111111111111', proofHash: '0x' + 'a'.repeat(64), handle: 'me' }),
		'no_signer',
	);
});

test('agora_post_task requires a description', async () => {
	await expectReject(postTask.handler({ rewardAmount: '1000', handle: 'me', secret: '1'.repeat(64) }), 'validation_error');
});

test('agora_post_task rejects a past absolute deadline', async () => {
	await expectReject(
		postTask.handler({
			description: 'do a thing',
			rewardAmount: '1000',
			handle: 'me',
			secret: '1'.repeat(64),
			deadline: 1, // unix second 1 — firmly in the past
		}),
		'validation_error',
	);
});

test('agora_post_task rejects a missing signer', async () => {
	await expectReject(postTask.handler({ description: 'do a thing', rewardAmount: '1000', handle: 'me' }), 'no_signer');
});
