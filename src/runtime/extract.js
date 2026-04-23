export class ExtractFailure extends Error {
  constructor(message) {
    super(message);
    this.name = 'ExtractFailure';
  }
}

export function extractStep(step, response) {
  const { from, regex } = step;
  let source;
  if (from === 'header') {
    source = response.getHeader(step.name);
    if (source == null) {
      throw new ExtractFailure(`header "${step.name}" not present`);
    }
  } else if (from === 'cookie') {
    source = response.getCookie(step.name);
    if (source == null) {
      throw new ExtractFailure(`cookie "${step.name}" not present`);
    }
  } else if (from === 'body') {
    source = response.body;
  } else {
    throw new Error(`unknown extract target "${from}"`);
  }

  const re = new RegExp(regex);
  const match = String(source).match(re);
  if (!match) {
    throw new ExtractFailure('extract did not match');
  }
  return { var: step.var, value: match[0] };
}
