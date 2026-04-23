import { HttpClient, RequestBuilder } from './httpClient.js';
import { applyModify } from './modify.js';
import { extractStep, ExtractFailure } from './extract.js';
import { compareStep, CompareFailure } from './compare.js';
import { interpolate, buildScope, UnresolvedVariableError } from '../interp/variables.js';

function formatStep(step) {
  switch (step.kind) {
    case 'modify':
      if (step.what === 'cookie' || step.what === 'header') {
        return `modify ${step.what} ${step.name} ${step.value}`;
      }
      return `modify ${step.what} ${step.value}`;
    case 'extract':
      if (step.from === 'cookie' || step.from === 'header') {
        return `extract ${step.from} ${step.name} ${step.var} ${step.regex}`;
      }
      return `extract ${step.from} ${step.var} ${step.regex}`;
    case 'compare':
      if (step.target === 'cookie' || step.target === 'header') {
        return `compare ${step.target} ${step.name} ${step.op} ${step.value}`;
      }
      return `compare ${step.target} ${step.op} ${step.value}`;
    default:
      return '(unknown step)';
  }
}

function formatRequest(req) {
  return `${req.method} ${req.url}`;
}

export async function runScript(script, { env, logger, seedVars = {} }) {
  const extracted = { ...seedVars };
  const client = new HttpClient();
  let failures = 0;

  for (const tc of script.testCases) {
    const scope = buildScope(env, extracted);
    const testLabel = safeInterpolate(formatRequest(tc.request), scope) ?? formatRequest(tc.request);
    const result = await runTestCase(tc, { client, scope, script, testLabel, logger, extracted });
    failures += result.failures;
    // Write back extracted vars (runTestCase mutates `extracted` directly).
  }
  return { failures };
}

async function runTestCase(tc, { client, scope, script, testLabel, logger, extracted }) {
  let failures = 0;

  // Prepare request
  const reqBuilder = new RequestBuilder(tc.request.method, '');
  try {
    reqBuilder.url = interpolate(tc.request.url, scope);
  } catch (e) {
    logFailure(logger, script, tc, tc.request.line, testLabel, formatRequest(tc.request), e.message);
    return { failures: 1 };
  }

  // Apply modify steps first (so headers/body are set before send)
  for (const step of tc.steps) {
    if (step.kind !== 'modify') continue;
    try {
      const stepCopy = { ...step };
      if (stepCopy.value !== undefined) stepCopy.value = interpolate(stepCopy.value, scope);
      if (stepCopy.name !== undefined) stepCopy.name = interpolate(stepCopy.name, scope);
      applyModify(stepCopy, reqBuilder);
    } catch (e) {
      logFailure(logger, script, tc, step.line, testLabel, formatStep(step), e.message);
      failures++;
      return { failures };
    }
  }

  // Send request
  let response;
  try {
    response = await client.send(reqBuilder);
  } catch (e) {
    logFailure(logger, script, tc, tc.request.line, testLabel, formatRequest(tc.request), `request failed: ${e.message}`);
    return { failures: 1 };
  }

  logger.info({
    msg: 'response received',
    status: response.status,
    script: script.name,
    test: testLabel,
  });

  // Then run extract + compare in script order (excluding modify which we already did).
  for (const step of tc.steps) {
    if (step.kind === 'modify') continue;
    try {
      const stepCopy = { ...step };
      if (stepCopy.value !== undefined) stepCopy.value = interpolate(stepCopy.value, scope);
      if (stepCopy.name !== undefined) stepCopy.name = interpolate(stepCopy.name, scope);
      if (stepCopy.regex !== undefined) stepCopy.regex = interpolate(stepCopy.regex, scope);

      if (step.kind === 'extract') {
        const result = extractStep(stepCopy, response);
        extracted[result.var] = result.value;
        scope.extracted[result.var] = result.value;
      } else if (step.kind === 'compare') {
        compareStep(stepCopy, response);
      }
    } catch (e) {
      if (e instanceof CompareFailure || e instanceof ExtractFailure || e instanceof UnresolvedVariableError) {
        logFailure(logger, script, tc, step.line, testLabel, formatStep(step), e.message);
      } else {
        logFailure(logger, script, tc, step.line, testLabel, formatStep(step), `error: ${e.message}`);
      }
      failures++;
    }
  }
  return { failures };
}

function safeInterpolate(s, scope) {
  try {
    return interpolate(s, scope);
  } catch {
    return null;
  }
}

function logFailure(logger, script, tc, line, testLabel, stepText, reason) {
  logger.error({
    msg: `comparison \`${stepText}\` failed`,
    line,
    script: script.name,
    test: testLabel,
    reason,
  });
}
