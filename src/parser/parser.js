import { ParseError } from './errors.js';

const HTTP_METHODS = new Set([
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS',
]);

const MODIFY_TARGETS_NAMED = new Set(['cookie', 'header']);
const MODIFY_TARGETS_SIMPLE = new Set(['body', 'type']);
const EXTRACT_TARGETS_NAMED = new Set(['cookie', 'header']);
const COMPARE_TARGETS_NAMED = new Set(['cookie', 'header']);
const COMPARE_TARGETS_SIMPLE = new Set(['body', 'redirect', 'status']);
const COMPARE_OPS = ['!contains', 'contains', '!=', '==', '!~', '~'];

export function parseScript(text, scriptName) {
  const lines = text.split(/\r?\n/);
  const testCases = [];
  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      i++;
      continue;
    }
    const tc = parseTestCase(lines, i, scriptName);
    testCases.push(tc.testCase);
    i = tc.nextIndex;
  }
  return { name: scriptName, testCases };
}

function parseTestCase(lines, startIndex, scriptName) {
  const requestLineRaw = lines[startIndex];
  const requestLineNo = startIndex + 1;
  const requestTrim = requestLineRaw.trim();
  const spaceIdx = requestTrim.indexOf(' ');
  if (spaceIdx === -1) {
    throw new ParseError(
      `expected "METHOD URL" but got "${requestTrim}"`,
      { line: requestLineNo, script: scriptName },
    );
  }
  const method = requestTrim.slice(0, spaceIdx);
  const url = requestTrim.slice(spaceIdx + 1).trim();
  if (!HTTP_METHODS.has(method)) {
    throw new ParseError(
      `unknown HTTP method "${method}"`,
      { line: requestLineNo, script: scriptName },
    );
  }
  if (!url) {
    throw new ParseError('missing URL', { line: requestLineNo, script: scriptName });
  }

  const steps = [];
  let i = startIndex + 1;
  let typeOverridden = false;
  let statusCompared = false;

  while (i < lines.length) {
    const raw = lines[i];
    if (raw.trim() === '') break;
    if (raw.trim().startsWith('#')) { i++; continue; }

    const lineNo = i + 1;
    const tokens = raw.trim();
    const head = tokens.split(/\s+/)[0];

    if (head === 'modify') {
      const parsed = parseModify(tokens, lineNo, scriptName, lines, i);
      if (parsed.what === 'type') typeOverridden = true;
      steps.push({ ...parsed.step, line: lineNo });
      i = parsed.nextIndex;
      continue;
    }
    if (head === 'extract') {
      const step = parseExtract(tokens, lineNo, scriptName);
      steps.push({ ...step, line: lineNo });
      i++;
      continue;
    }
    if (head === 'compare') {
      const step = parseCompare(tokens, lineNo, scriptName);
      if (step.target === 'status') statusCompared = true;
      steps.push({ ...step, line: lineNo });
      i++;
      continue;
    }
    throw new ParseError(
      `unknown command "${head}"`,
      { line: lineNo, script: scriptName },
    );
  }

  const request = { method, url, line: requestLineNo };
  const prepend = [];
  if (!typeOverridden) {
    prepend.push({
      kind: 'modify', what: 'type',
      value: 'application/x-www-form-urlencoded',
      line: requestLineNo, injected: true,
    });
  }
  if (!statusCompared) {
    steps.push({
      kind: 'compare', target: 'status',
      op: '==', value: '200',
      line: requestLineNo, injected: true,
    });
  }
  return {
    testCase: { request, steps: [...prepend, ...steps] },
    nextIndex: i,
  };
}

