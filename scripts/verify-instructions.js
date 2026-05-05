#!/usr/bin/env node
/**
 * verify-instructions.js — Instruction & Skill File Integrity Checker
 *
 * Computes SHA-256 checksums for all .github/instructions/ and .github/skills/
 * files. Can operate in two modes:
 *
 *   1. --generate  : Write checksums to .github/.instruction-checksums.json
 *   2. --verify    : Compare current files against stored checksums (default)
 *
 * Exit codes:
 *   0 — all files match (or checksums generated)
 *   1 — mismatch detected (files modified since last --generate)
 *   2 — no stored checksums found (run --generate first)
 *
 * Intended for use in pre-push hooks and CI pipelines.
 *
 * Mitigates: T-1 (instruction file poisoning), E-2 (capability escalation
 * via instruction modification), RC-3 (instruction file integrity).
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECKSUM_FILE = join(REPO_ROOT, '.github', '.instruction-checksums.json');

const SCAN_DIRS = [
  join(REPO_ROOT, '.github', 'instructions'),
  join(REPO_ROOT, '.github', 'skills'),
  join(REPO_ROOT, '.github', 'copilot-instructions.md'),
];

const EXTENSIONS = new Set(['.md', '.yaml', '.yml']);

async function collectFiles(dirPath) {
  const files = [];
  try {
    const s = await stat(dirPath);
    if (s.isFile()) {
      files.push(dirPath);
      return files;
    }
  } catch {
    return files; // path doesn't exist
  }

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')))) {
        files.push(full);
      }
    }
  }
  await walk(dirPath);
  return files;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function computeChecksums() {
  const allFiles = [];
  for (const dir of SCAN_DIRS) {
    allFiles.push(...await collectFiles(dir));
  }
  allFiles.sort();

  const checksums = {};
  for (const filePath of allFiles) {
    // Always store POSIX-style forward-slash paths so manifest is stable across OSes.
    const relPath = relative(REPO_ROOT, filePath).split(/[\\/]/g).join('/');
    // Normalize CRLF -> LF before hashing so checksums match regardless of the
    // checkout platform's line-ending policy (Windows core.autocrlf).
    const raw = await readFile(filePath, 'utf-8');
    const normalized = raw.replace(/\r\n/g, '\n');
    checksums[relPath] = sha256(Buffer.from(normalized, 'utf-8'));
  }
  return checksums;
}

async function generate() {
  const checksums = await computeChecksums();
  const count = Object.keys(checksums).length;
  await writeFile(CHECKSUM_FILE, JSON.stringify(checksums, null, 2) + '\n', 'utf-8');
  console.log(`✅ Generated checksums for ${count} instruction/skill files.`);
  console.log(`   Stored at: ${relative(REPO_ROOT, CHECKSUM_FILE)}`);
  return 0;
}

async function verify() {
  let stored;
  try {
    stored = JSON.parse(await readFile(CHECKSUM_FILE, 'utf-8'));
  } catch {
    console.error('❌ No stored checksums found. Run with --generate first:');
    console.error('   node scripts/verify-instructions.js --generate');
    return 2;
  }

  const current = await computeChecksums();
  const issues = [];

  // Check for modified or deleted files
  for (const [path, hash] of Object.entries(stored)) {
    if (!(path in current)) {
      issues.push({ path, type: 'deleted' });
    } else if (current[path] !== hash) {
      issues.push({ path, type: 'modified' });
    }
  }

  // Check for new files not in baseline
  for (const path of Object.keys(current)) {
    if (!(path in stored)) {
      issues.push({ path, type: 'added' });
    }
  }

  if (issues.length === 0) {
    console.log(`✅ All ${Object.keys(stored).length} instruction/skill files match stored checksums.`);
    return 0;
  }

  console.error(`⚠️  Instruction/skill file integrity check found ${issues.length} change(s):\n`);
  for (const { path, type } of issues) {
    const icon = type === 'added' ? '➕' : type === 'deleted' ? '🗑️' : '✏️';
    console.error(`  ${icon} [${type.toUpperCase()}] ${path}`);
  }
  console.error('\nIf these changes are intentional, update checksums with:');
  console.error('  node scripts/verify-instructions.js --generate\n');
  return 1;
}

const args = process.argv.slice(2);
const mode = args.includes('--generate') ? 'generate' : 'verify';

const exitCode = await (mode === 'generate' ? generate() : verify());
process.exit(exitCode);
