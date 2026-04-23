# Additional Features

## Target Servers

eniren can be used to run the same set of tests against a list of target
servers. The `-s` flag can be used to set a single server, and the `-S` flag
can be used to load a file with a list of servers. The server must be the
full base URL including the protocol such as `http://example.org` or
`https://example.com`. When defining tests for multiple targets, use the
`${TARGET_SERVER}` variable. The test below can be run against a single
server or multiple servers using the `-s` or `-S` flags, respectively.

```
GET ${TARGET_SERVER}/
compare header content-security-policy !contains default-src 'self'
compare header content-security-policy contains default-src *
compare header content-security-policy contains unsafe-inline
compare header content-security-policy contains unsafe-eval
```

## Environment Variables

eniren can load variables from the environment and use those variables in
the same way as extracted variables. The environment variables must be
prefixed with `ENIREN_` to be loaded. When specifying environment variables
in scripts the prefix should be removed. For example the environment
variable `ENIREN_MY_VAR1` can be used in scripts using the syntax
`${MY_VAR1}`. The script below can be executed against
`https://www.example.com` by setting the `ENIREN_TARGET_SERVER` environment
variable before running eniren.

```
GET ${TARGET_SERVER}/
```

If the environment variable `ENIREN_LICENSE` is set, eniren will read the
value but will not use it — license verification is not performed in this
build.
