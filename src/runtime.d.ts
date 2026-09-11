export type ValidationPath = readonly (string | number)[];

export type ValidationIssue = {
  readonly path: ValidationPath;
  readonly keyword: string;
  readonly message: string;
};

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly ValidationIssue[] };

export type MakeResult<T> = Result<T>;