function parseModify(tokens, lineNo, scriptName, lines, currentIndex) {
  // "modify what [name] value"
  const parts = tokens.split(/\s+/);
  const what = parts[1];
  if (!what) {
    throw new ParseError('modify: missing target', { line: lineNo, script: scriptName });
  }
  if (MODIFY_TARGETS_NAMED.has(what)) {
    const name = parts[2];
    if (!name) {
      throw new ParseError(
        `modify ${what}: missing name`,
        { line: lineNo, script: scriptName },
      );
    }
    const valueStart = tokens.indexOf(name) + name.length;
    const value = tokens.slice(valueStart).replace(/^\s+/, '');
    if (!value) {
      throw new ParseError(
        `modify ${what} ${name}: missing value`,
        { line: lineNo, script: scriptName },
      );
    }
    return {
      step: { kind: 'modify', what, name, value },
      nextIndex: currentIndex + 1,
    };
  }
  if (MODIFY_TARGETS_SIMPLE.has(what)) {
    const rest = tokens.slice(tokens.indexOf(what) + what.length).replace(/^\s+/, '');
    if (!rest) {
      throw new ParseError(
        `modify ${what}: missing value`,
        { line: lineNo, script: scriptName },
      );
    }
    if (what === 'body') {
      // Body may continue on subsequent lines prefixed with \t.
      const bodyLines = [rest];
      let j = currentIndex + 1;
      while (j < lines.length) {
        const l = lines[j];
        if (l.startsWith('\t')) {
          bodyLines.push(l.slice(1));
          j++;
        } else {
          break;
        }
      }
      return {
        step: { kind: 'modify', what: 'body', value: bodyLines.join('\n') },
        what: 'body',
        nextIndex: j,
      };
    }
    return {
      step: { kind: 'modify', what, value: rest },
      what,
      nextIndex: currentIndex + 1,
    };
  }
  throw new ParseError(
    `modify: unknown target "${what}"`,
    { line: lineNo, script: scriptName },
  );
}

function parseExtract(tokens, lineNo, scriptName) {
  // "extract from into [name] regex"
  // from = cookie|header|body ; for cookie|header a name is required
  const parts = tokens.split(/\s+/);
  const from = parts[1];
  if (!from) {
    throw new ParseError('extract: missing target', { line: lineNo, script: scriptName });
  }
  if (EXTRACT_TARGETS_NAMED.has(from)) {
    const name = parts[2];
    const varName = parts[3];
    if (!name || !varName) {
      throw new ParseError(
        `extract ${from}: missing name or variable`,
        { line: lineNo, script: scriptName },
      );
    }
    const regexStart = tokens.indexOf(varName, tokens.indexOf(name) + name.length) + varName.length;
    const regex = tokens.slice(regexStart).replace(/^\s+/, '');
    if (!regex) {
      throw new ParseError('extract: missing regex', { line: lineNo, script: scriptName });
    }
    return { kind: 'extract', from, name, var: varName, regex };
  }
  if (from === 'body') {
    const varName = parts[2];
    if (!varName) {
      throw new ParseError('extract body: missing variable', { line: lineNo, script: scriptName });
    }
    const regexStart = tokens.indexOf(varName) + varName.length;
    const regex = tokens.slice(regexStart).replace(/^\s+/, '');
    if (!regex) {
      throw new ParseError('extract: missing regex', { line: lineNo, script: scriptName });
    }
    return { kind: 'extract', from: 'body', var: varName, regex };
  }
  throw new ParseError(
    `extract: unknown target "${from}"`,
    { line: lineNo, script: scriptName },
  );
}

function parseCompare(tokens, lineNo, scriptName) {
  // "compare what [name] operator value"
  const parts = tokens.split(/\s+/);
  const target = parts[1];
  if (!target) {
    throw new ParseError('compare: missing target', { line: lineNo, script: scriptName });
  }

  let rest;
  let name;
  if (COMPARE_TARGETS_NAMED.has(target)) {
    name = parts[2];
    if (!name) {
      throw new ParseError(
        `compare ${target}: missing name`,
        { line: lineNo, script: scriptName },
      );
    }
    rest = tokens.slice(tokens.indexOf(name, tokens.indexOf(target) + target.length) + name.length).replace(/^\s+/, '');
  } else if (COMPARE_TARGETS_SIMPLE.has(target)) {
    rest = tokens.slice(tokens.indexOf(target) + target.length).replace(/^\s+/, '');
  } else {
    throw new ParseError(
      `compare: unknown target "${target}"`,
      { line: lineNo, script: scriptName },
    );
  }

  const op = COMPARE_OPS.find((o) => {
    if (rest === o) return true;
    if (rest.startsWith(o + ' ')) return true;
    return false;
  });
  if (!op) {
    throw new ParseError(
      `compare ${target}: missing or invalid operator`,
      { line: lineNo, script: scriptName },
    );
  }
  const value = rest.slice(op.length).replace(/^\s+/, '');
  // For `contains`/`!contains`/`==`/`!=`/`~`/`!~` an empty value is allowed only
  // if the original line contained explicit empty-string semantics. Keep it strict
  // for now and require something after the operator.
  if (value.length === 0) {
    throw new ParseError(
      `compare ${target}: missing value`,
      { line: lineNo, script: scriptName },
    );
  }

  const step = { kind: 'compare', target, op, value };
  if (name !== undefined) step.name = name;
  return step;
}
