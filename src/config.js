import fg from 'fast-glob';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export async function resolveScriptPaths(pattern) {
  // Three supported forms: literal file, directory, glob.
  try {
    const s = await stat(pattern);
    if (s.isFile()) return [path.resolve(pattern)];
    if (s.isDirectory()) {
      return (await fg('**/*.txt', { cwd: pattern, absolute: true })).sort();
    }
  } catch {
    // Fall through to glob resolution.
  }
  const matches = await fg(pattern, { absolute: true });
  return matches.sort();
}

function isLikelyUrl(s) {
  return /^https?:\/\//i.test(s);
}

export async function loadServersFile(file) {
  const text = await readFile(file, 'utf8');
  const servers = [];
  const errors = [];
  text.split(/\r?\n/).forEach((line, idx) => {
    const t = line.trim();
    if (!t) return;
    if (t.startsWith('#')) return;
    if (!isLikelyUrl(t)) {
      errors.push(`invalid URL at ${file}:${idx + 1}: "${t}"`);
      return;
    }
    servers.push(t);
  });
  return { servers, errors };
}

export async function resolveServers({ singles, file }) {
  const out = [];
  const errors = [];
  for (const s of singles) {
    if (!isLikelyUrl(s)) {
      errors.push(`invalid URL in -s: "${s}"`);
      continue;
    }
    out.push(s);
  }
  if (file) {
    const loaded = await loadServersFile(file);
    out.push(...loaded.servers);
    errors.push(...loaded.errors);
  }
  return { servers: out, errors };
}
