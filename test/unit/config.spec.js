import { describe, it, expect } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { resolveScriptPaths, resolveServers, loadServersFile } from '../../src/config.js';

async function tmpDir() {
  const d = await (await import('node:fs/promises')).mkdtemp(path.join(os.tmpdir(), 'eniren-'));
  return d;
}

describe('resolveScriptPaths', () => {
  it('resolves literal file', async () => {
    const d = await tmpDir();
    const f = path.join(d, 'a.txt');
    await writeFile(f, 'GET http://x\n');
    const got = await resolveScriptPaths(f);
    expect(got).toEqual([path.resolve(f)]);
    await rm(d, { recursive: true });
  });

  it('resolves directory to all .txt', async () => {
    const d = await tmpDir();
    await writeFile(path.join(d, 'a.txt'), 'GET http://x\n');
    await writeFile(path.join(d, 'b.txt'), 'GET http://x\n');
    await writeFile(path.join(d, 'c.md'), 'ignore');
    const got = await resolveScriptPaths(d);
    expect(got.map(p => path.basename(p)).sort()).toEqual(['a.txt', 'b.txt']);
    await rm(d, { recursive: true });
  });

  it('resolves glob', async () => {
    const d = await tmpDir();
    await writeFile(path.join(d, 'a.txt'), 'GET http://x\n');
    await writeFile(path.join(d, 'b.txt'), 'GET http://x\n');
    const got = await resolveScriptPaths(path.join(d, '*.txt').replaceAll('\\', '/'));
    expect(got.length).toBe(2);
    await rm(d, { recursive: true });
  });

  it('returns empty for no match', async () => {
    const got = await resolveScriptPaths('/__no_match_here__/*.txt');
    expect(got).toEqual([]);
  });
});

describe('loadServersFile', () => {
  it('parses with blanks, comments, and rejects bad urls', async () => {
    const d = await tmpDir();
    const f = path.join(d, 's.txt');
    await writeFile(f, '\nhttps://a.com\n# comment\nnot-a-url\n\nhttp://b.com\n');
    const { servers, errors } = await loadServersFile(f);
    expect(servers).toEqual(['https://a.com', 'http://b.com']);
    expect(errors.length).toBe(1);
    await rm(d, { recursive: true });
  });
});

describe('resolveServers', () => {
  it('unions -s and -S file entries', async () => {
    const d = await tmpDir();
    const f = path.join(d, 's.txt');
    await writeFile(f, 'https://b\nhttps://c\n');
    const { servers } = await resolveServers({ singles: ['https://a'], file: f });
    expect(servers).toEqual(['https://a', 'https://b', 'https://c']);
    await rm(d, { recursive: true });
  });
});
