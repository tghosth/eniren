# Installation

eniren is open source and distributed as a Node.js package via its GitHub
repository. There is no license purchase, no license key, and no signed
binary to verify.

## Requirements

- Node.js 18 or newer

## From source

```
git clone https://github.com/tghosth/eniren.git
cd eniren
npm install
```

Run directly:

```
node src/cli.js [options] file_pattern
```

Or link the `eniren` binary into your `PATH`:

```
npm link
eniren [options] file_pattern
```

## License key (legacy)

If the environment variable `ENIREN_LICENSE` is set, eniren will read the
value but will not use it. License verification has been removed in this
build — no key is required to run eniren.
