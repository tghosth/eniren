# eniren — Implementation Plan

## 1. Goals & scope

Implement eniren as a Node.js CLI (`eniren`) that:

1. Parses and executes `.txt` scripts in the DSL described in the manual.
2. Reproduces all runtime behavior — cookie jars, variable interpolation (env + extracted), modify/extract/compare semantics, concurrency, logging — with the **single exception of license verification** (`ENIREN_LICENSE`, `~/.eniren/license`, signature/minisign flow).
3. Runs the three example scripts from `external example scripts` (`tests/nav.txt`, `tests/up.txt`, `tests/security.txt`) against their original targets unmodified, with identical pass/fail behavior to the original.
4. Ships with a local **mock test server** that exercises every feature so the tool can be verified without hitting the internet.

Out of scope: license key validation, the minisign-signed binary download URL, and prebuilt OS/arch bundles. Example CI workflows will need a swap of the "download binary" steps for a Node install step — called out below as the only user-facing breaking change.

### Confirmed decisions

- **Distribution**: drop-in `setup-node` + `npm install -g eniren` workflow files in `examples-compat/workflows/`. No `pkg`-packaged binary.
- **`${TARGET_SERVER}` precedence**: CLI `-s`/`-S` wins over `ENIREN_TARGET_SERVER` env var when both are set.
- **Node floor**: Node 18+ LTS (native `fetch`/`undici`, no polyfills).
- **`ENIREN_LICENSE` handling**: silent at default log level; DEBUG-only acknowledgment ("license check skipped — OSS build").
- **`compare redirect` on non-3xx response**: fails with a clear "no redirect in response" message.

---

## 2. Target project layout

```
eniren/
├── package.json                # bin: eniren -> ./src/cli.js
├── src/
│   ├── cli.js                  # arg parsing, logger setup, orchestrator entry
│   ├── logger.js               # JSON (default) / text logger, levels ERROR|WARN|INFO|DEBUG
│   ├── config.js               # resolves servers (-s / -S), threads, script glob
│   ├── env.js                  # loads ENIREN_* env vars, strips prefix
│   ├── parser/
│   │   ├── lexer.js            # line-based tokenizer (comments, blank lines, \t body)
│   │   ├── parser.js           # -> [Script{tests:[TestCase{request, steps[]}]}]
│   │   └── errors.js           # ParseError w/ line, script path
│   ├── interp/
│   │   ├── variables.js        # ${NAME} interpolation, scope = env + script-extracted
│   │   └── regex.js            # compile ~/!~ patterns; strip capture groups
│   ├── runtime/
│   │   ├── runner.js           # top-level: load scripts, pool of N, run in parallel
│   │   ├── scriptRunner.js     # one script: cookie jar, sequential test cases
│   │   ├── httpClient.js       # undici-based, no auto-redirects, per-script cookie jar
│   │   ├── modify.js           # cookie|header|body|type mutators
│   │   ├── extract.js          # cookie|header|body extractor (no match groups)
│   │   └── compare.js          # cookie|header|body|redirect|status w/ 6 operators
│   └── server/                 # test server (section 8)
├── test/
│   ├── unit/…
│   ├── integration/…
│   └── fixtures/scripts/…      # example-compatible scripts for local tests
└── .github/workflows/ci.yml
```

Runtime deps (kept minimal): `undici` (HTTP), `tough-cookie` (jar), `fast-glob` (file patterns). No framework deps.

---

## 3. CLI surface (must match manual verbatim)

```
Usage: eniren [options] file_pattern
  -S string   File with list of target servers
  -V          Print version
  -level      ERROR | WARN | INFO | DEBUG (default ERROR)
  -s string   Single target server (base URL with protocol)
  -text       Text logging instead of JSON
  -threads    Max concurrent tests, cap 100 (default 10)
```

