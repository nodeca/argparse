// Port of python's argparse module, version 3.9.0:
// https://github.com/python/cpython/blob/v3.9.0rc1/Lib/test/test_argparse.py

// Copyright (C) 2010-2020 Python Software Foundation.
// Copyright (C) 2020 argparse.js authors

/* global describe, it, before, after */
/* eslint-disable quotes, new-cap, new-parens, no-extra-semi, comma-dangle */

// eslint-disable-next-line strict
'use strict'

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const stream = require('stream')
const util = require('util')
const argparse = require('../')
const textwrap = require('../lib/textwrap')
const sub = require('../lib/sub')


class JSTestCase {

    run() {
        describe(this.constructor.name, () => {
            for (let method of this) {
                if (method === 'setUp') {
                    before(() => this[method]())
                } else if (method === 'tearDown') {
                    after(() => this[method]())
                } else if (typeof method === 'string' && method.startsWith('skip_test') &&
                    this[method] !== undefined) {
                    it.skip(method, () => this[method]())
                } else if (typeof method === 'string' && method.startsWith('test') &&
                    this[method] !== undefined) {
                    it(method, () => this[method]())
                }
            }
        })
    }

    * [Symbol.iterator]() {
        /* eslint-disable consistent-this */
        let self = this
        let member_names = new Set()
        while (self) {
            for (let k of Reflect.ownKeys(self)) member_names.add(k)
            self = Object.getPrototypeOf(self)
        }
        yield* Array.from(member_names)
        /* eslint-enable consistent-this */
    }

    assertEqual(expected, actual)    { assert.deepStrictEqual(actual, expected) }
    assertNotEqual(expected, actual) { assert.notDeepStrictEqual(actual, expected) }
    assertIsNone(value)              { assert.strictEqual(value, undefined) }
    assertRegex(string, regex)       { assert.match(string, regex) }
    assertNotRegex(string, regex)    { assert.doesNotMatch(string, regex) }
    assertIn(key, object)            { assert(key in object) }
    assertNotIn(key, object)         { assert(!(key in object)) }
    assertRaises(error, fn) {
        let _err
        assert.throws(() => {
            try {
                fn()
            } catch (err) {
                _err = err
                throw err
            }
        }, error)
        return { exception: _err }
    }
}


class StdIOBuffer extends stream.Writable {
    constructor() {
        super()
        this.buffer = []
    }

    _write(chunk, enc, callback) {
        this.buffer.push(chunk)
        callback()
    }

    getvalue() {
        return Buffer.concat(this.buffer).toString('utf8')
    }
}


class TestCase extends JSTestCase {

    setUp() {
        // The tests assume that line wrapping occurs at 80 columns, but this
        // behaviour can be overridden by setting the COLUMNS environment
        // variable.  To ensure that this width is used, set COLUMNS to 80.
        process.env.COLUMNS = '80'
    }
}


function TempDirMixin(cls) {
    return class TempDirMixin extends cls {

        setUp() {
            this.temp_dir = path.join(os.tmpdir(), sub('test_argparse_%s', Math.random()))
            this.old_dir = process.cwd()
            fs.mkdirSync(this.temp_dir)
            process.chdir(this.temp_dir)
        }

        tearDown() {
            process.chdir(this.old_dir)
            fs.rmdirSync(this.temp_dir, { recursive: true })
        }

        create_readonly_file(filename) {
            let file_path = path.join(this.temp_dir, filename)
            fs.writeFileSync(file_path, filename)
            fs.chmodSync(file_path, 0o400)
        }
    }
}

function Sig(...args) {
    return args
}

function NS(dict) {
    return argparse.Namespace(dict)
}


class ArgumentParserError extends Error {

    constructor(message, stdout, stderr, error_code) {
        super()
        this.m = message
        this.stdout = stdout
        this.stderr = stderr
        this.error_code = error_code
        this.message = this.toString()
    }

    toString() {
        return '(' + [ this.m, this.stdout, this.stderr, this.error_code ].join(', ') + ')'
    }
}


class SystemExit extends Error {
    constructor(code) {
        super()
        this.code = code
    }
}


function stderr_to_parser_error(fn) {
    // if this is being called recursively and stderr or stdout is already being
    // redirected, simply call the function and let the enclosing function
    // catch the exception
    if (process.stderr instanceof StdIOBuffer || process.stdout instanceof StdIOBuffer) {
        return fn()
    }

    // if this is not being called recursively, redirect stderr and
    // use it as the ArgumentParserError message
    let old_stdout = Object.getOwnPropertyDescriptor(process, 'stdout')
    let old_stderr = Object.getOwnPropertyDescriptor(process, 'stderr')
    Object.defineProperty(process, 'stdout', { value: new StdIOBuffer() })
    Object.defineProperty(process, 'stderr', { value: new StdIOBuffer() })
    try {
        try {
            let result = fn()
            for (let key of Object.keys(result || {})) {
                if (result[key] === process.stdout) result[key] = old_stdout.get()
                if (result[key] === process.stderr) result[key] = old_stderr.get()
            }
            return result
        } catch (err) {
            if (!(err instanceof SystemExit)) throw err
            let code = err.code
            let stdout = process.stdout.getvalue()
            let stderr = process.stderr.getvalue()
            throw new ArgumentParserError(
                "SystemExit", stdout, stderr, code)
        }
    } finally {
        Object.defineProperty(process, 'stdout', old_stdout)
        Object.defineProperty(process, 'stderr', old_stderr)
    }
}


class ErrorRaisingArgumentParser extends argparse.ArgumentParser {

    parse_args(...args) {
        return stderr_to_parser_error(() => super.parse_args(...args))
    }

    exit(code, message) {
        return stderr_to_parser_error(() => {
            this._print_message(message, process.stderr)
            throw new SystemExit(code)
        })
    }

    error(...args) {
        return stderr_to_parser_error(() => super.error(...args))
    }
}


class ParserTestCase extends TestCase {
    /*
     *  Adds parser tests using the class attributes.
     *
     *  Classes of this type should specify the following attributes:
     *
     *  argument_signatures -- a list of Sig objects which specify
     *      the signatures of Argument objects to be created
     *  failures -- a list of args lists that should cause the parser
     *      to fail
     *  successes -- a list of (initial_args, options, remaining_args) tuples
     *      where initial_args specifies the string args to be parsed,
     *      options is a dict that should match the vars() of the options
     *      parsed out of initial_args, and remaining_args should be any
     *      remaining unparsed arguments
     */

    constructor() {
        super()

        // default parser signature is empty
        if (!('parser_signature' in this)) {
            this.parser_signature = Sig()
        }
        if (!('parser_class' in this)) {
            this.parser_class = ErrorRaisingArgumentParser
        }

        // ---------------------------------------
        // functions for adding optional arguments
        // ---------------------------------------
        function no_groups(parser, argument_signatures) {
            /* Add all arguments directly to the parser */
            for (let sig of argument_signatures) {
                parser.add_argument(...sig)
            }
        }

        function one_group(parser, argument_signatures) {
            /* Add all arguments under a single group in the parser */
            let group = parser.add_argument_group('foo')
            for (let sig of argument_signatures) {
                group.add_argument(...sig)
            }
        }

        function many_groups(parser, argument_signatures) {
            /* Add each argument in its own group to the parser */
            for (let [ i, sig ] of Object.entries(argument_signatures)) {
                let group = parser.add_argument_group(sub('foo:%i', +i))
                group.add_argument(...sig)
            }
        }

        // --------------------------
        // functions for parsing args
        // --------------------------
        function listargs(parser, args) {
            /* Parse the args by passing in a list */
            return parser.parse_args(args)
        }

        function sysargs(parser, args) {
            /* Parse the args by defaulting to sys.argv */
            let old_sys_argv = process.argv
            process.argv = [old_sys_argv[0], old_sys_argv[1]].concat(args)
            try {
                return parser.parse_args()
            } finally {
                process.argv = old_sys_argv
            }
        }

        // class that holds the combination of one optional argument
        // addition method and one arg parsing method
        class AddTests {

            constructor(tester_cls, add_arguments, parse_args) {
                this._add_arguments = add_arguments
                this._parse_args = parse_args

                let add_arguments_name = this._add_arguments.name
                let parse_args_name = this._parse_args.name
                for (let test_func of [this.test_failures, this.test_successes]) {
                    let func_name = test_func.name
                    let names = [ func_name, add_arguments_name, parse_args_name ]
                    let test_name = names.join('_')
                    tester_cls[test_name] = () => test_func.call(this, tester_cls)
                }
            }

            _get_parser(tester) {
                let parser = new tester.parser_class(...tester.parser_signature)
                this._add_arguments(parser, tester.argument_signatures)
                return parser
            }

            test_failures(tester) {
                let parser = this._get_parser(tester)
                for (let args_str of tester.failures) {
                    let args = args_str.split(/\s+/).filter(Boolean)
                    tester.assertRaises(ArgumentParserError, () => parser.parse_args(args))
                }
            }

            test_successes(tester) {
                let parser = this._get_parser(tester)
                for (let [ args, expected_ns ] of tester.successes) {
                    if (typeof args === 'string') {
                        args = args.split(/\s+/).filter(Boolean)
                    }
                    let result_ns = tester._normalize_ns(this._parse_args(parser, args))
                    tester.assertEqual(expected_ns, result_ns)
                }
            }
        }

        // add tests for each combination of an optionals adding method
        // and an arg parsing method
        for (let add_arguments of [no_groups, one_group, many_groups]) {
            for (let parse_args of [listargs, sysargs]) {
                // eslint-disable-next-line no-new
                new AddTests(this, add_arguments, parse_args)
            }
        }
    }

    _normalize_ns(ns) {
        return ns
    }
}

// ===============
// Optionals tests
// ===============

;(new class TestOptionalsSingleDash extends ParserTestCase {
    /* Test an Optional with a single-dash option string */

    argument_signatures = [Sig('-x')]
    failures = ['-x', 'a', '--foo', '-x --foo', '-x -y']
    successes = [
        ['', NS({ x: undefined })],
        ['-x a', NS({ x: 'a' })],
        ['-xa', NS({ x: 'a' })],
        ['-x -1', NS({ x: '-1' })],
        ['-x-1', NS({ x: '-1' })],
    ]
}).run()


;(new class TestOptionalsSingleDashCombined extends ParserTestCase {
    /* Test an Optional with a single-dash option string */

    argument_signatures = [
        Sig('-x', { action: 'store_true' }),
        Sig('-yyy', { action: 'store_const', const: 42 }),
        Sig('-z'),
    ]
    failures = ['a', '--foo', '-xa', '-x --foo', '-x -z', '-z -x',
                '-yx', '-yz a', '-yyyx', '-yyyza', '-xyza']
    successes = [
        ['', NS({ x: false, yyy: undefined, z: undefined })],
        ['-x', NS({ x: true, yyy: undefined, z: undefined })],
        ['-za', NS({ x: false, yyy: undefined, z: 'a' })],
        ['-z a', NS({ x: false, yyy: undefined, z: 'a' })],
        ['-xza', NS({ x: true, yyy: undefined, z: 'a' })],
        ['-xz a', NS({ x: true, yyy: undefined, z: 'a' })],
        ['-x -za', NS({ x: true, yyy: undefined, z: 'a' })],
        ['-x -z a', NS({ x: true, yyy: undefined, z: 'a' })],
        ['-y', NS({ x: false, yyy: 42, z: undefined })],
        ['-yyy', NS({ x: false, yyy: 42, z: undefined })],
        ['-x -yyy -za', NS({ x: true, yyy: 42, z: 'a' })],
        ['-x -yyy -z a', NS({ x: true, yyy: 42, z: 'a' })],
    ]
}).run()


;(new class TestOptionalsSingleDashLong extends ParserTestCase {
    /* Test an Optional with a multi-character single-dash option string */

    argument_signatures = [Sig('-foo')]
    failures = ['-foo', 'a', '--foo', '-foo --foo', '-foo -y', '-fooa']
    successes = [
        ['', NS({ foo: undefined })],
        ['-foo a', NS({ foo: 'a' })],
        ['-foo -1', NS({ foo: '-1' })],
        ['-fo a', NS({ foo: 'a' })],
        ['-f a', NS({ foo: 'a' })],
    ]
}).run()


;(new class TestOptionalsSingleDashSubsetAmbiguous extends ParserTestCase {
    /* Test Optionals where option strings are subsets of each other */

    argument_signatures = [Sig('-f'), Sig('-foobar'), Sig('-foorab')]
    failures = ['-f', '-foo', '-fo', '-foo b', '-foob', '-fooba', '-foora']
    successes = [
        ['', NS({ f: undefined, foobar: undefined, foorab: undefined })],
        ['-f a', NS({ f: 'a', foobar: undefined, foorab: undefined })],
        ['-fa', NS({ f: 'a', foobar: undefined, foorab: undefined })],
        ['-foa', NS({ f: 'oa', foobar: undefined, foorab: undefined })],
        ['-fooa', NS({ f: 'ooa', foobar: undefined, foorab: undefined })],
        ['-foobar a', NS({ f: undefined, foobar: 'a', foorab: undefined })],
        ['-foorab a', NS({ f: undefined, foobar: undefined, foorab: 'a' })],
    ]
}).run()


;(new class TestOptionalsSingleDashAmbiguous extends ParserTestCase {
    /* Test Optionals that partially match but are not subsets */

    argument_signatures = [Sig('-foobar'), Sig('-foorab')]
    failures = ['-f', '-f a', '-fa', '-foa', '-foo', '-fo', '-foo b']
    successes = [
        ['', NS({ foobar: undefined, foorab: undefined })],
        ['-foob a', NS({ foobar: 'a', foorab: undefined })],
        ['-foor a', NS({ foobar: undefined, foorab: 'a' })],
        ['-fooba a', NS({ foobar: 'a', foorab: undefined })],
        ['-foora a', NS({ foobar: undefined, foorab: 'a' })],
        ['-foobar a', NS({ foobar: 'a', foorab: undefined })],
        ['-foorab a', NS({ foobar: undefined, foorab: 'a' })],
    ]
}).run()


;(new class TestOptionalsNumeric extends ParserTestCase {
    /* Test an Optional with a short opt string */

    argument_signatures = [Sig('-1', { dest: 'one' })]
    failures = ['-1', 'a', '-1 --foo', '-1 -y', '-1 -1', '-1 -2']
    successes = [
        ['', NS({ one: undefined })],
        ['-1 a', NS({ one: 'a' })],
        ['-1a', NS({ one: 'a' })],
        ['-1-2', NS({ one: '-2' })],
    ]
}).run()


;(new class TestOptionalsDoubleDash extends ParserTestCase {
    /* Test an Optional with a double-dash option string */

    argument_signatures = [Sig('--foo')]
    failures = ['--foo', '-f', '-f a', 'a', '--foo -x', '--foo --bar']
    successes = [
        ['', NS({ foo: undefined })],
        ['--foo a', NS({ foo: 'a' })],
        ['--foo=a', NS({ foo: 'a' })],
        ['--foo -2.5', NS({ foo: '-2.5' })],
        ['--foo=-2.5', NS({ foo: '-2.5' })],
    ]
}).run()


;(new class TestOptionalsDoubleDashPartialMatch extends ParserTestCase {
    /* Tests partial matching with a double-dash option string */

    argument_signatures = [
        Sig('--badger', { action: 'store_true' }),
        Sig('--bat'),
    ]
    failures = ['--bar', '--b', '--ba', '--b: 2', '--ba: 4', '--badge 5']
    successes = [
        ['', NS({ badger: false, bat: undefined })],
        ['--bat X', NS({ badger: false, bat: 'X' })],
        ['--bad', NS({ badger: true, bat: undefined })],
        ['--badg', NS({ badger: true, bat: undefined })],
        ['--badge', NS({ badger: true, bat: undefined })],
        ['--badger', NS({ badger: true, bat: undefined })],
    ]
}).run()


;(new class TestOptionalsDoubleDashPrefixMatch extends ParserTestCase {
    /* Tests when one double-dash option string is a prefix of another */

    argument_signatures = [
        Sig('--badger', { action: 'store_true' }),
        Sig('--ba'),
    ]
    failures = ['--bar', '--b', '--ba', '--b: 2', '--badge 5']
    successes = [
        ['', NS({ badger: false, ba: undefined })],
        ['--ba X', NS({ badger: false, ba: 'X' })],
        ['--ba=X', NS({ badger: false, ba: 'X' })],
        ['--bad', NS({ badger: true, ba: undefined })],
        ['--badg', NS({ badger: true, ba: undefined })],
        ['--badge', NS({ badger: true, ba: undefined })],
        ['--badger', NS({ badger: true, ba: undefined })],
    ]
}).run()


;(new class TestOptionalsSingleDoubleDash extends ParserTestCase {
    /* Test an Optional with single- and double-dash option strings */

    argument_signatures = [
        Sig('-f', { action: 'store_true' }),
        Sig('--bar'),
        Sig('-baz', { action: 'store_const', const: 42 }),
    ]
    failures = ['--bar', '-fbar', '-fbaz', '-bazf', '-b B', 'B']
    successes = [
        ['', NS({ f: false, bar: undefined, baz: undefined })],
        ['-f', NS({ f: true, bar: undefined, baz: undefined })],
        ['--ba B', NS({ f: false, bar: 'B', baz: undefined })],
        ['-f --bar B', NS({ f: true, bar: 'B', baz: undefined })],
        ['-f -b', NS({ f: true, bar: undefined, baz: 42 })],
        ['-ba -f', NS({ f: true, bar: undefined, baz: 42 })],
    ]
}).run()


;(new class TestOptionalsAlternatePrefixChars extends ParserTestCase {
    /* Test an Optional with option strings with custom prefixes */

    parser_signature = Sig({ prefix_chars: '+:/', add_help: false })
    argument_signatures = [
        Sig('+f', { action: 'store_true' }),
        Sig('::bar'),
        Sig('/baz', { action: 'store_const', const: 42 }),
    ]
    failures = ['--bar', '-fbar', '-b B', 'B', '-f', '--bar B', '-baz', '-h', '--help', '+h', '::help', '/help']
    successes = [
        ['', NS({ f: false, bar: undefined, baz: undefined })],
        ['+f', NS({ f: true, bar: undefined, baz: undefined })],
        ['::ba B', NS({ f: false, bar: 'B', baz: undefined })],
        ['+f ::bar B', NS({ f: true, bar: 'B', baz: undefined })],
        ['+f /b', NS({ f: true, bar: undefined, baz: 42 })],
        ['/ba +f', NS({ f: true, bar: undefined, baz: 42 })],
    ]
}).run()


;(new class TestOptionalsAlternatePrefixCharsAddedHelp extends ParserTestCase {
    /*
     *  When ``-`` not in prefix_chars, default operators created for help
     *  should use the prefix_chars in use rather than - or --
     *  http://bugs.python.org/issue9444
     */

    parser_signature = Sig({ prefix_chars: '+:/', add_help: true })
    argument_signatures = [
        Sig('+f', { action: 'store_true' }),
        Sig('::bar'),
        Sig('/baz', { action: 'store_const', const: 42 }),
    ]
    failures = ['--bar', '-fbar', '-b B', 'B', '-f', '--bar B', '-baz']
    successes = [
        ['', NS({ f: false, bar: undefined, baz: undefined })],
        ['+f', NS({ f: true, bar: undefined, baz: undefined })],
        ['::ba B', NS({ f: false, bar: 'B', baz: undefined })],
        ['+f ::bar B', NS({ f: true, bar: 'B', baz: undefined })],
        ['+f /b', NS({ f: true, bar: undefined, baz: 42 })],
        ['/ba +f', NS({ f: true, bar: undefined, baz: 42 })]
    ]
}).run()


;(new class TestOptionalsAlternatePrefixCharsMultipleShortArgs extends ParserTestCase {
    /* Verify that Optionals must be called with their defined prefixes */

    parser_signature = Sig({ prefix_chars: '+-', add_help: false })
    argument_signatures = [
        Sig('-x', { action: 'store_true' }),
        Sig('+y', { action: 'store_true' }),
        Sig('+z', { action: 'store_true' }),
    ]
    failures = ['-w',
                '-xyz',
                '+x',
                '-y',
                '+xyz',
    ]
    successes = [
        ['', NS({ x: false, y: false, z: false })],
        ['-x', NS({ x: true, y: false, z: false })],
        ['+y -x', NS({ x: true, y: true, z: false })],
        ['+yz -x', NS({ x: true, y: true, z: true })],
    ]
}).run()


;(new class TestOptionalsShortLong extends ParserTestCase {
    /* Test a combination of single- and double-dash option strings */

    argument_signatures = [
        Sig('-v', '--verbose', '-n', '--noisy', { action: 'store_true' }),
    ]
    failures = ['--x --verbose', '-N', 'a', '-v x']
    successes = [
        ['', NS({ verbose: false })],
        ['-v', NS({ verbose: true })],
        ['--verbose', NS({ verbose: true })],
        ['-n', NS({ verbose: true })],
        ['--noisy', NS({ verbose: true })],
    ]
}).run()


;(new class TestOptionalsDest extends ParserTestCase {
    /* Tests various means of setting destination */

    argument_signatures = [Sig('--foo-bar'), Sig('--baz', { dest: 'zabbaz' })]
    failures = ['a']
    successes = [
        ['--foo-bar f', NS({ foo_bar: 'f', zabbaz: undefined })],
        ['--baz g', NS({ foo_bar: undefined, zabbaz: 'g' })],
        ['--foo-bar h --baz i', NS({ foo_bar: 'h', zabbaz: 'i' })],
        ['--baz j --foo-bar k', NS({ foo_bar: 'k', zabbaz: 'j' })],
    ]
}).run()


;(new class TestOptionalsDefault extends ParserTestCase {
    /* Tests specifying a default for an Optional */

    argument_signatures = [Sig('-x'), Sig('-y', { default: 42 })]
    failures = ['a']
    successes = [
        ['', NS({ x: undefined, y: 42 })],
        ['-xx', NS({ x: 'x', y: 42 })],
        ['-yy', NS({ x: undefined, y: 'y' })],
    ]
}).run()


;(new class TestOptionalsNargsDefault extends ParserTestCase {
    /* Tests not specifying the number of args for an Optional */

    argument_signatures = [Sig('-x')]
    failures = ['a', '-x']
    successes = [
        ['', NS({ x: undefined })],
        ['-x a', NS({ x: 'a' })],
    ]
}).run()


;(new class TestOptionalsNargs1 extends ParserTestCase {
    /* Tests specifying 1 arg for an Optional */

    argument_signatures = [Sig('-x', { nargs: 1 })]
    failures = ['a', '-x']
    successes = [
        ['', NS({ x: undefined })],
        ['-x a', NS({ x: ['a'] })],
    ]
}).run()


;(new class TestOptionalsNargs3 extends ParserTestCase {
    /* Tests specifying 3 args for an Optional */

    argument_signatures = [Sig('-x', { nargs: 3 })]
    failures = ['a', '-x', '-x a', '-x a b', 'a -x', 'a -x b']
    successes = [
        ['', NS({ x: undefined })],
        ['-x a b c', NS({ x: ['a', 'b', 'c'] })],
    ]
}).run()


;(new class TestOptionalsNargsOptional extends ParserTestCase {
    /* Tests specifying an Optional arg for an Optional */

    argument_signatures = [
        Sig('-w', { nargs: '?' }),
        Sig('-x', { nargs: '?', const: 42 }),
        Sig('-y', { nargs: '?', default: 'spam' }),
        Sig('-z', { nargs: '?', type: 'int', const: '42', default: '84' }),
    ]
    failures = ['2']
    successes = [
        ['', NS({ w: undefined, x: undefined, y: 'spam', z: 84 })],
        ['-w', NS({ w: undefined, x: undefined, y: 'spam', z: 84 })],
        ['-w 2', NS({ w: '2', x: undefined, y: 'spam', z: 84 })],
        ['-x', NS({ w: undefined, x: 42, y: 'spam', z: 84 })],
        ['-x 2', NS({ w: undefined, x: '2', y: 'spam', z: 84 })],
        ['-y', NS({ w: undefined, x: undefined, y: undefined, z: 84 })],
        ['-y 2', NS({ w: undefined, x: undefined, y: '2', z: 84 })],
        ['-z', NS({ w: undefined, x: undefined, y: 'spam', z: 42 })],
        ['-z 2', NS({ w: undefined, x: undefined, y: 'spam', z: 2 })],
    ]
}).run()


