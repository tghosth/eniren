const PREFIX = 'ENIREN_';

export function loadEnirenEnv(processEnv = process.env) {
  const out = {};
  for (const [k, v] of Object.entries(processEnv)) {
    if (k.startsWith(PREFIX)) {
      out[k.slice(PREFIX.length)] = v;
    }
  }
  return out;
}
