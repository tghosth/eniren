# Introduction

eniren is a static web application testing tool that allows you to send a
predefined web request and verify the response matches your expectations.
eniren executes scripts, which are comprised of one or more test cases that
are executed sequentially. With each test case you can modify the request,
compare the response to what you expect, and even extract data from the
response, which can then be used in subsequent test cases.

When running eniren the path to a directory containing one or more scripts
must be provided. eniren will then load and run each script and log any
errors that occur.

## CLI

```
Usage: eniren [options] file_pattern
  -S string
      A file containing a list of servers to execute tests against.
  -V  Display the product version.
  -level string
      Set the logging level [ERROR, WARN, INFO, DEBUG] (default "ERROR")
  -s string
      The server to execute tests against.
  -text
      Use text logging instead of JSON.
  -threads int
      Set the number of concurrent tests: maximum 100 (default 10)
```
