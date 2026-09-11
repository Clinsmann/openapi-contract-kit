import { resolve } from 'node:path';

import {
  DocumentStore,
  escapePointerSegment,
  locationOf,
  pointerChild,
  requireRecord,
} from './documents.mjs';
import { SchemaRegistry, toPascalIdentifier } from './schemaModel.mjs';

const HTTP_METHODS = [
  'delete',
  'get',
  'head',
  'options',
  'patch',
  'post',
  'put',
  'trace',
];
const JSON_MEDIA_TYPE = 'application/json';

class ModelBuilder {
  #documents = new DocumentStore();
  #registry;
  #rootDocument;
  #rootPath;

  async build(specPath) {
    this.#rootPath = resolve(specPath);
    this.#rootDocument = await this.#documents.load(this.#rootPath);
    this.#registry = new SchemaRegistry(this.#documents, this.#rootPath);
    this.#validateOpenApiRoot();
    this.#seedComponentSchemas();
    await this.#seedResponseSchemas();
    const operationDrafts = this.#collectOperationDrafts();
    const operations = await this.#buildOperations(operationDrafts);

    return {
      operations: operations.sort((left, right) =>
        left.name.localeCompare(right.name)
      ),
      schemas: await this.#registry.build(),
    };
  }

  #validateOpenApiRoot() {
    const version = this.#rootDocument.openapi;

    if (typeof version !== 'string' || !version.startsWith('3.1.')) {
      throw new Error(
        `OpenAPI document "${this.#rootPath}" must use OpenAPI 3.1`
      );
    }
    requireRecord(
      this.#rootDocument.paths,
      locationOf(this.#rootPath, '/paths'),
      'OpenAPI paths'
    );
  }

  #seedComponentSchemas() {
    const schemas = this.#rootDocument.components?.schemas;

