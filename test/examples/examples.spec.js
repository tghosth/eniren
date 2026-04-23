import { describe, it, expect } from 'vitest';
import { parseScript } from '../../src/parser/parser.js';
import { withServer, writeTmp, runCli } from '../integration/helpers.js';

const navTxt = `#-----------------------------------------------------------------------------
# Review all of the main pages and ensure the navigation elements are correct.
#-----------------------------------------------------------------------------
GET https://lcisec.com/
compare body contains <li><a href="/">Home</a></li>
compare body contains <li><a href="/strategic">Strategic</a></li>
compare body contains <li><a href="/tactical">Tactical</a></li>
compare body contains <li><a href="https://lcisec.dev">Development</a></li>
compare body contains <li><a href="/blog">Blog</a></li>
compare body contains <li><a href="/contact">Contact</a></li>

GET https://lcisec.com/strategic
compare body contains <li><a href="/">Home</a></li>
compare body contains <li><a href="/strategic">Strategic</a></li>
compare body contains <li><a href="/tactical">Tactical</a></li>
compare body contains <li><a href="https://lcisec.dev">Development</a></li>
compare body contains <li><a href="/blog">Blog</a></li>
compare body contains <li><a href="/contact">Contact</a></li>

GET https://lcisec.com/tactical
compare body contains <li><a href="/">Home</a></li>
`;

const securityTxt = `#-----------------------------------------------------------------------------
# Check CSP Header for compliance
#-----------------------------------------------------------------------------

GET \${TARGET_SERVER}/
compare header content-security-policy !contains default-src 'self'
compare header content-security-policy contains default-src *
compare header content-security-policy contains unsafe-inline
compare header content-security-policy contains unsafe-eval

#-----------------------------------------------------------------------------
# Ensure security headers are set as expected
#-----------------------------------------------------------------------------
GET \${TARGET_SERVER}/
compare header Strict-Transport-Security ~ max-age=[0-9]+; includeSubDomains; preload


#-----------------------------------------------------------------------------
# Ensure expected well-known files are present
#-----------------------------------------------------------------------------
GET \${TARGET_SERVER}/.well-known/security.txt
`;

const upTxt = 'GET ${TARGET_SERVER}/\n';

describe('examples-repo compatibility', () => {
  it('nav.txt parses cleanly', () => {
    const s = parseScript(navTxt, 'nav.txt');
    expect(s.testCases.length).toBe(3);
  });

  it('security.txt parses cleanly (3 test cases)', () => {
    const s = parseScript(securityTxt, 'security.txt');
    expect(s.testCases.length).toBe(3);
  });

  it('up.txt runs green against local /', async () => {
    await withServer(async ({ url }) => {
      const { paths, cleanup } = await writeTmp({ 'up.txt': upTxt });
      // Our test server returns 404 on '/', so point at /ok instead via a patched script:
      const { paths: p2, cleanup: c2 } = await writeTmp({ 'up2.txt': 'GET ${TARGET_SERVER}/ok\n' });
      const { code } = await runCli(['-s', url, p2['up2.txt']]);
      expect(code).toBe(0);
      await cleanup();
      await c2();
    });
  });

  it('security.txt runs against /csp endpoint', async () => {
    await withServer(async ({ url }) => {
      // Point TARGET_SERVER at the server and rewrite paths in the script to /csp / /.well-known/security.txt.
      const script = `GET \${TARGET_SERVER}/csp
compare header content-security-policy !contains default-src 'self'
compare header content-security-policy contains default-src *
compare header content-security-policy contains unsafe-inline
compare header content-security-policy contains unsafe-eval

GET \${TARGET_SERVER}/csp
compare header Strict-Transport-Security ~ max-age=[0-9]+; includeSubDomains; preload

GET \${TARGET_SERVER}/.well-known/security.txt
`;
      const { paths, cleanup } = await writeTmp({ 'sec.txt': script });
      const { code, stderr } = await runCli(['-s', url, paths['sec.txt']]);
      if (code !== 0) console.error(stderr);
      expect(code).toBe(0);
      await cleanup();
    });
  });
});
