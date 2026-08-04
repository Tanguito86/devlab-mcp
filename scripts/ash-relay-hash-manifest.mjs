#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  constants as fsConstants,
  lstat,
  open,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const SCHEMA = "devlab-ash-relay-hash-manifest-v1";
const GAME_EXCLUDED_DIRECTORIES = new Set(["dist", "node_modules"]);
const AGGREGATE_RECORD_FORMAT = "JSON([relativePath,bytes,sha256]) + LF";

function fail(message) {
  throw new Error(message);
}

function usage() {
  return [
    "Usage:",
    "  node scripts/ash-relay-hash-manifest.mjs \\",
    "    --evidence <absolute-existing-evidence-root> \\",
    "    --game <absolute-existing-game-root> \\",
    "    --output <absolute-new-json-file-within-evidence-root>",
  ].join("\n");
}

function parseArguments(argv) {
  const allowed = new Set(["--evidence", "--game", "--output"]);
  const values = new Map();

  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];

    if (!allowed.has(option)) {
      fail(`Unknown or misplaced option: ${option ?? "<missing>"}\n${usage()}`);
    }
    if (values.has(option)) {
      fail(`Duplicate option: ${option}\n${usage()}`);
    }
    if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
      fail(`Missing value for ${option}\n${usage()}`);
    }

    values.set(option, value);
  }

  if (argv.length !== 6 || values.size !== allowed.size) {
    fail(usage());
  }

  return {
    evidence: values.get("--evidence"),
    game: values.get("--game"),
    output: values.get("--output"),
  };
}

function stripWindowsDevicePrefix(value) {
  if (value.startsWith("\\\\?\\UNC\\")) {
    return `\\\\${value.slice(8)}`;
  }
  if (value.startsWith("\\\\?\\")) {
    return value.slice(4);
  }
  return value;
}

