import { resolve } from 'node:path';

import {
  DocumentStore,
  escapePointerSegment,
  isRecord,
  locationOf,
  pointerChild,
  requireRecord,
} from './documents.js';
import { SchemaRegistry, toPascalIdentifier } from './schemaModel.js';
import type {
  DocumentContext,
  OpenApiModel,
  OperationModel,
  ResponseModel,
  UnknownRecord,
} from './types.js';

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

type OperationDraft = {
  readonly method: string;
  readonly name: string;
  readonly operation: UnknownRecord;
  readonly operationId: string;
  readonly path: string;
  readonly pathPointer: string;
};

type UnnamedOperationDraft = Omit<OperationDraft, 'name'>;

type JsonBody = {
  readonly context: DocumentContext;
  readonly schema: unknown;
};

type ResolvedObject = {
  readonly context: DocumentContext;
  readonly value: UnknownRecord;
};

class ModelBuilder {
  #documents = new DocumentStore();
  #registry: SchemaRegistry | null = null;
  #rootDocument: UnknownRecord | null = null;
  #rootPath: string | null = null;

  async build(specPath: string): Promise<OpenApiModel> {
    this.#rootPath = resolve(specPath);
    this.#rootDocument = await this.#documents.load(this.#rootPath);
    this.#registry = new SchemaRegistry(this.#documents, this.#rootPath);
    this.#validateOpenApiRoot();
    this.#seedComponentSchemas();
    await this.#seedResponseSchemas();
    const operations = await this.#buildOperations(
      this.#collectOperationDrafts()
    );