Notes:
- `file_pattern` is a glob; resolves to one-or-more `.txt` scripts. Examples repo uses literal paths (`tests/nav.txt`) — those must also work.
- Exit code: non-zero if any script or test fails; zero otherwise.
- `-s` and `-S` together: union, `-s` first, then `-S` file entries. **If both CLI target flags and `ENIREN_TARGET_SERVER` are set, CLI wins.** If neither is provided, `${TARGET_SERVER}` falls back to `ENIREN_TARGET_SERVER`.
- `ENIREN_LICENSE` is **read but ignored** (DEBUG-only log line, "license check skipped — OSS build"). We do not refuse to run if unset/invalid. This is the one intentional behavioral divergence and it is prominently documented.

---

## 4. DSL parser

### 4.1 Lexical rules (from §Scripts, §Test Cases, §Modifying Requests)

- A **script** = one file; encoded UTF-8.
- A **test case** begins with a line of the form `METHOD URL` (METHOD ∈ GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|any token the HTTP lib accepts) and ends at the next blank line or EOF.
- Comment lines start with `#` at column 0 (after optional leading whitespace — the manual says "the line must start with `#`"; examples show it always at col 0). Comments are allowed **anywhere**, including mid–test-case.
- Multi-line `modify body` values: every continuation line begins with a `\t` character; the tab is stripped and lines are rejoined with `\n`. Body ends when a line does NOT begin with `\t` (or blank line terminates the test case).
- Scripts run **in parallel** across files; test cases within a script run **sequentially**.

### 4.2 Command grammar

```
request  := METHOD SP URL
modify   := "modify" SP ("cookie"|"header") SP NAME SP VALUE
          | "modify" SP ("body"|"type")  SP VALUE
extract  := "extract" SP ("cookie"|"header") SP NAME SP VARNAME SP REGEX
          | "extract" SP  "body"                 SP VARNAME SP REGEX
compare  := "compare" SP ("cookie"|"header") SP NAME SP OP SP VALUE
          | "compare" SP ("body"|"redirect"|"status") SP OP SP VALUE
OP       := "==" | "!=" | "~" | "!~" | "contains" | "!contains"
```

### 4.3 Defaults (per §Test Cases)

Every parsed test case is augmented with, unless explicitly overridden:
- `modify type application/x-www-form-urlencoded`
- `compare status == 200`

"Explicitly overridden" = any later `modify type …` or `compare status …` wins. Multiple `compare status` is allowed (per manual: compare can be used multiple times).

### 4.4 Error reporting

Parse errors and runtime failures share the format from the manual:
```
ERR comparison `compare status == 200` failed line=1 script=simple.txt test="GET http://www.example.com"
```
In JSON mode, the same fields are keys. `line` is 1-indexed and points at the failed command line (not the request line).

---

## 5. Variable resolution

- `${NAME}` is substituted anywhere in request URL, modify values, and compare values (pre-regex for `~`/`!~`).
- Resolution order: **script-extracted vars first**, then env vars (`ENIREN_NAME` → `${NAME}`). Script-extracted wins on collision.
- For `${TARGET_SERVER}` specifically: the runner seeds `TARGET_SERVER` per-target as an extracted-style var scoped to that run when `-s`/`-S` is in use. If neither CLI flag is set, falls back to `ENIREN_TARGET_SERVER` env var.
- Unresolved `${X}` → test fails with a substitution error before sending.

---

## 6. Semantics of each command

### 6.1 `modify`

| what | name req? | effect |
|---|---|---|
| `cookie` | yes | set/overwrite cookie in jar (domain = request host) before send |
| `header` | yes | set request header (last-wins) |
| `type`  | no  | sets `Content-Type`; default `application/x-www-form-urlencoded` |
| `body`  | no  | raw body; multi-line via `\t` prefix as in §4.1 |

### 6.2 `extract`

- `extract cookie NAME var regex`: run regex against the named cookie *value* (from `Set-Cookie` or jar post-response); store **whole match** in `var`. Examples show this pattern for header value `FETUWUWYRATNUCQIRJRA` extracted with `[A-Z2-7]+`.
- `extract header NAME var regex`: against header value.
- `extract body var regex`: against full body text.
- Regex groups are ignored; we always store `match[0]`. This matches the manual's explicit warning ("does not support regex match groups") — if the user writes parentheses we treat them as plain grouping, not capture.

