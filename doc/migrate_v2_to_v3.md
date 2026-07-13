Migration from v2 to v3
=======================

In short:

- Complete the [v1 to v2 migration](./migrate_v1_to_v2.md). Deprecated v1
  compatibility aliases are no longer available.
- Remove undocumented `type: 'auto'` options.


## 1. Remove v1 compatibility aliases

Version 2 still accepted the deprecated v1 API. Version 3 removes that
compatibility layer completely.

### Use `snake_case` method and option names

All automatically generated `camelCase` method aliases have been removed:

```js
// v2 compatibility API
parser.addArgument('--foo')
parser.parseArgs()

// v3
parser.add_argument('--foo')
parser.parse_args()
```

CamelCase option aliases have also been removed. Use the Python-compatible
`snake_case` names and the current `default` and `const` names:

```js
// v2 compatibility API
argparse.ArgumentParser({ addHelp: false, exitOnError: false })
parser.add_argument('--foo', { defaultValue: 'x', constant: 'y' })

// v3
argparse.ArgumentParser({ add_help: false, exit_on_error: false })
parser.add_argument('--foo', { default: 'x', const: 'y' })
```

Help templates must use `%(default)s`; the legacy `%(defaultValue)s` alias is
no longer expanded.

### Use `snake_case` action names

The legacy action names `storeConst`, `storeTrue`, `storeFalse`, and
`appendConst` have been removed. Use `store_const`, `store_true`, `store_false`,
and `append_const`.

### Pass argument names as separate parameters

The v1 array signature is no longer accepted:

```js
// v2 compatibility API
parser.add_argument([ '-f', '--foo' ], { help: 'foo' })

// v3
parser.add_argument('-f', '--foo', { help: 'foo' })
```

### Remove other v1 compatibility APIs

- Replace `type: 'string'` with `type: 'str'` or `type: String`.
- Replace `argparse.Const.NAME` with `argparse.NAME`.
- Replace the `ArgumentParser({ version: ... })` option with a `version`
  action.
- Replace the `ArgumentParser({ debug: ... })` option by overriding
  `ArgumentParser.exit()` when custom error handling is required.


## 2. Remove `type: 'auto'`

The undocumented legacy type name `'auto'` has been removed. It was equivalent
to omitting `type`, so remove it from argument options:

```js
// v2
parser.add_argument('--foo', { type: 'auto' })

// v3
parser.add_argument('--foo')
```
