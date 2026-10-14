import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Validate the deliberately overridden native dependency through Miniflare's
// actual resolution path, including Linux CI. Never process customer images.
const fromWrangler = createRequire(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const fromMiniflare = createRequire(fromWrangler.resolve('miniflare'));
const sharp = fromMiniflare('sharp');
assert.equal(sharp.versions.sharp, '0.35.5');
const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'green' } }).png().toBuffer();
assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
console.log('Patched Miniflare image tooling resolves and produces a synthetic PNG.');
