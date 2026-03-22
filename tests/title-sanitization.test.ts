import test from 'node:test';
import assert from 'node:assert/strict';

import { __test__ } from '../src/services/urlParser';

test('normalizes a single leading bracket label', () => {
  assert.equal(
    __test__.sanitizeRoamMarkdownLinkText('[Bug] Fix crash on startup'),
    'Bug: Fix crash on startup',
  );
});

test('normalizes multiple leading bracket labels into a readable prefix', () => {
  assert.equal(
    __test__.sanitizeRoamMarkdownLinkText('[Docs] [Guide] Setting up the parser'),
    'Docs / Guide: Setting up the parser',
  );
});

test('converts remaining brackets to full-width characters for Roam markdown safety', () => {
  assert.equal(
    __test__.sanitizeRoamMarkdownLinkText('Release notes [2026] for [internal] use'),
    'Release notes ［2026］ for ［internal］ use',
  );
});

test('leaves a plain title unchanged', () => {
  assert.equal(
    __test__.sanitizeRoamMarkdownLinkText('A plain title without labels'),
    'A plain title without labels',
  );
});
