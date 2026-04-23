import { startTestServer } from '../../src/server/testServer.js';
import { main } from '../../src/cli.js';
import { Writable } from 'node:stream';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export async function withServer(fn) {
  const s = await startTestServer(0);
  try {
    await fn(s);
  } finally {
    await new Promise((r) => s.server.close(r));
  }
}

export function captureStream() {
  const chunks = [];
  const s = new Writable({
    write(chunk, enc, cb) { chunks.push(chunk.toString()); cb(); },
  });
  s.getOutput = () => chunks.join('');
  return s;
}

export async function writeTmp(files) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'eniren-it-'));
  const paths = {};
  for (const [name, content] of Object.entries(files)) {
    const p = path.join(dir, name);
    await writeFile(p, content);
    paths[name] = p;
  }
  return { dir, paths, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

export async function runCli(args, env = {}) {
  const stderr = captureStream();
  const stdout = captureStream();
  const prev = { ...process.env };
  // Wipe any ENIREN_* leakage then apply override env.
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('ENIREN_')) delete process.env[k];
  }
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  try {
    const code = await main(args, { stderr, stdout });
    return { code, stderr: stderr.getOutput(), stdout: stdout.getOutput() };
  } finally {
    // Restore env
    for (const k of Object.keys(process.env)) {
      if (!(k in prev)) delete process.env[k];
    }
    for (const [k, v] of Object.entries(prev)) process.env[k] = v;
  }
}
