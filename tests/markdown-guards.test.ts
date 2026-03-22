import test from 'node:test';
import assert from 'node:assert/strict';

import { __test__ } from '../src/services/urlParser.ts';

const { stripMarkdownLinks } = __test__;

test('strips a normal markdown link before bare-url detection', () => {
  const input = 'Read [this article](https://example.com/docs) and then visit https://example.com/help';
  const output = stripMarkdownLinks(input);

  assert.equal(output, 'Read  and then visit https://example.com/help');
});

test('treats escaped brackets in markdown link text as part of the link', () => {
  const input = 'Check [docs with \\[brackets\\]](https://example.com/docs) and continue';
  const output = stripMarkdownLinks(input);

  assert.equal(output, 'Check  and continue');
});

test('treats an escaped closing parenthesis in the destination url as part of the link', () => {
  const input = 'Review [spec](https://example.com/path\\)) before shipping';
  const output = stripMarkdownLinks(input);

  assert.equal(output, 'Review  before shipping');
});

test('preserves nearby plain text after stripping markdown links', () => {
  const input = 'A [first](https://one.example) middle [second](https://two.example) tail';
  const output = stripMarkdownLinks(input);

  assert.equal(output, 'A  middle  tail');
});
