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

type OutputOptions = {
  readonly protectedPaths?: readonly string[];
};

type OutputManifest = {
  readonly files: readonly string[];
};

function isManifest(value: unknown): value is OutputManifest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const files = Reflect.get(value, 'files');
  return Array.isArray(files) && files.every((file) => typeof file === 'string');
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(directory: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

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

function validateGeneratedPath(path: string): void {
  if (
    path.length === 0 ||
    isAbsolute(path) ||
    path.split('/').some((segment) => segment === '..' || segment.length === 0)
  ) {
    throw new Error(`Unsafe generated output path "${path}"`);
  }
}

function isAncestor(parent: string, child: string): boolean {
  const pathFromParent = relative(parent, child);
  return (
    pathFromParent.length === 0 ||
    (!pathFromParent.startsWith('..') && !isAbsolute(pathFromParent))
  );
}

function validateOutputRoot(
  outDir: string,
  protectedPaths: readonly string[]
): void {
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

async function validateExistingOutput(outDir: string): Promise<boolean> {
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

  let manifest: unknown;
  try {
    manifest = JSON.parse(await readFile(join(outDir, MANIFEST_FILE), 'utf8'));
  } catch {
    throw new Error(`OpenAPI output manifest is invalid at ${outDir}`);
  }
  if (!isManifest(manifest)) {
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

async function writeStage(
  stagePath: string,
  files: ReadonlyMap<string, string>
): Promise<void> {
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
  outDir: string,
  files: ReadonlyMap<string, string>,
  options: OutputOptions = {}
): Promise<void> {
  const protectedPaths = options.protectedPaths ?? [];
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