;(new class TestOptionalsNargsZeroOrMore extends ParserTestCase {
    /* Tests specifying args for an Optional that accepts zero or more */

    argument_signatures = [
        Sig('-x', { nargs: '*' }),
        Sig('-y', { nargs: '*', default: 'spam' }),
    ]
    failures = ['a']
    successes = [
        ['', NS({ x: undefined, y: 'spam' })],
        ['-x', NS({ x: [], y: 'spam' })],
        ['-x a', NS({ x: ['a'], y: 'spam' })],
        ['-x a b', NS({ x: ['a', 'b'], y: 'spam' })],
        ['-y', NS({ x: undefined, y: [] })],
        ['-y a', NS({ x: undefined, y: ['a'] })],
        ['-y a b', NS({ x: undefined, y: ['a', 'b'] })],
    ]
}).run()


;(new class TestOptionalsNargsOneOrMore extends ParserTestCase {
    /* Tests specifying args for an Optional that accepts one or more */

    argument_signatures = [
        Sig('-x', { nargs: '+' }),
        Sig('-y', { nargs: '+', default: 'spam' }),
    ]
    failures = ['a', '-x', '-y', 'a -x', 'a -y b']
    successes = [
        ['', NS({ x: undefined, y: 'spam' })],
        ['-x a', NS({ x: ['a'], y: 'spam' })],
        ['-x a b', NS({ x: ['a', 'b'], y: 'spam' })],
        ['-y a', NS({ x: undefined, y: ['a'] })],
        ['-y a b', NS({ x: undefined, y: ['a', 'b'] })],
    ]
}).run()


;(new class TestOptionalsChoices extends ParserTestCase {
    /* Tests specifying the choices for an Optional */

    argument_signatures = [
        Sig('-f', { choices: 'abc' }),
        Sig('-g', { type: 'int', choices: Array(5).fill(0).map((x, i) => i) })]
    failures = ['a', '-f d', '-fad', '-ga', '-g 6']
    successes = [
        ['', NS({ f: undefined, g: undefined })],
        ['-f a', NS({ f: 'a', g: undefined })],
        ['-f c', NS({ f: 'c', g: undefined })],
        ['-g 0', NS({ f: undefined, g: 0 })],
        ['-g 03', NS({ f: undefined, g: 3 })],
        ['-fb -g4', NS({ f: 'b', g: 4 })],
    ]
}).run()


;(new class TestOptionalsRequired extends ParserTestCase {
    /* Tests an optional action that is required */

    argument_signatures = [
        Sig('-x', { type: 'int', required: true }),
    ]
    failures = ['a', '']
    successes = [
        ['-x 1', NS({ x: 1 })],
        ['-x42', NS({ x: 42 })],
    ]
}).run()


;(new class TestOptionalsActionStore extends ParserTestCase {
    /* Tests the store action for an Optional */

    argument_signatures = [Sig('-x', { action: 'store' })]
    failures = ['a', 'a -x']
    successes = [
        ['', NS({ x: undefined })],
        ['-xfoo', NS({ x: 'foo' })],
    ]
}).run()


;(new class TestOptionalsActionStoreConst extends ParserTestCase {
    /* Tests the store_const action for an Optional */

    argument_signatures = [Sig('-y', { action: 'store_const', const: Object })]
    failures = ['a']
    successes = [
        ['', NS({ y: undefined })],
        ['-y', NS({ y: Object })],
    ]
}).run()


;(new class TestOptionalsActionStoreFalse extends ParserTestCase {
    /* Tests the store_false action for an Optional */

    argument_signatures = [Sig('-z', { action: 'store_false' })]
    failures = ['a', '-za', '-z a']
    successes = [
        ['', NS({ z: true })],
        ['-z', NS({ z: false })],
    ]
}).run()


;(new class TestOptionalsActionStoreTrue extends ParserTestCase {
    /* Tests the store_true action for an Optional */

    argument_signatures = [Sig('--apple', { action: 'store_true' })]
    failures = ['a', '--apple=b', '--apple b']
    successes = [
        ['', NS({ apple: false })],
        ['--apple', NS({ apple: true })],
    ]
}).run()

;(new class TestBooleanOptionalAction extends ParserTestCase {
    /* Tests BooleanOptionalAction */

    argument_signatures = [Sig('--foo', { action: argparse.BooleanOptionalAction })]
    failures = ['--foo bar', '--foo=bar']
    successes = [
        ['', NS({ foo: undefined })],
        ['--foo', NS({ foo: true })],
        ['--no-foo', NS({ foo: false })],
        ['--foo --no-foo', NS({ foo: false })],  // useful for aliases
        ['--no-foo --foo', NS({ foo: true })],
    ]

    test_const() {
        // See bpo-40862
        let parser = argparse.ArgumentParser()
        let cm = this.assertRaises(TypeError, () =>
            parser.add_argument('--foo', { const: true, action: argparse.BooleanOptionalAction }))

        this.assertRegex(String(cm.exception), /got an unexpected keyword argument 'const'/)
    }
}).run()

;(new class TestBooleanOptionalActionRequired extends ParserTestCase {
    /* Tests BooleanOptionalAction required */

    argument_signatures = [
        Sig('--foo', { required: true, action: argparse.BooleanOptionalAction })
    ]
    failures = ['']
    successes = [
        ['--foo', NS({ foo: true })],
        ['--no-foo', NS({ foo: false })],
    ]
}).run()

;(new class TestOptionalsActionAppend extends ParserTestCase {
    /* Tests the append action for an Optional */

    argument_signatures = [Sig('--baz', { action: 'append' })]
    failures = ['a', '--baz', 'a --baz', '--baz a b']
    successes = [
        ['', NS({ baz: undefined })],
        ['--baz a', NS({ baz: ['a'] })],
        ['--baz a --baz b', NS({ baz: ['a', 'b'] })],
    ]
}).run()


;(new class TestOptionalsActionAppendWithDefault extends ParserTestCase {
    /* Tests the append action for an Optional */

    argument_signatures = [Sig('--baz', { action: 'append', default: ['X'] })]
    failures = ['a', '--baz', 'a --baz', '--baz a b']
    successes = [
        ['', NS({ baz: ['X'] })],
        ['--baz a', NS({ baz: ['X', 'a'] })],
        ['--baz a --baz b', NS({ baz: ['X', 'a', 'b'] })],
    ]
}).run()


;(new class TestOptionalsActionAppendConst extends ParserTestCase {
    /* Tests the append_const action for an Optional */

    argument_signatures = [
        Sig('-b', { action: 'append_const', const: Error }),
        Sig('-c', { action: 'append', dest: 'b' }),
    ]
    failures = ['a', '-c', 'a -c', '-bx', '-b x']
    successes = [
        ['', NS({ b: undefined })],
        ['-b', NS({ b: [Error] })],
        ['-b -cx -b -cyz', NS({ b: [Error, 'x', Error, 'yz'] })],
    ]
}).run()


;(new class TestOptionalsActionAppendConstWithDefault extends ParserTestCase {
    /* Tests the append_const action for an Optional */

    argument_signatures = [
        Sig('-b', { action: 'append_const', const: Error, default: ['X'] }),
        Sig('-c', { action: 'append', dest: 'b' }),
    ]
    failures = ['a', '-c', 'a -c', '-bx', '-b x']
    successes = [
        ['', NS({ b: ['X'] })],
        ['-b', NS({ b: ['X', Error] })],
        ['-b -cx -b -cyz', NS({ b: ['X', Error, 'x', Error, 'yz'] })],
    ]
}).run()


;(new class TestOptionalsActionCount extends ParserTestCase {
    /* Tests the count action for an Optional */

    argument_signatures = [Sig('-x', { action: 'count' })]
    failures = ['a', '-x a', '-x b', '-x a -x b']
    successes = [
        ['', NS({ x: undefined })],
        ['-x', NS({ x: 1 })],
    ]
}).run()


;(new class TestOptionalsAllowLongAbbreviation extends ParserTestCase {
    /* Allow long options to be abbreviated unambiguously */

    argument_signatures = [
        Sig('--foo'),
        Sig('--foobaz'),
        Sig('--fooble', { action: 'store_true' }),
    ]
    failures = ['--foob 5', '--foob']
    successes = [
        ['', NS({ foo: undefined, foobaz: undefined, fooble: false })],
        ['--foo 7', NS({ foo: '7', foobaz: undefined, fooble: false })],
        ['--fooba a', NS({ foo: undefined, foobaz: 'a', fooble: false })],
        ['--foobl --foo g', NS({ foo: 'g', foobaz: undefined, fooble: true })],
    ]
}).run()


;(new class TestOptionalsDisallowLongAbbreviation extends ParserTestCase {
    /* Do not allow abbreviations of long options at all */

    parser_signature = Sig({ allow_abbrev: false })
    argument_signatures = [
        Sig('--foo'),
        Sig('--foodle', { action: 'store_true' }),
        Sig('--foonly'),
    ]
    failures = ['-foon 3', '--foon 3', '--food', '--food --foo 2']
    successes = [
        ['', NS({ foo: undefined, foodle: false, foonly: undefined })],
        ['--foo 3', NS({ foo: '3', foodle: false, foonly: undefined })],
        ['--foonly 7 --foodle --foo 2', NS({ foo: '2', foodle: true, foonly: '7' })],
    ]
}).run()


;(new class TestOptionalsDisallowLongAbbreviationPrefixChars extends ParserTestCase {
    /* Disallowing abbreviations works with alternative prefix characters */

    parser_signature = Sig({ prefix_chars: '+', allow_abbrev: false })
    argument_signatures = [
        Sig('++foo'),
        Sig('++foodle', { action: 'store_true' }),
        Sig('++foonly'),
    ]
    failures = ['+foon 3', '++foon 3', '++food', '++food ++foo 2']
    successes = [
        ['', NS({ foo: undefined, foodle: false, foonly: undefined })],
        ['++foo 3', NS({ foo: '3', foodle: false, foonly: undefined })],
        ['++foonly 7 ++foodle ++foo 2', NS({ foo: '2', foodle: true, foonly: '7' })],
    ]
}).run()


;(new class TestDisallowLongAbbreviationAllowsShortGrouping extends ParserTestCase {
    /* Do not allow abbreviations of long options at all */

    parser_signature = Sig({ allow_abbrev: false })
    argument_signatures = [
        Sig('-r'),
        Sig('-c', { action: 'count' }),
    ]
    failures = ['-r', '-c -r']
    successes = [
        ['', NS({ r: undefined, c: undefined })],
        ['-ra', NS({ r: 'a', c: undefined })],
        ['-rcc', NS({ r: 'cc', c: undefined })],
        ['-cc', NS({ r: undefined, c: 2 })],
        ['-cc -ra', NS({ r: 'a', c: 2 })],
        ['-ccrcc', NS({ r: 'cc', c: 2 })],
    ]
}).run()


;(new class TestDisallowLongAbbreviationAllowsShortGroupingPrefix extends ParserTestCase {
    /* Short option grouping works with custom prefix and allow_abbrev=False */

    parser_signature = Sig({ prefix_chars: '+', allow_abbrev: false })
    argument_signatures = [
        Sig('+r'),
        Sig('+c', { action: 'count' }),
    ]
    failures = ['+r', '+c +r']
    successes = [
        ['', NS({ r: undefined, c: undefined })],
        ['+ra', NS({ r: 'a', c: undefined })],
        ['+rcc', NS({ r: 'cc', c: undefined })],
        ['+cc', NS({ r: undefined, c: 2 })],
        ['+cc +ra', NS({ r: 'a', c: 2 })],
        ['+ccrcc', NS({ r: 'cc', c: 2 })],
    ]
}).run()


// ================
// Positional tests
// ================

;(new class TestPositionalsNargsNone extends ParserTestCase {
    /* Test a Positional that doesn't specify nargs */

    argument_signatures = [Sig('foo')]
    failures = ['', '-x', 'a b']
    successes = [
        ['a', NS({ foo: 'a' })],
    ]
}).run()


;(new class TestPositionalsNargs1 extends ParserTestCase {
    /* Test a Positional that specifies an nargs of 1 */

    argument_signatures = [Sig('foo', { nargs: 1 })]
    failures = ['', '-x', 'a b']
    successes = [
        ['a', NS({ foo: ['a'] })],
    ]
}).run()


;(new class TestPositionalsNargs2 extends ParserTestCase {
    /* Test a Positional that specifies an nargs of 2 */

    argument_signatures = [Sig('foo', { nargs: 2 })]
    failures = ['', 'a', '-x', 'a b c']
    successes = [
        ['a b', NS({ foo: ['a', 'b'] })],
    ]
}).run()


;(new class TestPositionalsNargsZeroOrMore extends ParserTestCase {
    /* Test a Positional that specifies unlimited nargs */

    argument_signatures = [Sig('foo', { nargs: '*' })]
    failures = ['-x']
    successes = [
        ['', NS({ foo: [] })],
        ['a', NS({ foo: ['a'] })],
        ['a b', NS({ foo: ['a', 'b'] })],
    ]
}).run()


;(new class TestPositionalsNargsZeroOrMoreDefault extends ParserTestCase {
    /* Test a Positional that specifies unlimited nargs and a default */

    argument_signatures = [Sig('foo', { nargs: '*', default: 'bar' })]
    failures = ['-x']
    successes = [
        ['', NS({ foo: 'bar' })],
        ['a', NS({ foo: ['a'] })],
        ['a b', NS({ foo: ['a', 'b'] })],
    ]
}).run()


;(new class TestPositionalsNargsOneOrMore extends ParserTestCase {
    /* Test a Positional that specifies one or more nargs */

    argument_signatures = [Sig('foo', { nargs: '+' })]
    failures = ['', '-x']
    successes = [
        ['a', NS({ foo: ['a'] })],
        ['a b', NS({ foo: ['a', 'b'] })],
    ]
}).run()


;(new class TestPositionalsNargsOptional extends ParserTestCase {
    /* Tests an Optional Positional */

    argument_signatures = [Sig('foo', { nargs: '?' })]
    failures = ['-x', 'a b']
    successes = [
        ['', NS({ foo: undefined })],
        ['a', NS({ foo: 'a' })],
    ]
}).run()


;(new class TestPositionalsNargsOptionalDefault extends ParserTestCase {
    /* Tests an Optional Positional with a default value */

    argument_signatures = [Sig('foo', { nargs: '?', default: 42 })]
    failures = ['-x', 'a b']
    successes = [
        ['', NS({ foo: 42 })],
        ['a', NS({ foo: 'a' })],
    ]
}).run()


;(new class TestPositionalsNargsOptionalConvertedDefault extends ParserTestCase {
    /*
     *  Tests an Optional Positional with a default value
     *  that needs to be converted to the appropriate type.
     */

    argument_signatures = [
        Sig('foo', { nargs: '?', type: 'int', default: '42' }),
    ]
    failures = ['-x', 'a b', '1 2']
    successes = [
        ['', NS({ foo: 42 })],
        ['1', NS({ foo: 1 })],
    ]
}).run()


;(new class TestPositionalsNargsNoneNone extends ParserTestCase {
    /* Test two Positionals that don't specify nargs */

    argument_signatures = [Sig('foo'), Sig('bar')]
    failures = ['', '-x', 'a', 'a b c']
    successes = [
        ['a b', NS({ foo: 'a', bar: 'b' })],
    ]
}).run()


;(new class TestPositionalsNargsNone1 extends ParserTestCase {
    /* Test a Positional with no nargs followed by one with 1 */

    argument_signatures = [Sig('foo'), Sig('bar', { nargs: 1 })]
    failures = ['', '--foo', 'a', 'a b c']
    successes = [
        ['a b', NS({ foo: 'a', bar: ['b'] })],
    ]
}).run()


;(new class TestPositionalsNargs2None extends ParserTestCase {
    /* Test a Positional with 2 nargs followed by one with none */

    argument_signatures = [Sig('foo', { nargs: 2 }), Sig('bar')]
    failures = ['', '--foo', 'a', 'a b', 'a b c d']
    successes = [
        ['a b c', NS({ foo: ['a', 'b'], bar: 'c' })],
    ]
}).run()


;(new class TestPositionalsNargsNoneZeroOrMore extends ParserTestCase {
    /* Test a Positional with no nargs followed by one with unlimited */

    argument_signatures = [Sig('foo'), Sig('bar', { nargs: '*' })]
    failures = ['', '--foo']
    successes = [
        ['a', NS({ foo: 'a', bar: [] })],
        ['a b', NS({ foo: 'a', bar: ['b'] })],
        ['a b c', NS({ foo: 'a', bar: ['b', 'c'] })],
    ]
}).run()


;(new class TestPositionalsNargsNoneOneOrMore extends ParserTestCase {
    /* Test a Positional with no nargs followed by one with one or more */

    argument_signatures = [Sig('foo'), Sig('bar', { nargs: '+' })]
    failures = ['', '--foo', 'a']
    successes = [
        ['a b', NS({ foo: 'a', bar: ['b'] })],
        ['a b c', NS({ foo: 'a', bar: ['b', 'c'] })],
    ]
}).run()


;(new class TestPositionalsNargsNoneOptional extends ParserTestCase {
    /* Test a Positional with no nargs followed by one with an Optional */

    argument_signatures = [Sig('foo'), Sig('bar', { nargs: '?' })]
    failures = ['', '--foo', 'a b c']
    successes = [
        ['a', NS({ foo: 'a', bar: undefined })],
        ['a b', NS({ foo: 'a', bar: 'b' })],
    ]
}).run()


;(new class TestPositionalsNargsZeroOrMoreNone extends ParserTestCase {
    /* Test a Positional with unlimited nargs followed by one with none */

    argument_signatures = [Sig('foo', { nargs: '*' }), Sig('bar')]
    failures = ['', '--foo']
    successes = [
        ['a', NS({ foo: [], bar: 'a' })],
        ['a b', NS({ foo: ['a'], bar: 'b' })],
        ['a b c', NS({ foo: ['a', 'b'], bar: 'c' })],
    ]
}).run()


;(new class TestPositionalsNargsOneOrMoreNone extends ParserTestCase {
    /* Test a Positional with one or more nargs followed by one with none */

    argument_signatures = [Sig('foo', { nargs: '+' }), Sig('bar')]
    failures = ['', '--foo', 'a']
    successes = [
        ['a b', NS({ foo: ['a'], bar: 'b' })],
        ['a b c', NS({ foo: ['a', 'b'], bar: 'c' })],
    ]
}).run()


;(new class TestPositionalsNargsOptionalNone extends ParserTestCase {
    /* Test a Positional with an Optional nargs followed by one with none */

    argument_signatures = [Sig('foo', { nargs: '?', default: 42 }), Sig('bar')]
    failures = ['', '--foo', 'a b c']
    successes = [
        ['a', NS({ foo: 42, bar: 'a' })],
        ['a b', NS({ foo: 'a', bar: 'b' })],
    ]
}).run()


;(new class TestPositionalsNargs2ZeroOrMore extends ParserTestCase {
    /* Test a Positional with 2 nargs followed by one with unlimited */

    argument_signatures = [Sig('foo', { nargs: 2 }), Sig('bar', { nargs: '*' })]
    failures = ['', '--foo', 'a']
    successes = [
        ['a b', NS({ foo: ['a', 'b'], bar: [] })],
        ['a b c', NS({ foo: ['a', 'b'], bar: ['c'] })],
    ]
}).run()


;(new class TestPositionalsNargs2OneOrMore extends ParserTestCase {
    /* Test a Positional with 2 nargs followed by one with one or more */

    argument_signatures = [Sig('foo', { nargs: 2 }), Sig('bar', { nargs: '+' })]
    failures = ['', '--foo', 'a', 'a b']
    successes = [
        ['a b c', NS({ foo: ['a', 'b'], bar: ['c'] })],
    ]
}).run()


;(new class TestPositionalsNargs2Optional extends ParserTestCase {
    /* Test a Positional with 2 nargs followed by one optional */

    argument_signatures = [Sig('foo', { nargs: 2 }), Sig('bar', { nargs: '?' })]
    failures = ['', '--foo', 'a', 'a b c d']
    successes = [
        ['a b', NS({ foo: ['a', 'b'], bar: undefined })],
        ['a b c', NS({ foo: ['a', 'b'], bar: 'c' })],
    ]
}).run()


;(new class TestPositionalsNargsZeroOrMore1 extends ParserTestCase {
    /* Test a Positional with unlimited nargs followed by one with 1 */

    argument_signatures = [Sig('foo', { nargs: '*' }), Sig('bar', { nargs: 1 })]
    failures = ['', '--foo', ]
    successes = [
        ['a', NS({ foo: [], bar: ['a'] })],
        ['a b', NS({ foo: ['a'], bar: ['b'] })],
        ['a b c', NS({ foo: ['a', 'b'], bar: ['c'] })],
    ]
}).run()


;(new class TestPositionalsNargsOneOrMore1 extends ParserTestCase {
    /* Test a Positional with one or more nargs followed by one with 1 */

    argument_signatures = [Sig('foo', { nargs: '+' }), Sig('bar', { nargs: 1 })]
    failures = ['', '--foo', 'a']
    successes = [
        ['a b', NS({ foo: ['a'], bar: ['b'] })],
        ['a b c', NS({ foo: ['a', 'b'], bar: ['c'] })],
    ]
}).run()


;(new class TestPositionalsNargsOptional1 extends ParserTestCase {
    /* Test a Positional with an Optional nargs followed by one with 1 */

    argument_signatures = [Sig('foo', { nargs: '?' }), Sig('bar', { nargs: 1 })]
    failures = ['', '--foo', 'a b c']
    successes = [
        ['a', NS({ foo: undefined, bar: ['a'] })],
        ['a b', NS({ foo: 'a', bar: ['b'] })],
    ]
}).run()


;(new class TestPositionalsNargsNoneZeroOrMore1 extends ParserTestCase {
    /* Test three Positionals: no nargs, unlimited nargs and 1 nargs */

    argument_signatures = [
        Sig('foo'),
        Sig('bar', { nargs: '*' }),
        Sig('baz', { nargs: 1 }),
    ]
    failures = ['', '--foo', 'a']
    successes = [
        ['a b', NS({ foo: 'a', bar: [], baz: ['b'] })],
        ['a b c', NS({ foo: 'a', bar: ['b'], baz: ['c'] })],
    ]
}).run()


;(new class TestPositionalsNargsNoneOneOrMore1 extends ParserTestCase {
    /* Test three Positionals: no nargs, one or more nargs and 1 nargs */

    argument_signatures = [
        Sig('foo'),
        Sig('bar', { nargs: '+' }),
        Sig('baz', { nargs: 1 }),
    ]
    failures = ['', '--foo', 'a', 'b']
    successes = [
        ['a b c', NS({ foo: 'a', bar: ['b'], baz: ['c'] })],
        ['a b c d', NS({ foo: 'a', bar: ['b', 'c'], baz: ['d'] })],
    ]
}).run()


;(new class TestPositionalsNargsNoneOptional1 extends ParserTestCase {
    /* Test three Positionals: no nargs, optional narg and 1 nargs */

    argument_signatures = [
        Sig('foo'),
        Sig('bar', { nargs: '?', default: 0.625 }),
        Sig('baz', { nargs: 1 }),
    ]
    failures = ['', '--foo', 'a']
    successes = [
        ['a b', NS({ foo: 'a', bar: 0.625, baz: ['b'] })],
        ['a b c', NS({ foo: 'a', bar: 'b', baz: ['c'] })],
    ]
}).run()


;(new class TestPositionalsNargsOptionalOptional extends ParserTestCase {
    /* Test two optional nargs */

    argument_signatures = [
        Sig('foo', { nargs: '?' }),
        Sig('bar', { nargs: '?', default: 42 }),
    ]
    failures = ['--foo', 'a b c']
    successes = [
        ['', NS({ foo: undefined, bar: 42 })],
        ['a', NS({ foo: 'a', bar: 42 })],
        ['a b', NS({ foo: 'a', bar: 'b' })],
    ]
}).run()


