# Test Cases

Each test case begins with the type of HTTP request to send along with the
URL of the destination server. Each subsequent line should contain one
command that explains how to modify the request, what data to extract from
the response, or how to compare the response to what is expected. Finally,
the test case ends with a blank line. By default, every test case includes
the `modify type application/x-www-form-urlencoded` and
`compare status == 200` commands. If a different content type or status code
is needed, it must be explicitly defined.

## Modifying Requests

The `modify` command is used to modify an HTTP request before it is sent and
uses the following syntax `modify what [name] value`. The `modify` command
can be used multiple times within a single test case and can be used to
modify a cookie, a header, the body, or the content type. When modifying
cookies or headers the `name` parameter is required. For multiline body
strings each line must begin with a `\t` character, which will be removed
when constructing the body value.

```
# This script demonstrates how to use the modify command to update an HTTP
# request. When modifying a cookie or header, the name of the cookie or header
# must be specified.

POST https://www.example.com/
modify cookie Authorization Basic <credentials>
modify header user-agent Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.12.45 Mobile Safari/537.36
modify type application/json
modify body {
	"key1": "val1",
	"key2": "val2"
	}
compare status == 405
```

## Extracting Data

The `extract` command is used to extract data from an HTTP response and
store it in a variable, which can be reused in subsequent test cases within
the same script. Extracted variables cannot be used across scripts. Use the
following syntax to extract data from a response
`extract from into [name] regex`. The `extract` command can be used multiple
times in a single test case and can extract data from a cookie, a header, or
the body. When extracting data from cookies or headers the `name` parameter
is required. Keep in mind, eniren does not support regex match groups.

```
# This script demonstrates how to use the extract command to save data from an
# HTTP response header to be used in a subsequent test case. When extracting
# data from a header, the name of the header must be specified.

GET https://httpbin.org/response-headers?my-header=$$$$FETUWUWYRATNUCQIRJRA^^^^
extract header var1 my-header [A-Z2-7]+

GET https://httpbin.org/anything
modify header new-header header-${var1}
compare body contains "New-Header": "header-FETUWUWYRATNUCQIRJRA"
```

## Comparing Responses

The `compare` command is used to validate the HTTP response received matches
what is expected. Use the following syntax to compare a part of the response
to an expected value `compare what [name] operator value`. The `compare`
command can be used multiple times in a single test case and can compare
values in a cookie, a header, the body, a redirect location, or the status.
The `compare` command supports six different operators `==`, `!=`, `~`
(matches), `!~` (does not match), `contains`, and `!contains`. When using
the `~` and `!~` operators, the value is expected to be a valid regular
expression. Keep in mind, eniren does not support regex match groups.

```
# This script demonstrates how to use the compare command to ensure an HTTP
# response matches what is expected. When comparing a cookie or header, the
# name of the cookie or header must be specified.

GET https://www.example.com/
compare header Content-Type == text/html; charset=utf-8
compare header Content-Security-Policy ~ default-src 'self'
compare header Content-Security-Policy !contains unsafe-eval
compare body contains <title>Example Domain</title>
```
