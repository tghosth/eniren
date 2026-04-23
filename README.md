# eniren

A Node.js static web-application testing tool that executes `.txt` script files
containing HTTP requests and assertions written in a small DSL.

Behavior is documented in `PLAN.md`. The tool has one intentional divergence
from the original specification: license verification is dropped. The
`ENIREN_LICENSE` environment variable is read but ignored.

## Usage

```
eniren [options] file_pattern
  -S string   File with list of target servers
  -V          Print version
  -level      ERROR | WARN | INFO | DEBUG (default ERROR)
  -s string   Single target server (base URL with protocol)
  -text       Text logging instead of JSON
  -threads    Max concurrent scripts, cap 100 (default 10)
```

## License

This source is proprietary. See `LICENSE` — no use is permitted without written
permission from the copyright holder.