;(new class TestPositionalsNargsOptionalZeroOrMore extends ParserTestCase {
    /* Test an Optional narg followed by unlimited nargs */

    argument_signatures = [Sig('foo', { nargs: '?' }), Sig('bar', { nargs: '*' })]
    failures = ['--foo']
    successes = [
        ['', NS({ foo: undefined, bar: [] })],
        ['a', NS({ foo: 'a', bar: [] })],
        ['a b', NS({ foo: 'a', bar: ['b'] })],
        ['a b c', NS({ foo: 'a', bar: ['b', 'c'] })],
    ]
}).run()


;(new class TestPositionalsNargsOptionalOneOrMore extends ParserTestCase {
    /* Test an Optional narg followed by one or more nargs */

    argument_signatures = [Sig('foo', { nargs: '?' }), Sig('bar', { nargs: '+' })]
    failures = ['', '--foo']
    successes = [
        ['a', NS({ foo: undefined, bar: ['a'] })],
        ['a b', NS({ foo: 'a', bar: ['b'] })],
        ['a b c', NS({ foo: 'a', bar: ['b', 'c'] })],
    ]
}).run()


;(new class TestPositionalsChoicesString extends ParserTestCase {
    /* Test a set of single-character choices */

    argument_signatures = [Sig('spam', { choices: new Set('abcdefg') })]
    failures = ['', '--foo', 'h', '42', 'ef']
    successes = [
        ['a', NS({ spam: 'a' })],
        ['g', NS({ spam: 'g' })],
    ]
}).run()


;(new class TestPositionalsChoicesInt extends ParserTestCase {
    /* Test a set of integer choices */

    argument_signatures = [Sig('spam', { type: 'int', choices: Array(20).fill(0).map((x, i) => i) })]
    failures = ['', '--foo', 'h', '42', 'ef']
    successes = [
        ['4', NS({ spam: 4 })],
        ['15', NS({ spam: 15 })],
    ]
}).run()


;(new class TestPositionalsActionAppend extends ParserTestCase {
    /* Test the 'append' action */

    argument_signatures = [
        Sig('spam', { action: 'append' }),
        Sig('spam', { action: 'append', nargs: 2 }),
    ]
    failures = ['', '--foo', 'a', 'a b', 'a b c d']
    successes = [
        ['a b c', NS({ spam: ['a', ['b', 'c']] })],
    ]
}).run()

// ========================================
// Combined optionals and positionals tests
// ========================================

;(new class TestOptionalsNumericAndPositionals extends ParserTestCase {
    /* Tests negative number args when numeric options are present */

    argument_signatures = [
        Sig('x', { nargs: '?' }),
        Sig('-4', { dest: 'y', action: 'store_true' }),
    ]
    failures = ['-2', '-315']
    successes = [
        ['', NS({ x: undefined, y: false })],
        ['a', NS({ x: 'a', y: false })],
        ['-4', NS({ x: undefined, y: true })],
        ['-4 a', NS({ x: 'a', y: true })],
    ]
}).run()


;(new class TestOptionalsAlmostNumericAndPositionals extends ParserTestCase {
    /* Tests negative number args when almost numeric options are present */

    argument_signatures = [
        Sig('x', { nargs: '?' }),
        Sig('-k4', { dest: 'y', action: 'store_true' }),
    ]
    failures = ['-k3']
    successes = [
        ['', NS({ x: undefined, y: false })],
        ['-2', NS({ x: '-2', y: false })],
        ['a', NS({ x: 'a', y: false })],
        ['-k4', NS({ x: undefined, y: true })],
        ['-k4 a', NS({ x: 'a', y: true })],
    ]
}).run()


;(new class TestEmptyAndSpaceContainingArguments extends ParserTestCase {

    argument_signatures = [
        Sig('x', { nargs: '?' }),
        Sig('-y', '--yyy', { dest: 'y' }),
    ]
    failures = ['-y']
    successes = [
        [[''], NS({ x: '', y: undefined })],
        [['a badger'], NS({ x: 'a badger', y: undefined })],
        [['-a badger'], NS({ x: '-a badger', y: undefined })],
        [['-y', ''], NS({ x: undefined, y: '' })],
        [['-y', 'a badger'], NS({ x: undefined, y: 'a badger' })],
        [['-y', '-a badger'], NS({ x: undefined, y: '-a badger' })],
        [['--yyy=a badger'], NS({ x: undefined, y: 'a badger' })],
        [['--yyy=-a badger'], NS({ x: undefined, y: '-a badger' })],
    ]
}).run()


;(new class TestPrefixCharacterOnlyArguments extends ParserTestCase {

    parser_signature = Sig({ prefix_chars: '-+' })
    argument_signatures = [
        Sig('-', { dest: 'x', nargs: '?', const: 'badger' }),
        Sig('+', { dest: 'y', type: 'int', default: 42 }),
        Sig('-+-', { dest: 'z', action: 'store_true' }),
    ]
    failures = ['-y', '+ -']
    successes = [
        ['', NS({ x: undefined, y: 42, z: false })],
        ['-', NS({ x: 'badger', y: 42, z: false })],
        ['- X', NS({ x: 'X', y: 42, z: false })],
        ['+ -3', NS({ x: undefined, y: -3, z: false })],
        ['-+-', NS({ x: undefined, y: 42, z: true })],
        ['- ===', NS({ x: '===', y: 42, z: false })],
    ]
}).run()


;(new class TestNargsZeroOrMore extends ParserTestCase {
    /* Tests specifying args for an Optional that accepts zero or more */

    argument_signatures = [Sig('-x', { nargs: '*' }), Sig('y', { nargs: '*' })]
    failures = []
    successes = [
        ['', NS({ x: undefined, y: [] })],
        ['-x', NS({ x: [], y: [] })],
        ['-x a', NS({ x: ['a'], y: [] })],
        ['-x a -- b', NS({ x: ['a'], y: ['b'] })],
        ['a', NS({ x: undefined, y: ['a'] })],
        ['a -x', NS({ x: [], y: ['a'] })],
        ['a -x b', NS({ x: ['b'], y: ['a'] })],
    ]
}).run()


;(new class TestNargsRemainder extends ParserTestCase {
    /* Tests specifying a positional with nargs=REMAINDER */

    argument_signatures = [Sig('x'), Sig('y', { nargs: '...' }), Sig('-z')]
    failures = ['', '-z', '-z Z']
    successes = [
        ['X', NS({ x: 'X', y: [], z: undefined })],
        ['-z Z X', NS({ x: 'X', y: [], z: 'Z' })],
        ['X A B -z Z', NS({ x: 'X', y: ['A', 'B', '-z', 'Z'], z: undefined })],
        ['X Y --foo', NS({ x: 'X', y: ['Y', '--foo'], z: undefined })],
    ]
}).run()


;(new class TestOptionLike extends ParserTestCase {
    /* Tests options that may or may not be arguments */

    argument_signatures = [
        Sig('-x', { type: 'float' }),
        Sig('-3', { type: 'float', dest: 'y' }),
        Sig('z', { nargs: '*' }),
    ]
    failures = ['-x', '-y2.5', '-xa', '-x -a',
                '-x -3', '-x -3.5', '-3 -3.5',
                '-x -2.5', '-x -2.5 a', '-3 -.5',
                'a x -1', '-x -1 a', '-3 -1 a']
    successes = [
        ['', NS({ x: undefined, y: undefined, z: [] })],
        ['-x 2.5', NS({ x: 2.5, y: undefined, z: [] })],
        ['-x 2.5 a', NS({ x: 2.5, y: undefined, z: ['a'] })],
        ['-3.5', NS({ x: undefined, y: 0.5, z: [] })],
        ['-3-.5', NS({ x: undefined, y: -0.5, z: [] })],
        ['-3 .5', NS({ x: undefined, y: 0.5, z: [] })],
        ['a -3.5', NS({ x: undefined, y: 0.5, z: ['a'] })],
        ['a', NS({ x: undefined, y: undefined, z: ['a'] })],
        ['a -x 1', NS({ x: 1.0, y: undefined, z: ['a'] })],
        ['-x 1 a', NS({ x: 1.0, y: undefined, z: ['a'] })],
        ['-3 1 a', NS({ x: undefined, y: 1.0, z: ['a'] })],
    ]
}).run()


;(new class TestDefaultSuppress extends ParserTestCase {
    /* Test actions with suppressed defaults */

    argument_signatures = [
        Sig('foo', { nargs: '?', default: argparse.SUPPRESS }),
        Sig('bar', { nargs: '*', default: argparse.SUPPRESS }),
        Sig('--baz', { action: 'store_true', default: argparse.SUPPRESS }),
    ]
    failures = ['-x']
    successes = [
        ['', NS({})],
        ['a', NS({ foo: 'a' })],
        ['a b', NS({ foo: 'a', bar: ['b'] })],
        ['--baz', NS({ baz: true })],
        ['a --baz', NS({ foo: 'a', baz: true })],
        ['--baz a b', NS({ foo: 'a', bar: ['b'], baz: true })],
    ]
}).run()


;(new class TestParserDefaultSuppress extends ParserTestCase {
    /* Test actions with a parser-level default of SUPPRESS */

    parser_signature = Sig({ argument_default: argparse.SUPPRESS })
    argument_signatures = [
        Sig('foo', { nargs: '?' }),
        Sig('bar', { nargs: '*' }),
        Sig('--baz', { action: 'store_true' }),
    ]
    failures = ['-x']
    successes = [
        ['', NS({})],
        ['a', NS({ foo: 'a' })],
        ['a b', NS({ foo: 'a', bar: ['b'] })],
        ['--baz', NS({ baz: true })],
        ['a --baz', NS({ foo: 'a', baz: true })],
        ['--baz a b', NS({ foo: 'a', bar: ['b'], baz: true })],
    ]
}).run()


;(new class TestParserDefault42 extends ParserTestCase {
    /* Test actions with a parser-level default of 42 */

    parser_signature = Sig({ argument_default: 42 })
    argument_signatures = [
        Sig('--version', { action: 'version', version: '1.0' }),
        Sig('foo', { nargs: '?' }),
        Sig('bar', { nargs: '*' }),
        Sig('--baz', { action: 'store_true' }),
    ]
    failures = ['-x']
    successes = [
        ['', NS({ foo: 42, bar: 42, baz: 42, version: 42 })],
        ['a', NS({ foo: 'a', bar: 42, baz: 42, version: 42 })],
        ['a b', NS({ foo: 'a', bar: ['b'], baz: 42, version: 42 })],
        ['--baz', NS({ foo: 42, bar: 42, baz: true, version: 42 })],
        ['a --baz', NS({ foo: 'a', bar: 42, baz: true, version: 42 })],
        ['--baz a b', NS({ foo: 'a', bar: ['b'], baz: true, version: 42 })],
    ]
}).run()


let TempDirMixin_ParserTestCase = TempDirMixin(ParserTestCase)

;(new class TestArgumentsFromFile extends TempDirMixin_ParserTestCase {
    /* Test reading arguments from a file */

    setUp() {
        super.setUp()
        let file_texts = [
            ['hello', 'hello world!\n'],
            ['recursive', '-a\n' +
                          'A\n' +
                          '@hello'],
            ['invalid', '@no-such-path\n'],
        ]
        for (let [ path, text ] of file_texts) {
            fs.writeFileSync(path, text)
        }
    }

    parser_signature = Sig({ fromfile_prefix_chars: '@' })
    argument_signatures = [
        Sig('-a'),
        Sig('x'),
        Sig('y', { nargs: '+' }),
    ]
    failures = ['', '-b', 'X', '@invalid', '@missing']
    successes = [
        ['X Y', NS({ a: undefined, x: 'X', y: ['Y'] })],
        ['X -a A Y Z', NS({ a: 'A', x: 'X', y: ['Y', 'Z'] })],
        ['@hello X', NS({ a: undefined, x: 'hello world!', y: ['X'] })],
        ['X @hello', NS({ a: undefined, x: 'X', y: ['hello world!'] })],
        ['-a B @recursive Y Z', NS({ a: 'A', x: 'hello world!', y: ['Y', 'Z'] })],
        ['X @recursive Z -a B', NS({ a: 'B', x: 'X', y: ['hello world!', 'Z'] })],
        [["-a", "", "X", "Y"], NS({ a: '', x: 'X', y: ['Y'] })],
    ]
}).run()


;(new class TestArgumentsFromFileConverter extends TempDirMixin_ParserTestCase {
    /* Test reading arguments from a file */

    setUp() {
        super.setUp()
        let file_texts = [
            ['hello', 'hello world!\n'],
        ]
        for (let [ path, text ] of file_texts) {
            fs.writeFileSync(path, text)
        }
    }

    FromFileConverterArgumentParser = class FromFileConverterArgumentParser extends ErrorRaisingArgumentParser {

        * convert_arg_line_to_args(arg_line) {
            for (let arg of arg_line.split(/\s+/).filter(Boolean)) {
                if (!arg.trim()) {
                    continue
                }
                yield arg
            }
        }
    }

    parser_class = this.FromFileConverterArgumentParser
    parser_signature = Sig({ fromfile_prefix_chars: '@' })
    argument_signatures = [
        Sig('y', { nargs: '+' }),
    ]
    failures = []
    successes = [
        ['@hello X', NS({ y: ['hello', 'world!', 'X'] })],
    ]
}).run()


// =====================
// Type conversion tests
// =====================

;(new class TestFileTypeRepr extends TestCase {

    test_r() {
        let type = argparse.FileType('r')
        this.assertEqual("FileType('r')", sub('%r', type))
    }

    test_r_utf8() {
        let type = argparse.FileType('r', { encoding: 'utf8' })
        this.assertEqual("FileType('r', encoding='utf8')", sub('%r', type))
    }

    test_w_utf8_0o400() {
        let type = argparse.FileType('w', { encoding: 'utf8', mode: 0o400 })
        this.assertEqual("FileType('w', encoding='utf8', mode=0o400)",
                         sub('%r', type))
    }

    test_w_utf8_close() {
        let type = argparse.FileType('w', { encoding: 'utf8', emitClose: true })
        this.assertEqual("FileType('w', encoding='utf8', emitClose=true)",
                         sub('%r', type))
    }
}).run()


class StdStreamComparer {
    constructor(attr) {
        this.attr = attr
    }
}

let eq_stdin = new StdStreamComparer('stdin')
let eq_stdout = new StdStreamComparer('stdout')
let eq_stderr = new StdStreamComparer('stderr')


class FileTypeTestCase extends ParserTestCase {
    _normalize_ns(ns) {
        for (let key of Object.keys(ns)) {
            if (ns[key] === process.stdout) {
                ns[key] = eq_stdout
            } else if (ns[key] === process.stderr) {
                ns[key] = eq_stderr
            } else if (ns[key] === process.stdin) {
                ns[key] = eq_stdin
            } else if (ns[key] instanceof stream.Readable && ns[key].fd) {
                let fd = ns[key].fd
                ns[key] = new RFile(fs.readFileSync(fd, 'utf8'))
                fs.closeSync(fd)
            } else if (ns[key] instanceof stream.Writable && ns[key].fd) {
                let fd = ns[key].fd
                ns[key] = new WFile()
                fs.closeSync(fd)
            }
        }
        return ns
    }
}

let TempDirMixin_FileTypeTestCase = TempDirMixin(FileTypeTestCase)

class RFile {
    constructor(name) {
        this.name = name
    }
}


;(new class TestFileTypeR extends TempDirMixin_FileTypeTestCase {
    /* Test the FileType option/argument type for reading files */

    setUp() {
        super.setUp()
        for (let file_name of ['foo', 'bar']) {
            fs.writeFileSync(path.join(this.temp_dir, file_name), file_name)
        }
        this.create_readonly_file('readonly')
    }

    argument_signatures = [
        Sig('-x', { type: argparse.FileType() }),
        Sig('spam', { type: argparse.FileType('r') }),
    ]
    failures = ['-x', '', 'non-existent-file.txt']
    successes = [
        ['foo', NS({ x: undefined, spam: new RFile('foo') })],
        ['-x foo bar', NS({ x: new RFile('foo'), spam: new RFile('bar') })],
        ['bar -x foo', NS({ x: new RFile('foo'), spam: new RFile('bar') })],
        ['-x - -', NS({ x: eq_stdin, spam: eq_stdin })],
        ['readonly', NS({ x: undefined, spam: new RFile('readonly') })],
    ]
}).run()

;(new class TestFileTypeDefaults extends TempDirMixin_FileTypeTestCase {
    /* Test that a file is not created unless the default is needed */
    setUp() {
        super.setUp()
        let file = fs.openSync(path.join(this.temp_dir, 'good'), 'w')
        fs.writeSync(file, 'good')
        fs.closeSync(file)
    }

    argument_signatures = [
        Sig('-c', { type: argparse.FileType('r'), default: 'no-file.txt' }),
    ]
    // should provoke no such file error
    failures = ['']
    // should not provoke error because default file is created
    successes = [['-c good', NS({ c: new RFile('good') })]]
}).run()


class WFile {
    constructor() {
    }
}


;(new class TestFileTypeW extends TempDirMixin_FileTypeTestCase {
    /* Test the FileType option/argument type for writing files */

    setUp() {
        super.setUp()
        this.create_readonly_file('readonly')
    }

    argument_signatures = [
        Sig('-x', { type: argparse.FileType('w') }),
        Sig('spam', { type: argparse.FileType('w') }),
    ]
    failures = ['-x', '', 'readonly']
    successes = [
        ['foo', NS({ x: undefined, spam: new WFile('foo') })],
        ['-x foo bar', NS({ x: new WFile('foo'), spam: new WFile('bar') })],
        ['bar -x foo', NS({ x: new WFile('foo'), spam: new WFile('bar') })],
        ['-x - -', NS({ x: eq_stdout, spam: eq_stdout })],
    ]
}).run()


;(new class TestFileTypeMissingInitialization extends TestCase {
    /*
     *  Test that add_argument throws an error if FileType class
     *  object was passed instead of instance of FileType
     */

    test() {
        let parser = argparse.ArgumentParser()
        let cm = this.assertRaises(TypeError, () =>
            parser.add_argument('-x', { type: argparse.FileType }))

        this.assertEqual(sub(
            '%r is a FileType class object, instance of it must be passed',
            argparse.FileType),
            cm.exception.message
        )
    }
}).run()


;(new class TestTypeCallable extends ParserTestCase {
    /* Test some callables as option/argument types */

    argument_signatures = [
        Sig('--eggs', { type: 'float' }),
        Sig('spam', { type: 'float' }),
    ]
    failures = ['a', '42j', '--eggs a', '--eggs 2i']
    successes = [
        ['--eggs=42 42', NS({ eggs: 42, spam: 42.0 })],
        ['--eggs 2 -- -1.5', NS({ eggs: 2, spam: -1.5 })],
        ['1024.675', NS({ eggs: undefined, spam: 1024.675 })],
    ]
}).run()


;(new class TestTypeUserDefined extends ParserTestCase {
    /* Test a user-defined option/argument type */

    MyType = class MyType extends TestCase {
        constructor(value) {
            super()
            this.value = value
        }
    }

    argument_signatures = [
        Sig('-x', { type: this.MyType }),
        Sig('spam', { type: this.MyType }),
    ]
    failures = []
    successes = [
        ['a -x b', NS({ x: new this.MyType('b'), spam: new this.MyType('a') })],
        ['-xf g', NS({ x: new this.MyType('f'), spam: new this.MyType('g') })],
    ]
}).run()


;(new class TestTypeClassicClass extends ParserTestCase {
    /* Test a classic class type */

    C = class C {
        constructor(value) {
            this.value = value
        }
    }

    argument_signatures = [
        Sig('-x', { type: this.C }),
        Sig('spam', { type: this.C }),
    ]
    failures = []
    successes = [
        ['a -x b', NS({ x: new this.C('b'), spam: new this.C('a') })],
        ['-xf g', NS({ x: new this.C('f'), spam: new this.C('g') })],
    ]
}).run()


;(new class TestTypeRegistration extends TestCase {
    /* Test a user-defined type by registering it */

    test() {

        let get_my_type = string =>
            sub('my_type{%s}', string)

        let parser = argparse.ArgumentParser()
        parser.register('type', 'my_type', get_my_type)
        parser.add_argument('-x', { type: 'my_type' })
        parser.add_argument('y', { type: 'my_type' })

        this.assertEqual(parser.parse_args('1'.split(' ')),
                         NS({ x: undefined, y: 'my_type{1}' }))
        this.assertEqual(parser.parse_args('-x 1 42'.split(' ')),
                         NS({ x: 'my_type{1}', y: 'my_type{42}' }))
    }
}).run()


// ============
// Action tests
// ============

;(new class TestActionUserDefined extends ParserTestCase {
    /* Test a user-defined option/argument action */

    OptionalAction = class OptionalAction extends argparse.Action {

        call(parser, namespace, value, option_string = undefined) {
            try {
                // check destination and option string
                assert(this.dest === 'spam', sub('dest: %s', this.dest))
                assert(option_string === '-s', sub('flag: %s', option_string))
                // when option is before argument, badger=2, and when
                // option is after argument, badger=<whatever was set>
                let expected_ns = NS({ spam: 0.25 })
                if ([0.125, 0.625].includes(value)) {
                    expected_ns.badger = 2
                } else if ([2.0].includes(value)) {
                    expected_ns.badger = 84
                } else {
                    throw new assert.AssertionError(sub('value: %s', value))
                }
                assert(
                    JSON.stringify(expected_ns, Object.keys(expected_ns).sort()) ===
                        JSON.stringify(namespace, Object.keys(namespace).sort()),
                    sub('expected %s, got %s', expected_ns, namespace))
            } catch (err) {
                let e = err.message
                throw new ArgumentParserError(sub('opt_action failed: %s', e))
            }
            namespace.spam = value
        }
    }

    PositionalAction = class PositionalAction extends argparse.Action {

        call(parser, namespace, value, option_string = undefined) {
            try {
                assert(option_string === undefined, sub('option_string: %s',
                                                        option_string))
                // check destination
                assert(this.dest === 'badger', sub('dest: %s', this.dest))
                // when argument is before option, spam=0.25, and when
                // option is after argument, spam=<whatever was set>
                let expected_ns = NS({ badger: 2 })
                if ([42, 84].includes(value)) {
                    expected_ns.spam = 0.25
                } else if ([1].includes(value)) {
                    expected_ns.spam = 0.625
                } else if ([2].includes(value)) {
                    expected_ns.spam = 0.125
                } else {
                    throw new assert.AssertionError(sub('value: %s', value))
                }
                assert(
                    JSON.stringify(expected_ns, Object.keys(expected_ns).sort()) ===
                        JSON.stringify(namespace, Object.keys(namespace).sort()),
                    sub('expected %s, got %s', expected_ns, namespace))
            } catch (err) {
                let e = err.message
                throw new ArgumentParserError(sub('arg_action failed: %s', e))
            }
            namespace.badger = value
        }
    }

    argument_signatures = [
        Sig('-s', { dest: 'spam', action: this.OptionalAction,
            type: 'float', default: 0.25 }),
        Sig('badger', { action: this.PositionalAction,
            type: 'int', nargs: '?', default: 2 }),
    ]
    failures = []
    successes = [
        ['-s0.125', NS({ spam: 0.125, badger: 2 })],
        ['42', NS({ spam: 0.25, badger: 42 })],
        ['-s 0.625 1', NS({ spam: 0.625, badger: 1 })],
        ['84 -s2', NS({ spam: 2.0, badger: 84 })],
    ]
}).run()


;(new class TestActionRegistration extends TestCase {
    /* Test a user-defined action supplied by registering it */

    MyAction = class MyAction extends argparse.Action {

        call(parser, namespace, values/*, option_string = undefined*/) {
            namespace[this.dest] = sub('foo[%s]', values)
        }
    }

    test() {

        let parser = argparse.ArgumentParser()
        parser.register('action', 'my_action', this.MyAction)
        parser.add_argument('badger', { action: 'my_action' })

        this.assertEqual(parser.parse_args(['1']), NS({ badger: 'foo[1]' }))
        this.assertEqual(parser.parse_args(['42']), NS({ badger: 'foo[42]' }))
    }
}).run()


