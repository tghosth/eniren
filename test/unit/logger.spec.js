import { describe, it, expect } from 'vitest';
import { Writable } from 'node:stream';
import { createLogger } from '../../src/logger.js';

function captureStream() {
  const chunks = [];
  const s = new Writable({
    write(chunk, enc, cb) { chunks.push(chunk.toString()); cb(); },
  });
  s.getOutput = () => chunks.join('');
  return s;
}

describe('logger', () => {
  it('emits JSON by default', () => {
    const s = captureStream();
    const lg = createLogger({ level: 'INFO', stream: s });
    lg.info({ msg: 'hello', script: 'x' });
    const line = JSON.parse(s.getOutput().trim());
    expect(line.level).toBe('INFO');
    expect(line.msg).toBe('hello');
    expect(line.script).toBe('x');
  });

  it('suppresses lower levels', () => {
    const s = captureStream();
    const lg = createLogger({ level: 'ERROR', stream: s });
    lg.info({ msg: 'noisy' });
    lg.debug({ msg: 'noisier' });
    expect(s.getOutput()).toBe('');
  });

  it('text mode uses the manual format for comparison failures', () => {
    const s = captureStream();
    const lg = createLogger({ level: 'ERROR', text: true, stream: s });
    lg.error({
      msg: 'comparison `compare status == 200` failed',
      line: 1,
      script: 'simple.txt',
      test: 'GET http://www.example.com',
    });
    const out = s.getOutput().trim();
    expect(out).toBe('ERR comparison `compare status == 200` failed line=1 script=simple.txt test="GET http://www.example.com"');
  });
});
