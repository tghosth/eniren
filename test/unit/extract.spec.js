import { describe, it, expect } from 'vitest';
import { extractStep, ExtractFailure } from '../../src/runtime/extract.js';

function mkResponse({ headers = {}, body = '', cookies = {} } = {}) {
  return {
    getHeader(name) {
      const k = Object.keys(headers).find((h) => h.toLowerCase() === name.toLowerCase());
      return k ? headers[k] : undefined;
    },
    getCookie(name) {
      return Object.prototype.hasOwnProperty.call(cookies, name) ? cookies[name] : null;
    },
    body,
  };
}

describe('extractStep', () => {
  it('extracts whole-match from header', () => {
    const res = mkResponse({ headers: { 'my-header': 'FETUWUWYRATNUCQIRJRA' } });
    const out = extractStep({ from: 'header', name: 'my-header', var: 'v', regex: '[A-Z2-7]+' }, res);
    expect(out.var).toBe('v');
    expect(out.value).toBe('FETUWUWYRATNUCQIRJRA');
  });

  it('ignores capture groups (stores match[0])', () => {
    const res = mkResponse({ body: 'abc-123-xyz' });
    const out = extractStep({ from: 'body', var: 'v', regex: 'abc-(\\d+)-xyz' }, res);
    expect(out.value).toBe('abc-123-xyz');
  });

  it('fails when header missing', () => {
    const res = mkResponse({});
    expect(() => extractStep({ from: 'header', name: 'x', var: 'v', regex: '.+' }, res)).toThrow(ExtractFailure);
  });

  it('fails when regex does not match', () => {
    const res = mkResponse({ body: 'nothing' });
    const err = catchErr(() => extractStep({ from: 'body', var: 'v', regex: '^\\d+$' }, res));
    expect(err).toBeInstanceOf(ExtractFailure);
    expect(err.message).toBe('extract did not match');
  });
});

function catchErr(fn) { try { fn(); return null; } catch (e) { return e; } }
