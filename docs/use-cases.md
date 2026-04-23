# Use Cases

The primary feature of eniren is being able to define a set of static tests
that can be run against a web application to ensure it responds as expected.
This feature allows for a number of use cases such as CI/CD testing, web
application monitoring, and security configuration monitoring.

## CI/CD Pipelines

The original use case that inspired eniren is conducting web application
regression testing as part of CI/CD pipelines. Developers can create a set
of version controlled tests that define the expected web application
behavior and use eniren to verify the behavior. The tests can be run
against a local web server in the runner as part of commit testing or
against a staging server as part of pre-production testing.

### Example: navigation regression

This script checks that every top-level page of a site renders the expected
navigation menu — a typical regression check to catch a broken layout or a
missing link before it reaches production.

```
#-----------------------------------------------------------------------------
# Review all of the main pages and ensure the navigation elements are correct.
#-----------------------------------------------------------------------------
GET https://app.example.com/
compare body contains <li><a href="/">Home</a></li>
compare body contains <li><a href="/strategic">Strategic</a></li>
compare body contains <li><a href="/tactical">Tactical</a></li>
compare body contains <li><a href="/blog">Blog</a></li>
compare body contains <li><a href="/contact">Contact</a></li>

GET https://app.example.com/strategic
compare body contains <li><a href="/">Home</a></li>
compare body contains <li><a href="/strategic">Strategic</a></li>
compare body contains <li><a href="/tactical">Tactical</a></li>
compare body contains <li><a href="/blog">Blog</a></li>
compare body contains <li><a href="/contact">Contact</a></li>

GET https://app.example.com/tactical
compare body contains <li><a href="/">Home</a></li>
compare body contains <li><a href="/strategic">Strategic</a></li>
compare body contains <li><a href="/tactical">Tactical</a></li>
compare body contains <li><a href="/blog">Blog</a></li>
compare body contains <li><a href="/contact">Contact</a></li>

GET https://app.example.com/blog
compare body contains <li><a href="/">Home</a></li>
compare body contains <li><a href="/strategic">Strategic</a></li>
compare body contains <li><a href="/tactical">Tactical</a></li>
compare body contains <li><a href="/blog">Blog</a></li>
compare body contains <li><a href="/contact">Contact</a></li>

GET https://app.example.com/contact
compare body contains <li><a href="/">Home</a></li>
compare body contains <li><a href="/strategic">Strategic</a></li>
compare body contains <li><a href="/tactical">Tactical</a></li>
compare body contains <li><a href="/blog">Blog</a></li>
compare body contains <li><a href="/contact">Contact</a></li>
```

## Web Application Monitoring

The simplest eniren test case is a `GET` request that expects a `200 OK`
response. A basic web application monitoring system can be built by writing
a script with a single `GET` test case, creating a file with a list of
servers, running the script with eniren using the `-S` flag, and checking
the error logs.

### Example: simple uptime check

The script below will return an error if the given target server cannot be
reached. Use the `-s` flag to set a single target server or the `-S` flag
to pass a file with a newline delimited list of servers.

```
GET ${TARGET_SERVER}/
```

An accompanying `targets.txt` file:

```
https://google.com
https://openai.com
https://example.com
```

Invoke with:

```
eniren -S targets.txt tests/up.txt
```

## Security Configuration Monitoring

eniren can be used to check for the presence of the `.well-known/security.txt`
page and verify the page contains the correct information. It can also be
used to monitor for the presence, absence, or modification of security
headers such as `Content-Security-Policy` and `Strict-Transport-Security`.

### Example: security header and well-known file checks

```
#-----------------------------------------------------------------------------
# Check CSP Header for compliance
#-----------------------------------------------------------------------------
GET ${TARGET_SERVER}/
compare header content-security-policy !contains default-src 'self'
compare header content-security-policy contains default-src *
compare header content-security-policy contains unsafe-inline
compare header content-security-policy contains unsafe-eval

#-----------------------------------------------------------------------------
# Ensure security headers are set as expected
#-----------------------------------------------------------------------------
GET ${TARGET_SERVER}/
compare header Strict-Transport-Security ~ max-age=[0-9]+; includeSubDomains; preload

#-----------------------------------------------------------------------------
# Ensure expected well-known files are present
#-----------------------------------------------------------------------------
GET ${TARGET_SERVER}/.well-known/security.txt

GET ${TARGET_SERVER}/.well-known/openid-configuration

GET ${TARGET_SERVER}/.well-known/openpgpkey
```