;(new class TestActionExtend extends ParserTestCase {
    argument_signatures = [
        Sig('--foo', { action: "extend", nargs: "+", type: "str" }),
    ]
    failures = []
    successes = [
        ['--foo f1 --foo f2 f3 f4', NS({ foo: ['f1', 'f2', 'f3', 'f4'] })],
    ]
}).run()

// ================
// Subparsers tests
// ================

;(new class TestAddSubparsers extends TestCase {
    /* Test the add_subparsers method */

    assertArgumentParserError(...args) {
        this.assertRaises(ArgumentParserError, ...args)
    }

    _get_parser({ subparser_help = false, prefix_chars = undefined, aliases = false } = {}) {
        // create a parser with a subparsers argument
        let parser

        if (prefix_chars) {
            parser = new ErrorRaisingArgumentParser({
                prog: 'PROG', description: 'main description', prefix_chars })
            parser.add_argument(
                prefix_chars[0].repeat(2) + 'foo', { action: 'store_true', help: 'foo help' })
        } else {
            parser = new ErrorRaisingArgumentParser({
                prog: 'PROG', description: 'main description' })
            parser.add_argument(
                '--foo', { action: 'store_true', help: 'foo help' })
        }
        parser.add_argument(
            'bar', { type: 'float', help: 'bar help' })

        // check that only one subparsers argument can be added
        let subparsers_kwargs = {required: false}
        if (aliases) {
            subparsers_kwargs.metavar = 'COMMAND'
            subparsers_kwargs.title = 'commands'
        } else {
            subparsers_kwargs.help = 'command help'
        }
        let subparsers = parser.add_subparsers(subparsers_kwargs)
        this.assertArgumentParserError(() => parser.add_subparsers())

        // add first sub-parser
        let parser1_kwargs = { description: '1 description' }
        if (subparser_help) {
            parser1_kwargs.help = '1 help'
        }
        if (aliases) {
            parser1_kwargs.aliases = ['1alias1', '1alias2']
        }
        let parser1 = subparsers.add_parser('1', parser1_kwargs)
        parser1.add_argument('-w', { type: 'int', help: 'w help' })
        parser1.add_argument('x', { choices: 'abc', help: 'x help' })

        // add second sub-parser
        let parser2_kwargs = { description: '2 description' }
        if (subparser_help) {
            parser2_kwargs.help = '2 help'
        }
        let parser2 = subparsers.add_parser('2', parser2_kwargs)
        parser2.add_argument('-y', { choices: '123', help: 'y help' })
        parser2.add_argument('z', { type: 'str', nargs: '*', help: 'z help' })

        // add third sub-parser
        let parser3_kwargs = { description: '3 description' }
        if (subparser_help) {
            parser3_kwargs.help = '3 help'
        }
        let parser3 = subparsers.add_parser('3', parser3_kwargs)
        parser3.add_argument('t', { type: 'int', help: 't help' })
        parser3.add_argument('u', { nargs: '...', help: 'u help' })

        // return the main parser
        return parser
    }

    setUp() {
        super.setUp()
        this.parser = this._get_parser()
        this.command_help_parser = this._get_parser({ subparser_help: true })
    }

    test_parse_args_failures() {
        // check some failure cases:
        for (let args_str of ['', 'a', 'a a', '0.5 a', '0.5 1',
                              '0.5 1 -y', '0.5 2 -w']) {
            let args = args_str.split(/\s+/).filter(Boolean)
            this.assertArgumentParserError(() => this.parser.parse_args(args))
        }
    }

    test_parse_args() {
        // check some non-failure cases:
        this.assertEqual(
            this.parser.parse_args('0.5 1 b -w 7'.split(' ')),
            NS({ foo: false, bar: 0.5, w: 7, x: 'b' }),
        )
        this.assertEqual(
            this.parser.parse_args('0.25 --foo 2 -y 2 3j -- -1j'.split(' ')),
            NS({ foo: true, bar: 0.25, y: '2', z: ['3j', '-1j'] }),
        )
        this.assertEqual(
            this.parser.parse_args('--foo 0.125 1 c'.split(' ')),
            NS({ foo: true, bar: 0.125, w: undefined, x: 'c' }),
        )
        this.assertEqual(
            this.parser.parse_args('-1.5 3 11 -- a --foo 7 -- b'.split(' ')),
            NS({ foo: false, bar: -1.5, t: 11, u: ['a', '--foo', '7', '--', 'b'] }),
        )
    }

    test_parse_known_args() {
        this.assertEqual(
            this.parser.parse_known_args('0.5 1 b -w 7'.split(' ')),
            [NS({ foo: false, bar: 0.5, w: 7, x: 'b' }), []],
        )
        this.assertEqual(
            this.parser.parse_known_args('0.5 -p 1 b -w 7'.split(' ')),
            [NS({ foo: false, bar: 0.5, w: 7, x: 'b' }), ['-p']],
        )
        this.assertEqual(
            this.parser.parse_known_args('0.5 1 b -w 7 -p'.split(' ')),
            [NS({ foo: false, bar: 0.5, w: 7, x: 'b' }), ['-p']],
        )
        this.assertEqual(
            this.parser.parse_known_args('0.5 1 b -q -rs -w 7'.split(' ')),
            [NS({ foo: false, bar: 0.5, w: 7, x: 'b' }), ['-q', '-rs']],
        )
        this.assertEqual(
            this.parser.parse_known_args('0.5 -W 1 b -X Y -w 7 Z'.split(' ')),
            [NS({ foo: false, bar: 0.5, w: 7, x: 'b' }), ['-W', '-X', 'Y', 'Z']],
        )
    }

    test_dest() {
        let parser = new ErrorRaisingArgumentParser()
        parser.add_argument('--foo', { action: 'store_true' })
        let subparsers = parser.add_subparsers({ dest: 'bar' })
        let parser1 = subparsers.add_parser('1')
        parser1.add_argument('baz')
        this.assertEqual(NS({ foo: false, bar: '1', baz: '2' }),
                         parser.parse_args('1 2'.split(' ')))
    }

    _test_required_subparsers(parser) {
        // Should parse the sub command
        let ret = parser.parse_args(['run'])
        this.assertEqual(ret.command, 'run')

        // Error when the command is missing
        this.assertArgumentParserError(() => parser.parse_args([]))
    }

    test_required_subparsers_via_attribute() {
        let parser = new ErrorRaisingArgumentParser()
        let subparsers = parser.add_subparsers({ dest: 'command' })
        subparsers.required = true
        subparsers.add_parser('run')
        this._test_required_subparsers(parser)
    }

    test_required_subparsers_via_kwarg() {
        let parser = new ErrorRaisingArgumentParser()
        let subparsers = parser.add_subparsers({ dest: 'command', required: true })
        subparsers.add_parser('run')
        this._test_required_subparsers(parser)
    }

    test_required_subparsers_default() {
        let parser = new ErrorRaisingArgumentParser()
        let subparsers = parser.add_subparsers({ dest: 'command' })
        subparsers.add_parser('run')
        // No error here
        let ret = parser.parse_args([])
        this.assertIsNone(ret.command)
    }

    test_optional_subparsers() {
        let parser = new ErrorRaisingArgumentParser()
        let subparsers = parser.add_subparsers({ dest: 'command', required: false })
        subparsers.add_parser('run')
        // No error here
        let ret = parser.parse_args([])
        this.assertIsNone(ret.command)
    }

    test_help() {
        this.assertEqual(this.parser.format_usage(),
                         'usage: PROG [-h] [--foo] bar {1,2,3} ...\n')
        this.assertEqual(this.parser.format_help(), textwrap.dedent(`\
            usage: PROG [-h] [--foo] bar {1,2,3} ...

            main description

            positional arguments:
              bar         bar help
              {1,2,3}     command help

            optional arguments:
              -h, --help  show this help message and exit
              --foo       foo help
            `))
    }

    test_help_extra_prefix_chars() {
        // Make sure - is still used for help if it is a non-first prefix char
        let parser = this._get_parser({ prefix_chars: '+:-' })
        this.assertEqual(parser.format_usage(),
                         'usage: PROG [-h] [++foo] bar {1,2,3} ...\n')
        this.assertEqual(parser.format_help(), textwrap.dedent(`\
            usage: PROG [-h] [++foo] bar {1,2,3} ...

            main description

            positional arguments:
              bar         bar help
              {1,2,3}     command help

            optional arguments:
              -h, --help  show this help message and exit
              ++foo       foo help
            `))
    }

    test_help_non_breaking_spaces() {
        let parser = new ErrorRaisingArgumentParser({
            prog: 'PROG', description: 'main description' })
        parser.add_argument(
            "--non-breaking", { action: 'store_false',
            help: 'help message containing non-breaking spaces shall not ' +
            'wrap\xA0at non-breaking spaces' })
        this.assertEqual(parser.format_help(), textwrap.dedent(`\
            usage: PROG [-h] [--non-breaking]

            main description

            optional arguments:
              -h, --help      show this help message and exit
              --non-breaking  help message containing non-breaking spaces shall not
                              wrap\xA0at non-breaking spaces
        `))
    }

    test_help_alternate_prefix_chars() {
        let parser = this._get_parser({ prefix_chars: '+:/' })
        this.assertEqual(parser.format_usage(),
                         'usage: PROG [+h] [++foo] bar {1,2,3} ...\n')
        this.assertEqual(parser.format_help(), textwrap.dedent(`\
            usage: PROG [+h] [++foo] bar {1,2,3} ...

            main description

            positional arguments:
              bar         bar help
              {1,2,3}     command help

            optional arguments:
              +h, ++help  show this help message and exit
              ++foo       foo help
            `))
    }

    test_parser_command_help() {
        this.assertEqual(this.command_help_parser.format_usage(),
                         'usage: PROG [-h] [--foo] bar {1,2,3} ...\n')
        this.assertEqual(this.command_help_parser.format_help(),
                         textwrap.dedent(`\
            usage: PROG [-h] [--foo] bar {1,2,3} ...

            main description

            positional arguments:
              bar         bar help
              {1,2,3}     command help
                1         1 help
                2         2 help
                3         3 help

            optional arguments:
              -h, --help  show this help message and exit
              --foo       foo help
            `))
    }

    test_subparser_title_help() {
        let parser = new ErrorRaisingArgumentParser({ prog: 'PROG',
                                                      description: 'main description' })
        parser.add_argument('--foo', { action: 'store_true', help: 'foo help' })
        parser.add_argument('bar', { help: 'bar help' })
        let subparsers = parser.add_subparsers({ title: 'subcommands',
                                                 description: 'command help',
                                                 help: 'additional text' })
        subparsers.add_parser('1')
        subparsers.add_parser('2')
        this.assertEqual(parser.format_usage(),
                         'usage: PROG [-h] [--foo] bar {1,2} ...\n')
        this.assertEqual(parser.format_help(), textwrap.dedent(`\
            usage: PROG [-h] [--foo] bar {1,2} ...

            main description

            positional arguments:
              bar         bar help

            optional arguments:
              -h, --help  show this help message and exit
              --foo       foo help

            subcommands:
              command help

              {1,2}       additional text
            `))
    }

    _test_subparser_help(args_str, expected_help) {
        let cm = this.assertRaises(ArgumentParserError, () =>
            this.parser.parse_args(args_str.split(/\s+/).filter(Boolean)))
        this.assertEqual(expected_help, cm.exception.stdout)
    }

    test_subparser1_help() {
        this._test_subparser_help('5.0 1 -h', textwrap.dedent(`\
            usage: PROG bar 1 [-h] [-w W] {a,b,c}

            1 description

            positional arguments:
              {a,b,c}     x help

            optional arguments:
              -h, --help  show this help message and exit
              -w W        w help
            `))
    }

    test_subparser2_help() {
        this._test_subparser_help('5.0 2 -h', textwrap.dedent(`\
            usage: PROG bar 2 [-h] [-y {1,2,3}] [z ...]

            2 description

            positional arguments:
              z           z help

            optional arguments:
              -h, --help  show this help message and exit
              -y {1,2,3}  y help
            `))
    }

    test_alias_invocation() {
        let parser = this._get_parser({ aliases: true })
        this.assertEqual(
            parser.parse_known_args('0.5 1alias1 b'.split(' ')),
            [NS({ foo: false, bar: 0.5, w: undefined, x: 'b' }), []],
        )
        this.assertEqual(
            parser.parse_known_args('0.5 1alias2 b'.split(' ')),
            [NS({ foo: false, bar: 0.5, w: undefined, x: 'b' }), []],
        )
    }

    test_error_alias_invocation() {
        let parser = this._get_parser({ aliases: true })
        this.assertArgumentParserError(() => parser.parse_args(
                                       '0.5 1alias3 b'.split(' ')))
    }

    test_alias_help() {
        let parser = this._get_parser({ aliases: true, subparser_help: true })
        this.maxDiff = undefined
        this.assertEqual(parser.format_help(), textwrap.dedent(`\
            usage: PROG [-h] [--foo] bar COMMAND ...

            main description

            positional arguments:
              bar                   bar help

            optional arguments:
              -h, --help            show this help message and exit
              --foo                 foo help

            commands:
              COMMAND
                1 (1alias1, 1alias2)
                                    1 help
                2                   2 help
                3                   3 help
            `))
    }
}).run()

// ============
// Groups tests
// ============

;(new class TestPositionalsGroups extends TestCase {
    /* Tests that order of group positionals matches construction order */

    test_nongroup_first() {
        let parser = new ErrorRaisingArgumentParser()
        parser.add_argument('foo')
        let group = parser.add_argument_group('g')
        group.add_argument('bar')
        parser.add_argument('baz')
        let expected = NS({ foo: '1', bar: '2', baz: '3' })
        let result = parser.parse_args('1 2 3'.split(' '))
        this.assertEqual(expected, result)
    }

    test_group_first() {
        let parser = new ErrorRaisingArgumentParser()
        let group = parser.add_argument_group('xxx')
        group.add_argument('foo')
        parser.add_argument('bar')
        parser.add_argument('baz')
        let expected = NS({ foo: '1', bar: '2', baz: '3' })
        let result = parser.parse_args('1 2 3'.split(' '))
        this.assertEqual(expected, result)
    }

    test_interleaved_groups() {
        let parser = new ErrorRaisingArgumentParser()
        let group = parser.add_argument_group('xxx')
        parser.add_argument('foo')
        group.add_argument('bar')
        parser.add_argument('baz')
        group = parser.add_argument_group('yyy')
        group.add_argument('frell')
        let expected = NS({ foo: '1', bar: '2', baz: '3', frell: '4' })
        let result = parser.parse_args('1 2 3 4'.split(' '))
        this.assertEqual(expected, result)
    }
}).run()

// ===================
// Parent parser tests
// ===================

;(new class TestParentParsers extends TestCase {
    /* Tests that parsers can be created with parent parsers */

    assertArgumentParserError(...args) {
        this.assertRaises(ArgumentParserError, ...args)
    }

    setUp() {
        super.setUp()
        this.wxyz_parent = new ErrorRaisingArgumentParser({ add_help: false })
        this.wxyz_parent.add_argument('--w')
        let x_group = this.wxyz_parent.add_argument_group('x')
        x_group.add_argument('-y')
        this.wxyz_parent.add_argument('z')

        this.abcd_parent = new ErrorRaisingArgumentParser({ add_help: false })
        this.abcd_parent.add_argument('a')
        this.abcd_parent.add_argument('-b')
        let c_group = this.abcd_parent.add_argument_group('c')
        c_group.add_argument('--d')

        this.w_parent = new ErrorRaisingArgumentParser({ add_help: false })
        this.w_parent.add_argument('--w')

        this.z_parent = new ErrorRaisingArgumentParser({ add_help: false })
        this.z_parent.add_argument('z')

        // parents with mutually exclusive groups
        this.ab_mutex_parent = new ErrorRaisingArgumentParser({ add_help: false })
        let group = this.ab_mutex_parent.add_mutually_exclusive_group()
        group.add_argument('-a', { action: 'store_true' })
        group.add_argument('-b', { action: 'store_true' })

        this.main_program = path.basename(process.argv[1])
    }

    test_single_parent() {
        let parser = new ErrorRaisingArgumentParser({ parents: [this.wxyz_parent] })
        this.assertEqual(parser.parse_args('-y 1 2 --w 3'.split(' ')),
                         NS({ w: '3', y: '1', z: '2' }))
    }

    test_single_parent_mutex() {
        this._test_mutex_ab(args => this.ab_mutex_parent.parse_args(args))
        let parser = new ErrorRaisingArgumentParser({ parents: [this.ab_mutex_parent] })
        this._test_mutex_ab(args => parser.parse_args(args))
    }

    test_single_granparent_mutex() {
        let parents = [this.ab_mutex_parent]
        let parser = new ErrorRaisingArgumentParser({ add_help: false, parents })
        parser = new ErrorRaisingArgumentParser({ parents: [parser] })
        this._test_mutex_ab(args => parser.parse_args(args))
    }

    _test_mutex_ab(parse_args) {
        this.assertEqual(parse_args([]), NS({ a: false, b: false }))
        this.assertEqual(parse_args(['-a']), NS({ a: true, b: false }))
        this.assertEqual(parse_args(['-b']), NS({ a: false, b: true }))
        this.assertArgumentParserError(() => parse_args(['-a', '-b']))
        this.assertArgumentParserError(() => parse_args(['-b', '-a']))
        this.assertArgumentParserError(() => parse_args(['-c']))
        this.assertArgumentParserError(() => parse_args(['-a', '-c']))
        this.assertArgumentParserError(() => parse_args(['-b', '-c']))
    }

    test_multiple_parents() {
        let parents = [this.abcd_parent, this.wxyz_parent]
        let parser = new ErrorRaisingArgumentParser({ parents })
        this.assertEqual(parser.parse_args('--d 1 --w 2 3 4'.split(' ')),
                         NS({ a: '3', b: undefined, d: '1', w: '2', y: undefined, z: '4' }))
    }

    test_multiple_parents_mutex() {
        let parents = [this.ab_mutex_parent, this.wxyz_parent]
        let parser = new ErrorRaisingArgumentParser({ parents })
        this.assertEqual(parser.parse_args('-a --w 2 3'.split(' ')),
                         NS({ a: true, b: false, w: '2', y: undefined, z: '3' }))
        this.assertArgumentParserError(() =>
            parser.parse_args('-a --w 2 3 -b'.split(' ')))
        this.assertArgumentParserError(() =>
            parser.parse_args('-a -b --w 2 3'.split(' ')))
    }

    test_conflicting_parents() {
        this.assertRaises(
            argparse.ArgumentError,
            () => argparse.ArgumentParser({ parents: [this.w_parent, this.wxyz_parent] }))
    }

    test_conflicting_parents_mutex() {
        this.assertRaises(
            argparse.ArgumentError,
            () => argparse.ArgumentParser({ parents: [this.abcd_parent, this.ab_mutex_parent] }))
    }

    test_same_argument_name_parents() {
        let parents = [this.wxyz_parent, this.z_parent]
        let parser = new ErrorRaisingArgumentParser({ parents })
        this.assertEqual(parser.parse_args('1 2'.split(' ')),
                         NS({ w: undefined, y: undefined, z: '2' }))
    }

    test_subparser_parents() {
        let parser = new ErrorRaisingArgumentParser()
        let subparsers = parser.add_subparsers()
        let abcde_parser = subparsers.add_parser('bar', { parents: [this.abcd_parent] })
        abcde_parser.add_argument('e')
        this.assertEqual(parser.parse_args('bar -b 1 --d 2 3 4'.split(' ')),
                         NS({ a: '3', b: '1', d: '2', e: '4' }))
    }

    test_subparser_parents_mutex() {
        let parser = new ErrorRaisingArgumentParser()
        let subparsers = parser.add_subparsers()
        let parents = [this.ab_mutex_parent]
        let abc_parser = subparsers.add_parser('foo', { parents })
        let c_group = abc_parser.add_argument_group('c_group')
        c_group.add_argument('c')
        parents = [this.wxyz_parent, this.ab_mutex_parent]
        let wxyzabe_parser = subparsers.add_parser('bar', { parents })
        wxyzabe_parser.add_argument('e')
        this.assertEqual(parser.parse_args('foo -a 4'.split(' ')),
                         NS({ a: true, b: false, c: '4' }))
        this.assertEqual(parser.parse_args('bar -b --w 2 3 4'.split(' ')),
                         NS({ a: false, b: true, w: '2', y: undefined, z: '3', e: '4' }))
        this.assertArgumentParserError(
            () => parser.parse_args('foo -a -b 4'.split(' ')))
        this.assertArgumentParserError(
            () => parser.parse_args('bar -b -a 4'.split(' ')))
    }

    test_parent_help() {
        let parents = [this.abcd_parent, this.wxyz_parent]
        let parser = new ErrorRaisingArgumentParser({ parents })
        let parser_help = parser.format_help()
        let progname = this.main_program
        this.assertEqual(parser_help, textwrap.dedent(sub(`\
            usage: %s%s[-h] [-b B] [--d D] [--w W] [-y Y] a z

            positional arguments:
              a
              z

            optional arguments:
              -h, --help  show this help message and exit
              -b B
              --w W

            c:
              --d D

            x:
              -y Y
        `, progname, progname ? ' ' : '')))
    }

    test_groups_parents() {
        let parent = new ErrorRaisingArgumentParser({ add_help: false })
        let g = parent.add_argument_group({ title: 'g', description: 'gd' })
        g.add_argument('-w')
        g.add_argument('-x')
        let m = parent.add_mutually_exclusive_group()
        m.add_argument('-y')
        m.add_argument('-z')
        let parser = new ErrorRaisingArgumentParser({ parents: [parent] })

        this.assertRaises(ArgumentParserError, () =>
            parser.parse_args(['-y', 'Y', '-z', 'Z']))

        let parser_help = parser.format_help()
        let progname = this.main_program
        this.assertEqual(parser_help, textwrap.dedent(sub(`\
            usage: %s%s[-h] [-w W] [-x X] [-y Y | -z Z]

            optional arguments:
              -h, --help  show this help message and exit
              -y Y
              -z Z

            g:
              gd

              -w W
              -x X
        `, progname, progname ? ' ' : '')))
    }
}).run()

// ==============================
// Mutually exclusive group tests
// ==============================

class TestMutuallyExclusiveGroupErrors extends TestCase {

    test_invalid_add_argument_group() {
        let parser = new ErrorRaisingArgumentParser()
        let raises = this.assertRaises
        raises(TypeError, () => parser.add_mutually_exclusive_group({ title: 'foo' }))
    }

    test_invalid_add_argument() {
        let parser = new ErrorRaisingArgumentParser()
        let group = parser.add_mutually_exclusive_group()
        let raises = this.assertRaises
        raises(TypeError, () => group.add_argument('--foo', { required: true }))
        raises(TypeError, () => group.add_argument('bar'))
        raises(TypeError, () => group.add_argument('bar', { nargs: '+' }))
        raises(TypeError, () => group.add_argument('bar', { nargs: 1 }))
        raises(TypeError, () => group.add_argument('bar', { nargs: argparse.PARSER }))
    }

    test_help() {
        let parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        let group1 = parser.add_mutually_exclusive_group()
        group1.add_argument('--foo', { action: 'store_true' })
        group1.add_argument('--bar', { action: 'store_false' })
        let group2 = parser.add_mutually_exclusive_group()
        group2.add_argument('--soup', { action: 'store_true' })
        group2.add_argument('--nuts', { action: 'store_false' })
        let expected = `\
            usage: PROG [-h] [--foo | --bar] [--soup | --nuts]

            optional arguments:
              -h, --help  show this help message and exit
              --foo
              --bar
              --soup
              --nuts
              `
        this.assertEqual(parser.format_help(), textwrap.dedent(expected))
    }
}

