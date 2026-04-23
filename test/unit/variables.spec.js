import { describe, it, expect } from 'vitest';
import { interpolate, buildScope, UnresolvedVariableError } from '../../src/interp/variables.js';
import { loadEnirenEnv } from '../../src/env.js';

describe('variables', () => {
  it('interpolates env vars with prefix stripped', () => {
    const env = loadEnirenEnv({ ENIREN_FOO: 'bar', OTHER: 'x' });
    expect(env).toEqual({ FOO: 'bar' });
    const scope = buildScope(env);
    expect(interpolate('hello ${FOO}', scope)).toBe('hello bar');
  });

  it('extracted vars take precedence over env', () => {
    const scope = buildScope({ A: 'env' }, { A: 'ext' });
    expect(interpolate('${A}', scope)).toBe('ext');
  });

  it('throws on unresolved', () => {
    const scope = buildScope({}, {});
    expect(() => interpolate('${NOPE}', scope)).toThrow(UnresolvedVariableError);
  });

  it('works inside URL, values, and regex', () => {
    const scope = buildScope({}, { BASE: 'http://x', X: 'abc' });
    expect(interpolate('${BASE}/path', scope)).toBe('http://x/path');
    expect(interpolate('prefix-${X}-suffix', scope)).toBe('prefix-abc-suffix');
  });
});
