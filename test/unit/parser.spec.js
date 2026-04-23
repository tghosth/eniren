import { describe, it, expect } from 'vitest';
import { parseScript } from '../../src/parser/parser.js';
import { ParseError } from '../../src/parser/errors.js';

describe('parser', () => {
  it('parses a single GET test case with defaults', () => {
    const s = parseScript('GET http://x.com\n', 'a.txt');
    expect(s.testCases.length).toBe(1);
    const tc = s.testCases[0];
    expect(tc.request.method).toBe('GET');
    expect(tc.request.url).toBe('http://x.com');
    const types = tc.steps.filter(st => st.kind === 'modify' && st.what === 'type');
    expect(types[0].value).toBe('application/x-www-form-urlencoded');
    expect(types[0].injected).toBe(true);
    const statuses = tc.steps.filter(st => st.kind === 'compare' && st.target === 'status');
    expect(statuses[0].value).toBe('200');
    expect(statuses[0].injected).toBe(true);
  });

  it('splits test cases on blank lines', () => {
    const src = [
      'GET http://a',
      '',
      'POST http://b',
      'compare status == 405',
      '',
    ].join('\n');
    const s = parseScript(src, 'x.txt');
    expect(s.testCases.length).toBe(2);
    expect(s.testCases[0].request.method).toBe('GET');
    expect(s.testCases[1].request.method).toBe('POST');
  });

  it('ignores comments anywhere', () => {
    const src = [
      '# leading comment',
      'GET http://a',
      '# comment inside test case',
      'compare body contains foo',
      '',
      '# between',
      'GET http://b',
      '',
    ].join('\n');
    const s = parseScript(src, 'x.txt');
    expect(s.testCases.length).toBe(2);
  });

  it('supports tab-continued body lines', () => {
    const src = [
      'POST http://a',
      'modify type application/json',
      'modify body {',
      '\t"key1": "val1",',
      '\t"key2": "val2"',
      '\t}',
      'compare status == 405',
      '',
    ].join('\n');
    const s = parseScript(src, 'x.txt');
    const body = s.testCases[0].steps.find(st => st.kind === 'modify' && st.what === 'body');
    expect(body.value).toBe('{\n"key1": "val1",\n"key2": "val2"\n}');
  });

  it('reports line numbers on errors', () => {
    const src = [
      '',
      'NOTAMETHOD http://a',
      '',
    ].join('\n');
    expect(() => parseScript(src, 'x.txt')).toThrowError(ParseError);
    try { parseScript(src, 'x.txt'); } catch (e) { expect(e.line).toBe(2); }
  });

  it('explicit modify type overrides injected default', () => {
    const s = parseScript('POST http://a\nmodify type application/json\n', 'x.txt');
    const types = s.testCases[0].steps.filter(st => st.kind === 'modify' && st.what === 'type');
    expect(types.length).toBe(1);
    expect(types[0].value).toBe('application/json');
    expect(types[0].injected).toBeUndefined();
  });

  it('explicit compare status overrides injected default', () => {
    const s = parseScript('GET http://a\ncompare status == 404\n', 'x.txt');
    const statuses = s.testCases[0].steps.filter(st => st.kind === 'compare' && st.target === 'status');
    expect(statuses.length).toBe(1);
    expect(statuses[0].value).toBe('404');
  });

  it('parses multiple compare status lines and keeps both', () => {
    const s = parseScript('GET http://a\ncompare status != 500\ncompare status ~ ^2\n', 'x.txt');
    const statuses = s.testCases[0].steps.filter(st => st.kind === 'compare' && st.target === 'status');
    expect(statuses.length).toBe(2);
  });

  it('parses compare header with spaces and semicolons in value', () => {
    const s = parseScript(
      'GET http://a\ncompare header Strict-Transport-Security ~ max-age=[0-9]+; includeSubDomains; preload\n',
      'x.txt',
    );
    const cmp = s.testCases[0].steps.find(st => st.kind === 'compare' && st.target === 'header');
    expect(cmp.op).toBe('~');
    expect(cmp.value).toBe('max-age=[0-9]+; includeSubDomains; preload');
  });

  it('parses extract header with regex', () => {
    const s = parseScript('GET http://a\nextract header my-header var1 [A-Z2-7]+\n', 'x.txt');
    const ex = s.testCases[0].steps.find(st => st.kind === 'extract');
    expect(ex.from).toBe('header');
    expect(ex.name).toBe('my-header');
    expect(ex.var).toBe('var1');
    expect(ex.regex).toBe('[A-Z2-7]+');
  });
});