function MEMixin(cls) {
    return class MEMixin extends cls {

        test_failures_when_not_required() {
            let parser = this.get_parser({ required: false })
            let error = ArgumentParserError
            for (let args_string of this.failures) {
                this.assertRaises(error, () =>
                    parser.parse_args(args_string.split(/\s+/).filter(Boolean)))
            }
        }

        test_failures_when_required() {
            let parser = this.get_parser({ required: true })
            let error = ArgumentParserError
            for (let args_string of this.failures.concat([''])) {
                this.assertRaises(error, () =>
                    parser.parse_args(args_string.split(/\s+/).filter(Boolean)))
            }
        }

        test_successes_when_not_required() {
            let parser = this.get_parser({ required: false })
            let successes = this.successes.concat(this.successes_when_not_required)
            for (let [ args_string, expected_ns ] of successes) {
                let actual_ns = parser.parse_args(args_string.split(/\s+/).filter(Boolean))
                this.assertEqual(actual_ns, expected_ns)
            }
        }

        test_successes_when_required() {
            let parser = this.get_parser({ required: true })
            for (let [ args_string, expected_ns ] of this.successes) {
                let actual_ns = parser.parse_args(args_string.split(/\s+/).filter(Boolean))
                this.assertEqual(actual_ns, expected_ns)
            }
        }

        test_usage_when_not_required() {
            let parser = this.get_parser({ required: false })
            let expected_usage = this.usage_when_not_required
            this.assertEqual(parser.format_usage(), textwrap.dedent(expected_usage))
        }

        test_usage_when_required() {
            let parser = this.get_parser({ required: true })
            let expected_usage = this.usage_when_required
            this.assertEqual(parser.format_usage(), textwrap.dedent(expected_usage))
        }

        test_help_when_not_required() {
            let parser = this.get_parser({ required: false })
            let help = this.usage_when_not_required + this.help
            this.assertEqual(parser.format_help(), textwrap.dedent(help))
        }

        test_help_when_required() {
            let parser = this.get_parser({ required: true })
            let help = this.usage_when_required + this.help
            this.assertEqual(parser.format_help(), textwrap.dedent(help))
        }
    }
}


let MEMixin_TestCase = MEMixin(TestCase)

class TestMutuallyExclusiveSimple extends MEMixin_TestCase {

    get_parser({ required = undefined } = {}) {
        let parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        let group = parser.add_mutually_exclusive_group({ required })
        group.add_argument('--bar', { help: 'bar help' })
        group.add_argument('--baz', { nargs: '?', const: 'Z', help: 'baz help' })
        return parser
    }

    failures = ['--bar X --baz Y', '--bar X --baz']
    successes = [
        ['--bar X', NS({ bar: 'X', baz: undefined })],
        ['--bar X --bar Z', NS({ bar: 'Z', baz: undefined })],
        ['--baz Y', NS({ bar: undefined, baz: 'Y' })],
        ['--baz', NS({ bar: undefined, baz: 'Z' })],
    ]
    successes_when_not_required = [
        ['', NS({ bar: undefined, baz: undefined })],
    ]

    usage_when_not_required = `\
        usage: PROG [-h] [--bar BAR | --baz [BAZ]]
        `
    usage_when_required = `\
        usage: PROG [-h] (--bar BAR | --baz [BAZ])
        `
    help = `\

        optional arguments:
          -h, --help   show this help message and exit
          --bar BAR    bar help
          --baz [BAZ]  baz help
        `
}


class TestMutuallyExclusiveLong extends MEMixin_TestCase {

    get_parser({ required = undefined } = {}) {
        let parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        parser.add_argument('--abcde', { help: 'abcde help' })
        parser.add_argument('--fghij', { help: 'fghij help' })
        let group = parser.add_mutually_exclusive_group({ required })
        group.add_argument('--klmno', { help: 'klmno help' })
        group.add_argument('--pqrst', { help: 'pqrst help' })
        return parser
    }

    failures = ['--klmno X --pqrst Y']
    successes = [
        ['--klmno X', NS({ abcde: undefined, fghij: undefined, klmno: 'X', pqrst: undefined })],
        ['--abcde Y --klmno X',
            NS({ abcde: 'Y', fghij: undefined, klmno: 'X', pqrst: undefined })],
        ['--pqrst X', NS({ abcde: undefined, fghij: undefined, klmno: undefined, pqrst: 'X' })],
        ['--pqrst X --fghij Y',
            NS({ abcde: undefined, fghij: 'Y', klmno: undefined, pqrst: 'X' })],
    ]
    successes_when_not_required = [
        ['', NS({ abcde: undefined, fghij: undefined, klmno: undefined, pqrst: undefined })],
    ]

    usage_when_not_required = `\
    usage: PROG [-h] [--abcde ABCDE] [--fghij FGHIJ]
                [--klmno KLMNO | --pqrst PQRST]
    `
    usage_when_required = `\
    usage: PROG [-h] [--abcde ABCDE] [--fghij FGHIJ]
                (--klmno KLMNO | --pqrst PQRST)
    `
    help = `\

    optional arguments:
      -h, --help     show this help message and exit
      --abcde ABCDE  abcde help
      --fghij FGHIJ  fghij help
      --klmno KLMNO  klmno help
      --pqrst PQRST  pqrst help
    `
}


class TestMutuallyExclusiveFirstSuppressed extends MEMixin_TestCase {

    get_parser({ required = undefined } = {}) {
        let parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        let group = parser.add_mutually_exclusive_group({ required })
        group.add_argument('-x', { help: argparse.SUPPRESS })
        group.add_argument('-y', { action: 'store_false', help: 'y help' })
        return parser
    }

    failures = ['-x X -y']
    successes = [
        ['-x X', NS({ x: 'X', y: true })],
        ['-x X -x Y', NS({ x: 'Y', y: true })],
        ['-y', NS({ x: undefined, y: false })],
    ]
    successes_when_not_required = [
        ['', NS({ x: undefined, y: true })],
    ]

    usage_when_not_required = `\
        usage: PROG [-h] [-y]
        `
    usage_when_required = `\
        usage: PROG [-h] -y
        `
    help = `\

        optional arguments:
          -h, --help  show this help message and exit
          -y          y help
        `
}


class TestMutuallyExclusiveManySuppressed extends MEMixin_TestCase {

    get_parser({ required = undefined } = {}) {
        let parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        let group = parser.add_mutually_exclusive_group({ required })
        group.add_argument('--spam', { action: 'store_true', help: argparse.SUPPRESS })
        group.add_argument('--badger', { action: 'store_false', help: argparse.SUPPRESS })
        group.add_argument('--bladder', { help: argparse.SUPPRESS })
        return parser
    }

    failures = [
        '--spam --badger',
        '--badger --bladder B',
        '--bladder B --spam',
    ]
    successes = [
        ['--spam', NS({ spam: true, badger: true, bladder: undefined })],
        ['--badger', NS({ spam: false, badger: false, bladder: undefined })],
        ['--bladder B', NS({ spam: false, badger: true, bladder: 'B' })],
        ['--spam --spam', NS({ spam: true, badger: true, bladder: undefined })],
    ]
    successes_when_not_required = [
        ['', NS({ spam: false, badger: true, bladder: undefined })],
    ]

    usage_when_required = `\
        usage: PROG [-h]
        `
    usage_when_not_required = this.usage_when_required
    help = `\

        optional arguments:
          -h, --help  show this help message and exit
        `
}


class TestMutuallyExclusiveOptionalAndPositional extends MEMixin_TestCase {

    get_parser({ required = undefined } = {}) {
        let parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        let group = parser.add_mutually_exclusive_group({ required })
        group.add_argument('--foo', { action: 'store_true', help: 'FOO' })
        group.add_argument('--spam', { help: 'SPAM' })
        group.add_argument('badger', { nargs: '*', default: 'X', help: 'BADGER' })
        return parser
    }

    failures = [
        '--foo --spam S',
        '--spam S X',
        'X --foo',
        'X Y Z --spam S',
        '--foo X Y',
    ]
    successes = [
        ['--foo', NS({ foo: true, spam: undefined, badger: 'X' })],
        ['--spam S', NS({ foo: false, spam: 'S', badger: 'X' })],
        ['X', NS({ foo: false, spam: undefined, badger: ['X'] })],
        ['X Y Z', NS({ foo: false, spam: undefined, badger: ['X', 'Y', 'Z'] })],
    ]
    successes_when_not_required = [
        ['', NS({ foo: false, spam: undefined, badger: 'X' })],
    ]

    usage_when_not_required = `\
        usage: PROG [-h] [--foo | --spam SPAM | badger ...]
        `
    usage_when_required = `\
        usage: PROG [-h] (--foo | --spam SPAM | badger ...)
        `
    help = `\

        positional arguments:
          badger       BADGER

        optional arguments:
          -h, --help   show this help message and exit
          --foo        FOO
          --spam SPAM  SPAM
        `
}


class TestMutuallyExclusiveOptionalsMixed extends MEMixin_TestCase {

    get_parser({ required = undefined } = {}) {
        let parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        parser.add_argument('-x', { action: 'store_true', help: 'x help' })
        let group = parser.add_mutually_exclusive_group({ required })
        group.add_argument('-a', { action: 'store_true', help: 'a help' })
        group.add_argument('-b', { action: 'store_true', help: 'b help' })
        parser.add_argument('-y', { action: 'store_true', help: 'y help' })
        group.add_argument('-c', { action: 'store_true', help: 'c help' })
        return parser
    }

    failures = ['-a -b', '-b -c', '-a -c', '-a -b -c']
    successes = [
        ['-a', NS({ a: true, b: false, c: false, x: false, y: false })],
        ['-b', NS({ a: false, b: true, c: false, x: false, y: false })],
        ['-c', NS({ a: false, b: false, c: true, x: false, y: false })],
        ['-a -x', NS({ a: true, b: false, c: false, x: true, y: false })],
        ['-y -b', NS({ a: false, b: true, c: false, x: false, y: true })],
        ['-x -y -c', NS({ a: false, b: false, c: true, x: true, y: true })],
    ]
    successes_when_not_required = [
        ['', NS({ a: false, b: false, c: false, x: false, y: false })],
        ['-x', NS({ a: false, b: false, c: false, x: true, y: false })],
        ['-y', NS({ a: false, b: false, c: false, x: false, y: true })],
    ]

    usage_when_required = `\
        usage: PROG [-h] [-x] [-a] [-b] [-y] [-c]
        `
    usage_when_not_required = this.usage_when_required
    help = `\

        optional arguments:
          -h, --help  show this help message and exit
          -x          x help
          -a          a help
          -b          b help
          -y          y help
          -c          c help
        `
}


;(new class TestMutuallyExclusiveInGroup extends MEMixin_TestCase {

    get_parser({ required = undefined } = {}) {
        let parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        let titled_group = parser.add_argument_group({
            title: 'Titled group', description: 'Group description' })
        let mutex_group =
            titled_group.add_mutually_exclusive_group({ required })
        mutex_group.add_argument('--bar', { help: 'bar help' })
        mutex_group.add_argument('--baz', { help: 'baz help' })
        return parser
    }

    failures = ['--bar X --baz Y', '--baz X --bar Y']
    successes = [
        ['--bar X', NS({ bar: 'X', baz: undefined })],
        ['--baz Y', NS({ bar: undefined, baz: 'Y' })],
    ]
    successes_when_not_required = [
        ['', NS({ bar: undefined, baz: undefined })],
    ]

    usage_when_not_required = `\
        usage: PROG [-h] [--bar BAR | --baz BAZ]
        `
    usage_when_required = `\
        usage: PROG [-h] (--bar BAR | --baz BAZ)
        `
    help = `\

        optional arguments:
          -h, --help  show this help message and exit

        Titled group:
          Group description

          --bar BAR   bar help
          --baz BAZ   baz help
        `
}).run()


class TestMutuallyExclusiveOptionalsAndPositionalsMixed extends MEMixin_TestCase {

    get_parser({ required = undefined } = {}) {
        let parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        parser.add_argument('x', { help: 'x help' })
        parser.add_argument('-y', { action: 'store_true', help: 'y help' })
        let group = parser.add_mutually_exclusive_group({ required })
        group.add_argument('a', { nargs: '?', help: 'a help' })
        group.add_argument('-b', { action: 'store_true', help: 'b help' })
        group.add_argument('-c', { action: 'store_true', help: 'c help' })
        return parser
    }

    failures = ['X A -b', '-b -c', '-c X A']
    successes = [
        ['X A', NS({ a: 'A', b: false, c: false, x: 'X', y: false })],
        ['X -b', NS({ a: undefined, b: true, c: false, x: 'X', y: false })],
        ['X -c', NS({ a: undefined, b: false, c: true, x: 'X', y: false })],
        ['X A -y', NS({ a: 'A', b: false, c: false, x: 'X', y: true })],
        ['X -y -b', NS({ a: undefined, b: true, c: false, x: 'X', y: true })],
    ]
    successes_when_not_required = [
        ['X', NS({ a: undefined, b: false, c: false, x: 'X', y: false })],
        ['X -y', NS({ a: undefined, b: false, c: false, x: 'X', y: true })],
    ]

    usage_when_required = `\
        usage: PROG [-h] [-y] [-b] [-c] x [a]
        `
    usage_when_not_required = this.usage_when_required
    help = `\

        positional arguments:
          x           x help
          a           a help

        optional arguments:
          -h, --help  show this help message and exit
          -y          y help
          -b          b help
          -c          c help
        `
}

;(new class TestMutuallyExclusiveNested extends MEMixin_TestCase {

    get_parser({ required = undefined } = {}) {
        let parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        let group = parser.add_mutually_exclusive_group({ required })
        group.add_argument('-a')
        group.add_argument('-b')
        let group2 = group.add_mutually_exclusive_group({ required })
        group2.add_argument('-c')
        group2.add_argument('-d')
        let group3 = group2.add_mutually_exclusive_group({ required })
        group3.add_argument('-e')
        group3.add_argument('-f')
        return parser
    }

    usage_when_not_required = `\
        usage: PROG [-h] [-a A | -b B | [-c C | -d D | [-e E | -f F]]]
        `
    usage_when_required = `\
        usage: PROG [-h] (-a A | -b B | (-c C | -d D | (-e E | -f F)))
        `

    help = `\

        optional arguments:
          -h, --help  show this help message and exit
          -a A
          -b B
          -c C
          -d D
          -e E
          -f F
        `

    // We are only interested in testing the behavior of format_usage().
    test_failures_when_not_required = undefined
    test_failures_when_required = undefined
    test_successes_when_not_required = undefined
    test_successes_when_required = undefined
}).run()

// =================================================
// Mutually exclusive group in parent parser tests
// =================================================

function MEPBase(cls) {

    return class MEPBase extends cls {
        get_parser({ required = undefined } = {}) {
            let parent = super.get_parser({ required })
            let parser = new ErrorRaisingArgumentParser({
                prog: parent.prog, add_help: false, parents: [parent] })
            return parser
        }
    }
}


;(new TestMutuallyExclusiveGroupErrors()).run()
;(new class TestMutuallyExclusiveGroupErrorsParent extends
    MEPBase(TestMutuallyExclusiveGroupErrors) {}).run()


;(new TestMutuallyExclusiveSimple()).run()
;(new class TestMutuallyExclusiveSimpleParent extends
    MEPBase(TestMutuallyExclusiveSimple) {}).run()


;(new TestMutuallyExclusiveLong()).run()
;(new class TestMutuallyExclusiveLongParent extends
    MEPBase(TestMutuallyExclusiveLong) {}).run()


;(new TestMutuallyExclusiveFirstSuppressed()).run()
;(new class TestMutuallyExclusiveFirstSuppressedParent extends
    MEPBase(TestMutuallyExclusiveFirstSuppressed) {}).run()


;(new TestMutuallyExclusiveManySuppressed()).run()
;(new class TestMutuallyExclusiveManySuppressedParent extends
    MEPBase(TestMutuallyExclusiveManySuppressed) {}).run()


;(new TestMutuallyExclusiveOptionalAndPositional()).run()
;(new class TestMutuallyExclusiveOptionalAndPositionalParent extends
    MEPBase(TestMutuallyExclusiveOptionalAndPositional) {}).run()


;(new TestMutuallyExclusiveOptionalsMixed()).run()
;(new class TestMutuallyExclusiveOptionalsMixedParent extends
    MEPBase(TestMutuallyExclusiveOptionalsMixed) {}).run()


;(new TestMutuallyExclusiveOptionalsAndPositionalsMixed()).run()
;(new class TestMutuallyExclusiveOptionalsAndPositionalsMixedParent extends
    MEPBase(TestMutuallyExclusiveOptionalsAndPositionalsMixed) {}).run()


// =================
// Set default tests
// =================

;(new class TestSetDefaults extends TestCase {

    test_set_defaults_no_args() {
        let parser = new ErrorRaisingArgumentParser()
        parser.set_defaults({ x: 'foo' })
        parser.set_defaults({ y: 'bar', z: 1 })
        this.assertEqual(NS({ x: 'foo', y: 'bar', z: 1 }),
                         parser.parse_args([]))
        this.assertEqual(NS({ x: 'foo', y: 'bar', z: 1 }),
                         parser.parse_args([], NS()))
        this.assertEqual(NS({ x: 'baz', y: 'bar', z: 1 }),
                         parser.parse_args([], NS({ x: 'baz' })))
        this.assertEqual(NS({ x: 'baz', y: 'bar', z: 2 }),
                         parser.parse_args([], NS({ x: 'baz', z: 2 })))
    }

    test_set_defaults_with_args() {
        let parser = new ErrorRaisingArgumentParser()
        parser.set_defaults({ x: 'foo', y: 'bar' })
        parser.add_argument('-x', { default: 'xfoox' })
        this.assertEqual(NS({ x: 'xfoox', y: 'bar' }),
                         parser.parse_args([]))
        this.assertEqual(NS({ x: 'xfoox', y: 'bar' }),
                         parser.parse_args([], NS()))
        this.assertEqual(NS({ x: 'baz', y: 'bar' }),
                         parser.parse_args([], NS({ x: 'baz' })))
        this.assertEqual(NS({ x: '1', y: 'bar' }),
                         parser.parse_args('-x 1'.split(' ')))
        this.assertEqual(NS({ x: '1', y: 'bar' }),
                         parser.parse_args('-x 1'.split(' '), NS()))
        this.assertEqual(NS({ x: '1', y: 'bar' }),
                         parser.parse_args('-x 1'.split(' '), NS({ x: 'baz' })))
    }

    test_set_defaults_subparsers() {
        let parser = new ErrorRaisingArgumentParser()
        parser.set_defaults({ x: 'foo' })
        let subparsers = parser.add_subparsers()
        let parser_a = subparsers.add_parser('a')
        parser_a.set_defaults({ y: 'bar' })
        this.assertEqual(NS({ x: 'foo', y: 'bar' }),
                         parser.parse_args('a'.split(' ')))
    }

    test_set_defaults_parents() {
        let parent = new ErrorRaisingArgumentParser({ add_help: false })
        parent.set_defaults({ x: 'foo' })
        let parser = new ErrorRaisingArgumentParser({ parents: [parent] })
        this.assertEqual(NS({ x: 'foo' }), parser.parse_args([]))
    }

    test_set_defaults_on_parent_and_subparser() {
        let parser = argparse.ArgumentParser()
        let xparser = parser.add_subparsers().add_parser('X')
        parser.set_defaults({ foo: 1 })
        xparser.set_defaults({ foo: 2 })
        this.assertEqual(NS({ foo: 2 }), parser.parse_args(['X']))
    }

    test_set_defaults_same_as_add_argument() {
        let parser = new ErrorRaisingArgumentParser()
        parser.set_defaults({ w: 'W', x: 'X', y: 'Y', z: 'Z' })
        parser.add_argument('-w')
        parser.add_argument('-x', { default: 'XX' })
        parser.add_argument('y', { nargs: '?' })
        parser.add_argument('z', { nargs: '?', default: 'ZZ' })

        // defaults set previously
        this.assertEqual(NS({ w: 'W', x: 'XX', y: 'Y', z: 'ZZ' }),
                         parser.parse_args([]))

        // reset defaults
        parser.set_defaults({ w: 'WW', x: 'X', y: 'YY', z: 'Z' })
        this.assertEqual(NS({ w: 'WW', x: 'X', y: 'YY', z: 'Z' }),
                         parser.parse_args([]))
    }

    test_set_defaults_same_as_add_argument_group() {
        let parser = new ErrorRaisingArgumentParser()
        parser.set_defaults({ w: 'W', x: 'X', y: 'Y', z: 'Z' })
        let group = parser.add_argument_group('foo')
        group.add_argument('-w')
        group.add_argument('-x', { default: 'XX' })
        group.add_argument('y', { nargs: '?' })
        group.add_argument('z', { nargs: '?', default: 'ZZ' })


        // defaults set previously
        this.assertEqual(NS({ w: 'W', x: 'XX', y: 'Y', z: 'ZZ' }),
                         parser.parse_args([]))

        // reset defaults
        parser.set_defaults({ w: 'WW', x: 'X', y: 'YY', z: 'Z' })
        this.assertEqual(NS({ w: 'WW', x: 'X', y: 'YY', z: 'Z' }),
                         parser.parse_args([]))
    }
}).run()

// =================
// Get default tests
// =================

;(new class TestGetDefault extends TestCase {

    test_get_default() {
        let parser = new ErrorRaisingArgumentParser()
        this.assertIsNone(parser.get_default("foo"))
        this.assertIsNone(parser.get_default("bar"))

        parser.add_argument("--foo")
        this.assertIsNone(parser.get_default("foo"))
        this.assertIsNone(parser.get_default("bar"))

        parser.add_argument("--bar", { type: 'int', default: 42 })
        this.assertIsNone(parser.get_default("foo"))
        this.assertEqual(42, parser.get_default("bar"))

        parser.set_defaults({ foo: "badger" })
        this.assertEqual("badger", parser.get_default("foo"))
        this.assertEqual(42, parser.get_default("bar"))
    }
}).run()

// ==========================
// Namespace 'contains' tests
// ==========================

;(new class TestNamespaceContainsSimple extends TestCase {

    test_empty() {
        let ns = argparse.Namespace()
        this.assertNotIn('', ns)
        this.assertNotIn('x', ns)
    }

    test_non_empty() {
        let ns = argparse.Namespace({ x: 1, y: 2 })
        this.assertNotIn('', ns)
        this.assertIn('x', ns)
        this.assertIn('y', ns)
        this.assertNotIn('xx', ns)
        this.assertNotIn('z', ns)
    }
}).run()

// =====================
// Help formatting tests
// =====================

class HelpTestCase extends TestCase {

    constructor() {
        super()

        class AddTests {

            constructor(test_class, func_suffix, std_name) {
                this.func_suffix = func_suffix
                this.std_name = std_name

                for (let test_func of [this.test_format,
                                       this.test_print,
                                       this.test_print_file]) {
                    let test_name = sub('%s_%s', test_func.name, func_suffix)
                    test_class[test_name] = () => test_func.call(this, test_class)
                }
            }

            _get_parser(tester) {
                let parser = new argparse.ArgumentParser(...tester.parser_signature)
                for (let argument_sig of tester.argument_signatures || []) {
                    parser.add_argument(...argument_sig)
                }
                let group_sigs = tester.argument_group_signatures || []
                for (let [ group_sig, argument_sigs ] of group_sigs) {
                    let group = parser.add_argument_group(...group_sig)
                    for (let argument_sig of argument_sigs) {
                        group.add_argument(...argument_sig)
                    }
                }
                let subparsers_sigs = tester.subparsers_signatures || []
                if (subparsers_sigs.length) {
                    let subparsers = parser.add_subparsers()
                    for (let subparser_sig of subparsers_sigs) {
                        subparsers.add_parser(...subparser_sig)
                    }
                }
                return parser
            }

            _test(tester, parser_text) {
                let expected_text = tester[this.func_suffix]
                expected_text = textwrap.dedent(expected_text)
                tester.assertEqual(expected_text, parser_text)
            }

            test_format(tester) {
                let parser = this._get_parser(tester)
                let format = parser[sub('format_%s', this.func_suffix)]
                this._test(tester, format.call(parser))
            }

            test_print(tester) {
                let parser = this._get_parser(tester)
                let print_ = parser[sub('print_%s', this.func_suffix)]
                let old_stream = Object.getOwnPropertyDescriptor(process, this.std_name)
                Object.defineProperty(process, this.std_name, { value: new StdIOBuffer() })
                let parser_text
                try {
                    print_.call(parser)
                    parser_text = process[this.std_name].getvalue()
                } finally {
                    Object.defineProperty(process, this.std_name, old_stream)
                }
                this._test(tester, parser_text)
            }

            test_print_file(tester) {
                let parser = this._get_parser(tester)
                let print_ = parser[sub('print_%s', this.func_suffix)]
                let sfile = new StdIOBuffer()
                print_.call(parser, sfile)
                let parser_text = sfile.getvalue()
                this._test(tester, parser_text)
            }
        }

        // add tests for {format,print}_{usage,help}
        for (let [ func_suffix, std_name ] of [['usage', 'stdout'],
                                               ['help', 'stdout']]) {
            // eslint-disable-next-line no-new
            new AddTests(this, func_suffix, std_name)
        }
    }
}


