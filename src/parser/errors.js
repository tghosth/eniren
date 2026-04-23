export class ParseError extends Error {
  constructor(message, { line, script }) {
    super(message);
    this.name = 'ParseError';
    this.line = line;
    this.script = script;
  }
}
