import { describe, it, expect } from 'vitest';
import { applyOperator, compareStep, CompareFailure } from '../../src/runtime/compare.js';

function mkResponse({ status = 200, headers = {}, body = '', cookies = {} } = {}) {
  return {
    status,
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

describe('applyOperator', () => {
  it.each([
    ['==', 'a', 'a', true],
    ['==', 'a', 'b', false],
    ['!=', 'a', 'b', true],
    ['contains', 'hello world', 'orl', true],
    ['!contains', 'hello', 'z', true],
    ['~', 'abc123', '^[a-z]+\\d+$', true],
    ['!~', 'abc', '^\\d+$', true],
  ])('%s %s %s -> %s', (op, a, b, expected) => {
    expect(applyOperator(op, a, b)).toBe(expected);
  });
});

describe('compareStep', () => {
  it('compares status', () => {
    const res = mkResponse({ status: 200 });
    expect(() => compareStep({ target: 'status', op: '==', value: '200' }, res)).not.toThrow();
    expect(() => compareStep({ target: 'status', op: '==', value: '500' }, res)).toThrow(CompareFailure);
  });

  it('compares body substring', () => {
    const res = mkResponse({ body: '<title>Hello</title>' });
    expect(() => compareStep({ target: 'body', op: 'contains', value: 'Hello' }, res)).not.toThrow();
  });

  it('compares redirect only on 3xx', () => {
    const res3xx = mkResponse({ status: 301, headers: { location: 'https://x' } });
    expect(() => compareStep({ target: 'redirect', op: 'contains', value: 'https://x' }, res3xx)).not.toThrow();
    const res200 = mkResponse({ status: 200 });
    const err = catchErr(() => compareStep({ target: 'redirect', op: '==', value: '' }, res200));
    expect(err).toBeInstanceOf(CompareFailure);
    expect(err.message).toBe('no redirect in response');
  });

  it('matches headers case-insensitively', () => {
    const res = mkResponse({ headers: { 'content-type': 'text/html; charset=utf-8' } });
    expect(() => compareStep({ target: 'header', name: 'Content-Type', op: '==', value: 'text/html; charset=utf-8' }, res)).not.toThrow();
  });

  it('fails when header absent', () => {
    const res = mkResponse({});
    expect(() => compareStep({ target: 'header', name: 'X-Missing', op: '==', value: 'x' }, res)).toThrow(CompareFailure);
  });
});

function catchErr(fn) {
  try { fn(); return null; } catch (e) { return e; }
}
