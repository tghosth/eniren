import { runScript } from './scriptRunner.js';
import { parseScript } from '../parser/parser.js';
import { ParseError } from '../parser/errors.js';
import { readFile } from 'node:fs/promises';

export async function runAll({ scriptPaths, servers, threads, env, logger }) {
  // Load + parse all scripts up front (parse errors fail fast but don't stop others).
  const scripts = [];
  let parseFailures = 0;
  for (const p of scriptPaths) {
    try {
      const text = await readFile(p, 'utf8');
      scripts.push(parseScript(text, p));
    } catch (e) {
      parseFailures++;
      if (e instanceof ParseError) {
        logger.error({ msg: 'parse error', script: p, line: e.line, reason: e.message });
      } else {
        logger.error({ msg: 'failed to load script', script: p, reason: e.message });
      }
    }
  }

  // Expand per-server if servers are specified.
  const targetList = (servers && servers.length > 0) ? servers : [null];

  const runUnits = [];
  for (const script of scripts) {
    for (const target of targetList) {
      runUnits.push({ script, target });
    }
  }

  let failures = parseFailures;
  let index = 0;
  const worker = async () => {
    while (index < runUnits.length) {
      const my = index++;
      const unit = runUnits[my];
      const seedVars = unit.target ? { TARGET_SERVER: unit.target } : {};
      try {
        const res = await runScript(unit.script, { env, logger, seedVars });
        failures += res.failures;
      } catch (e) {
        failures++;
        logger.error({ msg: 'script crashed', script: unit.script.name, reason: e.message });
      }
    }
  };
  const concurrency = Math.min(Math.max(threads, 1), 100);
  const workers = Array.from({ length: Math.min(concurrency, runUnits.length || 1) }, () => worker());
  await Promise.all(workers);
  return { failures };
}
