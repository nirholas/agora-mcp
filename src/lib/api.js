// Real HTTP access to the three.ws Agora API. No mocks, no fixtures — every call
// is a live request to THREE_WS_BASE. Errors are normalized into a single shape so
// tool handlers can surface a clean message + status to the MCP client.

import { THREE_WS_BASE, HTTP_TIMEOUT_MS, USER_AGENT } from '../config.js';

/**
 * Call a three.ws HTTP endpoint and return its parsed JSON body.
 *
 * @param {string} path  Endpoint path beginning with `/` (e.g. `/api/agora/board`).
 * @param {{ method?: string, query?: Record<string, unknown>, body?: unknown }} [opts]
 * @returns {Promise<any>} Parsed JSON response.
 * @throws {Error} with `.code` ('timeout' | 'network_error' | 'upstream_error'),
 *   and on upstream errors `.status` + `.body`.
 */
export async function apiRequest(path, { method = 'GET', query, body } = {}) {
	const url = new URL(`${THREE_WS_BASE}${path}`);
	if (query) {
		for (const [key, value] of Object.entries(query)) {
			if (value === undefined || value === null || value === '') continue;
			url.searchParams.set(key, String(value));
		}
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

	let res;
	try {
		res = await fetch(url, {
			method,
			headers: {
				accept: 'application/json',
				'user-agent': USER_AGENT,
				...(body !== undefined ? { 'content-type': 'application/json' } : {}),
			},
			body: body !== undefined ? JSON.stringify(body) : undefined,
			signal: controller.signal,
		});
	} catch (err) {
		clearTimeout(timer);
		if (err?.name === 'AbortError') {
			throw Object.assign(new Error(`three.ws ${path} timed out after ${HTTP_TIMEOUT_MS}ms`), {
				code: 'timeout',
			});
		}
		throw Object.assign(new Error(`three.ws ${path} request failed: ${err?.message || err}`), {
			code: 'network_error',
		});
	}
	clearTimeout(timer);

	const text = await res.text();
	let data;
	try {
		data = text ? JSON.parse(text) : {};
	} catch {
		data = { raw: text };
	}

	if (!res.ok) {
		// Only trust a STRING message/error from the body — a 404 from the edge (route
		// not deployed) carries an object/no body, which must not stringify to
		// "[object Object]". Fall back to a clear HTTP-status message.
		const fromBody =
			typeof data?.message === 'string'
				? data.message
				: typeof data?.error === 'string'
					? data.error
					: null;
		const message = fromBody || `three.ws ${path} returned HTTP ${res.status}`;
		throw Object.assign(new Error(message), { code: 'upstream_error', status: res.status, body: data });
	}
	return data;
}
