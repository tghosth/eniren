export function applyModify(step, reqBuilder) {
  switch (step.what) {
    case 'header':
      reqBuilder.setHeader(step.name, step.value);
      return;
    case 'cookie':
      reqBuilder.setCookie(step.name, step.value);
      return;
    case 'type':
      reqBuilder.setHeader('Content-Type', step.value);
      return;
    case 'body':
      reqBuilder.setBody(step.value);
      return;
    default:
      throw new Error(`unknown modify target "${step.what}"`);
  }
}
