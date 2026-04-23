const VAR_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export class UnresolvedVariableError extends Error {
  constructor(name) {
    super(`unresolved variable \${${name}}`);
    this.name = 'UnresolvedVariableError';
    this.varName = name;
  }
}

export function interpolate(value, scope) {
  if (value == null) return value;
  return String(value).replace(VAR_PATTERN, (match, name) => {
    if (Object.prototype.hasOwnProperty.call(scope.extracted, name)) {
      return scope.extracted[name];
    }
    if (Object.prototype.hasOwnProperty.call(scope.env, name)) {
      return scope.env[name];
    }
    throw new UnresolvedVariableError(name);
  });
}

export function buildScope(env, extracted = {}) {
  return { env, extracted: { ...extracted } };
}
