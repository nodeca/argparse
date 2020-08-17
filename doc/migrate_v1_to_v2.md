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

## 7. Only TypeErrors are intercepted from `type` functions

If user input is invalid, throw TypeError instead of Error:

```
parser.add_argument('--digit', {
  type: function digit(v) {
    if (!/^\d$/.test(v)) throw TypeError('not a digit')
    return +v
  }
})
```

TypeErrors will get intercepted and turned into user-friendly error messages,
but ordinary Errors will not.

## 8. constants are moved to top-level

Constants `SUPPRESS`, `OPTIONAL`, `ZERO_OR_MORE`, `ONE_OR_MORE`, `PARSER`,
and `REMAINDER` previously available as `argparse.Const.*` are renamed to `argparse.*`.

Constant `_UNRECOGNIZED_ARGS_ATTR` is no longer exposed publicly.

Constant `EOL` no longer exists (hardcoded as '\n') - replace with '\n' if you used it somewhere.

## 9. namespace methods `.isset`, `.set`, `.get`, `.unset` are removed

Get values from `Namespace` as if it was a plain js object.

## 10. an absense of value is indicated by `undefined` instead of `null`

 - if you passed `null` to any of the functions, it will be treated as a value (not replaced by default)
 - `parse_args` will return `{ x: undefined }` instead of `{ x: null }` if optional arg isn't specified