### 6.3 `compare`

Operators:
- `==`, `!=` — string equality
- `~`, `!~` — regex (full-string `RegExp.test`, capture groups ignored)
- `contains`, `!contains` — substring

Targets:
- `status` — integer compare against status code (still string-compared to be operator-uniform; `== 200` works numerically because both sides stringify).
- `redirect` — value of `Location` header on a 3xx response. **If the response is not 3xx, the comparison fails with "no redirect in response".**
- `header NAME`, `cookie NAME` — first matching value.
- `body` — response body as UTF-8 text.

Failure produces the ERR line in §4.4. Success logs at INFO.

### 6.4 HTTP details

- **No automatic redirect following.** The manual example `compare status == 301 / compare redirect contains …` requires we see the 3xx directly.
- Per-script `tough-cookie` `CookieJar`, passed to every request in that script and discarded at script end.
- TLS uses system trust store; insecure flag not in the spec, not added.
- Timeouts: per-request 30s default (not in manual — reasonable default; configurable via `ENIREN_TIMEOUT_MS` if we want an escape hatch, no CLI flag to avoid scope creep).

---

## 7. Concurrency model

- `-threads N` (cap 100, default 10) = max **concurrent scripts**, not test cases. Scripts run independently; test cases within a script are sequential (required by cookie jar + variable passing).
- Implementation: a simple semaphore around `Promise.all(scripts.map(runScript))`.

---

## 8. Local test server (verifies the tool end-to-end)

A small Node HTTP server (`src/server/testServer.js`) launched via `npm run test-server` on `127.0.0.1:8787`. It exposes deterministic endpoints that each exercise one feature so script-level assertions become precise:

| Route | Purpose / feature exercised |
|---|---|
| `GET /ok` | 200 OK baseline (default compare) |
| `GET /teapot` | 418, used to verify `compare status == 418` |
| `GET /redirect-http-to-https` | 301 with `Location: https://127.0.0.1:8788/ok` — mirrors the manual's redirect example |
| `POST /echo` | echoes body + content-type + headers as JSON — verifies `modify body/type/header` |
| `ANY /methods` | returns 405 for non-GET — matches manual's POST/405 example |
| `GET /set-cookie` | sets session cookie `sid=abc123` |
| `GET /whoami` | reads `sid` cookie from jar, returns user — verifies cookie persistence across test cases |
| `GET /headers-echo?my-header=…` | sets arbitrary response headers from query — matches `httpbin.org/response-headers` example |
| `GET /anything` | returns JSON echo (httpbin-style) for extract→modify round-trip |
| `GET /csp` | returns a CSP header for security-config-style tests |
| `GET /.well-known/security.txt` | well-known page for security script |
| `GET /slow?ms=2000` | delay for concurrency/timeout tests |

The server is boring, synchronous, zero deps (Node `http`), and binds to a random port when started by the test harness to allow parallel `npm test` runs.

---

## 9. Compatibility with `external example scripts`

Verified the three example scripts + three workflows. Compatibility checklist:

| Example feature used | Our support |
|---|---|
| `GET ${TARGET_SERVER}/` with nothing else (up.txt) | ✓ — defaults to `compare status == 200` |
| `compare body contains <literal html>` across many GETs (nav.txt) | ✓ — body compare, substring |
| `compare header X !contains …` and `compare header X contains …` (security.txt) | ✓ |
| `compare header Strict-Transport-Security ~ max-age=[0-9]+; includeSubDomains; preload` | ✓ — `~` is regex, note the value contains `;` which is fine since the parser reads "rest of line" after the operator |
| `-s https://www.example.com tests/up.txt` (ping.yaml) | ✓ |
| `-S targets.txt tests/up.txt` — newline list of URLs | ✓ |
| `${TARGET_SERVER}` variable injected when `-s`/`-S` set | ✓ — see §5 |
| Multiple bare `GET` test cases separated by blank lines | ✓ |
| Running *just* a test file path (no glob wildcards) | ✓ — path treated as literal if not a glob |

