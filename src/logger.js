const LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };

export function createLogger({ level = 'ERROR', text = false, stream = process.stderr } = {}) {
  const levelNum = LEVELS[level] ?? LEVELS.ERROR;
  function emit(lvl, data) {
    if (LEVELS[lvl] > levelNum) return;
    if (text) {
      stream.write(formatText(lvl, data) + '\n');
    } else {
      stream.write(JSON.stringify({ level: lvl, ...data }) + '\n');
    }
  }
  return {
    error: (d) => emit('ERROR', d),
    warn:  (d) => emit('WARN', d),
    info:  (d) => emit('INFO', d),
    debug: (d) => emit('DEBUG', d),
    level,
    text,
  };
}

function formatText(level, data) {
  const prefix = level === 'ERROR' ? 'ERR' : level;
  // Prefer the manual's format for comparison failures:
  //   ERR comparison `compare status == 200` failed line=1 script=simple.txt test="GET http://..."
  if (typeof data.msg === 'string' && data.msg.startsWith('comparison `')) {
    let out = `${prefix} ${data.msg}`;
    if (data.line !== undefined) out += ` line=${data.line}`;
    if (data.script !== undefined) out += ` script=${data.script}`;
    if (data.test !== undefined) out += ` test="${data.test}"`;
    if (data.reason !== undefined) out += ` reason="${data.reason}"`;
    return out;
  }
  const parts = [`${prefix} ${data.msg ?? ''}`];
  for (const [k, v] of Object.entries(data)) {
    if (k === 'msg') continue;
    parts.push(`${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`);
  }
  return parts.join(' ');
}