class TestHelpBiggerOptionalsBase extends HelpTestCase {
    parser_signature = Sig({ prog: 'PROG', description: 'DESCRIPTION',
                             epilog: 'EPILOG' })
    argument_signatures = [
        Sig('-v', '--version', { action: 'version', version: '0.1' }),
        Sig('-x', { action: 'store_true', help: 'X HELP' }),
        Sig('--y', { help: 'Y HELP' }),
        Sig('foo', { help: 'FOO HELP' }),
        Sig('bar', { help: 'BAR HELP' }),
    ]
    argument_group_signatures = []
    version = `\
        0.1
        `
}


;(new class TestHelpBiggerOptionals extends TestHelpBiggerOptionalsBase {
    /* Make sure that argument help aligns when options are longer */

    usage = `\
        usage: PROG [-h] [-v] [-x] [--y Y] foo bar
        `
    help = this.usage + `\

        DESCRIPTION

        positional arguments:
          foo            FOO HELP
          bar            BAR HELP

        optional arguments:
          -h, --help     show this help message and exit
          -v, --version  show program's version number and exit
          -x             X HELP
          --y Y          Y HELP

        EPILOG
    `
}).run()


;(new class TestShortColumns extends TestHelpBiggerOptionalsBase {
    /*
     *  Test extremely small number of columns.
     *
     *  TestCase prevents "COLUMNS" from being too small in the tests themselves,
     *  but we don't want any exceptions thrown in such cases. Only ugly representation.
     */
    setUp() {
        process.env.COLUMNS = '15'
    }

    usage = `\
        usage: PROG
               [-h]
               [-v]
               [-x]
               [--y Y]
               foo
               bar
        `
    help = this.usage + `\

        DESCRIPTION

        positional arguments:
          foo
            FOO HELP
          bar
            BAR HELP

        optional arguments:
          -h, --help
            show this
            help
            message and
            exit
          -v, --version
            show
            program's
            version
            number and
            exit
          -x
            X HELP
          --y Y
            Y HELP

        EPILOG
    `
}).run()


;(new class TestHelpBiggerOptionalGroups extends HelpTestCase {
    /* Make sure that argument help aligns when options are longer */

    parser_signature = Sig({ prog: 'PROG', description: 'DESCRIPTION',
                             epilog: 'EPILOG' })
    argument_signatures = [
        Sig('-v', '--version', { action: 'version', version: '0.1' }),
        Sig('-x', { action: 'store_true', help: 'X HELP' }),
        Sig('--y', { help: 'Y HELP' }),
        Sig('foo', { help: 'FOO HELP' }),
        Sig('bar', { help: 'BAR HELP' }),
    ]
    argument_group_signatures = [
        [Sig('GROUP TITLE', { description: 'GROUP DESCRIPTION' }), [
            Sig('baz', { help: 'BAZ HELP' }),
            Sig('-z', { nargs: '+', help: 'Z HELP' })]],
    ]
    usage = `\
        usage: PROG [-h] [-v] [-x] [--y Y] [-z Z [Z ...]] foo bar baz
        `
    help = this.usage + `\

        DESCRIPTION

        positional arguments:
          foo            FOO HELP
          bar            BAR HELP

        optional arguments:
          -h, --help     show this help message and exit
          -v, --version  show program's version number and exit
          -x             X HELP
          --y Y          Y HELP

        GROUP TITLE:
          GROUP DESCRIPTION

          baz            BAZ HELP
          -z Z [Z ...]   Z HELP

        EPILOG
    `
    version = `\
        0.1
        `
}).run()


;(new class TestHelpBiggerPositionals extends HelpTestCase {
    /* Make sure that help aligns when arguments are longer */

    parser_signature = Sig({ usage: 'USAGE', description: 'DESCRIPTION' })
    argument_signatures = [
        Sig('-x', { action: 'store_true', help: 'X HELP' }),
        Sig('--y', { help: 'Y HELP' }),
        Sig('ekiekiekifekang', { help: 'EKI HELP' }),
        Sig('bar', { help: 'BAR HELP' }),
    ]
    argument_group_signatures = []
    usage = `\
        usage: USAGE
        `
    help = this.usage + `\

        DESCRIPTION

        positional arguments:
          ekiekiekifekang  EKI HELP
          bar              BAR HELP

        optional arguments:
          -h, --help       show this help message and exit
          -x               X HELP
          --y Y            Y HELP
        `

    version = ''
}).run()


;(new class TestHelpReformatting extends HelpTestCase {
    /* Make sure that text after short names starts on the first line */

    parser_signature = Sig({
        prog: 'PROG',
        description: '   oddly    formatted\n' +
                    'description\n' +
                    '\n' +
                    'that is so long that it should go onto multiple ' +
                    'lines when wrapped' })
    argument_signatures = [
        Sig('-x', { metavar: 'XX', help: 'oddly\n' +
                                     '    formatted -x help' }),
        Sig('y', { metavar: 'yyy', help: 'normal y help' }),
    ]
    argument_group_signatures = [
        [Sig('title', { description: '\n' +
                                  '    oddly formatted group\n' +
                                  '\n' +
                                  'description' }),
         [Sig('-a', { action: 'store_true',
              help: ' oddly \n' +
                   'formatted    -a  help  \n' +
                   '    again, so long that it should be wrapped over ' +
                   'multiple lines' })]],
    ]
    usage = `\
        usage: PROG [-h] [-x XX] [-a] yyy
        `
    help = this.usage + `\

        oddly formatted description that is so long that it should go onto \
multiple
        lines when wrapped

        positional arguments:
          yyy         normal y help

        optional arguments:
          -h, --help  show this help message and exit
          -x XX       oddly formatted -x help

        title:
          oddly formatted group description

          -a          oddly formatted -a help again, so long that it should \
be wrapped
                      over multiple lines
        `
    version = ''
}).run()


;(new class TestHelpWrappingShortNames extends HelpTestCase {
    /* Make sure that text after short names starts on the first line */

    parser_signature = Sig({ prog: 'PROG', description: 'D\nD'.repeat(30) })
    argument_signatures = [
        Sig('-x', { metavar: 'XX', help: 'XHH HX'.repeat(20) }),
        Sig('y', { metavar: 'yyy', help: 'YH YH'.repeat(20) }),
    ]
    argument_group_signatures = [
        [Sig('ALPHAS'), [
            Sig('-a', { action: 'store_true', help: 'AHHH HHA'.repeat(10) })]],
    ]
    usage = `\
        usage: PROG [-h] [-x XX] [-a] yyy
        `
    help = this.usage + `\

        D DD DD DD DD DD DD DD DD DD DD DD DD DD DD DD DD DD DD DD DD DD DD \
DD DD DD
        DD DD DD DD D

        positional arguments:
          yyy         YH YHYH YHYH YHYH YHYH YHYH YHYH YHYH YHYH YHYH YHYH \
YHYH YHYH
                      YHYH YHYH YHYH YHYH YHYH YHYH YHYH YH

        optional arguments:
          -h, --help  show this help message and exit
          -x XX       XHH HXXHH HXXHH HXXHH HXXHH HXXHH HXXHH HXXHH HXXHH \
HXXHH HXXHH
                      HXXHH HXXHH HXXHH HXXHH HXXHH HXXHH HXXHH HXXHH HXXHH HX

        ALPHAS:
          -a          AHHH HHAAHHH HHAAHHH HHAAHHH HHAAHHH HHAAHHH HHAAHHH \
HHAAHHH
                      HHAAHHH HHAAHHH HHA
        `
    version = ''
}).run()


;(new class TestHelpWrappingLongNames extends HelpTestCase {
    /* Make sure that text after long names starts on the next line */

    parser_signature = Sig({ usage: 'USAGE', description: 'D D'.repeat(30) })
    argument_signatures = [
        Sig('-v', '--version', { action: 'version', version: 'V V'.repeat(30) }),
        Sig('-x', { metavar: 'X'.repeat(25), help: 'XH XH'.repeat(20) }),
        Sig('y', { metavar: 'y'.repeat(25), help: 'YH YH'.repeat(20) }),
    ]
    argument_group_signatures = [
        [Sig('ALPHAS'), [
            Sig('-a', { metavar: 'A'.repeat(25), help: 'AH AH'.repeat(20) }),
            Sig('z', { metavar: 'z'.repeat(25), help: 'ZH ZH'.repeat(20) })]],
    ]
    usage = `\
        usage: USAGE
        `
    help = this.usage + `\

        D DD DD DD DD DD DD DD DD DD DD DD DD DD DD DD DD DD DD DD DD DD DD \
DD DD DD
        DD DD DD DD D

        positional arguments:
          yyyyyyyyyyyyyyyyyyyyyyyyy
                                YH YHYH YHYH YHYH YHYH YHYH YHYH YHYH YHYH \
YHYH YHYH
                                YHYH YHYH YHYH YHYH YHYH YHYH YHYH YHYH YHYH YH

        optional arguments:
          -h, --help            show this help message and exit
          -v, --version         show program's version number and exit
          -x XXXXXXXXXXXXXXXXXXXXXXXXX
                                XH XHXH XHXH XHXH XHXH XHXH XHXH XHXH XHXH \
XHXH XHXH
                                XHXH XHXH XHXH XHXH XHXH XHXH XHXH XHXH XHXH XH

        ALPHAS:
          -a AAAAAAAAAAAAAAAAAAAAAAAAA
                                AH AHAH AHAH AHAH AHAH AHAH AHAH AHAH AHAH \
AHAH AHAH
                                AHAH AHAH AHAH AHAH AHAH AHAH AHAH AHAH AHAH AH
          zzzzzzzzzzzzzzzzzzzzzzzzz
                                ZH ZHZH ZHZH ZHZH ZHZH ZHZH ZHZH ZHZH ZHZH \
ZHZH ZHZH
                                ZHZH ZHZH ZHZH ZHZH ZHZH ZHZH ZHZH ZHZH ZHZH ZH
        `
    version = `\
        V VV VV VV VV VV VV VV VV VV VV VV VV VV VV VV VV VV VV VV VV VV VV \
VV VV VV
        VV VV VV VV V
        `
}).run()


;(new class TestHelpUsage extends HelpTestCase {
    /* Test basic usage messages */

    parser_signature = Sig({ prog: 'PROG' })
    argument_signatures = [
        Sig('-w', { nargs: '+', help: 'w' }),
        Sig('-x', { nargs: '*', help: 'x' }),
        Sig('a', { help: 'a' }),
        Sig('b', { help: 'b', nargs: 2 }),
        Sig('c', { help: 'c', nargs: '?' }),
        Sig('--foo', { help: 'Whether to foo', action: argparse.BooleanOptionalAction }),
        Sig('--bar', { help: 'Whether to bar', default: true,
                       action: argparse.BooleanOptionalAction }),
        Sig('-f', '--foobar', '--barfoo', { action: argparse.BooleanOptionalAction }),
    ]
    argument_group_signatures = [
        [Sig('group'), [
            Sig('-y', { nargs: '?', help: 'y' }),
            Sig('-z', { nargs: 3, help: 'z' }),
            Sig('d', { help: 'd', nargs: '*' }),
            Sig('e', { help: 'e', nargs: '+' }),
        ]]
    ]
    usage = `\
        usage: PROG [-h] [-w W [W ...]] [-x [X ...]] [--foo | --no-foo]
                    [--bar | --no-bar]
                    [-f | --foobar | --no-foobar | --barfoo | --no-barfoo] [-y [Y]]
                    [-z Z Z Z]
                    a b b [c] [d ...] e [e ...]
        `
    help = this.usage + `\

        positional arguments:
          a                     a
          b                     b
          c                     c

        optional arguments:
          -h, --help            show this help message and exit
          -w W [W ...]          w
          -x [X ...]            x
          --foo, --no-foo       Whether to foo
          --bar, --no-bar       Whether to bar (default: true)
          -f, --foobar, --no-foobar, --barfoo, --no-barfoo

        group:
          -y [Y]                y
          -z Z Z Z              z
          d                     d
          e                     e
        `
    version = ''
}).run()


;(new class TestHelpOnlyUserGroups extends HelpTestCase {
    /* Test basic usage messages */

    parser_signature = Sig({ prog: 'PROG', add_help: false })
    argument_signatures = []
    argument_group_signatures = [
        [Sig('xxxx'), [
            Sig('-x', { help: 'x' }),
            Sig('a', { help: 'a' }),
        ]],
        [Sig('yyyy'), [
            Sig('b', { help: 'b' }),
            Sig('-y', { help: 'y' }),
        ]],
    ]
    usage = `\
        usage: PROG [-x X] [-y Y] a b
        `
    help = this.usage + `\

        xxxx:
          -x X  x
          a     a

        yyyy:
          b     b
          -y Y  y
        `
    version = ''
}).run()


;(new class TestHelpUsageLongProg extends HelpTestCase {
    /* Test usage messages where the prog is long */

    parser_signature = Sig({ prog: 'P'.repeat(60) })
    argument_signatures = [
        Sig('-w', { metavar: 'W' }),
        Sig('-x', { metavar: 'X' }),
        Sig('a'),
        Sig('b'),
    ]
    argument_group_signatures = []
    usage = `\
        usage: PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP
               [-h] [-w W] [-x X] a b
        `
    help = this.usage + `\

        positional arguments:
          a
          b

        optional arguments:
          -h, --help  show this help message and exit
          -w W
          -x X
        `
    version = ''
}).run()


;(new class TestHelpUsageLongProgOptionsWrap extends HelpTestCase {
    /* Test usage messages where the prog is long and the optionals wrap */

    parser_signature = Sig({ prog: 'P'.repeat(60) })
    argument_signatures = [
        Sig('-w', { metavar: 'W'.repeat(25) }),
        Sig('-x', { metavar: 'X'.repeat(25) }),
        Sig('-y', { metavar: 'Y'.repeat(25) }),
        Sig('-z', { metavar: 'Z'.repeat(25) }),
        Sig('a'),
        Sig('b'),
    ]
    argument_group_signatures = []
    usage = `\
        usage: PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP
               [-h] [-w WWWWWWWWWWWWWWWWWWWWWWWWW] \
[-x XXXXXXXXXXXXXXXXXXXXXXXXX]
               [-y YYYYYYYYYYYYYYYYYYYYYYYYY] [-z ZZZZZZZZZZZZZZZZZZZZZZZZZ]
               a b
        `
    help = this.usage + `\

        positional arguments:
          a
          b

        optional arguments:
          -h, --help            show this help message and exit
          -w WWWWWWWWWWWWWWWWWWWWWWWWW
          -x XXXXXXXXXXXXXXXXXXXXXXXXX
          -y YYYYYYYYYYYYYYYYYYYYYYYYY
          -z ZZZZZZZZZZZZZZZZZZZZZZZZZ
        `
    version = ''
}).run()


;(new class TestHelpUsageLongProgPositionalsWrap extends HelpTestCase {
    /* Test usage messages where the prog is long and the positionals wrap */

    parser_signature = Sig({ prog: 'P'.repeat(60), add_help: false })
    argument_signatures = [
        Sig('a'.repeat(25)),
        Sig('b'.repeat(25)),
        Sig('c'.repeat(25)),
    ]
    argument_group_signatures = []
    usage = `\
        usage: PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP
               aaaaaaaaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbbbbbbbb
               ccccccccccccccccccccccccc
        `
    help = this.usage + `\

        positional arguments:
          aaaaaaaaaaaaaaaaaaaaaaaaa
          bbbbbbbbbbbbbbbbbbbbbbbbb
          ccccccccccccccccccccccccc
        `
    version = ''
}).run()


;(new class TestHelpUsageOptionalsWrap extends HelpTestCase {
    /* Test usage messages where the optionals wrap */

    parser_signature = Sig({ prog: 'PROG' })
    argument_signatures = [
        Sig('-w', { metavar: 'W'.repeat(25) }),
        Sig('-x', { metavar: 'X'.repeat(25) }),
        Sig('-y', { metavar: 'Y'.repeat(25) }),
        Sig('-z', { metavar: 'Z'.repeat(25) }),
        Sig('a'),
        Sig('b'),
        Sig('c'),
    ]
    argument_group_signatures = []
    usage = `\
        usage: PROG [-h] [-w WWWWWWWWWWWWWWWWWWWWWWWWW] \
[-x XXXXXXXXXXXXXXXXXXXXXXXXX]
                    [-y YYYYYYYYYYYYYYYYYYYYYYYYY] \
[-z ZZZZZZZZZZZZZZZZZZZZZZZZZ]
                    a b c
        `
    help = this.usage + `\

        positional arguments:
          a
          b
          c

        optional arguments:
          -h, --help            show this help message and exit
          -w WWWWWWWWWWWWWWWWWWWWWWWWW
          -x XXXXXXXXXXXXXXXXXXXXXXXXX
          -y YYYYYYYYYYYYYYYYYYYYYYYYY
          -z ZZZZZZZZZZZZZZZZZZZZZZZZZ
        `
    version = ''
}).run()


;(new class TestHelpUsagePositionalsWrap extends HelpTestCase {
    /* Test usage messages where the positionals wrap */

    parser_signature = Sig({ prog: 'PROG' })
    argument_signatures = [
        Sig('-x'),
        Sig('-y'),
        Sig('-z'),
        Sig('a'.repeat(25)),
        Sig('b'.repeat(25)),
        Sig('c'.repeat(25)),
    ]
    argument_group_signatures = []
    usage = `\
        usage: PROG [-h] [-x X] [-y Y] [-z Z]
                    aaaaaaaaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbbbbbbbb
                    ccccccccccccccccccccccccc
        `
    help = this.usage + `\

        positional arguments:
          aaaaaaaaaaaaaaaaaaaaaaaaa
          bbbbbbbbbbbbbbbbbbbbbbbbb
          ccccccccccccccccccccccccc

        optional arguments:
          -h, --help            show this help message and exit
          -x X
          -y Y
          -z Z
        `
    version = ''
}).run()


;(new class TestHelpUsageOptionalsPositionalsWrap extends HelpTestCase {
    /* Test usage messages where the optionals and positionals wrap */

    parser_signature = Sig({ prog: 'PROG' })
    argument_signatures = [
        Sig('-x', { metavar: 'X'.repeat(25) }),
        Sig('-y', { metavar: 'Y'.repeat(25) }),
        Sig('-z', { metavar: 'Z'.repeat(25) }),
        Sig('a'.repeat(25)),
        Sig('b'.repeat(25)),
        Sig('c'.repeat(25)),
    ]
    argument_group_signatures = []
    usage = `\
        usage: PROG [-h] [-x XXXXXXXXXXXXXXXXXXXXXXXXX] \
[-y YYYYYYYYYYYYYYYYYYYYYYYYY]
                    [-z ZZZZZZZZZZZZZZZZZZZZZZZZZ]
                    aaaaaaaaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbbbbbbbb
                    ccccccccccccccccccccccccc
        `
    help = this.usage + `\

        positional arguments:
          aaaaaaaaaaaaaaaaaaaaaaaaa
          bbbbbbbbbbbbbbbbbbbbbbbbb
          ccccccccccccccccccccccccc

        optional arguments:
          -h, --help            show this help message and exit
          -x XXXXXXXXXXXXXXXXXXXXXXXXX
          -y YYYYYYYYYYYYYYYYYYYYYYYYY
          -z ZZZZZZZZZZZZZZZZZZZZZZZZZ
        `
    version = ''
}).run()


;(new class TestHelpUsageOptionalsOnlyWrap extends HelpTestCase {
    /* Test usage messages where there are only optionals and they wrap */

    parser_signature = Sig({ prog: 'PROG' })
    argument_signatures = [
        Sig('-x', { metavar: 'X'.repeat(25) }),
        Sig('-y', { metavar: 'Y'.repeat(25) }),
        Sig('-z', { metavar: 'Z'.repeat(25) }),
    ]
    argument_group_signatures = []
    usage = `\
        usage: PROG [-h] [-x XXXXXXXXXXXXXXXXXXXXXXXXX] \
[-y YYYYYYYYYYYYYYYYYYYYYYYYY]
                    [-z ZZZZZZZZZZZZZZZZZZZZZZZZZ]
        `
    help = this.usage + `\

        optional arguments:
          -h, --help            show this help message and exit
          -x XXXXXXXXXXXXXXXXXXXXXXXXX
          -y YYYYYYYYYYYYYYYYYYYYYYYYY
          -z ZZZZZZZZZZZZZZZZZZZZZZZZZ
        `
    version = ''
}).run()


;(new class TestHelpUsagePositionalsOnlyWrap extends HelpTestCase {
    /* Test usage messages where there are only positionals and they wrap */

    parser_signature = Sig({ prog: 'PROG', add_help: false })
    argument_signatures = [
        Sig('a'.repeat(25)),
        Sig('b'.repeat(25)),
        Sig('c'.repeat(25)),
    ]
    argument_group_signatures = []
    usage = `\
        usage: PROG aaaaaaaaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbbbbbbbb
                    ccccccccccccccccccccccccc
        `
    help = this.usage + `\

        positional arguments:
          aaaaaaaaaaaaaaaaaaaaaaaaa
          bbbbbbbbbbbbbbbbbbbbbbbbb
          ccccccccccccccccccccccccc
        `
    version = ''
}).run()


;(new class TestHelpVariableExpansion extends HelpTestCase {
    /* Test that variables are expanded properly in help messages */

    parser_signature = Sig({ prog: 'PROG' })
    argument_signatures = [
        Sig('-x', { type: 'int',
            help: 'x %(prog)s %(default)s %(type)s %%' }),
        Sig('-y', { action: 'store_const', default: 42, const: 'XXX',
            help: 'y %(prog)s %(default)s %(const)s' }),
        Sig('--foo', { choices: 'abc',
            help: 'foo %(prog)s %(default)s %(choices)s' }),
        Sig('--bar', { default: 'baz', choices: [1, 2], metavar: 'BBB',
            help: 'bar %(prog)s %(default)s %(dest)s' }),
        Sig('spam', { help: 'spam %(prog)s %(default)s' }),
        Sig('badger', { default: 0.5, help: 'badger %(prog)s %(default)s' }),
    ]
    argument_group_signatures = [
        [Sig('group'), [
            Sig('-a', { help: 'a %(prog)s %(default)s' }),
            Sig('-b', { default: -1, help: 'b %(prog)s %(default)s' }),
        ]]
    ]
    usage = (`\
        usage: PROG [-h] [-x X] [-y] [--foo {a,b,c}] [--bar BBB] [-a A] [-b B]
                    spam badger
        `)
    help = this.usage + `\

        positional arguments:
          spam           spam PROG undefined
          badger         badger PROG 0.5

        optional arguments:
          -h, --help     show this help message and exit
          -x X           x PROG undefined int %
          -y             y PROG 42 XXX
          --foo {a,b,c}  foo PROG undefined a, b, c
          --bar BBB      bar PROG baz bar

        group:
          -a A           a PROG undefined
          -b B           b PROG -1
        `
    version = ''
}).run()


;(new class TestHelpVariableExpansionUsageSupplied extends HelpTestCase {
    /* Test that variables are expanded properly when usage= is present */

    parser_signature = Sig({ prog: 'PROG', usage: '%(prog)s FOO' })
    argument_signatures = []
    argument_group_signatures = []
    usage = (`\
        usage: PROG FOO
        `)
    help = this.usage + `\

        optional arguments:
          -h, --help  show this help message and exit
        `
    version = ''
}).run()