**Documented breaking change to the example workflows**: the `Download the tool` / `Verify the tool` (curl + minisign) steps become:

```yaml
- uses: actions/setup-node@v4
  with: { node-version: '20' }
- run: npm install -g eniren
- run: eniren tests/nav.txt          # or eniren -S targets.txt tests/security.txt
```

We ship equivalent workflow files in `examples-compat/workflows/` so users can drop-in replace.

---

## 10. What we deliberately drop (licensing)

- `ENIREN_LICENSE` env var — read, logged at DEBUG only ("license check skipped — OSS build"), otherwise ignored.
- `~/.eniren/license` — not read.
- No download endpoint, no minisign signature verification, no per-OS/arch tarballs.

The code does not contain any stubbed license-check branch that could fail closed — removing it entirely keeps us from shipping a time-bomb.

---

## 11. Test strategy

### 11.1 Unit (Vitest, runs in CI on every PR)

- `parser.spec.js`
  - comments at col 0 in various positions; blank-line termination; tab-continued bodies; multiple `modify`/`compare`/`extract` per case; defaults injection; bad syntax → ParseError w/ correct line number.
  - **Default-override precedence**: explicit `modify type application/json` beats the injected `application/x-www-form-urlencoded`; explicit `compare status == 404` beats the injected `== 200`; multiple `compare status` lines all run (per manual "compare can be used multiple times").
- `variables.spec.js`
  - `ENIREN_FOO` → `${FOO}`; precedence script-extracted > env; unresolved `${X}` fails; `-s`/`-S` beats `ENIREN_TARGET_SERVER`.
  - **Interpolation surface**: `${VAR}` resolves inside URLs, `modify header/cookie/body/type` values, and `compare` values (including the regex-valued `~`/`!~` operators where the substituted text must then still be a valid regex).
- `compare.spec.js`
  - all 6 operators × all 5 targets; regex without capture groups; `!=` vs `!~` vs `!contains`; `compare redirect` on non-3xx → fails with "no redirect in response".
  - **Header/cookie name case-insensitivity**: `compare header Content-Type ==` matches a response header sent as `content-type`, and vice-versa. Cookie names follow RFC 6265 (case-sensitive by spec — documented and tested).
- `modify.spec.js`
  - header last-wins; multi-line body tab stripping; `type` default override.
  - **Method coverage**: GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS each round-trip through the request builder with the correct verb.
- `extract.spec.js`
  - matches whole string only (groups ignored); missing cookie/header = failure.
  - **Extract miss**: regex that doesn't match → test case fails with `extract did not match` (explicit decision, since the manual is silent on this).
- `logger.spec.js` *(new)*
  - JSON mode emits one object per line with fixed keys (`level`, `msg`, `line`, `script`, `test`, and comparison-specific fields).
  - Text mode emits the manual's verbatim format: `ERR comparison \`…\` failed line=N script=X test="…"`.
  - `-level ERROR` suppresses INFO/DEBUG; `-level DEBUG` shows everything; `-level WARN` passes WARN+ERROR.
- `config.spec.js` *(new)*
  - `-s` + `-S` union produces `[single, ...fileEntries]` in that order; multiple `-s` flags concatenate; `-S` file parsing skips blank lines and `#` comments, rejects malformed URLs.
  - `file_pattern` resolution: literal file path, directory (loads `*.txt`), glob (`tests/*.txt`), no-match → error + non-zero exit.
- `cli.spec.js`
  - flag parsing for every documented flag, `-V` prints version, `-threads` clamped to 100.
  - **Exit codes**: explicit assertions that all-pass → `0`, any-fail → non-zero, parse error → non-zero, no-matching-scripts → non-zero.

