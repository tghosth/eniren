# Getting Started

eniren scripts are defined in plain text files using a simple domain specific
language similar to standard HTTP requests. The simplest script that can be
executed is:

```
GET http://www.example.com
```

This script will send a `GET` request to `http://www.example.com` and verify
that it receives a `200 OK` response. If it receives anything other than a
`200 OK` an error message will be logged.

```
ERR comparison `compare status == 200` failed line=1 script=simple.txt test="GET http://www.example.com"
```

The test failed because the server actually sends a `301 Moved Permanently`
response to let the user agent know the site should be accessed through
HTTPS. The test needs to be rewritten to reflect this fact. Taking it a step
further, a redirect comparison can be added to ensure the location of the
redirect response is correct as well.

```
GET http://www.example.com
compare status == 301
compare redirect contains https://www.example.com
```