;(new class TestHelpVariableExpansionNoArguments extends HelpTestCase {
    /* Test that variables are expanded properly with no arguments */

    parser_signature = Sig({ prog: 'PROG', add_help: false })
    argument_signatures = []
    argument_group_signatures = []
    usage = (`\
        usage: PROG
        `)
    help = this.usage
    version = ''
}).run()


;(new class TestHelpSuppressUsage extends HelpTestCase {
    /* Test that items can be suppressed in usage messages */

    parser_signature = Sig({ prog: 'PROG', usage: argparse.SUPPRESS })
    argument_signatures = [
        Sig('--foo', { help: 'foo help' }),
        Sig('spam', { help: 'spam help' }),
    ]
    argument_group_signatures = []
    help = `\
        positional arguments:
          spam        spam help

        optional arguments:
          -h, --help  show this help message and exit
          --foo FOO   foo help
        `
    usage = ''
    version = ''
}).run()


;(new class TestHelpSuppressOptional extends HelpTestCase {
    /* Test that optional arguments can be suppressed in help messages */

    parser_signature = Sig({ prog: 'PROG', add_help: false })
    argument_signatures = [
        Sig('--foo', { help: argparse.SUPPRESS }),
        Sig('spam', { help: 'spam help' }),
    ]
    argument_group_signatures = []
    usage = `\
        usage: PROG spam
        `
    help = this.usage + `\

        positional arguments:
          spam  spam help
        `
    version = ''
}).run()


;(new class TestHelpSuppressOptionalGroup extends HelpTestCase {
    /* Test that optional groups can be suppressed in help messages */

    parser_signature = Sig({ prog: 'PROG' })
    argument_signatures = [
        Sig('--foo', { help: 'foo help' }),
        Sig('spam', { help: 'spam help' }),
    ]
    argument_group_signatures = [
        [Sig('group'), [Sig('--bar', { help: argparse.SUPPRESS })]],
    ]
    usage = `\
        usage: PROG [-h] [--foo FOO] spam
        `
    help = this.usage + `\

        positional arguments:
          spam        spam help

        optional arguments:
          -h, --help  show this help message and exit
          --foo FOO   foo help
        `
    version = ''
}).run()


;(new class TestHelpSuppressPositional extends HelpTestCase {
    /* Test that positional arguments can be suppressed in help messages */

    parser_signature = Sig({ prog: 'PROG' })
    argument_signatures = [
        Sig('--foo', { help: 'foo help' }),
        Sig('spam', { help: argparse.SUPPRESS }),
    ]
    argument_group_signatures = []
    usage = `\
        usage: PROG [-h] [--foo FOO]
        `
    help = this.usage + `\

        optional arguments:
          -h, --help  show this help message and exit
          --foo FOO   foo help
        `
    version = ''
}).run()


;(new class TestHelpRequiredOptional extends HelpTestCase {
    /* Test that required options don't look optional */

    parser_signature = Sig({ prog: 'PROG' })
    argument_signatures = [
        Sig('--foo', { required: true, help: 'foo help' }),
    ]
    argument_group_signatures = []
    usage = `\
        usage: PROG [-h] --foo FOO
        `
    help = this.usage + `\

        optional arguments:
          -h, --help  show this help message and exit
          --foo FOO   foo help
        `
    version = ''
}).run()


;(new class TestHelpAlternatePrefixChars extends HelpTestCase {
    /* Test that options display with different prefix characters */

    parser_signature = Sig({ prog: 'PROG', prefix_chars: '^;', add_help: false })
    argument_signatures = [
        Sig('^^foo', { action: 'store_true', help: 'foo help' }),
        Sig(';b', ';;bar', { help: 'bar help' }),
    ]
    argument_group_signatures = []
    usage = `\
        usage: PROG [^^foo] [;b BAR]
        `
    help = this.usage + `\

        optional arguments:
          ^^foo              foo help
          ;b BAR, ;;bar BAR  bar help
        `
    version = ''
}).run()


;(new class TestHelpNoHelpOptional extends HelpTestCase {
    /* Test that the --help argument can be suppressed help messages */

    parser_signature = Sig({ prog: 'PROG', add_help: false })
    argument_signatures = [
        Sig('--foo', { help: 'foo help' }),
        Sig('spam', { help: 'spam help' }),
    ]
    argument_group_signatures = []
    usage = `\
        usage: PROG [--foo FOO] spam
        `
    help = this.usage + `\

        positional arguments:
          spam       spam help

        optional arguments:
          --foo FOO  foo help
        `
    version = ''
}).run()


;(new class TestHelpNone extends HelpTestCase {
    /* Test that no errors occur if no help is specified */

    parser_signature = Sig({ prog: 'PROG' })
    argument_signatures = [
        Sig('--foo'),
        Sig('spam'),
    ]
    argument_group_signatures = []
    usage = `\
        usage: PROG [-h] [--foo FOO] spam
        `
    help = this.usage + `\

        positional arguments:
          spam

        optional arguments:
          -h, --help  show this help message and exit
          --foo FOO
        `
    version = ''
}).run()


;(new class TestHelpTupleMetavar extends HelpTestCase {
    /* Test specifying metavar as a tuple */

    parser_signature = Sig({ prog: 'PROG' })
    argument_signatures = [
        Sig('-w', { help: 'w', nargs: '+', metavar: ['W1', 'W2'] }),
        Sig('-x', { help: 'x', nargs: '*', metavar: ['X1', 'X2'] }),
        Sig('-y', { help: 'y', nargs: 3, metavar: ['Y1', 'Y2', 'Y3'] }),
        Sig('-z', { help: 'z', nargs: '?', metavar: ['Z1'] }),
    ]
    argument_group_signatures = []
    usage = `\
        usage: PROG [-h] [-w W1 [W2 ...]] [-x [X1 [X2 ...]]] [-y Y1 Y2 Y3] \
[-z [Z1]]
        `
    help = this.usage + `\

        optional arguments:
          -h, --help        show this help message and exit
          -w W1 [W2 ...]    w
          -x [X1 [X2 ...]]  x
          -y Y1 Y2 Y3       y
          -z [Z1]           z
        `
    version = ''
}).run()


;(new class TestHelpRawText extends HelpTestCase {
    /* Test the RawTextHelpFormatter */

    parser_signature = Sig({
        prog: 'PROG', formatter_class: argparse.RawTextHelpFormatter,
        description: 'Keep the formatting\n' +
                     '    exactly as it is written\n' +
                     '\n' +
                     'here\n' })

    argument_signatures = [
        Sig('--foo', { help: '    foo help should also\n' +
                             'appear as given here' }),
        Sig('spam', { help: 'spam help' }),
    ]
    argument_group_signatures = [
        [Sig('title', { description: '    This text\n' +
                                     '  should be indented\n' +
                                     '    exactly like it is here\n' }),
         [Sig('--bar', { help: 'bar help' })]],
    ]
    usage = `\
        usage: PROG [-h] [--foo FOO] [--bar BAR] spam
        `
    help = this.usage + `\

        Keep the formatting
            exactly as it is written

        here

        positional arguments:
          spam        spam help

        optional arguments:
          -h, --help  show this help message and exit
          --foo FOO       foo help should also
                      appear as given here

        title:
              This text
            should be indented
              exactly like it is here

          --bar BAR   bar help
        `
    version = ''
}).run()


;(new class TestHelpRawDescription extends HelpTestCase {
    /* Test the RawTextHelpFormatter */

    parser_signature = Sig({
        prog: 'PROG', formatter_class: argparse.RawDescriptionHelpFormatter,
        description: 'Keep the formatting\n' +
                     '    exactly as it is written\n' +
                     '\n' +
                     'here\n' })

    argument_signatures = [
        Sig('--foo', { help: '  foo help should not\n' +
                             '    retain this odd formatting' }),
        Sig('spam', { help: 'spam help' }),
    ]
    argument_group_signatures = [
        [Sig('title', { description: '    This text\n' +
                                     '  should be indented\n' +
                                     '    exactly like it is here\n' }),
         [Sig('--bar', { help: 'bar help' })]],
    ]
    usage = `\
        usage: PROG [-h] [--foo FOO] [--bar BAR] spam
        `
    help = this.usage + `\

        Keep the formatting
            exactly as it is written

        here

        positional arguments:
          spam        spam help

        optional arguments:
          -h, --help  show this help message and exit
          --foo FOO   foo help should not retain this odd formatting

        title:
              This text
            should be indented
              exactly like it is here

          --bar BAR   bar help
        `
    version = ''
}).run()


;(new class TestHelpArgumentDefaults extends HelpTestCase {
    /* Test the ArgumentDefaultsHelpFormatter */

    parser_signature = Sig({
        prog: 'PROG', formatter_class: argparse.ArgumentDefaultsHelpFormatter,
        description: 'description' })

    argument_signatures = [
        Sig('--foo', { help: 'foo help - oh and by the way, %(default)s' }),
        Sig('--bar', { action: 'store_true', help: 'bar help' }),
        Sig('spam', { help: 'spam help' }),
        Sig('badger', { nargs: '?', default: 'wooden', help: 'badger help' }),
    ]
    argument_group_signatures = [
        [Sig('title', { description: 'description' }),
         [Sig('--baz', { type: 'int', default: 42, help: 'baz help' })]],
    ]
    usage = `\
        usage: PROG [-h] [--foo FOO] [--bar] [--baz BAZ] spam [badger]
        `
    help = this.usage + `\

        description

        positional arguments:
          spam        spam help
          badger      badger help (default: wooden)

        optional arguments:
          -h, --help  show this help message and exit
          --foo FOO   foo help - oh and by the way, undefined
          --bar       bar help (default: false)

        title:
          description

          --baz BAZ   baz help (default: 42)
        `
    version = ''
}).run()

;(new class TestHelpVersionAction extends HelpTestCase {
    /* Test the default help for the version action */

    parser_signature = Sig({ prog: 'PROG', description: 'description' })
    argument_signatures = [Sig('-V', '--version', { action: 'version', version: '3.6' })]
    argument_group_signatures = []
    usage = `\
        usage: PROG [-h] [-V]
        `
    help = this.usage + `\

        description

        optional arguments:
          -h, --help     show this help message and exit
          -V, --version  show program's version number and exit
        `
    version = ''
}).run()


;(new class TestHelpVersionActionSuppress extends HelpTestCase {
    /* Test that the --version argument can be suppressed in help messages */

    parser_signature = Sig({ prog: 'PROG' })
    argument_signatures = [
        Sig('-v', '--version', { action: 'version', version: '1.0',
            help: argparse.SUPPRESS }),
        Sig('--foo', { help: 'foo help' }),
        Sig('spam', { help: 'spam help' }),
    ]
    argument_group_signatures = []
    usage = `\
        usage: PROG [-h] [--foo FOO] spam
        `
    help = this.usage + `\

        positional arguments:
          spam        spam help

        optional arguments:
          -h, --help  show this help message and exit
          --foo FOO   foo help
        `
}).run()


;(new class TestHelpSubparsersOrdering extends HelpTestCase {
    /* Test ordering of subcommands in help matches the code */
    parser_signature = Sig({ prog: 'PROG',
                             description: 'display some subcommands' })
    argument_signatures = [Sig('-v', '--version', { action: 'version', version: '0.1' })]

    subparsers_signatures = [ 'a', 'b', 'c', 'd', 'e' ].map(name => Sig({ name }))

    usage = `\
        usage: PROG [-h] [-v] {a,b,c,d,e} ...
        `

    help = this.usage + `\

        display some subcommands

        positional arguments:
          {a,b,c,d,e}

        optional arguments:
          -h, --help     show this help message and exit
          -v, --version  show program's version number and exit
        `

    version = `\
        0.1
        `
}).run()

;(new class TestHelpSubparsersWithHelpOrdering extends HelpTestCase {
    /* Test ordering of subcommands in help matches the code */
    parser_signature = Sig({ prog: 'PROG',
                             description: 'display some subcommands' })
    argument_signatures = [Sig('-v', '--version', { action: 'version', version: '0.1' })]

    subcommand_data = [['a', 'a subcommand help'],
                       ['b', 'b subcommand help'],
                       ['c', 'c subcommand help'],
                       ['d', 'd subcommand help'],
                       ['e', 'e subcommand help']]

    subparsers_signatures = this.subcommand_data.map(([ name, help ]) => Sig({ name, help }))

    usage = `\
        usage: PROG [-h] [-v] {a,b,c,d,e} ...
        `

    help = this.usage + `\

        display some subcommands

        positional arguments:
          {a,b,c,d,e}
            a            a subcommand help
            b            b subcommand help
            c            c subcommand help
            d            d subcommand help
            e            e subcommand help

        optional arguments:
          -h, --help     show this help message and exit
          -v, --version  show program's version number and exit
        `

    version = `\
        0.1
        `
}).run()



;(new class TestHelpMetavarTypeFormatter extends HelpTestCase {

    custom_type = string => string

    parser_signature = Sig({ prog: 'PROG', description: 'description',
                             formatter_class: argparse.MetavarTypeHelpFormatter })
    argument_signatures = [Sig('a', { type: 'int' }),
                           Sig('-b', { type: this.custom_type }),
                           Sig('-c', { type: 'float', metavar: 'SOME FLOAT' })]
    argument_group_signatures = []
    usage = `\
        usage: PROG [-h] [-b custom_type] [-c SOME FLOAT] int
        `
    help = this.usage + `\

        description

        positional arguments:
          int

        optional arguments:
          -h, --help      show this help message and exit
          -b custom_type
          -c SOME FLOAT
        `
    version = ''
}).run()


// =====================================
// Optional/Positional constructor tests
// =====================================

;(new class TestInvalidArgumentConstructors extends TestCase {
    /* Test a bunch of invalid Argument constructors */

    assertTypeError(...args) {
        let parser = argparse.ArgumentParser()
        this.assertRaises(TypeError, () => parser.add_argument(...args))
    }

    assertValueError(...args) {
        let parser = argparse.ArgumentParser()
        // same as TypeError in js
        this.assertRaises(TypeError, () => parser.add_argument(...args))
    }

    test_invalid_keyword_arguments() {
        this.assertTypeError('-x', { bar: undefined })
        this.assertTypeError('-y', { callback: 'foo' })
        this.assertTypeError('-y', { callback_args: [] })
        this.assertTypeError('-y', { callback_kwargs: {} })
    }

    test_missing_destination() {
        this.assertTypeError()
        for (let action of ['append', 'store']) {
            this.assertTypeError({ action })
        }
    }

    test_invalid_option_strings() {
        this.assertValueError('--')
        this.assertValueError('---')
    }

    test_invalid_type() {
        this.assertValueError('--foo', { type: 'Number' })
        this.assertValueError('--foo', { type: [ Number, Number ] })
    }

/*
    test_invalid_action() {
        this.assertValueError('-x', action='foo')
        this.assertValueError('foo', action='baz')
        this.assertValueError('--foo', action=('store', 'append'))
        parser = argparse.ArgumentParser()
        with this.assertRaises(ValueError) as cm:
            parser.add_argument("--foo", action="store-true")
        this.assertIn('unknown action', str(cm.exception))
    }

    test_multiple_dest() {
        parser = argparse.ArgumentParser()
        parser.add_argument(dest='foo')
        with this.assertRaises(ValueError) as cm:
            parser.add_argument('bar', dest='baz')
        this.assertIn('dest supplied twice for positional argument',
                      str(cm.exception))
    }

    test_no_argument_actions() {
        for action in ['store_const', 'store_true', 'store_false',
                       'append_const', 'count']:
            for attrs in [dict(type=int), dict(nargs='+'),
                          dict(choices='ab')]:
                this.assertTypeError('-x', action=action, **attrs)
    }

    test_no_argument_no_const_actions() {
        # options with zero arguments
        for action in ['store_true', 'store_false', 'count']:

            # const is always disallowed
            this.assertTypeError('-x', const='foo', action=action)

            # nargs is always disallowed
            this.assertTypeError('-x', nargs='*', action=action)
    }

    test_more_than_one_argument_actions() {
        for action in ['store', 'append']:

            # nargs=0 is disallowed
            this.assertValueError('-x', nargs=0, action=action)
            this.assertValueError('spam', nargs=0, action=action)

            # const is disallowed with non-optional arguments
            for nargs in [1, '*', '+']:
                this.assertValueError('-x', const='foo',
                                      nargs=nargs, action=action)
                this.assertValueError('spam', const='foo',
                                      nargs=nargs, action=action)
    }

    test_required_const_actions() {
        for action in ['store_const', 'append_const']:

            // nargs is always disallowed
            this.assertTypeError('-x', nargs='+', action=action)
    }

    test_parsers_action_missing_params() {
        this.assertTypeError('command', action='parsers')
        this.assertTypeError('command', action='parsers', prog='PROG')
        this.assertTypeError('command', action='parsers',
                             parser_class=argparse.ArgumentParser)
    }

    test_required_positional() {
        this.assertTypeError('foo', required=True)
    }

    test_user_defined_action() {

        class Success(Exception):
            pass

        class Action(object):

            def __init__(self,
                         option_strings,
                         dest,
                         const,
                         default,
                         required=False):
                if dest == 'spam':
                    if const is Success:
                        if default is Success:
                            raise Success()

            def __call__(self, *args, **kwargs):
                pass

        parser = argparse.ArgumentParser()
        this.assertRaises(Success, parser.add_argument, '--spam',
                          action=Action, default=Success, const=Success)
        this.assertRaises(Success, parser.add_argument, 'spam',
                          action=Action, default=Success, const=Success)
    }
*/
}).run()

// ================================
// Actions returned by add_argument
// ================================

;(new class TestActionsReturned extends TestCase {

    test_dest() {
        let parser = argparse.ArgumentParser()
        let action = parser.add_argument('--foo')
        this.assertEqual(action.dest, 'foo')
        action = parser.add_argument('-b', '--bar')
        this.assertEqual(action.dest, 'bar')
        action = parser.add_argument('-x', '-y')
        this.assertEqual(action.dest, 'x')
    }

    test_misc() {
        let parser = argparse.ArgumentParser()
        let action = parser.add_argument('--foo', { nargs: '?', const: 42,
                                         default: 84, type: 'int', choices: [1, 2],
                                         help: 'FOO', metavar: 'BAR', dest: 'baz' })
        this.assertEqual(action.nargs, '?')
        this.assertEqual(action.const, 42)
        this.assertEqual(action.default, 84)
        this.assertEqual(action.type, 'int')
        this.assertEqual(action.choices, [1, 2])
        this.assertEqual(action.help, 'FOO')
        this.assertEqual(action.metavar, 'BAR')
        this.assertEqual(action.dest, 'baz')
    }
}).run()


// ================================
// Argument conflict handling tests
// ================================

;(new class TestConflictHandling extends TestCase {

    test_bad_type() {
        this.assertRaises(TypeError,
                          () => argparse.ArgumentParser({ conflict_handler: 'foo' }))
    }

    test_conflict_error() {
        let parser = argparse.ArgumentParser()
        parser.add_argument('-x')
        this.assertRaises(argparse.ArgumentError,
                          () => parser.add_argument('-x'))
        parser.add_argument('--spam')
        this.assertRaises(argparse.ArgumentError,
                          () => parser.add_argument('--spam'))
    }

    test_resolve_error() {
        let get_parser = argparse.ArgumentParser
        let parser = get_parser({ prog: 'PROG', conflict_handler: 'resolve' })

        parser.add_argument('-x', { help: 'OLD X' })
        parser.add_argument('-x', { help: 'NEW X' })
        this.assertEqual(parser.format_help(), textwrap.dedent(`\
            usage: PROG [-h] [-x X]

            optional arguments:
              -h, --help  show this help message and exit
              -x X        NEW X
            `))

        parser.add_argument('--spam', { metavar: 'OLD_SPAM' })
        parser.add_argument('--spam', { metavar: 'NEW_SPAM' })
        this.assertEqual(parser.format_help(), textwrap.dedent(`\
            usage: PROG [-h] [-x X] [--spam NEW_SPAM]

            optional arguments:
              -h, --help       show this help message and exit
              -x X             NEW X
              --spam NEW_SPAM
            `))
    }
}).run()


// =============================
// Help and Version option tests
// =============================

;(new class TestOptionalsHelpVersionActions extends TestCase {
    /* Test the help and version actions */

    assertPrintHelpExit(parser, args_str) {
        let cm = this.assertRaises(ArgumentParserError, () =>
            parser.parse_args(args_str.split(/\s+/).filter(Boolean)))
        this.assertEqual(parser.format_help(), cm.exception.stdout)
    }

    assertArgumentParserError(parser, ...args) {
        this.assertRaises(ArgumentParserError, () => parser.parse_args(args))
    }

    test_version() {
        let parser = new ErrorRaisingArgumentParser()
        parser.add_argument('-v', '--version', { action: 'version', version: '1.0' })
        this.assertPrintHelpExit(parser, '-h')
        this.assertPrintHelpExit(parser, '--help')
        this.assertNotIn('format_version', parser)
    }

    test_version_format() {
        let parser = new ErrorRaisingArgumentParser({ prog: 'PPP' })
        parser.add_argument('-v', '--version', { action: 'version', version: '%(prog)s 3.5' })
        let cm = this.assertRaises(ArgumentParserError, () =>
            parser.parse_args(['-v']))
        this.assertEqual('PPP 3.5\n', cm.exception.stdout)
    }

    test_version_no_help() {
        let parser = new ErrorRaisingArgumentParser({ add_help: false })
        parser.add_argument('-v', '--version', { action: 'version', version: '1.0' })
        this.assertArgumentParserError(parser, '-h')
        this.assertArgumentParserError(parser, '--help')
        this.assertNotIn('format_version', parser)
    }

    test_version_action() {
        let parser = new ErrorRaisingArgumentParser({ prog: 'XXX' })
        parser.add_argument('-V', { action: 'version', version: '%(prog)s 3.7' })
        let cm = this.assertRaises(ArgumentParserError, () =>
            parser.parse_args(['-V']))
        this.assertEqual('XXX 3.7\n', cm.exception.stdout)
    }

    test_no_help() {
        let parser = new ErrorRaisingArgumentParser({ add_help: false })
        this.assertArgumentParserError(parser, '-h')
        this.assertArgumentParserError(parser, '--help')
        this.assertArgumentParserError(parser, '-v')
        this.assertArgumentParserError(parser, '--version')
    }

    test_alternate_help_version() {
        let parser = new ErrorRaisingArgumentParser()
        parser.add_argument('-x', { action: 'help' })
        parser.add_argument('-y', { action: 'version' })
        this.assertPrintHelpExit(parser, '-x')
        this.assertArgumentParserError(parser, '-v')
        this.assertArgumentParserError(parser, '--version')
        this.assertNotIn('format_version', parser)
    }

    test_help_version_extra_arguments() {
        let parser = new ErrorRaisingArgumentParser()
        parser.add_argument('--version', { action: 'version', version: '1.0' })
        parser.add_argument('-x', { action: 'store_true' })
        parser.add_argument('y')

        // try all combinations of valid prefixes and suffixes
        let valid_prefixes = ['', '-x', 'foo', '-x bar', 'baz -x']
        let valid_suffixes = valid_prefixes.concat(['--bad-option', 'foo bar baz'])
        for (let prefix of valid_prefixes) {
            let format
            for (let suffix of valid_suffixes) {
                format = sub('%s %%s %s', prefix, suffix)
            }
            this.assertPrintHelpExit(parser, sub(format, '-h'))
            this.assertPrintHelpExit(parser, sub(format, '--help'))
            this.assertNotIn('format_version', parser)
        }
    }
}).run()


// ======================
// str() and repr() tests
// ======================

