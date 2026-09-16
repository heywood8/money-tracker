#!/usr/bin/env node
/**
 * Reports the DEX size and obfuscation coverage of a built APK, the two numbers
 * Google Play's code-optimization requirement turns on from February 2027.
 *
 * Play's rule: an app whose DEX exceeds 10 MB must show at least 25% coverage
 * for optimization, shrinking AND obfuscation. Below 10 MB the rule does not
 * apply at all. Penny is above the threshold, so the margin is worth watching
 * on every release rather than discovering it in the Play Console.
 *
 * What this measures, and what it does not: Play derives its own percentages
 * from the `r8.json` that AGP 8.10+ emits, across all three axes. This script
 * reads the DEX itself and reports obfuscation only, by walking each dex file's
 * class_defs table and counting how many defined classes R8 renamed. The number
 * it prints is therefore an approximation of one of Play's three axes -- useful
 * as a regression guard and for comparing two builds, not as the compliance
 * verdict. The App Bundle Explorer in the Play Console remains the source of
 * truth.
 *
 * Usage: node scripts/check-dex-optimization.js <path-to.apk> [--json]
 */

const fs = require('fs');
const { execFileSync } = require('child_process');
const os = require('os');
const path = require('path');

// Play's thresholds, from the Play Console technical quality requirements.
const DEX_LIMIT_BYTES = 10 * 1000 * 1000;
const COVERAGE_FLOOR_PCT = 25;

/** Reads a uleb128 at `off`, returning the value and the offset past it. */
const readUleb = (buf, off) => {
  let result = 0;
  let shift = 0;
  let byte;
  do {
    byte = buf[off++];
    result |= (byte & 0x7f) << shift;
    shift += 7;
  } while (byte & 0x80);
  return [result, off];
};

/**
 * Fully-qualified names of the classes DEFINED in one dex file.
 *
 * Walks class_defs rather than type_ids on purpose: type_ids also lists every
 * type the dex merely REFERENCES, including platform classes like java.lang.*
 * that R8 could never rename. Counting those would pad the denominator with
 * classes that are not the app's to obfuscate and flatter the result.
 *
 * Offsets are the fixed fields of the DEX header (see the Dalvik executable
 * format): string_ids at 56/60, type_ids at 64/68, class_defs at 96/100.
 * Each class_def_item is 32 bytes and opens with its class_idx.
 */