    if (schemas === undefined) {
      return;
    }
    requireRecord(
      schemas,
      locationOf(this.#rootPath, '/components/schemas'),
      'OpenAPI component schemas'
    );

    for (const componentName of Object.keys(schemas).sort()) {
      this.#registry.register(
        Reflect.get(schemas, componentName),
        {
          documentPath: this.#rootPath,
          pointer: `/components/schemas/${escapePointerSegment(componentName)}`,
        },
        componentName
      );
    }
  }

  async #seedResponseSchemas() {
    const responses = this.#rootDocument.components?.responses;

    if (responses === undefined) {
      return;
    }
    requireRecord(
      responses,
      locationOf(this.#rootPath, '/components/responses'),
      'OpenAPI component responses'
    );

    for (const responseName of Object.keys(responses).sort()) {
      const context = {
        documentPath: this.#rootPath,
        pointer: `/components/responses/${escapePointerSegment(responseName)}`,
      };
      const resolved = await this.#resolveReferenceObject(
        Reflect.get(responses, responseName),
        context,
        'Response'
      );
      const body = this.#readJsonBody(
        resolved.value,
        resolved.context,
        'Response'
      );

      if (body !== null) {
        this.#registry.register(body.schema, body.context, responseName);
      }
    }
  }

  #collectOperationDrafts() {
    const drafts = [];
    const operationIds = new Set();

    for (const path of Object.keys(this.#rootDocument.paths).sort()) {
      const pathPointer = `/paths/${escapePointerSegment(path)}`;
      const pathItem = requireRecord(
        Reflect.get(this.#rootDocument.paths, path),
        locationOf(this.#rootPath, pathPointer),
        'Path item'
      );

      if (pathItem.$ref !== undefined) {
        throw new Error(`Referenced path items are unsupported at ${path}`);
      }
      if (
        Array.isArray(pathItem.parameters) &&
        pathItem.parameters.length > 0
      ) {
        throw new Error(`Path parameters are unsupported at ${path}`);
      }

      for (const method of HTTP_METHODS) {
        if (pathItem[method] === undefined) {
          continue;
        }
        const operation = requireRecord(
          pathItem[method],
          locationOf(this.#rootPath, `${pathPointer}/${method}`),
          'Operation'
        );
        const operationId = operation.operationId;

        if (typeof operationId !== 'string' || operationId.length === 0) {
          throw new Error(
            `Missing operationId for ${method.toUpperCase()} ${path}`
          );
        }
        if (operationIds.has(operationId)) {
          throw new Error(`Duplicate operationId "${operationId}"`);
        }
        if (
          Array.isArray(operation.parameters) &&
          operation.parameters.length > 0
        ) {
          throw new Error(
            `Operation parameters are unsupported for ${operationId}`
          );
        }

        operationIds.add(operationId);
        drafts.push({ method, operation, operationId, path, pathPointer });
      }
    }

    const leafCounts = new Map();
    for (const draft of drafts) {
      const segments = draft.operationId
        .split(/[^A-Za-z0-9_$]+/u)
        .filter(Boolean);
      const leaf = toPascalIdentifier(
        segments.at(-1) ?? draft.operationId,
        'Operation'
      );
      draft.leafName = leaf;
      leafCounts.set(
        leaf.toLowerCase(),
        (leafCounts.get(leaf.toLowerCase()) ?? 0) + 1
      );
    }

    const names = new Set();
    for (const draft of drafts) {
      draft.name =
        leafCounts.get(draft.leafName.toLowerCase()) === 1
          ? draft.leafName
          : toPascalIdentifier(draft.operationId, 'Operation');
      const key = draft.name.toLowerCase();
      if (names.has(key)) {
        throw new Error(`Operation name collision for "${draft.name}"`);
      }
      names.add(key);
    }

    return drafts;
  }

  async #buildOperations(drafts) {
    const operations = [];

    for (const draft of drafts) {
      const operationPointer = `${draft.pathPointer}/${draft.method}`;
      const context = {
        documentPath: this.#rootPath,
        pointer: operationPointer,
      };
      operations.push({
        method: draft.method.toUpperCase(),
        name: draft.name,
        operationId: draft.operationId,
        path: draft.path,
        request: await this.#buildRequest(draft.operation, context, draft.name),
        responses: await this.#buildResponses(
          draft.operation,
          context,
          draft.name
        ),
      });
    }

    return operations;
  }

  async #buildRequest(operation, context, operationName) {
    if (operation.requestBody === undefined) {
      return { schemaName: null };
    }

    const requestContext = {
      documentPath: context.documentPath,
      pointer: pointerChild(context.pointer, 'requestBody'),
    };
    const resolved = await this.#resolveReferenceObject(
      operation.requestBody,
      requestContext,
      'Request body'
    );

    if (resolved.value.required !== true) {
      throw new Error(
        `Optional request bodies are unsupported for ${operationName}`
      );
    }
    const body = this.#readJsonBody(
      resolved.value,
      resolved.context,
      'Request body'
    );
    if (body === null) {
      throw new Error(`Request body for ${operationName} has no JSON schema`);
    }

    return {
      schemaName: await this.#registry.schemaNameFor(
        body.schema,
        body.context,
        `${operationName}Request`
      ),
    };
  }

  async #buildResponses(operation, context, operationName) {
    const responsesPointer = pointerChild(context.pointer, 'responses');
    const responses = requireRecord(
      operation.responses,
      locationOf(context.documentPath, responsesPointer),
      'Operation responses'
    );
    const result = [];

    for (const statusKey of Object.keys(responses).sort(
      (left, right) => Number(left) - Number(right)
    )) {
      if (!/^\d{3}$/u.test(statusKey)) {
        throw new Error(
          `Response status "${statusKey}" is unsupported for ${operationName}`
        );
      }
      const status = Number(statusKey);
      if (status < 100 || status > 599) {
        throw new Error(
          `Invalid response status "${statusKey}" for ${operationName}`
        );
      }
      const responseContext = {
        documentPath: context.documentPath,
        pointer: pointerChild(responsesPointer, statusKey),
      };
      const resolved = await this.#resolveReferenceObject(
        Reflect.get(responses, statusKey),
        responseContext,
        'Response'
      );
      const body = this.#readJsonBody(
        resolved.value,
        resolved.context,
        'Response'
      );
      const schemaName =
        body === null
          ? null
          : await this.#registry.schemaNameFor(
              body.schema,
              body.context,
              `${operationName}Response${statusKey}`
            );

      result.push({
        isSuccess: status >= 200 && status <= 299,
        schemaName,
        status,
      });
    }

    if (result.length === 0) {
      throw new Error(`Operation ${operationName} must document a response`);
    }

    return result;
  }

  #readJsonBody(value, context, label) {
    if (value.content === undefined) {
      return null;
    }
    const content = requireRecord(
      value.content,
      locationOf(
        context.documentPath,
        pointerChild(context.pointer, 'content')
      ),
      `${label} content`
    );
    const mediaTypes = Object.keys(content);

    if (mediaTypes.length === 0) {
      return null;
    }
    if (mediaTypes.length !== 1 || mediaTypes[0] !== JSON_MEDIA_TYPE) {
      throw new Error(
        `${label} at ${locationOf(context.documentPath, context.pointer)} must use only ${JSON_MEDIA_TYPE}`
      );
    }
    const media = requireRecord(
      content[JSON_MEDIA_TYPE],
      locationOf(
        context.documentPath,
        pointerChild(pointerChild(context.pointer, 'content'), JSON_MEDIA_TYPE)
      ),
      `${label} media type`
    );
    if (media.schema === undefined) {
      throw new Error(
        `${label} at ${locationOf(context.documentPath, context.pointer)} has no schema`
      );
    }

    return {
      context: {
        documentPath: context.documentPath,
        pointer: pointerChild(
          pointerChild(
            pointerChild(context.pointer, 'content'),
            JSON_MEDIA_TYPE
          ),
          'schema'
        ),
      },
      schema: media.schema,
    };
  }

  async #resolveReferenceObject(value, context, label, seen = new Set()) {
    const object = requireRecord(
      value,
      locationOf(context.documentPath, context.pointer),
      label
    );

    if (object.$ref === undefined) {
      return { context, value: object };
    }
    const resolved = await this.#documents.resolveReference(
      object.$ref,
      context.documentPath
    );
    if (seen.has(resolved.canonicalKey)) {
      throw new Error(
        `Cyclic ${label.toLowerCase()} reference at ${resolved.canonicalKey}`
      );
    }
    seen.add(resolved.canonicalKey);
    return this.#resolveReferenceObject(
      resolved.value,
      { documentPath: resolved.documentPath, pointer: resolved.pointer },
      label,
      seen
    );
  }
}

export async function buildOpenApiModel(specPath) {
  return new ModelBuilder().build(specPath);
}

