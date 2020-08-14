Migration from v1 to v2
=======================

In short:

- Fix all deprecation warnings.
- If you extended argparse classes - propagate appropriate changes.


## 1. Change all options, method and action names from `camelCase` to `snake_case`.

For example:

 - `argparse.ArgumentParser({ addHelp: false })` -> `argparse.ArgumentParser({ add_help: false })`
 - `parser.printHelp()` -> `parser.print_help()`
 - `parser.add_argument({ action: 'storeTrue' })` -> `parser.add_argument({ action: 'store_true' })`

Old names still have aliases (with deprecation messages), and your code may work.
But no guarantees, especially if you extend classes.


## 2. `defaultValue` => `default`, `constValue` => `const`.

Old names still has aliases with deprecaion messages, to simplify migration.


## 3. In `add_argument`, argument names should be raw params (not array).

```js
parser.add_argument('-h', '--help', { help: 'show this help message and exit' })
```

Old signature is supported but shows deprecation message.


## 4. `debug` option of argparse.ArgumentParser is deprecated

Override `.exit()` method instead.

```js
const argparse = require('argparse')

class MyArgumentParser extends argparse.ArgumentParser {
  exit() { console.log('no exiting today') }
}

parser = new MyArgumentParser()
```

## 5. `version` option of argparse.ArgumentParser is deprecated

Use `version` action instead:

```js
parser.add_argument('-v', '--version', { action: 'version', version: '1.0.0' })
```

## 6. `string` type is renamed to `str`

```js
parser.add_argument('--foo', { type: 'str' })
```

Old signature is supported but shows deprecation message.

## 7. constants are moved to top-level

For example, `argparse.Const.ONE_OR_MORE` is renamed to `argparse.ONE_OR_MORE`.

## 8. namespace methods `.isset`, `.set`, `.get`, `.unset` are removed

Get values from `Namespace` as if it was a plain js object.

## 9. an absense of value is indicated by `undefined` instead of `null`

 - if you passed `null` to any of the functions, it will be treated as a value (not replaced by default)
 - `parse_args` will return `{ x: undefined }` instead of `{ x: null }` if optional arg isn't specified
