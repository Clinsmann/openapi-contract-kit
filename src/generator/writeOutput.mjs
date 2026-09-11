import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
} from 'node:path';

const MANIFEST_FILE = '.openapi-runtime-manifest.json';
const LEGACY_GENERATED_FILE =
  /^(?:quickpay-api\.ts|(?:endpoints|schemas)\/[^/]+\.ts)$/u;

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    const relativePath =
      prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    const absolutePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(absolutePath, relativePath)));
    } else {
      files.push(relativePath);
    }
  }

  return files;
}

function validateGeneratedPath(path) {
  if (
    path.length === 0 ||
    isAbsolute(path) ||
    path.split('/').some((segment) => segment === '..' || segment.length === 0)
  ) {
    throw new Error(`Unsafe generated output path "${path}"`);
  }
}

function isAncestor(parent, child) {
  const pathFromParent = relative(parent, child);
  return (
    pathFromParent.length === 0 ||
    (!pathFromParent.startsWith('..') && !isAbsolute(pathFromParent))
  );
}

function validateOutputRoot(outDir, protectedPaths) {
  if (parse(outDir).root === outDir) {
    throw new Error(`Unsafe OpenAPI output directory "${outDir}"`);
  }

  for (const protectedPath of protectedPaths) {
    if (isAncestor(outDir, protectedPath)) {
      throw new Error(
        `OpenAPI output directory "${outDir}" contains protected input "${protectedPath}"`
      );
    }
  }
}

async function validateExistingOutput(outDir) {
  if (!(await exists(outDir))) {
    return false;
  }

  const existingFiles = await listFiles(outDir);
  if (existingFiles.length === 0) {
    return true;
  }

  if (!existingFiles.includes(MANIFEST_FILE)) {
    const unexpected = existingFiles.find(
      (file) => !LEGACY_GENERATED_FILE.test(file)
    );
    if (unexpected !== undefined) {
      throw new Error(
        `OpenAPI output directory contains unexpected file "${unexpected}"`
      );
    }
    return true;
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(outDir, MANIFEST_FILE), 'utf8'));
  } catch {
    throw new Error(`OpenAPI output manifest is invalid at ${outDir}`);
  }
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !Array.isArray(manifest.files) ||
    manifest.files.some((file) => typeof file !== 'string')
  ) {
    throw new Error(`OpenAPI output manifest is invalid at ${outDir}`);
  }

  const ownedFiles = new Set([...manifest.files, MANIFEST_FILE]);
  const unexpected = existingFiles.find((file) => !ownedFiles.has(file));
  if (unexpected !== undefined) {
    throw new Error(
      `OpenAPI output directory contains unexpected file "${unexpected}"`
    );
  }

  return true;
}

async function writeStage(stagePath, files) {
  await mkdir(stagePath, { recursive: true });

  for (const [relativePath, content] of files) {
    validateGeneratedPath(relativePath);
    const targetPath = join(stagePath, relativePath);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content);
  }

  const manifest = {
    version: 1,
    files: [...files.keys()].sort(),
  };
  await writeFile(
    join(stagePath, MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
}

export async function writeGeneratedOutput(
  outDir,
  files,
  { protectedPaths = [] } = {}
) {
  validateOutputRoot(outDir, protectedPaths);
  const hadExistingOutput = await validateExistingOutput(outDir);
  const parent = dirname(outDir);
  await mkdir(parent, { recursive: true });
  const swapRoot = await mkdtemp(
    join(parent, `.${basename(outDir)}.openapi-runtime-`)
  );
  const stagedOutput = join(swapRoot, 'next');
  const previousOutput = join(swapRoot, 'previous');
  let movedPreviousOutput = false;

  try {
    await writeStage(stagedOutput, files);
    if (hadExistingOutput) {
      await rename(outDir, previousOutput);
      movedPreviousOutput = true;
    }
    try {
      await rename(stagedOutput, outDir);
    } catch (error) {
      if (movedPreviousOutput && !(await exists(outDir))) {
        await rename(previousOutput, outDir);
        movedPreviousOutput = false;
      }
      throw error;
    }
    if (movedPreviousOutput) {
      await rm(previousOutput, { force: true, recursive: true });
      movedPreviousOutput = false;
    }
  } finally {
    if (movedPreviousOutput && !(await exists(outDir))) {
      await rename(previousOutput, outDir);
    }
    await rm(swapRoot, { force: true, recursive: true });
  }
}