### 11.2 Integration against the local test server (CI + local)

Each case boots the server on an ephemeral port, runs a fixture script, asserts log output + exit code.

| # | Fixture | What it proves |
|---|---|---|
| 1 | `simple_ok.txt` — bare `GET /ok` | Defaults (`compare status == 200`, form-urlencoded type) work |
| 2 | `redirect.txt` — from manual verbatim, retargeted | 301 + `compare redirect contains` |
| 3 | `method_not_allowed.txt` — POST `/methods`, `compare status == 405` | Non-default status check |
| 4 | `cookies_auth.txt` — GET `/set-cookie` then GET `/whoami` | Per-script cookie jar persistence |
| 5 | `modify_all.txt` — POST `/echo` with `modify header`, `modify cookie`, `modify type application/json`, multi-line `modify body` | All modify variants + \t body parsing |
| 6 | `extract_chain.txt` — GET `/headers-echo?my-header=…` with `extract header`, then GET `/anything` with `modify header new-header header-${var1}`, `compare body contains …` | Manual's extract example, adapted |
| 7 | `compare_all.txt` — exercises `==`, `!=`, `~`, `!~`, `contains`, `!contains` across cookie/header/body/redirect/status | Operator matrix |
| 8 | `multi_case.txt` — 5 test cases, blank-line separated, comments mid-script | Scripts/§Comments |
| 9 | `target_server_var.txt` — uses `${TARGET_SERVER}`, run once with `-s`, once with `-S` file | Env/CLI target injection |
| 10 | `env_var.txt` — uses `${CUSTOM}` with `ENIREN_CUSTOM=xyz` in env | Env var plumbing |
| 11 | `parallel_cookies.txt` — two scripts run in parallel, each does its own `/set-cookie`/`/whoami` | Cookie jars don't leak across scripts |
| 12 | `parse_error.txt` — missing operator | Error format + non-zero exit |
| 13 | `failure_message.txt` — deliberate failing `compare status == 200` | Verbatim `ERR comparison \`…\` failed line=N script=… test="…"` format in text mode; equivalent JSON in JSON mode |
| 14 | `threads.js` — 50 scripts, `-threads 5` | Semaphore limits concurrent scripts; `-threads 200` gets clamped to 100 |
| 15 | `license_ignored.js` — sets `ENIREN_LICENSE=garbage`, runs script | Tool still runs (our one intentional divergence); no output at default level, DEBUG line present with `-level DEBUG` |
| 16 | `methods.txt` — one test case per verb (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS) hitting an echo endpoint | Every HTTP method reaches the server with the correct verb and body handling |
| 17 | `logger_modes.js` — runs one failing and one passing script with `-text` vs default JSON vs `-level DEBUG` | Log output shape matches manual's `ERR comparison \`…\`` line; JSON is one object per line; level filtering works |
| 18 | `glob_and_dir.js` — invokes with (a) single file, (b) directory, (c) `tests/*.txt`, (d) non-matching glob | All resolution modes work; non-matching glob → non-zero exit with clear error |
| 19 | `servers_file.js` — `-S` file with blank lines, `#` comments, and one malformed URL | Blanks/comments skipped; malformed URL produces a clear error, other servers still run |
| 20 | `server_union.js` — combines `-s http://a` with `-S file-of-b-and-c.txt` and verifies all three get hit in order | `-s` + `-S` union works; multiple `-s` flags concatenate |
| 21 | `header_case.txt` — response has `content-type`, script uses `compare header Content-Type`; and vice-versa | Header name match is case-insensitive |
| 22 | `extract_miss.txt` — regex that won't match the response | Test fails with `extract did not match`; subsequent test case using `${var}` also fails cleanly |
| 23 | `interp_everywhere.txt` — `${VAR}` used inside URL, `modify header`, `modify body`, `compare body contains ${VAR}`, and `compare body ~ prefix-${VAR}-suffix` | Variable substitution works in all positions, including inside a regex value |
| 24 | `override_defaults.txt` — explicit `modify type application/json` + explicit `compare status == 404` | Explicit lines override injected defaults; no duplicate `Content-Type` header; only the explicit status check runs |
| 25 | `exit_codes.js` — runs all-pass script then a mixed pass/fail script | Exit code is 0 then non-zero; parse-error script exits non-zero without making HTTP calls |

