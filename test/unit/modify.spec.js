import { describe, it, expect } from 'vitest';
import { RequestBuilder } from '../../src/runtime/httpClient.js';
import { applyModify } from '../../src/runtime/modify.js';

describe('applyModify', () => {
  it('sets header (last wins, case-insensitive key)', () => {
    const b = new RequestBuilder('GET', 'http://x');
    applyModify({ what: 'header', name: 'X-Foo', value: 'a' }, b);
    applyModify({ what: 'header', name: 'x-foo', value: 'b' }, b);
    expect(b.headers['x-foo']).toBe('b');
  });

  it('sets type via Content-Type header', () => {
    const b = new RequestBuilder('POST', 'http://x');
    applyModify({ what: 'type', value: 'application/json' }, b);
    expect(b.headers['content-type']).toBe('application/json');
  });

  it('sets body raw', () => {
    const b = new RequestBuilder('POST', 'http://x');
    applyModify({ what: 'body', value: '{"a":1}' }, b);
    expect(b.body).toBe('{"a":1}');
  });

  it('sets cookie by name', () => {
    const b = new RequestBuilder('GET', 'http://x');
    applyModify({ what: 'cookie', name: 'sid', value: 'abc' }, b);
    expect(b.cookies.sid).toBe('abc');
  });
});
