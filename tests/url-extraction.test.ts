import test from 'node:test';
import assert from 'node:assert/strict';

import { GetUrlsFromString, isMarkdownUrl } from '../src/utils/url.ts';

test('extracts urls with modern long tlds', () => {
  assert.deepEqual(
    GetUrlsFromString('Read more at https://example.systems/docs'),
    ['https://example.systems/docs']
  );
});

test('trims trailing sentence punctuation without touching url content', () => {
  assert.deepEqual(
    GetUrlsFromString('See https://example.com/path?query=1, then continue.'),
    ['https://example.com/path?query=1']
  );
});

test('preserves balanced parentheses inside a url', () => {
  assert.deepEqual(
    GetUrlsFromString('Reference https://en.wikipedia.org/wiki/Function_(mathematics) for details'),
    ['https://en.wikipedia.org/wiki/Function_(mathematics)']
  );
});

test('trims unmatched trailing right parentheses after a url', () => {
  assert.deepEqual(
    GetUrlsFromString('Reference https://en.wikipedia.org/wiki/Function_(mathematics)).'),
    ['https://en.wikipedia.org/wiki/Function_(mathematics)']
  );
});

test('recognizes existing markdown urls so they are not re-extracted', () => {
  assert.equal(isMarkdownUrl('[Example](https://example.com)'), true);
  assert.equal(isMarkdownUrl('https://example.com'), false);
});
