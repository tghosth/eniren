# Scripts

eniren scripts are an atomic unit made up of one or more test cases, each of
which represents actions taken on a single HTTP request and response pair.
Each test case begins with a line stating the type of HTTP request to send
along with the URL of the destination server and ends with a blank line.
Scripts can also include comments to help explain the purpose of the script
and the test cases. Comments can be put anywhere in the script but they must
be on a new line and the line must start with the `#` character. Scripts are
executed independently from each other and in parallel.

The following script has two test cases, one sends a `GET` request expecting
a `200` response and the other sends a `POST` request expecting a `405`
response.

```
# This is a simple demonstration script for eniren, in which we define two
# test cases, which are separated by a newline character.
GET https://www.example.com

# The POST method is not implemented so we expect a 405 response.
POST https://www.example.com
compare status == 405
```

## Cookies

Each script has a dedicated cookie jar that is automatically used by every
test case within the script. This makes it possible to write a script that
authenticates to a server and then makes all subsequent requests as an
authenticated user. The cookie jar cannot be shared across scripts so each
script must perform its own authentication request if it is needed.