function comparablePath(value) {
  const normalized = path.normalize(stripWindowsDevicePrefix(path.resolve(value)));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function samePath(left, right) {
  return comparablePath(left) === comparablePath(right);
}

function isStrictlyWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative.length > 0 &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function rootsOverlap(left, right) {
  return samePath(left, right) || isStrictlyWithin(left, right) || isStrictlyWithin(right, left);
}

function isFilesystemRoot(value) {
  return samePath(value, path.parse(path.resolve(value)).root);
}

function compareOrdinal(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function toManifestPath(relativePath) {
  return relativePath.split(path.sep).join("/");
}

async function assertExistingDirectory(directoryPath, label) {
  let stats;
  try {
    stats = await lstat(directoryPath);
  } catch (error) {
    fail(`${label} does not exist or cannot be inspected: ${directoryPath} (${error.message})`);
  }

  if (stats.isSymbolicLink()) {
    fail(`${label} must not be a symbolic link or junction: ${directoryPath}`);
  }
  if (!stats.isDirectory()) {
    fail(`${label} must be a directory: ${directoryPath}`);
  }
}

async function assertDirectPathIdentity(existingPath, label) {
  let resolvedRealPath;
  try {
    resolvedRealPath = await realpath(existingPath);
  } catch (error) {
    fail(`${label} cannot be resolved: ${existingPath} (${error.message})`);
  }

  if (!samePath(existingPath, resolvedRealPath)) {
    fail(
      `${label} resolves through a symbolic link, junction, mount alias, or other reparse path: ` +
        `${existingPath} -> ${resolvedRealPath}`,
    );
  }
}

async function assertNoLinkedComponents(existingPath, label) {
  const absolutePath = path.resolve(existingPath);
  const root = path.parse(absolutePath).root;
  const remainder = absolutePath.slice(root.length);
  const components = remainder.split(/[\\/]+/u).filter(Boolean);
  let current = root;

  await assertDirectPathIdentity(root, `${label} filesystem root`);

  for (const component of components) {
    current = path.join(current, component);

    let stats;
    try {
      stats = await lstat(current);
    } catch (error) {
      fail(`${label} path component cannot be inspected: ${current} (${error.message})`);
    }

    if (stats.isSymbolicLink()) {
      fail(`${label} contains a symbolic link or junction component: ${current}`);
    }
    await assertDirectPathIdentity(current, `${label} path component`);
  }
}

async function validateInputs(raw) {
  for (const [label, value] of Object.entries(raw)) {
    if (!path.isAbsolute(value)) {
      fail(`${label} path must be absolute: ${value}`);
    }
    if (value.includes("\0")) {
      fail(`${label} path contains a NUL byte`);
    }
  }

  const evidence = path.resolve(raw.evidence);
  const game = path.resolve(raw.game);
  const output = path.resolve(raw.output);
  const outputParent = path.dirname(output);

  if (isFilesystemRoot(evidence) || isFilesystemRoot(game)) {
    fail("Evidence and game roots must not be filesystem roots");
  }
  if (rootsOverlap(evidence, game)) {
    fail(`Evidence and game roots overlap dangerously: ${evidence} <> ${game}`);
  }
  if (!isStrictlyWithin(evidence, output)) {
    fail(`Output must be strictly within the evidence root: ${output}`);
  }
  if (isStrictlyWithin(game, output) || samePath(game, output)) {
    fail(`Output must not be inside the game root: ${output}`);
  }
  if (path.extname(output).toLowerCase() !== ".json") {
    fail(`Output must have a .json extension: ${output}`);
  }

  await assertExistingDirectory(evidence, "Evidence root");
  await assertExistingDirectory(game, "Game root");
  await assertExistingDirectory(outputParent, "Output parent");
  await assertNoLinkedComponents(evidence, "Evidence root");
  await assertNoLinkedComponents(game, "Game root");
  await assertNoLinkedComponents(outputParent, "Output parent");

  try {
    await lstat(output);
    fail(`Output already exists; refusing to overwrite it: ${output}`);
  } catch (error) {
    if (error.message.startsWith("Output already exists;")) {
      throw error;
    }
    if (error.code !== "ENOENT") {
      fail(`Output existence cannot be verified: ${output} (${error.message})`);
    }
  }

  return { evidence, game, output };
}

async function assertWalkEntryIsDirect(entryPath, stats, label) {
  if (stats.isSymbolicLink()) {
    fail(`${label} contains a symbolic link or junction: ${entryPath}`);
  }
  await assertDirectPathIdentity(entryPath, `${label} entry`);
}

async function collectFiles(root, options) {
  const files = [];

  async function walk(directoryPath) {
    let entries;
    try {
      entries = await readdir(directoryPath, { withFileTypes: true });
    } catch (error) {
      fail(`Cannot enumerate ${options.label}: ${directoryPath} (${error.message})`);
    }

    entries.sort((left, right) => compareOrdinal(left.name, right.name));

    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);
      const relativePath = path.relative(root, entryPath);
      let stats;

      try {
        stats = await lstat(entryPath);
      } catch (error) {
        fail(`Cannot inspect ${options.label} entry: ${entryPath} (${error.message})`);
      }

      await assertWalkEntryIsDirect(entryPath, stats, options.label);

      if (stats.isDirectory()) {
        if (options.excludeDirectory?.(relativePath, entry.name)) {
          continue;
        }
        await walk(entryPath);
        continue;
      }

      if (!stats.isFile()) {
        fail(`${options.label} contains an unsupported non-file entry: ${entryPath}`);
      }
      if (options.excludeFile?.(entryPath, relativePath)) {
        continue;
      }

      files.push({
        absolutePath: entryPath,
        relativePath: toManifestPath(relativePath),
      });
    }
  }

  await walk(root);
  files.sort((left, right) => compareOrdinal(left.relativePath, right.relativePath));
  return files;
}