    return {
      operations: operations.sort((left, right) =>
        left.name.localeCompare(right.name)
      ),
      schemas: await this.#registry.build(),
    };
  }

  #getRegistry(): SchemaRegistry {
    if (this.#registry === null) {
      throw new Error('OpenAPI model registry is unavailable');
    }
    return this.#registry;
  }

  #getRootDocument(): UnknownRecord {
    if (this.#rootDocument === null) {
      throw new Error('OpenAPI root document is unavailable');
    }
    return this.#rootDocument;
  }

  #getRootPath(): string {
    if (this.#rootPath === null) {
      throw new Error('OpenAPI root path is unavailable');
    }
    return this.#rootPath;
  }

  #validateOpenApiRoot(): void {
    const rootDocument = this.#getRootDocument();
    const rootPath = this.#getRootPath();
    const version = rootDocument.openapi;

    if (typeof version !== 'string' || !version.startsWith('3.1.')) {
      throw new Error(`OpenAPI document "${rootPath}" must use OpenAPI 3.1`);
    }
    requireRecord(
      rootDocument.paths,
      locationOf(rootPath, '/paths'),
      'OpenAPI paths'
    );
  }

  #seedComponentSchemas(): void {
    const rootDocument = this.#getRootDocument();
    const rootPath = this.#getRootPath();
    const components = rootDocument.components;
    const schemas = isRecord(components) ? components.schemas : undefined;

    if (schemas === undefined) {
      return;
    }
    const schemaRecord = requireRecord(
      schemas,
      locationOf(rootPath, '/components/schemas'),
      'OpenAPI component schemas'
    );

    for (const componentName of Object.keys(schemaRecord).sort()) {
      this.#getRegistry().register(
        Reflect.get(schemaRecord, componentName),
        {
          documentPath: rootPath,
          pointer: `/components/schemas/${escapePointerSegment(componentName)}`,
        },
        componentName
      );
    }
  }

  async #seedResponseSchemas(): Promise<void> {
    const rootDocument = this.#getRootDocument();
    const rootPath = this.#getRootPath();
    const components = rootDocument.components;
    const responses = isRecord(components) ? components.responses : undefined;

    if (responses === undefined) {
      return;
    }
    const responseRecord = requireRecord(
      responses,
      locationOf(rootPath, '/components/responses'),
      'OpenAPI component responses'
    );

    for (const responseName of Object.keys(responseRecord).sort()) {
      const context = {
        documentPath: rootPath,
        pointer: `/components/responses/${escapePointerSegment(responseName)}`,
      };
      const resolved = await this.#resolveReferenceObject(
        Reflect.get(responseRecord, responseName),
        context,
        'Response'
      );
      const body = this.#readJsonBody(
        resolved.value,
        resolved.context,
        'Response'
      );

      if (body !== null) {
        this.#getRegistry().register(body.schema, body.context, responseName);
      }
    }
  }

  #collectOperationDrafts(): readonly OperationDraft[] {
    const rootDocument = this.#getRootDocument();
    const rootPath = this.#getRootPath();
    const paths = requireRecord(
      rootDocument.paths,
      locationOf(rootPath, '/paths'),
      'OpenAPI paths'
    );
    const drafts: UnnamedOperationDraft[] = [];
    const operationIds = new Set<string>();

    for (const path of Object.keys(paths).sort()) {
      const pathPointer = `/paths/${escapePointerSegment(path)}`;
      const pathItem = requireRecord(
        Reflect.get(paths, path),
        locationOf(rootPath, pathPointer),
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
        const rawOperation = pathItem[method];
        if (rawOperation === undefined) {
          continue;
        }
        const operation = requireRecord(
          rawOperation,
          locationOf(rootPath, `${pathPointer}/${method}`),
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

    const draftsWithLeaves = drafts.map((draft) => {
      const segments = draft.operationId
        .split(/[^A-Za-z0-9_$]+/u)
        .filter(Boolean);
      return {
        ...draft,
        leafName: toPascalIdentifier(
          segments.at(-1) ?? draft.operationId,
          'Operation'
        ),
      };
    });
    const leafCounts = new Map<string, number>();
    for (const draft of draftsWithLeaves) {
      const key = draft.leafName.toLowerCase();
      leafCounts.set(key, (leafCounts.get(key) ?? 0) + 1);
    }

    const names = new Set<string>();
    return draftsWithLeaves.map((draft) => {
      const name =
        leafCounts.get(draft.leafName.toLowerCase()) === 1
          ? draft.leafName
          : toPascalIdentifier(draft.operationId, 'Operation');
      const key = name.toLowerCase();
      if (names.has(key)) {
        throw new Error(`Operation name collision for "${name}"`);
      }
      names.add(key);
      return {
        method: draft.method,
        name,
        operation: draft.operation,
        operationId: draft.operationId,
        path: draft.path,
        pathPointer: draft.pathPointer,
      };
    });
  }

  async #buildOperations(
    drafts: readonly OperationDraft[]
  ): Promise<OperationModel[]> {
    const operations: OperationModel[] = [];
    const rootPath = this.#getRootPath();

    for (const draft of drafts) {
      const context = {
        documentPath: rootPath,
        pointer: `${draft.pathPointer}/${draft.method}`,
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

  async #buildRequest(
    operation: UnknownRecord,
    context: DocumentContext,
    operationName: string
  ): Promise<OperationModel['request']> {
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
      schemaName: await this.#getRegistry().schemaNameFor(
        body.schema,
        body.context,
        `${operationName}Request`
      ),
    };
  }

  async #buildResponses(
    operation: UnknownRecord,
    context: DocumentContext,
    operationName: string
  ): Promise<readonly ResponseModel[]> {
    const responsesPointer = pointerChild(context.pointer, 'responses');
    const responses = requireRecord(
      operation.responses,
      locationOf(context.documentPath, responsesPointer),
      'Operation responses'
    );
    const result: ResponseModel[] = [];

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
          : await this.#getRegistry().schemaNameFor(
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

  #readJsonBody(
    value: UnknownRecord,
    context: DocumentContext,
    label: string
  ): JsonBody | null {
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

  async #resolveReferenceObject(
    value: unknown,
    context: DocumentContext,
    label: string,
    seen = new Set<string>()
  ): Promise<ResolvedObject> {
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

export async function buildOpenApiModel(
  specPath: string
): Promise<OpenApiModel> {
  return new ModelBuilder().build(specPath);
}
