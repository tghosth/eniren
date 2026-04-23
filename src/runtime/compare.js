export class CompareFailure extends Error {
  constructor(message) {
    super(message);
    this.name = 'CompareFailure';
  }
}

export function applyOperator(op, actual, expected) {
  const a = actual == null ? '' : String(actual);
  const e = expected == null ? '' : String(expected);
  switch (op) {
    case '==':
      return a === e;
    case '!=':
      return a !== e;
    case 'contains':
      return a.includes(e);
    case '!contains':
      return !a.includes(e);
    case '~': {
      const re = new RegExp(e);
      return re.test(a);
    }
    case '!~': {
      const re = new RegExp(e);
      return !re.test(a);
    }
    default:
      throw new Error(`unknown operator "${op}"`);
  }
}

export function compareStep(step, response) {
  const { target, op, value } = step;
  let actual;
  switch (target) {
    case 'status':
      actual = String(response.status);
      break;
    case 'body':
      actual = response.body;
      break;
    case 'redirect':
      if (response.status < 300 || response.status >= 400) {
        throw new CompareFailure('no redirect in response');
      }
      actual = response.getHeader('location') ?? '';
      break;
    case 'header':
      actual = response.getHeader(step.name);
      if (actual == null) {
        throw new CompareFailure(`header "${step.name}" not present`);
      }
      break;
    case 'cookie':
      actual = response.getCookie(step.name);
      if (actual == null) {
        throw new CompareFailure(`cookie "${step.name}" not present`);
      }
      break;
    default:
      throw new Error(`unknown compare target "${target}"`);
  }
  const ok = applyOperator(op, actual, value);
  if (!ok) {
    throw new CompareFailure(`comparison failed (actual=${JSON.stringify(actual)})`);
  }
}
