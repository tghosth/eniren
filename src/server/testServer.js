import http from 'node:http';

export function createTestServer() {
  const server = http.createServer(handle);
  return server;
}

export function startTestServer(port = 0) {
  return new Promise((resolve) => {
    const server = createTestServer();
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: addr.port, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

function send(res, status, headers, body) {
  const h = { 'content-type': 'text/plain; charset=utf-8', ...headers };
  res.writeHead(status, h);
  res.end(body ?? '');
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    out[k] = v.join('=');
  }
  return out;
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const p = url.pathname;
  const method = req.method;

  if (p === '/ok') return send(res, 200, {}, 'ok');
  if (p === '/teapot') return send(res, 418, {}, "i'm a teapot");

  if (p === '/redirect-http-to-https') {
    return send(res, 301, { location: 'https://www.lcisec.dev/' }, '');
  }

  if (p === '/echo' && method === 'POST') {
    const body = await readBody(req);
    const echoed = {
      method,
      headers: req.headers,
      body,
    };
    return send(res, 200, { 'content-type': 'application/json' }, JSON.stringify(echoed));
  }

  if (p === '/methods') {
    if (method === 'GET') return send(res, 200, {}, 'methods ok');
    return send(res, 405, { allow: 'GET' }, 'Method Not Allowed');
  }

  if (p === '/any-method') {
    const body = await readBody(req);
    return send(res, 200, { 'content-type': 'application/json' }, JSON.stringify({ method, body }));
  }

  if (p === '/set-cookie') {
    return send(res, 200, { 'set-cookie': 'sid=abc123; Path=/' }, 'set');
  }

  if (p === '/set-named-cookie') {
    // Set a cookie whose value is an uppercase base32-ish string for extract-regex tests.
    return send(res, 200, { 'set-cookie': 'token=QWERTYUIOP2345; Path=/' }, 'named');
  }

  if (p === '/whoami') {
    const cookies = parseCookies(req.headers['cookie']);
    if (cookies.sid === 'abc123') return send(res, 200, {}, 'user-alice');
    return send(res, 401, {}, 'no sid');
  }

  if (p === '/headers-echo') {
    const headers = {};
    for (const [k, v] of url.searchParams) {
      headers[k.toLowerCase()] = v;
    }
    return send(res, 200, headers, 'headers-echoed');
  }

  if (p === '/anything') {
    const body = await readBody(req);
    const out = { method, headers: req.headers, body };
    // httpbin mimics by echoing header values back in the body under "New-Header", etc.
    // We'll reflect every header with capitalised first letter so scripts can assert on them.
    const reflected = {};
    for (const [k, v] of Object.entries(req.headers)) {
      reflected[k.replace(/(^|-)([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase())] = v;
    }
    return send(res, 200, { 'content-type': 'application/json' },
      JSON.stringify({ ...out, reflected }));
  }

  if (p === '/csp') {
    return send(res, 200, {
      'content-security-policy': "default-src *; style-src 'unsafe-inline'; script-src 'unsafe-eval'",
      'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    }, 'csp-ok');
  }

  if (p === '/.well-known/security.txt') {
    return send(res, 200, {}, 'Contact: mailto:security@example.com\n');
  }

  if (p === '/slow') {
    const ms = parseInt(url.searchParams.get('ms') ?? '1000', 10);
    setTimeout(() => send(res, 200, {}, 'slow-done'), ms);
    return;
  }

  send(res, 404, {}, 'not found');
}

// Run as a standalone server if invoked directly.
if (process.argv[1] && process.argv[1].endsWith('testServer.js')) {
  const port = parseInt(process.env.PORT ?? '8787', 10);
  startTestServer(port).then(({ url }) => {
    process.stdout.write(`test server listening on ${url}\n`);
  });
}
