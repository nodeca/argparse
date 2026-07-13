Differences with python version
===============================

## 1. Option object instead of keyword arguments

Python:

```py
# python allows keyword arguments
parser = argparse.ArgumentParser(prog='PROG', usage='%(prog)s [options]')
```

Javascript:

```js
// keyword arguments are passed as a single `options` object
parser = argparse.ArgumentParser({ prog: 'PROG', usage: '%(prog)s [options]' })
```

## 2. Use strings 'int', 'float' or 'str' instead of built-in python types

Python:

```py
parser.add_argument('--foo', type=int)
```

Javascript:

```js
parser.add_argument('--foo', { type: 'int' })
```

## 3. TypeError instead of ValueError

Python raises TypeError or ValueError for various argument errors. Javascript raises TypeError in both cases.

## 4. FileType() returns a stream

You should be closing it with `.close()` if available (which doesn't exist for stdin/stdout).

Only basic read and write modes are implemented. Support for the remaining
modes will not be added: `FileType` is deprecated, emits a
`PendingDeprecationWarning`, and is expected to be removed.

## 5. When class is called as a function, `.call` is executed

Override `Action.call` instead of `Action.__call__` in inherited classes

## 6. Limited support for %-formats

 - `%s` is rendered as `String(arg)`
 - `%r` is rendered as `util.inspect(arg)`
 - `%d`, `%i` is rendered as `arg.toFixed(0)`, no precision digits or padding is supported
 - no other formats are implemented yet

## 7. No `gettext` support

All error messages are hardcoded.

## 8. No `pickle` support

Python's `ArgumentParser` can be serialized with `pickle`. JavaScript has no
equivalent serialization mechanism, so this behavior is not supported.

## 9. `ArgumentError` follows JavaScript error semantics

`ArgumentError.message` contains the final formatted error message. Unlike
Python, separate `argument_name` and raw message fields are not exposed.

## 10. Output uses Node.js stream error handling

`print_help(file)`, `print_usage(file)`, and parser error output write messages
to the supplied `file` object. An object without a `.write()` method is ignored,
as in Python. Exceptions thrown by a custom `.write()` implementation are not
suppressed.

Unlike Python file objects, Node.js streams normally report I/O failures through
the `error` event or a write callback rather than by throwing an `OSError` from
`.write()`. Those errors must be handled on the stream itself.
