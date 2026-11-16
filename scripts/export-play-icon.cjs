#!/usr/bin/env node
'use strict';

// Export the existing artwork, without cropping, padding, masking, or redesign.
// Google Play: 512 x 512, 32-bit sRGB PNG, at most 1024 KB.
// https://developer.android.com/distribute/google-play/resources/icon-design-specifications
const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(path.dirname(module.filename), '..');
const pngjs = path.join(root, 'node_modules/.pnpm/pngjs@3.4.0/node_modules/pngjs');
const { PNG } = require(pngjs);
const Crc = require(path.join(pngjs, 'lib/crc'));
const sourcePath = path.join(root, 'assets/icon.png');
const outputPath = path.join(root, 'store-assets/google-play-icon.png');
const source = PNG.sync.read(fs.readFileSync(sourcePath));
assert.equal(source.width, 1024, 'Expected the existing 1024px app icon');
assert.equal(source.height, 1024, 'Expected square artwork');
const output = new PNG({ width: 512, height: 512 });

// Average each 2 x 2 source block. Premultiply alpha to preserve edge colors.
for (let y = 0; y < output.height; y++) {
  for (let x = 0; x < output.width; x++) {
    const channels = [0, 0, 0];
    let alpha = 0;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const index = ((y * 2 + dy) * source.width + x * 2 + dx) * 4;
        const sampleAlpha = source.data[index + 3];
        alpha += sampleAlpha;
        for (let c = 0; c < 3; c++) channels[c] += source.data[index + c] * sampleAlpha;
      }
    }
    const index = (y * output.width + x) * 4;
    for (let c = 0; c < 3; c++) output.data[index + c] = alpha ? Math.round(channels[c] / alpha) : 0;
    output.data[index + 3] = Math.round(alpha / 4);
  }
}

const encoded = PNG.sync.write(output, { colorType: 6, inputColorType: 6, bitDepth: 8 });
// pngjs does not emit an sRGB chunk. Add the standard perceptual-rendering tag.
const srgb = Buffer.alloc(13);
srgb.writeUInt32BE(1, 0);
srgb.write('sRGB', 4, 'ascii');
srgb.writeInt32BE(Crc.crc32(srgb.subarray(4, 9)), 9);
const bytes = Buffer.concat([encoded.subarray(0, 33), srgb, encoded.subarray(33)]);
const verified = PNG.sync.read(bytes);
assert.equal(verified.width, 512);
assert.equal(verified.height, 512);
assert.equal(bytes[24], 8, 'PNG must have 8 bits per channel');
assert.equal(bytes[25], 6, 'PNG must have RGBA channels');
assert.ok(bytes.length <= 1024 * 1024, 'PNG exceeds the Google Play size limit');
assert.deepEqual(verified.data, output.data, 'PNG round-trip must preserve pixels');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, bytes);
console.log(`Exported ${outputPath}: 512 x 512, 32-bit sRGB RGBA PNG, ${bytes.length} bytes`);