### 11.3 Examples-repo compatibility (local only, gated)

A `npm run test:examples` target clones `external example scripts` (or references a vendored snapshot at `test/fixtures/example-scripts/`) and runs:

- `eniren tests/up.txt` with `-s http://127.0.0.1:8787/ok` → mapped target server (we point `${TARGET_SERVER}` at our local server since the real sites may be flaky).
- `eniren -S local-targets.txt tests/up.txt` with a two-URL file.
- Parser-only smoke: we parse `tests/nav.txt` and `tests/security.txt` and assert zero parse errors + expected number of test cases (nav: 5 GETs; security: 5 GETs). We don't execute these against real external targets in CI to avoid flakiness, but a manual `npm run test:examples:live` target does.

### 11.4 CI pipeline (`.github/workflows/ci.yml`)

Matrix: Node 18, 20, 22 × ubuntu-latest, windows-latest.

Steps:
1. `npm ci`
2. `npm run lint` (ESLint, no new rules beyond recommended)
3. `npm test` → unit + integration (sections 11.1 and 11.2)
4. `npm run test:examples` → parser smoke + local-server execution of examples (section 11.3)
5. On tag push, `npm publish` (no license server, no binary build).

Local-only (not in CI):
- `npm run test:examples:live` — real external hits, flagged as flaky.
- `npm run test-server` — boots the server for manual poking with curl.

---

## 12. Delivery order

0. **Repo setup** (see §13).
1. Parser + defaults + variable substitution (pure, easy to test first).
2. HTTP client + per-script cookie jar + modify/compare/extract primitives.
3. Runner + concurrency + logger.
4. CLI wiring.
5. Local test server + integration fixtures 1–10.
6. Example-repo compatibility target + fixtures 11–15.
7. Docs: README + examples-compat workflows.

Roughly 1–1.5 weeks of focused work; the parser and server are the only novel bits, everything else is straightforward.

---

## 13. Repository setup (Step 0)

The working directory is not yet a git repo. Before any code lands:

1. **Initialize the repo** in the project root:
   ```bash
   git init -b main
   ```
2. **Create `.gitignore`** covering Node artifacts and editor cruft:
   ```
   node_modules/
   coverage/
   dist/
   .env
   .env.local
   *.log
   .DS_Store
   .idea/
   .vscode/
   ```
3. **Create `package.json`** via `npm init -y`, then edit:
   - `"name": "eniren"`
   - `"bin": { "eniren": "./src/cli.js" }`
   - `"engines": { "node": ">=18" }`
   - `"type": "module"` (or CJS — decide once; plan assumes ESM)
   - Scripts: `test`, `test:examples`, `test:examples:live`, `test-server`, `lint`.
4. **`LICENSE`** — already present: proprietary "All Rights Reserved, no use permitted" notice. Do not replace with an OSS license. Also create a stub `README.md` describing the CLI + the one intentional divergence (license env var is inert) + a note that the code is not licensed for external use.
5. **Keep `PLAN.md`** at the repo root as the canonical behavioral spec.
6. **Initial commit**:
   ```bash
   git add .gitignore package.json LICENSE README.md PLAN.md
   git commit -m "Initial repo scaffold and implementation plan"
   ```
7. **GitHub remote** (optional, user-driven): `gh repo create <org>/eniren --private --source=. --push` once the user confirms org/visibility. Not automated — confirmation required before any network-visible action.
8. **Branch protection + CI wiring** happens once `.github/workflows/ci.yml` (§11.4) is committed and the remote exists.

No publishing to npm at this stage; `npm publish` is gated on a tagged release (§11.4 step 5).
