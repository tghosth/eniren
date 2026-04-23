import { request } from 'undici';
import { CookieJar } from 'tough-cookie';

export class RequestBuilder {
  constructor(method, url) {
    this.method = method;
    this.url = url;
    this.headers = {}; // lower-cased key -> value
    this.cookies = {}; // name -> value (script-level overrides)
    this.body = undefined;
  }
  setHeader(name, value) {
    this.headers[name.toLowerCase()] = String(value);
  }
  setCookie(name, value) {
    this.cookies[name] = String(value);
  }
  setBody(body) {
    this.body = body;
  }
}

function findHeader(headers, name) {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) {
      if (Array.isArray(v)) return v[0];
      return v;
    }
  }
  return undefined;
}

function findAllSetCookieValues(headers) {
  const out = [];
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'set-cookie') {
      if (Array.isArray(v)) out.push(...v);
      else out.push(v);
    }
  }
  return out;
}

function parseCookiePair(cookieStr) {
  const firstSemi = cookieStr.indexOf(';');
  const pair = firstSemi === -1 ? cookieStr : cookieStr.slice(0, firstSemi);
  const eq = pair.indexOf('=');
  if (eq === -1) return null;
  return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim() };
}

export class ResponseView {
  constructor({ status, headers, body, cookiesForUrl }) {
    this.status = status;
    this.headers = headers;
    this.body = body;
    this._cookiesForUrl = cookiesForUrl; // map name -> value from jar for the URL
  }
  getHeader(name) {
    return findHeader(this.headers, name);
  }
  getCookie(name) {
    // Check Set-Cookie headers first (this response), then fall back to jar.
    const setCookies = findAllSetCookieValues(this.headers);
    for (const sc of setCookies) {
      const pair = parseCookiePair(sc);
      if (pair && pair.name === name) return pair.value;
    }
    if (this._cookiesForUrl && Object.prototype.hasOwnProperty.call(this._cookiesForUrl, name)) {
      return this._cookiesForUrl[name];
    }
    return null;
  }
}

export class HttpClient {
  constructor({ timeoutMs = 30000 } = {}) {
    this.jar = new CookieJar();
    this.timeoutMs = timeoutMs;
  }

  async send(reqBuilder) {
    const url = reqBuilder.url;
    const urlObj = new URL(url);

    // Start with cookies from jar for this URL.
    const jarCookieHeader = await this.jar.getCookieString(url);
    const cookiePairs = [];
    if (jarCookieHeader) cookiePairs.push(jarCookieHeader);
    // Add per-request override cookies (these are also saved into the jar).
    for (const [name, value] of Object.entries(reqBuilder.cookies)) {
      cookiePairs.push(`${name}=${value}`);
      await this.jar.setCookie(`${name}=${value}; Path=/`, `${urlObj.protocol}//${urlObj.host}/`);
    }
    const finalHeaders = { ...reqBuilder.headers };
    if (cookiePairs.length > 0) {
      finalHeaders['cookie'] = cookiePairs.join('; ');
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    let res;
    try {
      res = await request(url, {
        method: reqBuilder.method,
        headers: finalHeaders,
        body: reqBuilder.body,
        maxRedirections: 0,
        signal: ac.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    // Persist Set-Cookie headers back to the jar.
    const setCookies = findAllSetCookieValues(res.headers);
    for (const sc of setCookies) {
      try {
        await this.jar.setCookie(sc, url);
      } catch {
        // ignore malformed cookies
      }
    }

    const body = await res.body.text();
    const cookiesForUrl = await cookiesByNameForUrl(this.jar, url);
    return new ResponseView({
      status: res.statusCode,
      headers: res.headers,
      body,
      cookiesForUrl,
    });
  }
}

async function cookiesByNameForUrl(jar, url) {
  const cookies = await jar.getCookies(url);
  const out = {};
  for (const c of cookies) {
    out[c.key] = c.value;
  }
  return out;
}
