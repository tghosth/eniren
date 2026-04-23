#!/usr/bin/env node
import { createLogger } from './logger.js';
import { loadEnirenEnv } from './env.js';
import { resolveScriptPaths, resolveServers } from './config.js';
import { runAll } from './runtime/runner.js';
import { readFile } from 'node:fs/promises';

const VERSION = '0.1.0';

function parseArgs(argv) {
  const opts = {
    singles: [],
    serversFile: null,
    level: 'ERROR',
    text: false,
    threads: 10,
    version: false,
    filePattern: null,
  };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    switch (a) {
      case '-V':
        opts.version = true; i++; break;
      case '-s':
        opts.singles.push(argv[++i]); i++; break;
      case '-S':
        opts.serversFile = argv[++i]; i++; break;
      case '-level':
        opts.level = argv[++i]; i++; break;
      case '-text':
        opts.text = true; i++; break;
      case '-threads':
        opts.threads = parseInt(argv[++i], 10); i++; break;
      default:
        if (opts.filePattern == null) {
          opts.filePattern = a;
          i++;
          break;
        }
        throw new Error(`unexpected argument: ${a}`);
    }
  }
  return opts;
}

export async function main(argv = process.argv.slice(2), { stderr = process.stderr, stdout = process.stdout } = {}) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    stderr.write(`ERR ${e.message}\n`);
    return 2;
  }
  if (opts.version) {
    stdout.write(`eniren ${VERSION}\n`);
    return 0;
  }
  if (!opts.filePattern) {
    stderr.write('ERR missing file_pattern argument\n');
    return 2;
  }

  const logger = createLogger({ level: opts.level, text: opts.text, stream: stderr });

  if (process.env.ENIREN_LICENSE) {
    logger.debug({ msg: 'license check skipped — OSS build' });
  }

  const env = loadEnirenEnv();

  // Seed TARGET_SERVER from CLI flags; fall back to env var ENIREN_TARGET_SERVER
  // (already present in `env` map with key "TARGET_SERVER").
  const { servers, errors: serverErrors } = await resolveServers({
    singles: opts.singles,
    file: opts.serversFile,
  });
  for (const e of serverErrors) logger.error({ msg: e });

  let cliTargetList = servers;
  if (cliTargetList.length === 0 && env.TARGET_SERVER) {
    cliTargetList = [env.TARGET_SERVER];
  }

  const scriptPaths = await resolveScriptPaths(opts.filePattern);
  if (scriptPaths.length === 0) {
    logger.error({ msg: `no scripts matched pattern "${opts.filePattern}"` });
    return 2;
  }

  const threads = Math.min(Math.max(opts.threads || 10, 1), 100);

  const { failures } = await runAll({
    scriptPaths,
    servers: cliTargetList,
    threads,
    env,
    logger,
  });

  return failures > 0 ? 1 : 0;
}

const invokedDirectly = process.argv[1] && (process.argv[1].endsWith('cli.js') || process.argv[1].endsWith('eniren'));
if (invokedDirectly) {
  main().then((code) => process.exit(code)).catch((e) => {
    process.stderr.write(`ERR ${e.stack || e.message}\n`);
    process.exit(2);
  });
}
