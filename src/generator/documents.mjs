import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';

export function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function escapePointerSegment(segment) {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1');
}

export function pointerChild(pointer, segment) {
  return `${pointer}/${escapePointerSegment(String(segment))}`;
}

export function locationOf(documentPath, pointer) {
  return `${documentPath}#${pointer}`;
}

export function requireRecord(value, location, label) {
  if (!isRecord(value)) {
    throw new Error(`${label} at ${location} must be an object`);
  }

  return value;
}

export class DocumentStore {
  #documents = new Map();

  async load(documentPath) {
    const absolutePath = resolve(documentPath);
    const existing = this.#documents.get(absolutePath);

    if (existing !== undefined) {
      return existing;
    }

    const pending = this.#read(absolutePath);
    this.#documents.set(absolutePath, pending);
    return pending;
  }

  async #read(documentPath) {
    let source;

    try {
      source = await readFile(documentPath, 'utf8');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Unable to read OpenAPI document "${documentPath}": ${message}`
      );
    }

    try {
      const extension = extname(documentPath).toLowerCase();
      if (extension !== '.json') {
        throw new Error('Only JSON OpenAPI documents are supported');
      }
      const value = JSON.parse(source);
      return requireRecord(value, documentPath, 'OpenAPI document');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Unable to parse OpenAPI document "${documentPath}": ${message}`
      );
    }
  }

  async resolveReference(reference, fromDocumentPath) {
    if (typeof reference !== 'string' || reference.length === 0) {
      throw new Error(`Invalid $ref at ${fromDocumentPath}`);
    }
    if (/^[A-Za-z][A-Za-z\d+.-]*:/u.test(reference)) {
      throw new Error(`Remote $ref "${reference}" is unsupported`);
    }

    const hashIndex = reference.indexOf('#');
    const filePart =
      hashIndex === -1 ? reference : reference.slice(0, hashIndex);
    const fragment = hashIndex === -1 ? '' : reference.slice(hashIndex + 1);
    const documentPath =
      filePart.length === 0
        ? fromDocumentPath
        : resolve(dirname(fromDocumentPath), decodeURIComponent(filePart));
    const document = await this.load(documentPath);
    const decodedFragment = decodeURIComponent(fragment);

    if (decodedFragment.length > 0 && !decodedFragment.startsWith('/')) {
      throw new Error(`Anchor $ref "${reference}" is unsupported`);
    }

    let value = document;
    for (const encodedSegment of decodedFragment.split('/').slice(1)) {
      const segment = encodedSegment
        .replaceAll('~1', '/')
        .replaceAll('~0', '~');
      if (!isRecord(value) && !Array.isArray(value)) {
        throw new Error(
          `Unresolved $ref "${reference}" from ${fromDocumentPath}`
        );
      }
      if (!Object.prototype.hasOwnProperty.call(value, segment)) {
        throw new Error(
          `Unresolved $ref "${reference}" from ${fromDocumentPath}`
        );
      }
      value = Reflect.get(value, segment);
    }

    return {
      canonicalKey: locationOf(documentPath, decodedFragment),
      documentPath,
      pointer: decodedFragment,
      value,
    };
  }
}
