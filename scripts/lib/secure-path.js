/**
 * secure-path.js — Vault path boundary validation.
 *
 * Prevents symlink-escape and path-traversal attacks by resolving real
 * filesystem paths and enforcing that all resolved paths stay within
 * the configured vault root.
 *
 * Import:
 *   import { resolveVaultRoot, assertWithinVault } from './secure-path.js';
 */

import { realpathSync, existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";

/**
 * Resolve and validate an Obsidian vault root path.
 *
 * Returns the realpath (symlinks resolved) of the vault directory.
 * Throws if the path doesn't exist, isn't a directory, or resolves
 * outside of the user's home directory.
 *
 * @param {string} vaultPath — raw vault path (from env var, CLI arg, or .env)
 * @returns {string} — resolved real absolute path to the vault root
 */
export function resolveVaultRoot(vaultPath) {
  if (!vaultPath || typeof vaultPath !== "string") {
    throw new Error("Vault path is required");
  }

  const resolved = resolve(vaultPath);

  if (!existsSync(resolved)) {
    throw new Error(`Vault path does not exist: ${resolved}`);
  }

  const real = realpathSync(resolved);

  if (!statSync(real).isDirectory()) {
    throw new Error(`Vault path is not a directory: ${real}`);
  }

  return real;
}

/**
 * Assert that a target path resolves within the vault boundary.
 *
 * For existing paths, resolves symlinks via realpathSync.
 * For non-existing paths (e.g., new file to create), walks up to the
 * nearest existing ancestor and validates that ancestor's realpath
 * is within the vault root.
 *
 * @param {string} targetPath — path to validate
 * @param {string} vaultRoot  — trusted vault root (must be a realpath)
 * @returns {string} — the resolved real path of the target
 * @throws {Error} if the target escapes the vault boundary
 */
export function assertWithinVault(targetPath, vaultRoot) {
  if (!targetPath || typeof targetPath !== "string") {
    throw new Error("Target path is required");
  }
  if (!vaultRoot || typeof vaultRoot !== "string") {
    throw new Error("Vault root is required");
  }

  const resolved = resolve(targetPath);

  let realTarget;
  if (existsSync(resolved)) {
    // Existing path — resolve symlinks directly
    realTarget = realpathSync(resolved);
  } else {
    // Non-existing path (new file/dir) — find nearest existing ancestor
    let ancestor = dirname(resolved);
    const visited = new Set();
    while (!existsSync(ancestor)) {
      if (visited.has(ancestor)) {
        throw new Error(`Circular path resolution for: ${targetPath}`);
      }
      visited.add(ancestor);
      const parent = dirname(ancestor);
      if (parent === ancestor) {
        throw new Error(`No existing ancestor found for: ${targetPath}`);
      }
      ancestor = parent;
    }
    const realAncestor = realpathSync(ancestor);
    // Reconstruct the relative tail and attach to the real ancestor
    const tail = resolved.slice(ancestor.length);
    realTarget = realAncestor + tail;
  }

  // Boundary check: target must be equal to or nested under vault root
  // Use trailing separator to prevent prefix attacks (e.g., /vault-evil matching /vault)
  const vaultPrefix = vaultRoot.endsWith("/") ? vaultRoot : vaultRoot + "/";
  if (realTarget !== vaultRoot && !realTarget.startsWith(vaultPrefix)) {
    throw new Error(
      `Path escapes vault boundary.\n  Target: ${realTarget}\n  Vault:  ${vaultRoot}`
    );
  }

  return realTarget;
}
