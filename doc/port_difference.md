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

## 5. When class is called as a function, `.call` is executed

Override `Action.call` instead of `Action.__call__` in inherited classes

## 6. Limited support for %-formats

 - `%s` is rendered as `String(arg)`
 - `%r` is rendered as `util.inspect(arg)`
 - `%d`, `%i` is rendered as `arg.toFixed(0)`, no precision digits or padding is supported
 - no other formats are implemented yet

## 7. No `gettext` support

All error messages are hardcoded.
