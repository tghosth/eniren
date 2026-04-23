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

## Web Application Monitoring

The simplest eniren test case is a `GET` request that expects a `200 OK`
response. A basic web application monitoring system can be built by writing
a script with a single `GET` test case, creating a file with a list of
servers, running the script with eniren using the `-S` flag, and checking
the error logs.

## Security Configuration Monitoring

eniren can be used to check for the presence of the `.well-known/security.txt`
page and verify the page contains the correct information. It can also be
used to monitor for the presence, absence, or modification of security
headers such as `Content-Security-Policy` and `Strict-Transport-Security`.
