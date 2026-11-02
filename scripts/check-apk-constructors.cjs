#!/usr/bin/env node
'use strict';

// Read-only APK diagnostic. Dependencies: Node.js built-ins only.
// Usage: node check-apk-constructors.cjs --apk C:\absolute\path\app.apk
// Exit 0: all three no-argument constructors exist; 1: missing class/constructor; 2: invalid input.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const TARGETS = [
  'Landroidx/work/impl/WorkDatabase_Impl;',
  'Landroidx/work/ArrayCreatingInputMerger;',
  'Landroidx/work/OverwritingInputMerger;',
];

function assertRange(buffer, offset, length, label) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > buffer.length) {
    throw new Error(`Invalid ${label} range: offset=${offset}, length=${length}`);
  }
}

function dexEntries(apk) {
  let eocd = -1;
  for (let i = apk.length - 22; i >= Math.max(0, apk.length - 65557); i--) {
    if (apk.readUInt32LE(i) === 0x06054b50 && i + 22 + apk.readUInt16LE(i + 20) === apk.length) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP end-of-central-directory not found');
  if (apk.readUInt16LE(eocd + 4) || apk.readUInt16LE(eocd + 6)) throw new Error('Multi-disk ZIP is unsupported');
  const count = apk.readUInt16LE(eocd + 10);
  let cursor = apk.readUInt32LE(eocd + 16);
  if (count === 0xffff || cursor === 0xffffffff) throw new Error('ZIP64 APK is unsupported');
  const output = [];
  for (let i = 0; i < count; i++) {
    assertRange(apk, cursor, 46, 'central-directory header');
    if (apk.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid central-directory header');
    const flags = apk.readUInt16LE(cursor + 8);
    const method = apk.readUInt16LE(cursor + 10);
    const compressedSize = apk.readUInt32LE(cursor + 20);
    const uncompressedSize = apk.readUInt32LE(cursor + 24);
    const nameLength = apk.readUInt16LE(cursor + 28);
    const extraLength = apk.readUInt16LE(cursor + 30);
    const commentLength = apk.readUInt16LE(cursor + 32);
    const localOffset = apk.readUInt32LE(cursor + 42);
    assertRange(apk, cursor + 46, nameLength + extraLength + commentLength, 'central-directory data');
    const name = apk.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    if (/^classes\d*\.dex$/.test(name)) {
      if (flags & 1) throw new Error(`Encrypted DEX entry: ${name}`);
      if (![0, 8].includes(method)) throw new Error(`Unsupported ZIP method ${method}: ${name}`);
      if (uncompressedSize > 512 * 1024 * 1024) throw new Error(`DEX entry exceeds diagnostic size limit: ${name}`);
      assertRange(apk, localOffset, 30, 'local ZIP header');
      if (apk.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`Invalid local ZIP header: ${name}`);
      const dataOffset = localOffset + 30 + apk.readUInt16LE(localOffset + 26) + apk.readUInt16LE(localOffset + 28);
      assertRange(apk, dataOffset, compressedSize, 'compressed DEX data');
      const compressed = apk.subarray(dataOffset, dataOffset + compressedSize);
      const bytes = method === 8 ? zlib.inflateRawSync(compressed, { maxOutputLength: 512 * 1024 * 1024 }) : compressed;
      if (bytes.length !== uncompressedSize) throw new Error(`DEX size mismatch: ${name}`);
      output.push({ name, bytes });
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (!output.length) throw new Error('No classes*.dex entries found in APK');
  return output;
}

function inspectDex(dex, filename) {
  assertRange(dex, 0, 112, 'DEX header');
  if (dex.toString('ascii', 0, 4) !== 'dex\n') throw new Error(`Invalid DEX magic: ${filename}`);
  if (dex.readUInt32LE(40) !== 0x12345678) throw new Error(`Unsupported DEX endianness: ${filename}`);
  const u32 = offset => { assertRange(dex, offset, 4, 'DEX uint32'); return dex.readUInt32LE(offset); };
  const stringsSize = u32(56), stringsOffset = u32(60);
  const typesSize = u32(64), typesOffset = u32(68);
  const protosSize = u32(72), protosOffset = u32(76);
  const methodsSize = u32(88), methodsOffset = u32(92);
  const classesSize = u32(96), classesOffset = u32(100);
  assertRange(dex, stringsOffset, stringsSize * 4, 'DEX string IDs');
  assertRange(dex, typesOffset, typesSize * 4, 'DEX type IDs');
  assertRange(dex, protosOffset, protosSize * 12, 'DEX prototype IDs');
  assertRange(dex, methodsOffset, methodsSize * 8, 'DEX method IDs');
  assertRange(dex, classesOffset, classesSize * 32, 'DEX class definitions');
  function uleb(offset) {
    let value = 0;
    for (let shift = 0; shift < 35; shift += 7) {
      assertRange(dex, offset, 1, 'DEX ULEB128');
      const byte = dex[offset++];
      value |= (byte & 0x7f) << shift;
      if (!(byte & 0x80)) return [value >>> 0, offset];
    }
    throw new Error('Invalid DEX ULEB128 encoding');
  }
  const strings = new Map();
  function stringAt(index) {
    if (index >= stringsSize) throw new Error(`Invalid DEX string index ${index}`);
    if (strings.has(index)) return strings.get(index);
    const offset = uleb(u32(stringsOffset + 4 * index))[1];
    const end = dex.indexOf(0, offset);
    if (end < 0) throw new Error('Unterminated DEX string');
    // Target class descriptors and method names are ASCII, so standard UTF-8 is sufficient here.
    const text = dex.toString('utf8', offset, end);
    strings.set(index, text);
    return text;
  }
  function typeAt(index) {
    if (index >= typesSize) throw new Error(`Invalid DEX type index ${index}`);
    return stringAt(u32(typesOffset + 4 * index));
  }
  const findings = [];
  for (let index = 0; index < classesSize; index++) {
    const offset = classesOffset + index * 32;
    const descriptor = typeAt(u32(offset));
    if (!TARGETS.includes(descriptor)) continue;
    let cursor = u32(offset + 24);
    const methods = [];
    const constructorParameterCounts = [];
    const hasClassData = cursor !== 0;
    if (hasClassData) {
      const sizes = [];
      for (let i = 0; i < 4; i++) {
        const decoded = uleb(cursor);
        sizes.push(decoded[0]); cursor = decoded[1];
      }
      for (let i = 0; i < sizes[0] + sizes[1]; i++) {
        cursor = uleb(cursor)[1]; // field_idx_diff
        cursor = uleb(cursor)[1]; // access_flags
      }
      for (const size of sizes.slice(2)) {
        let methodIndex = 0; // DEX index deltas reset for direct and virtual method lists.
        for (let i = 0; i < size; i++) {
          const decoded = uleb(cursor);
          methodIndex += decoded[0]; cursor = decoded[1];
          cursor = uleb(cursor)[1]; // access_flags
          cursor = uleb(cursor)[1]; // code_off
          if (methodIndex >= methodsSize) throw new Error(`Invalid method index in ${descriptor}`);
          const methodOffset = methodsOffset + methodIndex * 8;
          const name = stringAt(u32(methodOffset + 4));
          methods.push(name);
          if (name === '<init>') {
            const prototypeIndex = dex.readUInt16LE(methodOffset + 2);
            if (prototypeIndex >= protosSize) throw new Error('Invalid DEX prototype index');
            const parametersOffset = u32(protosOffset + prototypeIndex * 12 + 8);
            constructorParameterCounts.push(parametersOffset === 0 ? 0 : u32(parametersOffset));
          }
        }
      }
    }
    findings.push({ descriptor, dex: filename, hasClassData, methods, constructorParameterCounts, hasConstructor: methods.includes('<init>'), hasNoArgConstructor: constructorParameterCounts.includes(0) });
  }
  return findings;
}

function checkApk(filename) {
  if (!path.isAbsolute(filename)) throw new Error('--apk must be an absolute filesystem path');
  const apk = fs.readFileSync(filename);
  const entries = dexEntries(apk);
  const findings = entries.flatMap(entry => inspectDex(entry.bytes, entry.name));
  console.log(`APK: ${filename}`);
  console.log(`SHA256: ${crypto.createHash('sha256').update(apk).digest('hex')}`);
  console.log(`DEX files inspected: ${entries.map(entry => entry.name).join(', ')}`);
  let passed = true;
  for (const descriptor of TARGETS) {
    const matches = findings.filter(finding => finding.descriptor === descriptor);
    if (matches.length !== 1) {
      console.log(`FAIL ${descriptor}: expected one class definition, found ${matches.length}`);
      passed = false;
      continue;
    }
    const finding = matches[0];
    console.log(`${finding.hasNoArgConstructor ? 'PASS' : 'FAIL'} ${descriptor} in ${finding.dex}: <init> ${finding.hasConstructor ? 'PRESENT' : 'ABSENT'}; no-arg <init>() ${finding.hasNoArgConstructor ? 'PRESENT' : 'ABSENT'}; class_data ${finding.hasClassData ? 'present' : 'absent'}; defined methods=${JSON.stringify(finding.methods)}; constructor parameter counts=${JSON.stringify(finding.constructorParameterCounts)}`);
    if (!finding.hasNoArgConstructor) passed = false;
  }
  console.log(passed ? 'PASS: all three reflectively created WorkManager/Room classes retain a no-argument constructor.' : 'FAIL: required WorkManager/Room no-argument constructors are missing. This supports an R8 stripping diagnosis; correlate with device AndroidRuntime crash logs.');
  return passed;
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== '--apk') throw new Error('Usage: node check-apk-constructors.cjs --apk C:\\absolute\\path\\app.apk');
    process.exitCode = checkApk(args[1]) ? 0 : 1;
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 2;
  }
}

module.exports = { checkApk, dexEntries, inspectDex, TARGETS };