const definedClasses = (file) => {
  const buf = fs.readFileSync(file);
  const stringIdsOff = buf.readUInt32LE(60);
  const typeIdsOff = buf.readUInt32LE(68);
  const classDefsSize = buf.readUInt32LE(96);
  const classDefsOff = buf.readUInt32LE(100);

  const string = (index) => {
    const off = buf.readUInt32LE(stringIdsOff + index * 4);
    // The uleb128 prefix is utf16_size -- the number of UTF-16 code units, NOT
    // a byte count. Slicing that many BYTES truncates any non-ASCII descriptor
    // mid-character. The payload is MUTF-8 and NUL-terminated, so the
    // terminator is what actually delimits it.
    const [, start] = readUleb(buf, off);
    const end = buf.indexOf(0, start);
    return buf.toString('utf8', start, end === -1 ? buf.length : end);
  };
  const typeName = (index) => string(buf.readUInt32LE(typeIdsOff + index * 4));

  const names = [];
  for (let i = 0; i < classDefsSize; i++) {
    const descriptor = typeName(buf.readUInt32LE(classDefsOff + i * 32));
    // Class descriptors are "Lcom/example/Foo;". Anything else is an array or
    // a primitive, neither of which is a class definition.
    if (!descriptor.startsWith('L') || !descriptor.endsWith(';')) continue;
    names.push(descriptor.slice(1, -1).replace(/\//g, '.'));
  }
  return names;
};

// R8 renames to the shortest identifiers it can, so a segment it generated is
// one or two characters. A class counts as renamed only when EVERY segment of
// its name looks generated -- a package R8 left alone is a package it did not
// obfuscate, however short the leaf happens to be.
const isGeneratedSegment = (segment) => /^[a-zA-Z$_][a-zA-Z0-9$_]?$/.test(segment);
const isRenamed = (name) => name.split('.').every(isGeneratedSegment);

const main = () => {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const apk = args.find((a) => !a.startsWith('--'));

  if (!apk) {
    console.error('Usage: node scripts/check-dex-optimization.js <path-to.apk> [--json]');
    return 2;
  }
  if (!fs.existsSync(apk)) {
    console.error(`No such file: ${apk}`);
    return 2;
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'penny-dex-'));
  // Exit code, resolved inside the try and acted on in `finally`. Calling
  // process.exit() from the try would skip the cleanup entirely and strand
  // ~14 MB of extracted DEX in the temp dir on every run.
  let exitCode = 0;
  try {
    try {
      execFileSync('unzip', ['-o', '-q', apk, 'classes*.dex', '-d', workDir], {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
    } catch (error) {
      // unzip exits 11 when the archive contains nothing matching the pattern,
      // and ENOENT when the binary is missing. Neither is "coverage below the
      // floor", so neither may exit 1 -- a CI gate could not tell them apart.
      const reason =
        error.code === 'ENOENT'
          ? 'the `unzip` binary is not on PATH'
          : error.status === 11
            ? `no classes*.dex inside ${apk} -- is it really an APK?`
            : `unzip failed (exit ${error.status}): ${String(error.stderr || '').trim()}`;
      console.error(`Cannot read ${apk}: ${reason}`);
      return 2;
    }

    const dexFiles = fs
      .readdirSync(workDir)
      .filter((f) => f.endsWith('.dex'))
      .map((f) => path.join(workDir, f));

    if (dexFiles.length === 0) {
      console.error(`No classes*.dex found in ${apk} -- is it an APK?`);
      return 2;
    }

    const dexBytes = dexFiles.reduce((sum, f) => sum + fs.statSync(f).size, 0);
    const classes = dexFiles.flatMap(definedClasses);
    const renamed = classes.filter(isRenamed);
    const coveragePct = (100 * renamed.length) / classes.length;

    // Which packages the un-renamed classes sit in is the actionable half of
    // this report: a package near the top of the list is one some -keep rule is
    // pinning, and the rules are where the coverage is won back.
    const byPackage = new Map();
    for (const name of classes) {
      if (isRenamed(name)) continue;
      const pkg = name.split('.').slice(0, 3).join('.');
      byPackage.set(pkg, (byPackage.get(pkg) || 0) + 1);
    }
    const topPackages = [...byPackage.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([pkg, count]) => ({ package: pkg, classes: count }));

    const applies = dexBytes > DEX_LIMIT_BYTES;
    const compliant = !applies || coveragePct >= COVERAGE_FLOOR_PCT;

    if (asJson) {
      console.log(
        JSON.stringify(
          {
            apk,
            dexBytes,
            dexFiles: dexFiles.length,
            classesDefined: classes.length,
            classesRenamed: renamed.length,
            obfuscationPct: Number(coveragePct.toFixed(1)),
            requirementApplies: applies,
            compliant,
            topUnobfuscatedPackages: topPackages,
          },
          null,
          2,
        ),
      );
    } else {
      const mb = (dexBytes / 1e6).toFixed(2);
      console.log(`APK              : ${apk}`);
      console.log(`DEX              : ${mb} MB across ${dexFiles.length} file(s)`);
      console.log(
        `Play requirement : ${applies ? 'APPLIES' : 'does not apply'} ` +
          `(threshold ${DEX_LIMIT_BYTES / 1e6} MB for apps)`,
      );
      console.log(`Classes defined  : ${classes.length}`);
      console.log(
        `Obfuscated       : ${renamed.length} (${coveragePct.toFixed(1)}%, floor ${COVERAGE_FLOOR_PCT}%)`,
      );
      console.log('\nLargest un-obfuscated packages (candidates for narrowing a -keep rule):');
      for (const { package: pkg, classes: count } of topPackages) {
        console.log(`  ${String(count).padStart(5)}  ${pkg}`);
      }
      console.log(
        `\nVerdict: ${compliant ? 'above the floor' : 'BELOW THE FLOOR'}. ` +
          'Play computes its own figure from r8.json; confirm in the App Bundle Explorer.',
      );
    }

    // A non-zero exit only when the requirement applies AND we are under it, so
    // a CI step can gate on this without failing builds the rule never covers.
    // Anything that went wrong reading the APK returned 2 above, keeping "we
    // could not measure" distinguishable from "we measured, and it is short".
    return compliant ? 0 : 1;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
};

process.exit(main());
