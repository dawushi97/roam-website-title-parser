import test from 'node:test';
import assert from 'node:assert/strict';

import { __test__ } from '../src/services/urlParser.ts';

const REDDIT_URL = 'https://www.reddit.com/r/neovim/comments/1s71eph/0120/';

test('uses Reddit oEmbed for Reddit post titles', async () => {
  const originalFetch = globalThis.fetch;
  const originalDOMParser = globalThis.DOMParser;
  let fetchCalls = 0;

  globalThis.fetch = (async (input: string | URL | Request) => {
    fetchCalls += 1;
    const requestUrl = String(input);

    assert.match(requestUrl, /reddit\.com\/oembed\?url=/);

    return new Response(JSON.stringify({ title: '0.12.0' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const title = await __test__.resolveWebsiteTitle(REDDIT_URL);

    assert.equal(title, '0.12.0');
    assert.equal(fetchCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.DOMParser = originalDOMParser;
  }
});

test('falls back to generic parsing when Reddit oEmbed is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  const originalDOMParser = globalThis.DOMParser;
  const fetchCalls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const requestUrl = String(input);
    fetchCalls.push(requestUrl);

    if (requestUrl.includes('/oembed?url=')) {
      return new Response('blocked', { status: 403 });
    }

    return new Response('<html><head><title>Fallback Reddit Title</title></head></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  }) as typeof fetch;

  globalThis.DOMParser = class {
    parseFromString() {
      return {
        querySelector(selector: string) {
          if (selector === 'title') {
            return { textContent: 'Fallback Reddit Title' };
          }

          return null;
        },
      };
    }
  } as typeof DOMParser;

  try {
    const title = await __test__.resolveWebsiteTitle(REDDIT_URL);

    assert.equal(title, 'Fallback Reddit Title');
    assert.equal(fetchCalls.length, 2);
    assert.match(fetchCalls[0], /reddit\.com\/oembed\?url=/);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.DOMParser = originalDOMParser;
  }
});