function sameBigIntStat(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

async function hashFile(file) {
  const digest = createHash("sha256");
  let byteCount = 0n;
  const fileHandle = await open(file.absolutePath, fsConstants.O_RDONLY);

  try {
    const before = await fileHandle.stat({ bigint: true });
    if (!before.isFile()) {
      fail(`File changed type before hashing: ${file.absolutePath}`);
    }

    const stream = fileHandle.createReadStream({ autoClose: false });
    for await (const chunk of stream) {
      digest.update(chunk);
      byteCount += BigInt(chunk.byteLength);
    }

    const after = await fileHandle.stat({ bigint: true });
    if (!sameBigIntStat(before, after) || byteCount !== after.size) {
      fail(`File changed while being hashed: ${file.absolutePath}`);
    }
  } finally {
    await fileHandle.close();
  }

  if (byteCount > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail(`File is too large to represent byte count safely in JSON: ${file.absolutePath}`);
  }

  return {
    path: file.relativePath,
    bytes: Number(byteCount),
    sha256: digest.digest("hex"),
  };
}

async function hashTree(files) {
  const entries = [];
  let totalBytes = 0n;

  for (const file of files) {
    const entry = await hashFile(file);
    entries.push(entry);
    totalBytes += BigInt(entry.bytes);
  }

  if (totalBytes > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail("Tree is too large to represent total byte count safely in JSON");
  }

  const aggregate = createHash("sha256");
  for (const entry of entries) {
    aggregate.update(JSON.stringify([entry.path, entry.bytes, entry.sha256]));
    aggregate.update("\n");
  }

  return {
    aggregateSha256: aggregate.digest("hex"),
    bytes: Number(totalBytes),
    fileCount: entries.length,
    files: entries,
  };
}

function stableStringify(value, indentation = 2) {
  const seen = new Set();

  function normalize(current) {
    if (current === null || typeof current !== "object") {
      return current;
    }
    if (seen.has(current)) {
      fail("Cannot serialize a cyclic manifest value");
    }

    seen.add(current);
    let normalized;
    if (Array.isArray(current)) {
      normalized = current.map(normalize);
    } else {
      normalized = {};
      for (const key of Object.keys(current).sort(compareOrdinal)) {
        normalized[key] = normalize(current[key]);
      }
    }
    seen.delete(current);
    return normalized;
  }

  return `${JSON.stringify(normalize(value), null, indentation)}\n`;
}

async function main() {
  const raw = parseArguments(process.argv.slice(2));
  const paths = await validateInputs(raw);

  const evidenceFiles = await collectFiles(paths.evidence, {
    label: "Evidence tree",
    excludeFile: (entryPath) => samePath(entryPath, paths.output),
  });
  const gameFiles = await collectFiles(paths.game, {
    label: "Game tree",
    excludeDirectory: (_relativePath, name) => GAME_EXCLUDED_DIRECTORIES.has(name),
  });

  const [evidenceTree, gameTree] = await Promise.all([
    hashTree(evidenceFiles),
    hashTree(gameFiles),
  ]);

  const manifest = {
    aggregateRecordFormat: AGGREGATE_RECORD_FORMAT,
    algorithm: "sha256",
    evidence: {
      root: paths.evidence,
      ...evidenceTree,
    },
    game: {
      excludedDirectories: [...GAME_EXCLUDED_DIRECTORIES].sort(compareOrdinal),
      root: paths.game,
      ...gameTree,
    },
    schema: SCHEMA,
  };

  // Recheck path safety immediately before the exclusive create. The `wx` flag
  // makes a concurrent creation fail instead of overwriting evidence.
  await assertNoLinkedComponents(path.dirname(paths.output), "Output parent");
  await writeFile(paths.output, stableStringify(manifest), {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });

  process.stdout.write(
    `${JSON.stringify({
      evidenceAggregateSha256: evidenceTree.aggregateSha256,
      evidenceFiles: evidenceTree.fileCount,
      gameAggregateSha256: gameTree.aggregateSha256,
      gameFiles: gameTree.fileCount,
      output: paths.output,
      schema: SCHEMA,
    })}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`ash-relay-hash-manifest: ${error.message}\n`);
  process.exitCode = 1;
});