;(new class TestStrings extends TestCase {
    /* Test str()  and repr() on Optionals and Positionals */

    assertStringEqual(obj, result_string) {
        let str = String, repr = util.inspect
        for (let func of [str, repr]) {
            this.assertEqual(func(obj), result_string)
        }
    }

    test_optional() {
        let option = argparse.Action({
            option_strings: ['--foo', '-a', '-b'],
            dest: 'b',
            type: 'int',
            nargs: '+',
            default: 42,
            choices: [1, 2, 3],
            help: 'HELP',
            metavar: 'METAVAR' })
        let string = (
            "Action(option_strings=[ '--foo', '-a', '-b' ], dest='b', " +
            "nargs='+', const=undefined, default=42, type='int', " +
            "choices=[ 1, 2, 3 ], help='HELP', metavar='METAVAR')")
        this.assertStringEqual(option, string)
    }

    test_argument() {
        let argument = argparse.Action({
            option_strings: [],
            dest: 'x',
            type: Number,
            nargs: '?',
            default: 2.5,
            choices: [0.5, 1.5, 2.5],
            help: 'H HH H',
            metavar: 'MV MV MV' })
        let string = sub(
            "Action(option_strings=[], dest='x', nargs='?', " +
            "const=undefined, default=2.5, type=%r, choices=[ 0.5, 1.5, 2.5 ], " +
            "help='H HH H', metavar='MV MV MV')", Number)
        this.assertStringEqual(argument, string)
    }

    test_namespace() {
        let ns = argparse.Namespace({ foo: 42, bar: 'spam' })
        let string = "Namespace(foo=42, bar='spam')"
        this.assertStringEqual(ns, string)
    }

    test_namespace_starkwargs_notidentifier() {
        let ns = argparse.Namespace({'"': 'quote'})
        let string = `Namespace(**{ '"': 'quote' })`
        this.assertStringEqual(ns, string)
    }

    test_namespace_kwargs_and_starkwargs_notidentifier() {
        let ns = argparse.Namespace({ a: 1, '"': 'quote'})
        let string = `Namespace(a=1, **{ '"': 'quote' })`
        this.assertStringEqual(ns, string)
    }

    test_namespace_starkwargs_identifier() {
        let ns = argparse.Namespace({valid: true})
        let string = "Namespace(valid=true)"
        this.assertStringEqual(ns, string)
    }

    test_parser() {
        let parser = argparse.ArgumentParser({ prog: 'PROG' })
        let string = sub(
            "ArgumentParser(prog='PROG', usage=undefined, description=undefined, " +
            "formatter_class=%r, conflict_handler='error', " +
            "add_help=true)", argparse.HelpFormatter)
        this.assertStringEqual(parser, string)
    }
}).run()

// ===============
// Namespace tests
// ===============

;(new class TestNamespace extends TestCase {

    test_constructor() {
        let ns = argparse.Namespace({ a: 42, b: 'spam' })
        this.assertEqual(ns.a, 42)
        this.assertEqual(ns.b, 'spam')
    }

    test_equality() {
        let ns1 = argparse.Namespace({ a: 1, b: 2 })
        let ns2 = argparse.Namespace({ b: 2, a: 1 })
        let ns3 = argparse.Namespace({ a: 1 })
        let ns4 = argparse.Namespace({ b: 2 })

        this.assertEqual(ns1, ns2)
        this.assertNotEqual(ns1, ns3)
        this.assertNotEqual(ns1, ns4)
        this.assertNotEqual(ns2, ns3)
        this.assertNotEqual(ns2, ns4)
    }
}).run()


// ===================
// ArgumentError tests
// ===================

;(new class TestArgumentError extends TestCase {

    test_argument_error() {
        let msg = "my error here"
        let error = argparse.ArgumentError(undefined, msg)
        this.assertEqual(error.message, msg)
    }
}).run()

// =======================
// ArgumentTypeError tests
// =======================

;(new class TestArgumentTypeError extends TestCase {

    test_argument_type_error() {

        function spam(/*string*/) {
            throw argparse.ArgumentTypeError('spam!')
        }

        let parser = new ErrorRaisingArgumentParser({ prog: 'PROG', add_help: false })
        parser.add_argument('x', { type: spam })
        let cm = this.assertRaises(ArgumentParserError, () => parser.parse_args(['XXX']))
        this.assertEqual('usage: PROG x\nPROG: error: argument x: spam!\n',
                         cm.exception.stderr)
    }
}).run()

// =========================
// MessageContentError tests
// =========================

;(new class TestMessageContentError extends TestCase {

    test_missing_argument_name_in_message() {
        let parser = new ErrorRaisingArgumentParser({ prog: 'PROG', usage: '' })
        parser.add_argument('req_pos', { type: 'str' })
        parser.add_argument('-req_opt', { type: 'int', required: true })
        parser.add_argument('need_one', { type: 'str', nargs: '+' })

        let cm = this.assertRaises(ArgumentParserError, () =>
            parser.parse_args([]))
        let msg = String(cm.exception)
        this.assertRegex(msg, /req_pos/)
        this.assertRegex(msg, /req_opt/)
        this.assertRegex(msg, /need_one/)
        cm = this.assertRaises(ArgumentParserError, () =>
            parser.parse_args(['myXargument']))
        msg = String(cm.exception)
        this.assertNotRegex(msg, /req_pos/)
        this.assertRegex(msg, /req_opt/)
        this.assertRegex(msg, /need_one/)
        cm = this.assertRaises(ArgumentParserError, () =>
            parser.parse_args(['myXargument', '-req_opt=1']))
        msg = String(cm.exception)
        this.assertNotRegex(msg, /req_pos/)
        this.assertNotRegex(msg, /req_opt/)
        this.assertRegex(msg, /need_one/)
    }

    test_optional_optional_not_in_message() {
        let parser = new ErrorRaisingArgumentParser({ prog: 'PROG', usage: '' })
        parser.add_argument('req_pos', { type: 'str' })
        parser.add_argument('--req_opt', { type: 'int', required: true })
        parser.add_argument('--opt_opt', { type: Boolean, nargs: '?',
                            default: true })
        let cm = this.assertRaises(ArgumentParserError, () =>
            parser.parse_args([]))
        let msg = String(cm.exception)
        this.assertRegex(msg, /req_pos/)
        this.assertRegex(msg, /req_opt/)
        this.assertNotRegex(msg, /opt_opt/)
        cm = this.assertRaises(ArgumentParserError, () =>
            parser.parse_args(['--req_opt=1']))
        msg = String(cm.exception)
        this.assertRegex(msg, /req_pos/)
        this.assertNotRegex(msg, /req_opt/)
        this.assertNotRegex(msg, /opt_opt/)
    }

    test_optional_positional_not_in_message() {
        let parser = new ErrorRaisingArgumentParser({ prog: 'PROG', usage: '' })
        parser.add_argument('req_pos')
        parser.add_argument('optional_positional', { nargs: '?', default: 'eggs' })
        let cm = this.assertRaises(ArgumentParserError, () =>
            parser.parse_args([]))
        let msg = String(cm.exception)
        this.assertRegex(msg, /req_pos/)
        this.assertNotRegex(msg, /optional_positional/)
    }
}).run()


// ================================================
// Check that the type function is called only once
// ================================================

;(new class TestTypeFunctionCallOnlyOnce extends TestCase {

    test_type_function_call_only_once() {
        let spam = string_to_convert => {
            this.assertEqual(string_to_convert, 'spam!')
            return 'foo_converted'
        }

        let parser = argparse.ArgumentParser()
        parser.add_argument('--foo', { type: spam, default: 'bar' })
        let args = parser.parse_args('--foo spam!'.split(' '))
        this.assertEqual(NS({ foo: 'foo_converted' }), args)
    }
}).run()

// ==================================================================
// Check semantics regarding the default argument and type conversion
// ==================================================================

;(new class TestTypeFunctionCalledOnDefault extends TestCase {

    test_type_function_call_with_non_string_default() {
        let spam = int_to_convert => {
            this.assertEqual(int_to_convert, 0)
            return 'foo_converted'
        }

        let parser = argparse.ArgumentParser()
        parser.add_argument('--foo', { type: spam, default: 0 })
        let args = parser.parse_args([])
        // foo should *not* be converted because its default is not a string.
        this.assertEqual(NS({ foo: 0 }), args)
    }

    test_type_function_call_with_string_default() {
        let spam = (/*int_to_convert*/) =>
            'foo_converted'

        let parser = argparse.ArgumentParser()
        parser.add_argument('--foo', { type: spam, default: '0' })
        let args = parser.parse_args([])
        // foo is converted because its default is a string.
        this.assertEqual(NS({ foo: 'foo_converted' }), args)
    }

    test_no_double_type_conversion_of_default() {
        let extend = str_to_convert =>
            str_to_convert + '*'

        let parser = argparse.ArgumentParser()
        parser.add_argument('--test', { type: extend, default: '*' })
        let args = parser.parse_args([])
        // The test argument will be two stars, one coming from the default
        // value and one coming from the type conversion being called exactly
        // once.
        this.assertEqual(NS({ test: '**' }), args)
    }

    test_issue_15906() {
        // Issue #15906: When action='append', type=str, default=[] are
        // providing, the dest value was the string representation "[]" when it
        // should have been an empty list.
        let parser = argparse.ArgumentParser()
        parser.add_argument('--test', { dest: 'test', type: 'str',
                            default: [], action: 'append' })
        let args = parser.parse_args([])
        this.assertEqual(args.test, [])
    }
}).run()

// ======================
// parse_known_args tests
// ======================

;(new class TestParseKnownArgs extends TestCase {

    /*test_arguments_tuple() {
        let parser = argparse.ArgumentParser()
        parser.parse_args([])
    }*/

    test_arguments_list() {
        let parser = argparse.ArgumentParser()
        parser.parse_args([])
    }

    /*test_arguments_tuple_positional() {
        let parser = argparse.ArgumentParser()
        parser.add_argument('x')
        parser.parse_args(['x'])
    }*/

    test_arguments_list_positional() {
        let parser = argparse.ArgumentParser()
        parser.add_argument('x')
        parser.parse_args(['x'])
    }

    test_optionals() {
        let parser = argparse.ArgumentParser()
        parser.add_argument('--foo')
        let [ args, extras ] = parser.parse_known_args('--foo F --bar --baz'.split(' '))
        this.assertEqual(NS({ foo: 'F' }), args)
        this.assertEqual(['--bar', '--baz'], extras)
    }

    test_mixed() {
        let parser = argparse.ArgumentParser()
        parser.add_argument('-v', { nargs: '?', const: 1, type: 'int' })
        parser.add_argument('--spam', { action: 'store_false' })
        parser.add_argument('badger')

        let argv = ["B", "C", "--foo", "-v", "3", "4"]
        let [ args, extras ] = parser.parse_known_args(argv)
        this.assertEqual(NS({ v: 3, spam: true, badger: "B" }), args)
        this.assertEqual(["C", "--foo", "4"], extras)
    }
}).run()

// ===========================
// parse_intermixed_args tests
// ===========================

;(new class TestIntermixedArgs extends TestCase {
    test_basic() {
        // test parsing intermixed optionals and positionals
        let parser = argparse.ArgumentParser({ prog: 'PROG' })
        parser.add_argument('--foo', { dest: 'foo' })
        let bar = parser.add_argument('--bar', { dest: 'bar', required: true })
        parser.add_argument('cmd')
        parser.add_argument('rest', { nargs: '*', type: 'int' })
        let argv = 'cmd --foo x 1 --bar y 2 3'.split(' ')
        let args = parser.parse_intermixed_args(argv)
        // rest gets [1,2,3] despite the foo and bar strings
        this.assertEqual(NS({ bar: 'y', cmd: 'cmd', foo: 'x', rest: [1, 2, 3] }), args)

        let extras
        ;[ args, extras ] = parser.parse_known_args(argv)
        // cannot parse the '1,2,3'
        this.assertEqual(NS({ bar: 'y', cmd: 'cmd', foo: 'x', rest: [] }), args)
        this.assertEqual(["1", "2", "3"], extras)

        argv = 'cmd --foo x 1 --error 2 --bar y 3'.split(' ')
        ;[ args, extras ] = parser.parse_known_intermixed_args(argv)
        // unknown optionals go into extras
        this.assertEqual(NS({ bar: 'y', cmd: 'cmd', foo: 'x', rest: [1] }), args)
        this.assertEqual(['--error', '2', '3'], extras)

        // restores attributes that were temporarily changed
        this.assertIsNone(parser.usage)
        this.assertEqual(bar.required, true)
    }

    test_remainder() {
        // Intermixed and remainder are incompatible
        let parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        parser.add_argument('-z')
        parser.add_argument('x')
        parser.add_argument('y', { nargs: '...' })
        let argv = 'X A B -z Z'.split(' ')
        // intermixed fails with '...' (also 'A...')
        // this.assertRaises(TypeError, parser.parse_intermixed_args, argv)
        let cm = this.assertRaises(TypeError, () => parser.parse_intermixed_args(argv))
        this.assertRegex(String(cm.exception), /\.\.\./)
    }

    test_exclusive() {
        // mutually exclusive group; intermixed works fine
        let parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        let group = parser.add_mutually_exclusive_group({ required: true })
        group.add_argument('--foo', { action: 'store_true', help: 'FOO' })
        group.add_argument('--spam', { help: 'SPAM' })
        parser.add_argument('badger', { nargs: '*', default: 'X', help: 'BADGER' })
        let args = parser.parse_intermixed_args('1 --foo 2'.split(' '))
        this.assertEqual(NS({ badger: ['1', '2'], foo: true, spam: undefined }), args)
        this.assertRaises(ArgumentParserError, () => parser.parse_intermixed_args('1 2'.split(' ')))
        this.assertEqual(group.required, true)
    }

    test_exclusive_incompatible() {
        // mutually exclusive group including positional - fail
        let parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        let group = parser.add_mutually_exclusive_group({ required: true })
        group.add_argument('--foo', { action: 'store_true', help: 'FOO' })
        group.add_argument('--spam', { help: 'SPAM' })
        group.add_argument('badger', { nargs: '*', default: 'X', help: 'BADGER' })
        this.assertRaises(TypeError, () => parser.parse_intermixed_args([]))
        this.assertEqual(group.required, true)
    }
}).run()

;(new class TestIntermixedMessageContentError extends TestCase {
    // case where Intermixed gives different error message
    // error is raised by 1st parsing step
    test_missing_argument_name_in_message() {
        let parser = new ErrorRaisingArgumentParser({ prog: 'PROG', usage: '' })
        parser.add_argument('req_pos', { type: 'str' })
        parser.add_argument('-req_opt', { type: 'int', required: true })

        let cm = this.assertRaises(ArgumentParserError, () => parser.parse_args([]))
        let msg = String(cm.exception)
        this.assertRegex(msg, /req_pos/)
        this.assertRegex(msg, /req_opt/)

        cm = this.assertRaises(ArgumentParserError, () => parser.parse_intermixed_args([]))
        msg = String(cm.exception)
        this.assertNotRegex(msg, /req_pos/)
        this.assertRegex(msg, /req_opt/)
    }
}).run()

// ==========================
// add_argument metavar tests
// ==========================

;(new class TestAddArgumentMetavar extends TestCase {

    EXPECTED_MESSAGE = "length of metavar tuple does not match nargs"

    do_test_no_exception({ nargs, metavar }) {
        let parser = argparse.ArgumentParser()
        parser.add_argument("--foo", { nargs, metavar })
    }

    do_test_exception({ nargs, metavar }) {
        let parser = argparse.ArgumentParser()
        let cm = this.assertRaises(TypeError, () => parser.add_argument("--foo", { nargs, metavar }))
        this.assertEqual(cm.exception.message, this.EXPECTED_MESSAGE)
    }

    // Unit tests for different values of metavar when nargs=None

    test_nargs_None_metavar_string() {
        this.do_test_no_exception({ nargs: undefined, metavar: "1" })
    }

    test_nargs_undefined_metavar_length0() {
        this.do_test_exception({ nargs: undefined, metavar: [] })
    }

    test_nargs_undefined_metavar_length1() {
        this.do_test_no_exception({ nargs: undefined, metavar: ["1"] })
    }

    test_nargs_undefined_metavar_length2() {
        this.do_test_exception({ nargs: undefined, metavar: ["1", "2"] })
    }

    test_nargs_undefined_metavar_length3() {
        this.do_test_exception({ nargs: undefined, metavar: ["1", "2", "3"] })
    }

    // Unit tests for different values of metavar when nargs=?

    test_nargs_optional_metavar_string() {
        this.do_test_no_exception({ nargs: "?", metavar: "1" })
    }

    test_nargs_optional_metavar_length0() {
        this.do_test_exception({ nargs: "?", metavar: [] })
    }

    test_nargs_optional_metavar_length1() {
        this.do_test_no_exception({ nargs: "?", metavar: ["1"] })
    }

    test_nargs_optional_metavar_length2() {
        this.do_test_exception({ nargs: "?", metavar: ["1", "2"] })
    }

    test_nargs_optional_metavar_length3() {
        this.do_test_exception({ nargs: "?", metavar: ["1", "2", "3"] })
    }

    // Unit tests for different values of metavar when nargs=*

    test_nargs_zeroormore_metavar_string() {
        this.do_test_no_exception({ nargs: "*", metavar: "1" })
    }

    test_nargs_zeroormore_metavar_length0() {
        this.do_test_exception({ nargs: "*", metavar: [] })
    }

    test_nargs_zeroormore_metavar_length1() {
        this.do_test_no_exception({ nargs: "*", metavar: ["1"] })
    }

    test_nargs_zeroormore_metavar_length2() {
        this.do_test_no_exception({ nargs: "*", metavar: ["1", "2"] })
    }

    test_nargs_zeroormore_metavar_length3() {
        this.do_test_exception({ nargs: "*", metavar: ["1", "2", "3"] })
    }

    // Unit tests for different values of metavar when nargs=+

    test_nargs_oneormore_metavar_string() {
        this.do_test_no_exception({ nargs: "+", metavar: "1" })
    }

    test_nargs_oneormore_metavar_length0() {
        this.do_test_exception({ nargs: "+", metavar: [] })
    }

    test_nargs_oneormore_metavar_length1() {
        this.do_test_exception({ nargs: "+", metavar: ["1"] })
    }

    test_nargs_oneormore_metavar_length2() {
        this.do_test_no_exception({ nargs: "+", metavar: ["1", "2"] })
    }

    test_nargs_oneormore_metavar_length3() {
        this.do_test_exception({ nargs: "+", metavar: ["1", "2", "3"] })
    }

    // Unit tests for different values of metavar when nargs=...

    test_nargs_remainder_metavar_string() {
        this.do_test_no_exception({ nargs: "...", metavar: "1" })
    }

    test_nargs_remainder_metavar_length0() {
        this.do_test_no_exception({ nargs: "...", metavar: [] })
    }

    test_nargs_remainder_metavar_length1() {
        this.do_test_no_exception({ nargs: "...", metavar: ["1"] })
    }

    test_nargs_remainder_metavar_length2() {
        this.do_test_no_exception({ nargs: "...", metavar: ["1", "2"] })
    }

    test_nargs_remainder_metavar_length3() {
        this.do_test_no_exception({ nargs: "...", metavar: ["1", "2", "3"] })
    }

    // Unit tests for different values of metavar when nargs=A...

    test_nargs_parser_metavar_string() {
        this.do_test_no_exception({ nargs: "A...", metavar: "1" })
    }

    test_nargs_parser_metavar_length0() {
        this.do_test_exception({ nargs: "A...", metavar: [] })
    }

    test_nargs_parser_metavar_length1() {
        this.do_test_no_exception({ nargs: "A...", metavar: ["1"] })
    }

    test_nargs_parser_metavar_length2() {
        this.do_test_exception({ nargs: "A...", metavar: ["1", "2"] })
    }

    test_nargs_parser_metavar_length3() {
        this.do_test_exception({ nargs: "A...", metavar: ["1", "2", "3"] })
    }

    // Unit tests for different values of metavar when nargs=1

    test_nargs_1_metavar_string() {
        this.do_test_no_exception({ nargs: 1, metavar: "1" })
    }

    test_nargs_1_metavar_length0() {
        this.do_test_exception({ nargs: 1, metavar: [] })
    }

    test_nargs_1_metavar_length1() {
        this.do_test_no_exception({ nargs: 1, metavar: ["1"] })
    }

    test_nargs_1_metavar_length2() {
        this.do_test_exception({ nargs: 1, metavar: ["1", "2"] })
    }

    test_nargs_1_metavar_length3() {
        this.do_test_exception({ nargs: 1, metavar: ["1", "2", "3"] })
    }

    // Unit tests for different values of metavar when nargs=2

    test_nargs_2_metavar_string() {
        this.do_test_no_exception({ nargs: 2, metavar: "1" })
    }

    test_nargs_2_metavar_length0() {
        this.do_test_exception({ nargs: 2, metavar: [] })
    }

    test_nargs_2_metavar_length1() {
        this.do_test_exception({ nargs: 2, metavar: ["1"] })
    }

    test_nargs_2_metavar_length2() {
        this.do_test_no_exception({ nargs: 2, metavar: ["1", "2"] })
    }

    test_nargs_2_metavar_length3() {
        this.do_test_exception({ nargs: 2, metavar: ["1", "2", "3"] })
    }

    // Unit tests for different values of metavar when nargs=3

    test_nargs_3_metavar_string() {
        this.do_test_no_exception({ nargs: 3, metavar: "1" })
    }

    test_nargs_3_metavar_length0() {
        this.do_test_exception({ nargs: 3, metavar: [] })
    }

    test_nargs_3_metavar_length1() {
        this.do_test_exception({ nargs: 3, metavar: ["1"] })
    }

    test_nargs_3_metavar_length2() {
        this.do_test_exception({ nargs: 3, metavar: ["1", "2"] })
    }

    test_nargs_3_metavar_length3() {
        this.do_test_no_exception({ nargs: 3, metavar: ["1", "2", "3"] })
    }
}).run()


;(new class TestInvalidNargs extends TestCase {

    EXPECTED_INVALID_MESSAGE = "invalid nargs value"
    EXPECTED_RANGE_MESSAGE = ("nargs for store actions must be != 0; if you " +
                              "have nothing to store, actions such as store " +
                              "true or store const may be more appropriate")

    do_test_range_exception({ nargs }) {
        let parser = argparse.ArgumentParser()
        let cm = this.assertRaises(TypeError, () => parser.add_argument("--foo", { nargs }))
        this.assertEqual(cm.exception.message, this.EXPECTED_RANGE_MESSAGE)
    }

    do_test_invalid_exception({ nargs }) {
        let parser = argparse.ArgumentParser()
        let cm = this.assertRaises(TypeError, () => parser.add_argument("--foo", { nargs }))
        this.assertEqual(cm.exception.message, this.EXPECTED_INVALID_MESSAGE)
    }

    // Unit tests for different values of nargs

    test_nargs_alphabetic() {
        this.do_test_invalid_exception({ nargs: 'a' })
        this.do_test_invalid_exception({ nargs: "abcd" })
    }

    test_nargs_zero() {
        this.do_test_range_exception({ nargs: 0 })
    }
}).run()

// ============================
// from argparse import * tests
// ============================

;(new class TestWrappingMetavar extends TestCase {

    setUp() {
        super.setUp()
        this.parser = new ErrorRaisingArgumentParser(
            { prog: 'this_is_spammy_prog_with_a_long_name_sorry_about_the_name' }
        )
        // this metavar was triggering library assertion errors due to usage
        // message formatting incorrectly splitting on the ] chars within
        let metavar = '<http[s]://example:1234>'
        this.parser.add_argument('--proxy', { metavar })
    }

    test_help_with_metavar() {
        let help_text = this.parser.format_help()
        this.assertEqual(help_text, textwrap.dedent(`\
            usage: this_is_spammy_prog_with_a_long_name_sorry_about_the_name
                   [-h] [--proxy <http[s]://example:1234>]

            optional arguments:
              -h, --help            show this help message and exit
              --proxy <http[s]://example:1234>
            `))
    }
}).run()


;(new class TestExitOnError extends TestCase {

    setUp() {
        this.parser = argparse.ArgumentParser({ exit_on_error: false })
        this.parser.add_argument('--integers', { metavar: 'N', type: 'int' })
    }

    test_exit_on_error_with_good_args() {
        let ns = this.parser.parse_args('--integers 4'.split(' '))
        this.assertEqual(ns, argparse.Namespace({ integers: 4 }))
    }

    test_exit_on_error_with_bad_args() {
        this.assertRaises(argparse.ArgumentError, () => {
            this.parser.parse_args('--integers a'.split(' '))
        })
    }
}).run()
