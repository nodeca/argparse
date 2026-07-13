// Port of python's argparse module, version 3.14.6:
// https://github.com/python/cpython/blob/v3.14.6/Lib/test/test_argparse.py

// Copyright (C) 2010-2020 Python Software Foundation.
// Copyright (C) 2020 argparse.js authors

/* eslint-disable new-cap */


'use strict'

const assert = require('assert')
const child_process = require('child_process')
const { describe, it, beforeEach, afterEach } = require('node:test')
const { once } = require('events')
const fs = require('fs')
const os = require('os')
const path = require('path')
const stream = require('stream')
const util = require('util')
const argparse = require('../')
const _colorize = require('../lib/_colorize')
const textwrap = require('../lib/textwrap')
const sub = require('../lib/sub')


class JSTestCase {

    run () {
        describe(this.constructor.name, () => {
            let restore_color
            if (this.force_color !== undefined) {
                beforeEach(() => {
                    restore_color = force_color(this.force_color)
                })
            }
            for (const method of this) {
                if (method === 'setUp') {
                    beforeEach(() => this[method]())
                } else if (method === 'tearDown') {
                    afterEach(() => this[method]())
                } else if (typeof method === 'string' && method.startsWith('skip_test') &&
                    this[method] !== undefined) {
                    it.skip(method, () => this[method]())
                } else if (typeof method === 'string' && method.startsWith('test') &&
                    this[method] !== undefined) {
                    const test = () => this[method]()
                    if (this.force_not_colorized?.has(method)) {
                        it(method, () => {
                            const restore = force_color(false)
                            try {
                                test()
                            } finally {
                                restore()
                            }
                        })
                    } else {
                        it(method, test)
                    }
                }
            }
            if (this.force_color !== undefined) {
                afterEach(() => restore_color())
            }
        })
    }

    * [Symbol.iterator] () {

        let self = this
        const member_names = new Set()
        while (self) {
            for (const k of Reflect.ownKeys(self)) member_names.add(k)
            self = Object.getPrototypeOf(self)
        }
        yield * Array.from(member_names)

    }

    assertEqual (expected, actual)    { assert.deepStrictEqual(actual, expected) }
    assertNotEqual (expected, actual) { assert.notDeepStrictEqual(actual, expected) }
    assertIsNone (value)              { assert.strictEqual(value, undefined) }
    assertRegex (string, regex)       { assert.match(string, regex) }
    assertNotRegex (string, regex)    { assert.doesNotMatch(string, regex) }
    assertIn (key, object)            { assert(key in object) }
    assertNotIn (key, object)         { assert(!(key in object)) }
    assertRaises (error, fn) {
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
    constructor () {
        super()
        this.buffer = []
    }

    _write (chunk, enc, callback) {
        this.buffer.push(chunk)
        callback()
    }

    getvalue () {
        return Buffer.concat(this.buffer).toString('utf8')
    }
}


function captured_stderr (fn) {
    const old_stderr = Object.getOwnPropertyDescriptor(process, 'stderr')
    Object.defineProperty(process, 'stderr', { value: new StdIOBuffer() })
    try {
        fn()
        return process.stderr.getvalue()
    } finally {
        Object.defineProperty(process, 'stderr', old_stderr)
    }
}


function force_color (color) {
    const old_can_colorize = _colorize.can_colorize
    const env_names = ['FORCE_COLOR', 'NO_COLOR', 'PYTHON_COLORS']
    const old_env = env_names.map(name => ({
        name,
        present: Object.prototype.hasOwnProperty.call(process.env, name),
        value: process.env[name]
    }))

    _colorize.can_colorize = () => color
    for (const name of env_names) delete process.env[name]
    process.env[color ? 'FORCE_COLOR' : 'NO_COLOR'] = '1'

    return () => {
        _colorize.can_colorize = old_can_colorize
        for (const name of env_names) delete process.env[name]
        for (const { name, present, value } of old_env) {
            if (present) process.env[name] = value
        }
    }
}


class TestCase extends JSTestCase {

    setUp () {
        // The tests assume that line wrapping occurs at 80 columns, but this
        // behaviour can be overridden by setting the COLUMNS environment
        // variable.  To ensure that this width is used, set COLUMNS to 80.
        process.env.COLUMNS = '80'
    }
}


;(new class StdStreamTest extends TestCase {

    test_skip_invalid_stderr () {
        const parser = new argparse.ArgumentParser()
        const old_stderr = Object.getOwnPropertyDescriptor(process, 'stderr')
        const old_exit = Object.getOwnPropertyDescriptor(process, 'exit')
        Object.defineProperty(process, 'stderr', { value: undefined })
        Object.defineProperty(process, 'exit', { value: () => {} })
        try {
            parser.exit(0, 'foo')
        } finally {
            Object.defineProperty(process, 'stderr', old_stderr)
            Object.defineProperty(process, 'exit', old_exit)
        }
    }

    test_skip_invalid_stdout () {
        const parser = new argparse.ArgumentParser()
        for (const func of [
            parser.print_usage.bind(parser),
            parser.print_help.bind(parser),
            parser.parse_args.bind(parser, ['-h']),
        ]) {
            const mocked_stderr = new StdIOBuffer()
            const old_stdout = Object.getOwnPropertyDescriptor(process, 'stdout')
            const old_stderr = Object.getOwnPropertyDescriptor(process, 'stderr')
            const old_exit = Object.getOwnPropertyDescriptor(process, 'exit')
            Object.defineProperty(process, 'stdout', { value: undefined })
            Object.defineProperty(process, 'stderr', { value: mocked_stderr })
            Object.defineProperty(process, 'exit', { value: () => {} })
            try {
                func()
                this.assertRegex(mocked_stderr.getvalue(), /usage:/)
            } finally {
                Object.defineProperty(process, 'stdout', old_stdout)
                Object.defineProperty(process, 'stderr', old_stderr)
                Object.defineProperty(process, 'exit', old_exit)
            }
        }
    }
}).run()


function TempDirMixin (cls) {
    return class TempDirMixin extends cls {

        setUp () {
            this.temp_dir = path.join(os.tmpdir(), sub('test_argparse_%s', Math.random()))
            this.old_dir = process.cwd()
            fs.mkdirSync(this.temp_dir)
            process.chdir(this.temp_dir)
        }

        tearDown () {
            process.chdir(this.old_dir)
            fs.rmdirSync(this.temp_dir, { recursive: true })
        }

        create_readonly_file (filename) {
            const file_path = path.join(this.temp_dir, filename)
            fs.writeFileSync(file_path, filename)
            fs.chmodSync(file_path, 0o400)
        }
    }
}

function Sig (...args) {
    return args
}

function NS (dict) {
    return argparse.Namespace(dict)
}


class ArgumentParserError extends Error {

    constructor (message, stdout, stderr, error_code) {
        super()
        this.m = message
        this.stdout = stdout
        this.stderr = stderr
        this.error_code = error_code
        this.message = this.toString()
    }

    toString () {
        return '(' + [this.m, this.stdout, this.stderr, this.error_code].join(', ') + ')'
    }
}


class SystemExit extends Error {
    constructor (code) {
        super()
        this.code = code
    }
}


function stderr_to_parser_error (fn) {
    // if this is being called recursively and stderr or stdout is already being
    // redirected, simply call the function and let the enclosing function
    // catch the exception
    if (process.stderr instanceof StdIOBuffer || process.stdout instanceof StdIOBuffer) {
        return fn()
    }

    // if this is not being called recursively, redirect stderr and
    // use it as the ArgumentParserError message
    const old_stdout = Object.getOwnPropertyDescriptor(process, 'stdout')
    const old_stderr = Object.getOwnPropertyDescriptor(process, 'stderr')
    Object.defineProperty(process, 'stdout', { value: new StdIOBuffer() })
    Object.defineProperty(process, 'stderr', { value: new StdIOBuffer() })
    try {
        try {
            const result = fn()
            for (const key of Object.keys(result || {})) {
                if (result[key] === process.stdout) result[key] = old_stdout.get()
                if (result[key] === process.stderr) result[key] = old_stderr.get()
            }
            return result
        } catch (err) {
            if (!(err instanceof SystemExit)) throw err
            const code = err.code
            const stdout = process.stdout.getvalue()
            const stderr = process.stderr.getvalue()
            throw new ArgumentParserError(
                "SystemExit", stdout, stderr, code)
        }
    } finally {
        Object.defineProperty(process, 'stdout', old_stdout)
        Object.defineProperty(process, 'stderr', old_stderr)
    }
}


class ErrorRaisingArgumentParser extends argparse.ArgumentParser {

    parse_args (...args) {
        return stderr_to_parser_error(() => super.parse_args(...args))
    }

    exit (code, message) {
        return stderr_to_parser_error(() => {
            this._print_message(message, process.stderr)
            throw new SystemExit(code)
        })
    }

    error (...args) {
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

    constructor () {
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
        function no_groups (parser, argument_signatures) {
            /* Add all arguments directly to the parser */
            for (const sig of argument_signatures) {
                parser.add_argument(...sig)
            }
        }

        function one_group (parser, argument_signatures) {
            /* Add all arguments under a single group in the parser */
            const group = parser.add_argument_group('foo')
            for (const sig of argument_signatures) {
                group.add_argument(...sig)
            }
        }

        function many_groups (parser, argument_signatures) {
            /* Add each argument in its own group to the parser */
            for (const [i, sig] of Object.entries(argument_signatures)) {
                const group = parser.add_argument_group(sub('foo:%i', +i))
                group.add_argument(...sig)
            }
        }

        // --------------------------
        // functions for parsing args
        // --------------------------
        function listargs (parser, args) {
            /* Parse the args by passing in a list */
            return parser.parse_args(args)
        }

        function sysargs (parser, args) {
            /* Parse the args by defaulting to sys.argv */
            const old_sys_argv = process.argv
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

            constructor (tester_cls, add_arguments, parse_args) {
                this._add_arguments = add_arguments
                this._parse_args = parse_args

                const add_arguments_name = this._add_arguments.name
                const parse_args_name = this._parse_args.name
                for (const test_func of [this.test_failures, this.test_successes]) {
                    const func_name = test_func.name
                    const names = [func_name, add_arguments_name, parse_args_name]
                    const test_name = names.join('_')
                    tester_cls[test_name] = () => test_func.call(this, tester_cls)
                }
            }

            _get_parser (tester) {
                const parser = new tester.parser_class(...tester.parser_signature)
                this._add_arguments(parser, tester.argument_signatures)
                return parser
            }

            test_failures (tester) {
                const parser = this._get_parser(tester)
                for (const args_str of tester.failures) {
                    const args = args_str.split(/\s+/).filter(Boolean)
                    tester.assertRaises(ArgumentParserError, () => parser.parse_args(args))
                }
            }

            test_successes (tester) {
                const parser = this._get_parser(tester)
                for (let [args, expected_ns] of tester.successes) {
                    if (typeof args === 'string') {
                        args = args.split(/\s+/).filter(Boolean)
                    }
                    const result_ns = tester._normalize_ns(this._parse_args(parser, args))
                    tester.assertEqual(expected_ns, result_ns)
                }
            }
        }

        // add tests for each combination of an optionals adding method
        // and an arg parsing method
        for (const add_arguments of [no_groups, one_group, many_groups]) {
            for (const parse_args of [listargs, sysargs]) {
                // eslint-disable-next-line no-new
                new AddTests(this, add_arguments, parse_args)
            }
        }
    }

    _normalize_ns (ns) {
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
                '-yx', '-yz a', '-yyyx', '-yyyza', '-xyza', '-x=']
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
    failures = ['-f', '-f a', '-fa', '-foa', '-foo', '-fo', '-foo b',
                '-f=a', '-foo=b']
    successes = [
        ['', NS({ foobar: undefined, foorab: undefined })],
        ['-foob a', NS({ foobar: 'a', foorab: undefined })],
        ['-foob=a', NS({ foobar: 'a', foorab: undefined })],
        ['-foor a', NS({ foobar: undefined, foorab: 'a' })],
        ['-foor=a', NS({ foobar: undefined, foorab: 'a' })],
        ['-fooba a', NS({ foobar: 'a', foorab: undefined })],
        ['-fooba=a', NS({ foobar: 'a', foorab: undefined })],
        ['-foora a', NS({ foobar: undefined, foorab: 'a' })],
        ['-foora=a', NS({ foobar: undefined, foorab: 'a' })],
        ['-foobar a', NS({ foobar: 'a', foorab: undefined })],
        ['-foobar=a', NS({ foobar: 'a', foorab: undefined })],
        ['-foorab a', NS({ foobar: undefined, foorab: 'a' })],
        ['-foorab=a', NS({ foobar: undefined, foorab: 'a' })],
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
    failures = ['--bar', '--b', '--ba', '--b=2', '--ba=4', '--badge 5']
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
    failures = ['--bar', '--b', '--ba', '--b=2', '--badge 5']
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
        Sig('-z', { nargs: '?', type: 'int', const: '42', default: '84', choices: [1, 2] }),
    ]
    failures = ['2', '-z a', '-z 42', '-z 84']
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
    failures = ['a', '-f d', '-f ab', '-fad', '-ga', '-g 6']
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

    test_const () {
        // See bpo-40862
        const parser = argparse.ArgumentParser()
        const cm = this.assertRaises(TypeError, () =>
            parser.add_argument('--foo', { const: true, action: argparse.BooleanOptionalAction }))

        this.assertRegex(String(cm.exception), /got an unexpected keyword argument 'const'/)
    }

    test_invalid_name () {
        const parser = argparse.ArgumentParser()
        const cm = this.assertRaises(TypeError, () =>
            parser.add_argument('--no-foo', { action: argparse.BooleanOptionalAction }))
        this.assertEqual(
            "invalid option name '--no-foo' for BooleanOptionalAction",
            cm.exception.message)
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


;(new class TestConstActionsMissingConstKwarg extends ParserTestCase {
    /* Tests that const gets default value of undefined when not provided */

    argument_signatures = [
        Sig('-f', { action: 'append_const' }),
        Sig('--foo', { action: 'append_const' }),
        Sig('-b', { action: 'store_const' }),
        Sig('--bar', { action: 'store_const' }),
    ]
    failures = ['-f v', '--foo=bar', '--foo bar']
    successes = [
        ['', NS({ f: undefined, foo: undefined, b: undefined, bar: undefined })],
        ['-f', NS({ f: [undefined], foo: undefined, b: undefined, bar: undefined })],
        ['--foo', NS({ f: undefined, foo: [undefined], b: undefined, bar: undefined })],
        ['-b', NS({ f: undefined, foo: undefined, b: undefined, bar: undefined })],
        ['--bar', NS({ f: undefined, foo: undefined, b: undefined, bar: undefined })],
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
        ['--foo=7', NS({ foo: '7', foobaz: undefined, fooble: false })],
        ['--fooba a', NS({ foo: undefined, foobaz: 'a', fooble: false })],
        ['--fooba=a', NS({ foo: undefined, foobaz: 'a', fooble: false })],
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


;(new class TestOptionalsDisallowSingleDashLongAbbreviation extends ParserTestCase {
    /* Do not allow abbreviations of long options at all */

    parser_signature = Sig({ allow_abbrev: false })
    argument_signatures = [
        Sig('-foo'),
        Sig('-foodle', { action: 'store_true' }),
        Sig('-foonly'),
    ]
    failures = ['-foon 3', '-food', '-food -foo 2']
    successes = [
        ['', NS({ foo: undefined, foodle: false, foonly: undefined })],
        ['-foo 3', NS({ foo: '3', foodle: false, foonly: undefined })],
        ['-foonly 7 -foodle -foo 2', NS({ foo: '2', foodle: true, foonly: '7' })],
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


class Color extends String {}
Color.RED = new Color('red')
Color.GREEN = new Color('green')
Color.BLUE = new Color('blue')

const colors = [Color.RED, Color.GREEN, Color.BLUE]

;(new class TestStrEnumChoices extends TestCase {
    force_not_colorized = new Set(['test_help_message_contains_enum_choices'])

    test_parse_enum_value () {
        const parser = argparse.ArgumentParser()
        parser.add_argument('--color', {
            choices: colors,
            type: value => colors.find(color => String(color) === value) || value
        })
        const args = parser.parse_args(['--color', 'red'])
        this.assertEqual(Color.RED, args.color)
    }

    test_help_message_contains_enum_choices () {
        const parser = argparse.ArgumentParser()
        parser.add_argument('--color', { choices: colors, help: 'Choose a color' })
        this.assertRegex(parser.format_usage(), /\[--color \{red,green,blue\}\]/)
        this.assertRegex(parser.format_help(), /  --color \{red,green,blue\}/)
    }

    test_invalid_enum_value_raises_error () {
        const parser = argparse.ArgumentParser({ exit_on_error: false })
        parser.add_argument('--color', { choices: colors })
        const cm = this.assertRaises(argparse.ArgumentError, () =>
            parser.parse_args(['--color', 'yellow']))
        this.assertRegex(
            String(cm.exception),
            /invalid choice: 'yellow' \(choose from 'red', 'green', 'blue'\)/)
    }
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

    argument_signatures = [Sig('foo', { nargs: '*', default: 'bar', choices: ['a', 'b'] })]
    failures = ['-x', 'bar', 'a c']
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

    argument_signatures = [Sig('foo', { nargs: '?', default: 42, choices: ['a', 'b'] })]
    failures = ['-x', 'a b', '42']
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
        Sig('foo', { nargs: '?', type: 'int', default: '42', choices: [1, 2] }),
    ]
    failures = ['-x', 'a b', '1 2', '42']
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

    argument_signatures = [Sig('-x'), Sig('foo'), Sig('bar', { nargs: '*' })]
    failures = ['', '--foo', 'a b -x X c']
    successes = [
        ['a', NS({ x: undefined, foo: 'a', bar: [] })],
        ['a b', NS({ x: undefined, foo: 'a', bar: ['b'] })],
        ['a b c', NS({ x: undefined, foo: 'a', bar: ['b', 'c'] })],
        ['-x X a', NS({ x: 'X', foo: 'a', bar: [] })],
        ['a -x X', NS({ x: 'X', foo: 'a', bar: [] })],
        ['-x X a b', NS({ x: 'X', foo: 'a', bar: ['b'] })],
        ['a -x X b', NS({ x: 'X', foo: 'a', bar: ['b'] })],
        ['a b -x X', NS({ x: 'X', foo: 'a', bar: ['b'] })],
        ['-x X a b c', NS({ x: 'X', foo: 'a', bar: ['b', 'c'] })],
        ['a -x X b c', NS({ x: 'X', foo: 'a', bar: ['b', 'c'] })],
        ['a b c -x X', NS({ x: 'X', foo: 'a', bar: ['b', 'c'] })],
    ]
}).run()


;(new class TestPositionalsNargsNoneOneOrMore extends ParserTestCase {
    /* Test a Positional with no nargs followed by one with one or more */

    argument_signatures = [Sig('-x'), Sig('foo'), Sig('bar', { nargs: '+' })]
    failures = ['', '--foo', 'a', 'a b -x X c']
    successes = [
        ['a b', NS({ x: undefined, foo: 'a', bar: ['b'] })],
        ['a b c', NS({ x: undefined, foo: 'a', bar: ['b', 'c'] })],
        ['-x X a b', NS({ x: 'X', foo: 'a', bar: ['b'] })],
        ['a -x X b', NS({ x: 'X', foo: 'a', bar: ['b'] })],
        ['a b -x X', NS({ x: 'X', foo: 'a', bar: ['b'] })],
        ['-x X a b c', NS({ x: 'X', foo: 'a', bar: ['b', 'c'] })],
        ['a -x X b c', NS({ x: 'X', foo: 'a', bar: ['b', 'c'] })],
        ['a b c -x X', NS({ x: 'X', foo: 'a', bar: ['b', 'c'] })],
    ]
}).run()


;(new class TestPositionalsNargsNoneOptional extends ParserTestCase {
    /* Test a Positional with no nargs followed by one with an Optional */

    argument_signatures = [Sig('-x'), Sig('foo'), Sig('bar', { nargs: '?' })]
    failures = ['', '--foo', 'a b c']
    successes = [
        ['a', NS({ x: undefined, foo: 'a', bar: undefined })],
        ['a b', NS({ x: undefined, foo: 'a', bar: 'b' })],
        ['-x X a', NS({ x: 'X', foo: 'a', bar: undefined })],
        ['a -x X', NS({ x: 'X', foo: 'a', bar: undefined })],
        ['-x X a b', NS({ x: 'X', foo: 'a', bar: 'b' })],
        ['a -x X b', NS({ x: 'X', foo: 'a', bar: 'b' })],
        ['a b -x X', NS({ x: 'X', foo: 'a', bar: 'b' })],
    ]
}).run()


;(new class TestPositionalsNargsZeroOrMoreNone extends ParserTestCase {
    /* Test a Positional with unlimited nargs followed by one with none */

    argument_signatures = [Sig('-x'), Sig('foo', { nargs: '*' }), Sig('bar')]
    failures = ['', '--foo', 'a -x X b', 'a -x X b c', 'a b -x X c']
    successes = [
        ['a', NS({ x: undefined, foo: [], bar: 'a' })],
        ['a b', NS({ x: undefined, foo: ['a'], bar: 'b' })],
        ['a b c', NS({ x: undefined, foo: ['a', 'b'], bar: 'c' })],
        ['-x X a', NS({ x: 'X', foo: [], bar: 'a' })],
        ['a -x X', NS({ x: 'X', foo: [], bar: 'a' })],
        ['-x X a b', NS({ x: 'X', foo: ['a'], bar: 'b' })],
        ['a b -x X', NS({ x: 'X', foo: ['a'], bar: 'b' })],
        ['-x X a b c', NS({ x: 'X', foo: ['a', 'b'], bar: 'c' })],
        ['a b c -x X', NS({ x: 'X', foo: ['a', 'b'], bar: 'c' })],
    ]
}).run()


;(new class TestPositionalsNargsOneOrMoreNone extends ParserTestCase {
    /* Test a Positional with one or more nargs followed by one with none */

    argument_signatures = [Sig('-x'), Sig('foo', { nargs: '+' }), Sig('bar')]
    failures = ['', '--foo', 'a', 'a -x X b c', 'a b -x X c']
    successes = [
        ['a b', NS({ x: undefined, foo: ['a'], bar: 'b' })],
        ['a b c', NS({ x: undefined, foo: ['a', 'b'], bar: 'c' })],
        ['-x X a b', NS({ x: 'X', foo: ['a'], bar: 'b' })],
        ['a -x X b', NS({ x: 'X', foo: ['a'], bar: 'b' })],
        ['a b -x X', NS({ x: 'X', foo: ['a'], bar: 'b' })],
        ['-x X a b c', NS({ x: 'X', foo: ['a', 'b'], bar: 'c' })],
        ['a b c -x X', NS({ x: 'X', foo: ['a', 'b'], bar: 'c' })],
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
    failures = ['', '--foo',]
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
        Sig('-x'),
        Sig('foo'),
        Sig('bar', { nargs: '*' }),
        Sig('baz', { nargs: 1 }),
    ]
    failures = ['', '--foo', 'a', 'a b -x X c']
    successes = [
        ['a b', NS({ x: undefined, foo: 'a', bar: [], baz: ['b'] })],
        ['a b c', NS({ x: undefined, foo: 'a', bar: ['b'], baz: ['c'] })],
        ['-x X a b', NS({ x: 'X', foo: 'a', bar: [], baz: ['b'] })],
        ['a -x X b', NS({ x: 'X', foo: 'a', bar: [], baz: ['b'] })],
        ['a b -x X', NS({ x: 'X', foo: 'a', bar: [], baz: ['b'] })],
        ['-x X a b c', NS({ x: 'X', foo: 'a', bar: ['b'], baz: ['c'] })],
        ['a -x X b c', NS({ x: 'X', foo: 'a', bar: ['b'], baz: ['c'] })],
        ['a b c -x X', NS({ x: 'X', foo: 'a', bar: ['b'], baz: ['c'] })],
    ]
}).run()


;(new class TestPositionalsNargsNoneOneOrMore1 extends ParserTestCase {
    /* Test three Positionals: no nargs, one or more nargs and 1 nargs */

    argument_signatures = [
        Sig('-x'),
        Sig('foo'),
        Sig('bar', { nargs: '+' }),
        Sig('baz', { nargs: 1 }),
    ]
    failures = ['', '--foo', 'a', 'b', 'a b -x X c d', 'a b c -x X d']
    successes = [
        ['a b c', NS({ x: undefined, foo: 'a', bar: ['b'], baz: ['c'] })],
        ['a b c d', NS({ x: undefined, foo: 'a', bar: ['b', 'c'], baz: ['d'] })],
        ['-x X a b c', NS({ x: 'X', foo: 'a', bar: ['b'], baz: ['c'] })],
        ['a -x X b c', NS({ x: 'X', foo: 'a', bar: ['b'], baz: ['c'] })],
        ['a b -x X c', NS({ x: 'X', foo: 'a', bar: ['b'], baz: ['c'] })],
        ['a b c -x X', NS({ x: 'X', foo: 'a', bar: ['b'], baz: ['c'] })],
        ['-x X a b c d', NS({ x: 'X', foo: 'a', bar: ['b', 'c'], baz: ['d'] })],
        ['a -x X b c d', NS({ x: 'X', foo: 'a', bar: ['b', 'c'], baz: ['d'] })],
        ['a b c d -x X', NS({ x: 'X', foo: 'a', bar: ['b', 'c'], baz: ['d'] })],
    ]
}).run()


;(new class TestPositionalsNargsNoneOptional1 extends ParserTestCase {
    /* Test three Positionals: no nargs, optional narg and 1 nargs */

    argument_signatures = [
        Sig('-x'),
        Sig('foo'),
        Sig('bar', { nargs: '?', default: 0.625 }),
        Sig('baz', { nargs: 1 }),
    ]
    failures = ['', '--foo', 'a', 'a b -x X c']
    successes = [
        ['a b', NS({ x: undefined, foo: 'a', bar: 0.625, baz: ['b'] })],
        ['a b c', NS({ x: undefined, foo: 'a', bar: 'b', baz: ['c'] })],
        ['-x X a b', NS({ x: 'X', foo: 'a', bar: 0.625, baz: ['b'] })],
        ['a -x X b', NS({ x: 'X', foo: 'a', bar: 0.625, baz: ['b'] })],
        ['a b -x X', NS({ x: 'X', foo: 'a', bar: 0.625, baz: ['b'] })],
        ['-x X a b c', NS({ x: 'X', foo: 'a', bar: 'b', baz: ['c'] })],
        ['a -x X b c', NS({ x: 'X', foo: 'a', bar: 'b', baz: ['c'] })],
        ['a b c -x X', NS({ x: 'X', foo: 'a', bar: 'b', baz: ['c'] })],
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

;(new class TestPositionalsActionExtend extends ParserTestCase {
    /* Test the 'extend' action */

    argument_signatures = [
        Sig('spam', { action: 'extend' }),
        Sig('spam', { action: 'extend', nargs: 2 }),
    ]
    failures = ['', '--foo', 'a', 'a b', 'a b c d']
    successes = [
        ['a b c', NS({ spam: ['a', 'b', 'c'] })],
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

;(new class TestOptionalsAndPositionalsAppend extends ParserTestCase {
    argument_signatures = [
        Sig('foo', { nargs: '*', action: 'append' }),
        Sig('--bar'),
    ]
    failures = ['-foo']
    successes = [
        ['a b', NS({ foo: [['a', 'b']], bar: undefined })],
        ['--bar a b', NS({ foo: [['b']], bar: 'a' })],
        ['a b --bar c', NS({ foo: [['a', 'b']], bar: 'c' })],
    ]
}).run()

;(new class TestOptionalsAndPositionalsExtend extends ParserTestCase {
    argument_signatures = [
        Sig('foo', { nargs: '*', action: 'extend' }),
        Sig('--bar'),
    ]
    failures = ['-foo']
    successes = [
        ['a b', NS({ foo: ['a', 'b'], bar: undefined })],
        ['--bar a b', NS({ foo: ['b'], bar: 'a' })],
        ['a b --bar c', NS({ foo: ['a', 'b'], bar: 'c' })],
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
        ['-z Z X A B', NS({ x: 'X', y: ['A', 'B'], z: 'Z' })],
        ['X -z Z A B', NS({ x: 'X', y: ['-z', 'Z', 'A', 'B'], z: undefined })],
        ['X A -z Z B', NS({ x: 'X', y: ['A', '-z', 'Z', 'B'], z: undefined })],
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
        Sig('foo', { nargs: '?', type: 'int', default: argparse.SUPPRESS }),
        Sig('bar', { nargs: '*', type: 'int', default: argparse.SUPPRESS }),
        Sig('--baz', { action: 'store_true', default: argparse.SUPPRESS }),
        Sig('--qux', { nargs: '?', type: 'int', default: argparse.SUPPRESS }),
        Sig('--quux', { nargs: '*', type: 'int', default: argparse.SUPPRESS }),
    ]
    failures = ['-x', 'a', '1 a']
    successes = [
        ['', NS({})],
        ['1', NS({ foo: 1 })],
        ['1 2', NS({ foo: 1, bar: [2] })],
        ['--baz', NS({ baz: true })],
        ['1 --baz', NS({ foo: 1, baz: true })],
        ['--baz 1 2', NS({ foo: 1, bar: [2], baz: true })],
        ['--qux', NS({ qux: undefined })],
        ['--qux 1', NS({ qux: 1 })],
        ['--quux', NS({ quux: [] })],
        ['--quux 1 2', NS({ quux: [1, 2] })],
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


const TempDirMixin_ParserTestCase = TempDirMixin(ParserTestCase)

;(new class TestArgumentsFromFile extends TempDirMixin_ParserTestCase {
    /* Test reading arguments from a file */

    setUp () {
        super.setUp()
        const file_texts = [
            ['hello', this.hello + '\n'],
            ['recursive', '-a\n' +
                          'A\n' +
                          '@hello'],
            ['invalid', '@no-such-path\n'],
        ]
        for (const [path, text] of file_texts) {
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
    hello = 'hello world!é'
    successes = [
        ['X Y', NS({ a: undefined, x: 'X', y: ['Y'] })],
        ['X -a A Y Z', NS({ a: 'A', x: 'X', y: ['Y', 'Z'] })],
        ['@hello X', NS({ a: undefined, x: this.hello, y: ['X'] })],
        ['X @hello', NS({ a: undefined, x: 'X', y: [this.hello] })],
        ['-a B @recursive Y Z', NS({ a: 'A', x: this.hello, y: ['Y', 'Z'] })],
        ['X @recursive Z -a B', NS({ a: 'B', x: 'X', y: [this.hello, 'Z'] })],
        [["-a", "", "X", "Y"], NS({ a: '', x: 'X', y: ['Y'] })],
    ]
}).run()


;(new class TestArgumentsFromFileConverter extends TempDirMixin_ParserTestCase {
    /* Test reading arguments from a file */

    setUp () {
        super.setUp()
        const file_texts = [
            ['hello', 'hello world!\n'],
        ]
        for (const [path, text] of file_texts) {
            fs.writeFileSync(path, text)
        }
    }

    FromFileConverterArgumentParser = class FromFileConverterArgumentParser extends ErrorRaisingArgumentParser {

        * convert_arg_line_to_args (arg_line) {
            for (const arg of arg_line.split(/\s+/).filter(Boolean)) {
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

function FileType (...args) {
    const emitWarning = process.emitWarning
    process.emitWarning = () => {}
    try {
        return argparse.FileType(...args)
    } finally {
        process.emitWarning = emitWarning
    }
}


;(new class TestFileTypeDeprecation extends TestCase {

    test () {
        const warnings = []
        const emitWarning = process.emitWarning
        process.emitWarning = (warning, type) => warnings.push([warning, type])
        try {
            argparse.FileType()
        } finally {
            process.emitWarning = emitWarning
        }
        this.assertEqual(1, warnings.length)
        this.assertRegex(warnings[0][0], /FileType is deprecated/)
        this.assertEqual('PendingDeprecationWarning', warnings[0][1])
    }
}).run()


;(new class TestFileTypeRepr extends TestCase {

    test_r () {
        const type = FileType('r')
        this.assertEqual("FileType('r')", sub('%r', type))
    }

    test_r_utf8 () {
        const type = FileType('r', { encoding: 'utf8' })
        this.assertEqual("FileType('r', encoding='utf8')", sub('%r', type))
    }

    test_w_utf8_0o400 () {
        const type = FileType('w', { encoding: 'utf8', mode: 0o400 })
        this.assertEqual("FileType('w', encoding='utf8', mode=0o400)",
                         sub('%r', type))
    }

    test_w_utf8_close () {
        const type = FileType('w', { encoding: 'utf8', emitClose: true })
        this.assertEqual("FileType('w', encoding='utf8', emitClose=true)",
                         sub('%r', type))
    }
}).run()


class StdStreamComparer {
    constructor (attr) {
        this.attr = attr
    }
}

const eq_stdin = new StdStreamComparer('stdin')
const eq_stdout = new StdStreamComparer('stdout')
const eq_stderr = new StdStreamComparer('stderr')


class FileTypeTestCase extends ParserTestCase {
    _normalize_ns (ns) {
        for (const key of Object.keys(ns)) {
            if (ns[key] === process.stdout) {
                ns[key] = eq_stdout
            } else if (ns[key] === process.stderr) {
                ns[key] = eq_stderr
            } else if (ns[key] === process.stdin) {
                ns[key] = eq_stdin
            } else if (ns[key] instanceof stream.Readable && ns[key].fd) {
                const fd = ns[key].fd
                const file_name = path.basename(ns[key].path)
                const contents = fs.readFileSync(fd, 'utf8')
                fs.closeSync(fd)
                ns[key] = new RFile(file_name, contents)
            } else if (ns[key] instanceof stream.Writable && ns[key].fd) {
                const fd = ns[key].fd
                const file_name = path.basename(ns[key].path)
                const contents = 'Check that file is writable.'
                fs.writeSync(fd, contents)
                fs.closeSync(fd)
                ns[key] = new WFile(file_name,
                                    fs.readFileSync(ns[key].path, 'utf8'))
            }
        }
        return ns
    }
}

const TempDirMixin_FileTypeTestCase = TempDirMixin(FileTypeTestCase)

class RFile {
    constructor (name, contents = name) {
        this.name = name
        this.contents = contents
    }
}


;(new class TestFileTypeR extends TempDirMixin_FileTypeTestCase {
    /* Test the FileType option/argument type for reading files */

    setUp () {
        super.setUp()
        for (const file_name of ['foo', 'bar']) {
            fs.writeFileSync(path.join(this.temp_dir, file_name), file_name)
        }
        this.create_readonly_file('readonly')
    }

    argument_signatures = [
        Sig('-x', { type: FileType() }),
        Sig('spam', { type: FileType('r') }),
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
    setUp () {
        super.setUp()
        const file = fs.openSync(path.join(this.temp_dir, 'good'), 'w')
        fs.writeSync(file, 'good')
        fs.closeSync(file)
    }

    argument_signatures = [
        Sig('-c', { type: FileType('r'), default: 'no-file.txt' }),
    ]
    // should provoke no such file error
    failures = ['']
    // should not provoke error because default file is created
    successes = [['-c good', NS({ c: new RFile('good') })]]
}).run()


class WFile {
    constructor (name, contents = 'Check that file is writable.') {
        this.name = name
        this.contents = contents
    }
}


;(new class TestFileTypeW extends TempDirMixin_FileTypeTestCase {
    /* Test the FileType option/argument type for writing files */

    setUp () {
        super.setUp()
        this.create_readonly_file('readonly')
    }

    argument_signatures = [
        Sig('-x', { type: FileType('w') }),
        Sig('spam', { type: FileType('w') }),
    ]
    failures = ['-x', '', 'readonly']
    successes = [
        ['foo', NS({ x: undefined, spam: new WFile('foo') })],
        ['-x foo bar', NS({ x: new WFile('foo'), spam: new WFile('bar') })],
        ['bar -x foo', NS({ x: new WFile('foo'), spam: new WFile('bar') })],
        ['-x - -', NS({ x: eq_stdout, spam: eq_stdout })],
    ]
}).run()


;(new class TestFileTypeStreams extends TempDirMixin(TestCase) {

    async test_read_stream () {
        fs.writeFileSync('readable', 'contents')
        const file = FileType('r')('readable')
        const chunks = []
        const closed = once(file, 'close')
        file.on('data', chunk => chunks.push(chunk))
        await closed
        this.assertEqual('readable', file.path)
        this.assertEqual('contents', Buffer.concat(chunks).toString())
        this.assertEqual(true, file.closed)
    }

    async test_write_stream () {
        const file = FileType('w')('writable')
        const closed = once(file, 'close')
        file.end('contents')
        await closed
        this.assertEqual('writable', file.path)
        this.assertEqual('contents', fs.readFileSync('writable', 'utf8'))
        this.assertEqual(true, file.closed)
    }
}).run()


;(new class TestFileTypeDashModes extends TestCase {

    test_read_modes () {
        for (const flags of ['r', 'rb']) {
            assert.strictEqual(FileType(flags)('-'), process.stdin)
        }
    }

    test_write_modes () {
        for (const flags of ['w', 'wb', 'a', 'ab', 'x', 'xb']) {
            assert.strictEqual(FileType(flags)('-'), process.stdout)
        }
    }
}).run()


;(new class TestFileTypeInvalid extends TestCase {
    test_invalid_file_type () {
        this.assertRaises(TypeError, () => FileType('b')('-test'))
    }
}).run()


;(new class TestFileTypeMissingInitialization extends TestCase {
    /*
     *  Test that add_argument throws an error if FileType class
     *  object was passed instead of instance of FileType
     */

    test () {
        const parser = argparse.ArgumentParser()
        const cm = this.assertRaises(TypeError, () =>
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
        constructor (value) {
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
        constructor (value) {
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

    test () {

        const get_my_type = string =>
            sub('my_type{%s}', string)

        const parser = argparse.ArgumentParser()
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

        call (parser, namespace, value, option_string = undefined) {
            try {
                // check destination and option string
                assert(this.dest === 'spam', sub('dest: %s', this.dest))
                assert(option_string === '-s', sub('flag: %s', option_string))
                // when option is before argument, badger=2, and when
                // option is after argument, badger=<whatever was set>
                const expected_ns = NS({ spam: 0.25 })
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
                const e = err.message
                throw new ArgumentParserError(sub('opt_action failed: %s', e))
            }
            namespace.spam = value
        }
    }

    PositionalAction = class PositionalAction extends argparse.Action {

        call (parser, namespace, value, option_string = undefined) {
            try {
                assert(option_string === undefined, sub('option_string: %s',
                                                        option_string))
                // check destination
                assert(this.dest === 'badger', sub('dest: %s', this.dest))
                // when argument is before option, spam=0.25, and when
                // option is after argument, spam=<whatever was set>
                const expected_ns = NS({ badger: 2 })
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
                const e = err.message
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

        call (parser, namespace, values/*, option_string = undefined */) {
            namespace[this.dest] = sub('foo[%s]', values)
        }
    }

    test () {

        const parser = argparse.ArgumentParser()
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

;(new class TestNegativeNumber extends ParserTestCase {
    /* Test parsing negative numbers */

    argument_signatures = [
        Sig('--int', { type: 'int' }),
        Sig('--float', { type: 'float' }),
    ]
    failures = [
        '--float -_.45',
        '--float -1__000.0',
        '--float -1.0.0',
        '--int -1__000',
        '--int -1.0',
    ]
    successes = [
        ['--int -1000 --float -1000.0', NS({ int: -1000, float: -1000.0 })],
        ['--int -1_000 --float -1_000.0', NS({ int: -1000, float: -1000.0 })],
        ['--int -1_000_000 --float -1_000_000.0', NS({ int: -1000000, float: -1000000.0 })],
        ['--float -1_000.0', NS({ int: undefined, float: -1000.0 })],
        ['--float -1_000_000.0_0', NS({ int: undefined, float: -1000000.0 })],
        ['--float -.5', NS({ int: undefined, float: -0.5 })],
        ['--float -.5_000', NS({ int: undefined, float: -0.5 })],
        ['--float -1e3', NS({ int: undefined, float: -1000 })],
        ['--float -1e-3', NS({ int: undefined, float: -0.001 })],
    ]
}).run()


;(new class TestArgumentAndSubparserSuggestions extends TestCase {
    /* Test error handling and suggestion when a user makes a typo */

    test_wrong_argument_error_with_suggestions () {
        const parser = new ErrorRaisingArgumentParser({ suggest_on_error: true })
        parser.add_argument('foo', { choices: ['bar', 'baz'] })
        const cm = this.assertRaises(ArgumentParserError, () =>
            parser.parse_args(['bazz']))
        assert(cm.exception.stderr.includes(
            "error: argument foo: invalid choice: 'bazz', maybe you meant 'baz'? " +
            "(choose from 'bar', 'baz')"))
    }

    test_wrong_argument_error_no_suggestions () {
        const parser = new ErrorRaisingArgumentParser({ suggest_on_error: false })
        parser.add_argument('foo', { choices: ['bar', 'baz'] })
        const cm = this.assertRaises(ArgumentParserError, () =>
            parser.parse_args(['bazz']))
        assert(cm.exception.stderr.includes(
            "error: argument foo: invalid choice: 'bazz' (choose from 'bar', 'baz')"))
    }

    test_wrong_argument_subparsers_with_suggestions () {
        const parser = new ErrorRaisingArgumentParser({ suggest_on_error: true })
        const subparsers = parser.add_subparsers({ required: true })
        subparsers.add_parser('foo')
        subparsers.add_parser('bar')
        const cm = this.assertRaises(ArgumentParserError, () =>
            parser.parse_args(['baz']))
        assert(cm.exception.stderr.includes(
            "error: argument {foo,bar}: invalid choice: 'baz', maybe you meant " +
            "'bar'? (choose from 'foo', 'bar')"))
    }

    test_wrong_argument_subparsers_no_suggestions () {
        const parser = new ErrorRaisingArgumentParser({ suggest_on_error: false })
        const subparsers = parser.add_subparsers({ required: true })
        subparsers.add_parser('foo')
        subparsers.add_parser('bar')
        const cm = this.assertRaises(ArgumentParserError, () =>
            parser.parse_args(['baz']))
        assert(cm.exception.stderr.includes(
            "error: argument {foo,bar}: invalid choice: 'baz' (choose from 'foo', 'bar')"))
    }

    test_wrong_argument_no_suggestion_implicit () {
        const parser = new ErrorRaisingArgumentParser()
        parser.add_argument('foo', { choices: ['bar', 'baz'] })
        const cm = this.assertRaises(ArgumentParserError, () =>
            parser.parse_args(['bazz']))
        assert(cm.exception.stderr.includes(
            "error: argument foo: invalid choice: 'bazz' (choose from 'bar', 'baz')"))
    }

    test_suggestions_choices_empty () {
        const parser = new ErrorRaisingArgumentParser({ suggest_on_error: true })
        parser.add_argument('foo', { choices: [] })
        const cm = this.assertRaises(ArgumentParserError, () =>
            parser.parse_args(['bazz']))
        assert(cm.exception.stderr.includes(
            "error: argument foo: invalid choice: 'bazz' (choose from )"))
    }

    test_suggestions_choices_int () {
        const parser = new ErrorRaisingArgumentParser({ suggest_on_error: true })
        parser.add_argument('foo', { choices: [1, 2] })
        const cm = this.assertRaises(ArgumentParserError, () =>
            parser.parse_args(['3']))
        assert(cm.exception.stderr.includes(
            "error: argument foo: invalid choice: '3' (choose from '1', '2')"))
    }

    test_suggestions_choices_mixed_types () {
        const parser = new ErrorRaisingArgumentParser({ suggest_on_error: true })
        parser.add_argument('foo', { choices: [1, '2'] })
        const cm = this.assertRaises(ArgumentParserError, () =>
            parser.parse_args(['3']))
        assert(cm.exception.stderr.includes(
            "error: argument foo: invalid choice: '3' (choose from '1', '2')"))
    }
}).run()


;(new class TestInvalidAction extends TestCase {
    /* Test invalid user defined Action */

    ActionWithoutCall = class ActionWithoutCall extends argparse.Action {}

    test_invalid_type () {
        const parser = argparse.ArgumentParser()
        parser.add_argument('--foo', { action: this.ActionWithoutCall })
        this.assertRaises(Error, () => parser.parse_args(['--foo', 'bar']))
    }

    test_modified_invalid_action () {
        const parser = argparse.ArgumentParser({ exit_on_error: false })
        const action = parser.add_argument('--foo')
        action.type = 1
        let cm = this.assertRaises(TypeError, () => parser.parse_args(['--foo', 'bar']))
        this.assertRegex(String(cm.exception), /1 is not callable/)
        action.type = []
        cm = this.assertRaises(TypeError, () => parser.parse_args(['--foo', 'bar']))
        this.assertRegex(String(cm.exception), /\[\] is not callable/)
        // It is impossible to distinguish a TypeError raised due to a mismatch
        // of the required function arguments from a TypeError raised for an incorrect
        // argument value, and using the heavy inspection machinery is not worthwhile
        // as it does not reliably work in all cases.
        // Therefore, a generic ArgumentError is raised to handle this logical error.
        function pow (a, b) {
            if (b === undefined) throw new TypeError('missing argument')
            return Math.pow(a, b)
        }
        action.type = pow
        cm = this.assertRaises(argparse.ArgumentError, () =>
            parser.parse_args(['--foo', 'bar']))
        this.assertRegex(String(cm.exception),
            /argument --foo: invalid pow value: 'bar'/)
    }
}).run()


// ================
// Subparsers tests
// ================

;(new class TestAddSubparsers extends TestCase {
    /* Test the add_subparsers method */

    force_color = false

    assertArgumentParserError (...args) {
        this.assertRaises(ArgumentParserError, ...args)
    }

    _get_parser ({ subparser_help = false, prefix_chars = undefined,
                   aliases = false, usage = undefined } = {}) {
        // create a parser with a subparsers argument
        let parser

        if (prefix_chars) {
            parser = new ErrorRaisingArgumentParser({
                prog: 'PROG', description: 'main description', usage, prefix_chars })
            parser.add_argument(
                prefix_chars[0].repeat(2) + 'foo', { action: 'store_true', help: 'foo help' })
        } else {
            parser = new ErrorRaisingArgumentParser({
                prog: 'PROG', description: 'main description', usage })
            parser.add_argument(
                '--foo', { action: 'store_true', help: 'foo help' })
        }
        parser.add_argument(
            'bar', { type: 'float', help: 'bar help' })

        // check that only one subparsers argument can be added
        const subparsers_kwargs = {required: false}
        if (aliases) {
            subparsers_kwargs.metavar = 'COMMAND'
            subparsers_kwargs.title = 'commands'
        } else {
            subparsers_kwargs.help = 'command help'
        }
        const subparsers = parser.add_subparsers(subparsers_kwargs)
        const cm = this.assertRaises(TypeError, () => parser.add_subparsers())
        this.assertRegex(cm.exception.message, /cannot have multiple subparser arguments/)

        // add first sub-parser
        const parser1_kwargs = { description: '1 description' }
        if (subparser_help) {
            parser1_kwargs.help = '1 help'
        }
        if (aliases) {
            parser1_kwargs.aliases = ['1alias1', '1alias2']
        }
        const parser1 = subparsers.add_parser('1', parser1_kwargs)
        parser1.add_argument('-w', { type: 'int', help: 'w help' })
        parser1.add_argument('x', { choices: ['a', 'b', 'c'], help: 'x help' })

        // add second sub-parser
        const parser2_kwargs = { description: '2 description' }
        if (subparser_help) {
            parser2_kwargs.help = '2 help'
        }
        const parser2 = subparsers.add_parser('2', parser2_kwargs)
        parser2.add_argument('-y', { choices: ['1', '2', '3'], help: 'y help' })
        parser2.add_argument('z', { type: 'str', nargs: '*', help: 'z help' })

        // add third sub-parser
        const parser3_kwargs = {
            description: '3 description',
            usage: 'PROG --foo bar 3 t ...'
        }
        if (subparser_help) {
            parser3_kwargs.help = '3 help'
        }
        const parser3 = subparsers.add_parser('3', parser3_kwargs)
        parser3.add_argument('t', { type: 'int', help: 't help' })
        parser3.add_argument('u', { nargs: '...', help: 'u help' })

        // return the main parser
        return parser
    }

    setUp () {
        super.setUp()
        this.parser = this._get_parser()
        this.command_help_parser = this._get_parser({ subparser_help: true })
    }

    test_parse_args_failures () {
        // check some failure cases:
        for (const args_str of ['', 'a', 'a a', '0.5 a', '0.5 1',
                              '0.5 1 -y', '0.5 2 -w']) {
            const args = args_str.split(/\s+/).filter(Boolean)
            this.assertArgumentParserError(() => this.parser.parse_args(args))
        }
    }

    test_parse_args_failures_details () {
        for (const [args_str, usage_str, error_str] of [
            [
                '',
                'usage: PROG [-h] [--foo] bar {1,2,3} ...',
                'PROG: error: the following arguments are required: bar'
            ],
            [
                '0.5 1 -y',
                'usage: PROG bar 1 [-h] [-w W] {a,b,c}',
                'PROG bar 1: error: the following arguments are required: x'
            ],
            [
                '0.5 3',
                'usage: PROG --foo bar 3 t ...',
                'PROG bar 3: error: the following arguments are required: t'
            ]
        ]) {
            const args = args_str.split(/\s+/).filter(Boolean)
            const cm = this.assertRaises(ArgumentParserError, () =>
                this.parser.parse_args(args))
            this.assertEqual(cm.exception.m, 'SystemExit')
            this.assertEqual(cm.exception.stderr, `${usage_str}\n${error_str}\n`)
        }
    }

    test_parse_args_failures_details_custom_usage () {
        const parser = this._get_parser({
            usage: 'PROG [--foo] bar 1 [-w W] {a,b,c}\n' +
                   '       PROG --foo bar 3 t ...'
        })
        for (const [args_str, usage_str, error_str] of [
            [
                '',
                'usage: PROG [--foo] bar 1 [-w W] {a,b,c}\n' +
                '       PROG --foo bar 3 t ...',
                'PROG: error: the following arguments are required: bar'
            ],
            [
                '0.5 1 -y',
                'usage: PROG bar 1 [-h] [-w W] {a,b,c}',
                'PROG bar 1: error: the following arguments are required: x'
            ],
            [
                '0.5 3',
                'usage: PROG --foo bar 3 t ...',
                'PROG bar 3: error: the following arguments are required: t'
            ]
        ]) {
            const args = args_str.split(/\s+/).filter(Boolean)
            const cm = this.assertRaises(ArgumentParserError, () =>
                parser.parse_args(args))
            this.assertEqual(cm.exception.m, 'SystemExit')
            this.assertEqual(cm.exception.stderr, `${usage_str}\n${error_str}\n`)
        }
    }

    test_parse_args () {
        // check some non-failure cases:
        this.assertEqual(
            this.parser.parse_args('0.5 1 b -w 7'.split(' ')),
            NS({ foo: false, bar: 0.5, w: 7, x: 'b' })
        )
        this.assertEqual(
            this.parser.parse_args('0.25 --foo 2 -y 2 3j -- -1j'.split(' ')),
            NS({ foo: true, bar: 0.25, y: '2', z: ['3j', '-1j'] })
        )
        this.assertEqual(
            this.parser.parse_args('--foo 0.125 1 c'.split(' ')),
            NS({ foo: true, bar: 0.125, w: undefined, x: 'c' })
        )
        this.assertEqual(
            this.parser.parse_args('-1.5 3 11 -- a --foo 7 -- b'.split(' ')),
            NS({ foo: false, bar: -1.5, t: 11, u: ['a', '--foo', '7', '--', 'b'] })
        )
    }

    test_parse_known_args () {
        this.assertEqual(
            this.parser.parse_known_args('0.5 1 b -w 7'.split(' ')),
            [NS({ foo: false, bar: 0.5, w: 7, x: 'b' }), []]
        )
        this.assertEqual(
            this.parser.parse_known_args('0.5 -p 1 b -w 7'.split(' ')),
            [NS({ foo: false, bar: 0.5, w: 7, x: 'b' }), ['-p']]
        )
        this.assertEqual(
            this.parser.parse_known_args('0.5 1 b -w 7 -p'.split(' ')),
            [NS({ foo: false, bar: 0.5, w: 7, x: 'b' }), ['-p']]
        )
        this.assertEqual(
            this.parser.parse_known_args('0.5 1 b -q -rs -w 7'.split(' ')),
            [NS({ foo: false, bar: 0.5, w: 7, x: 'b' }), ['-q', '-rs']]
        )
        this.assertEqual(
            this.parser.parse_known_args('0.5 -W 1 b -X Y -w 7 Z'.split(' ')),
            [NS({ foo: false, bar: 0.5, w: 7, x: 'b' }), ['-W', '-X', 'Y', 'Z']]
        )
    }

    test_parse_known_args_to_class_namespace () {
        class C {}
        this.assertEqual(
            this.parser.parse_known_args('0.5 1 b -w 7 -p'.split(' '), C),
            [C, ['-p']]
        )
        this.assertEqual(C.foo, false)
        this.assertEqual(C.bar, 0.5)
        this.assertEqual(C.w, 7)
        this.assertEqual(C.x, 'b')
    }

    test_abbreviation () {
        const parser = new ErrorRaisingArgumentParser()
        parser.add_argument('--foodle')
        parser.add_argument('--foonly')
        const subparsers = parser.add_subparsers()
        const parser1 = subparsers.add_parser('bar')
        parser1.add_argument('--fo')
        parser1.add_argument('--foonew')

        this.assertEqual(parser.parse_args(['--food', 'baz', 'bar']),
                         NS({ foodle: 'baz', foonly: undefined,
                             fo: undefined, foonew: undefined }))
        this.assertEqual(parser.parse_args(['--foon', 'baz', 'bar']),
                         NS({ foodle: undefined, foonly: 'baz',
                             fo: undefined, foonew: undefined }))
        this.assertArgumentParserError(() => parser.parse_args(['--fo', 'baz', 'bar']))
        this.assertEqual(parser.parse_args(['bar', '--fo', 'baz']),
                         NS({ foodle: undefined, foonly: undefined,
                             fo: 'baz', foonew: undefined }))
        this.assertEqual(parser.parse_args(['bar', '--foo', 'baz']),
                         NS({ foodle: undefined, foonly: undefined,
                             fo: undefined, foonew: 'baz' }))
        this.assertEqual(parser.parse_args(['bar', '--foon', 'baz']),
                         NS({ foodle: undefined, foonly: undefined,
                             fo: undefined, foonew: 'baz' }))
        this.assertArgumentParserError(() => parser.parse_args(['bar', '--food', 'baz']))
    }

    test_parse_known_args_with_single_dash_option () {
        const parser = new ErrorRaisingArgumentParser()
        parser.add_argument('-k', '--known', { action: 'count', default: 0 })
        parser.add_argument('-n', '--new', { action: 'count', default: 0 })
        this.assertEqual(parser.parse_known_args(['-k', '-u']),
                         [NS({ known: 1, new: 0 }), ['-u']])
        this.assertEqual(parser.parse_known_args(['-u', '-k']),
                         [NS({ known: 1, new: 0 }), ['-u']])
        this.assertEqual(parser.parse_known_args(['-ku']),
                         [NS({ known: 1, new: 0 }), ['-u']])
        this.assertArgumentParserError(() => parser.parse_known_args(['-k=u']))
        this.assertEqual(parser.parse_known_args(['-uk']),
                         [NS({ known: 0, new: 0 }), ['-uk']])
        this.assertEqual(parser.parse_known_args(['-u=k']),
                         [NS({ known: 0, new: 0 }), ['-u=k']])
        this.assertEqual(parser.parse_known_args(['-kunknown']),
                         [NS({ known: 1, new: 0 }), ['-unknown']])
        this.assertArgumentParserError(() => parser.parse_known_args(['-k=unknown']))
        this.assertEqual(parser.parse_known_args(['-ku=nknown']),
                         [NS({ known: 1, new: 0 }), ['-u=nknown']])
        this.assertEqual(parser.parse_known_args(['-knew']),
                         [NS({ known: 1, new: 1 }), ['-ew']])
        this.assertArgumentParserError(() => parser.parse_known_args(['-kn=ew']))
        this.assertArgumentParserError(() => parser.parse_known_args(['-k-new']))
        this.assertArgumentParserError(() => parser.parse_known_args(['-kn-ew']))
        this.assertEqual(parser.parse_known_args(['-kne-w']),
                         [NS({ known: 1, new: 1 }), ['-e-w']])
    }

    test_dest () {
        const parser = new ErrorRaisingArgumentParser()
        parser.add_argument('--foo', { action: 'store_true' })
        const subparsers = parser.add_subparsers({ dest: 'bar' })
        const parser1 = subparsers.add_parser('1')
        parser1.add_argument('baz')
        this.assertEqual(NS({ foo: false, bar: '1', baz: '2' }),
                         parser.parse_args('1 2'.split(' ')))
    }

    _test_required_subparsers (parser) {
        // Should parse the sub command
        const ret = parser.parse_args(['run'])
        this.assertEqual(ret.command, 'run')

        // Error when the command is missing
        this.assertArgumentParserError(() => parser.parse_args([]))
    }

    test_required_subparsers_via_attribute () {
        const parser = new ErrorRaisingArgumentParser()
        const subparsers = parser.add_subparsers({ dest: 'command' })
        subparsers.required = true
        subparsers.add_parser('run')
        this._test_required_subparsers(parser)
    }

    test_required_subparsers_via_kwarg () {
        const parser = new ErrorRaisingArgumentParser()
        const subparsers = parser.add_subparsers({ dest: 'command', required: true })
        subparsers.add_parser('run')
        this._test_required_subparsers(parser)
    }

    test_required_subparsers_default () {
        const parser = new ErrorRaisingArgumentParser()
        const subparsers = parser.add_subparsers({ dest: 'command' })
        subparsers.add_parser('run')
        // No error here
        const ret = parser.parse_args([])
        this.assertIsNone(ret.command)
    }

    test_required_subparsers_no_destination_error () {
        const parser = new ErrorRaisingArgumentParser()
        const subparsers = parser.add_subparsers({ required: true })
        subparsers.add_parser('foo')
        subparsers.add_parser('bar')
        const cm = this.assertRaises(ArgumentParserError, () =>
            parser.parse_args([]))
        this.assertRegex(
            cm.exception.stderr,
            /error: the following arguments are required: \{foo,bar\}\n$/)
    }

    test_optional_subparsers () {
        const parser = new ErrorRaisingArgumentParser()
        const subparsers = parser.add_subparsers({ dest: 'command', required: false })
        subparsers.add_parser('run')
        // No error here
        const ret = parser.parse_args([])
        this.assertIsNone(ret.command)
    }

    test_help () {
        this.assertEqual(this.parser.format_usage(),
                         'usage: PROG [-h] [--foo] bar {1,2,3} ...\n')
        this.assertEqual(this.parser.format_help(), textwrap.dedent(`\
            usage: PROG [-h] [--foo] bar {1,2,3} ...

            main description

            positional arguments:
              bar         bar help
              {1,2,3}     command help

            options:
              -h, --help  show this help message and exit
              --foo       foo help
            `))
    }

    test_help_extra_prefix_chars () {
        // Make sure - is still used for help if it is a non-first prefix char
        const parser = this._get_parser({ prefix_chars: '+:-' })
        this.assertEqual(parser.format_usage(),
                         'usage: PROG [-h] [++foo] bar {1,2,3} ...\n')
        this.assertEqual(parser.format_help(), textwrap.dedent(`\
            usage: PROG [-h] [++foo] bar {1,2,3} ...

            main description

            positional arguments:
              bar         bar help
              {1,2,3}     command help

            options:
              -h, --help  show this help message and exit
              ++foo       foo help
            `))
    }

    test_help_non_breaking_spaces () {
        const parser = new ErrorRaisingArgumentParser({
            prog: 'PROG', description: 'main description' })
        parser.add_argument(
            "--non-breaking", { action: 'store_false',
            help: 'help message containing non-breaking spaces shall not ' +
            'wrap\xA0at non-breaking spaces' })
        this.assertEqual(parser.format_help(), textwrap.dedent(`\
            usage: PROG [-h] [--non-breaking]

            main description

            options:
              -h, --help      show this help message and exit
              --non-breaking  help message containing non-breaking spaces shall not
                              wrap\xA0at non-breaking spaces
        `))
    }

    test_help_blank () {
        // Issue 24444
        let parser = new ErrorRaisingArgumentParser({
            prog: 'PROG', description: 'main description' })
        parser.add_argument('foo', { help: '    ' })
        this.assertEqual(parser.format_help(), textwrap.dedent(`\
            usage: PROG [-h] foo

            main description

            positional arguments:
              foo         

            options:
              -h, --help  show this help message and exit
        `))

        parser = new ErrorRaisingArgumentParser({
            prog: 'PROG', description: 'main description' })
        parser.add_argument('foo', { choices: [], help: '%(choices)s' })
        this.assertEqual(parser.format_help(), textwrap.dedent(`\
            usage: PROG [-h] {}

            main description

            positional arguments:
              {}          

            options:
              -h, --help  show this help message and exit
        `))
    }

    test_help_alternate_prefix_chars () {
        const parser = this._get_parser({ prefix_chars: '+:/' })
        this.assertEqual(parser.format_usage(),
                         'usage: PROG [+h] [++foo] bar {1,2,3} ...\n')
        this.assertEqual(parser.format_help(), textwrap.dedent(`\
            usage: PROG [+h] [++foo] bar {1,2,3} ...

            main description

            positional arguments:
              bar         bar help
              {1,2,3}     command help

            options:
              +h, ++help  show this help message and exit
              ++foo       foo help
            `))
    }

    test_parser_command_help () {
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

            options:
              -h, --help  show this help message and exit
              --foo       foo help
            `))
    }

    assert_bad_help (context_type, func, ...args) {
        const cm = this.assertRaises(TypeError, () => func(...args))
        this.assertRegex(cm.exception.message, /badly formed help string/)
        assert(cm.exception.cause instanceof context_type)
    }

    test_invalid_subparsers_help () {
        let parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        this.assert_bad_help(TypeError, parser.add_subparsers.bind(parser),
            { help: '%Y-%m-%d' })
        parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        this.assert_bad_help(TypeError, parser.add_subparsers.bind(parser),
            { help: '%(spam)s' })
        parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        this.assert_bad_help(TypeError, parser.add_subparsers.bind(parser),
            { help: '%(prog)d' })
    }

    test_invalid_subparser_help () {
        const parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        const subparsers = parser.add_subparsers()
        const add_parser = subparsers.add_parser.bind(subparsers)
        this.assert_bad_help(TypeError, add_parser, '1', { help: '%Y-%m-%d' })
        this.assert_bad_help(TypeError, add_parser, '1', { help: '%(spam)s' })
        this.assert_bad_help(TypeError, add_parser, '1', { help: '%(prog)d' })
    }

    test_subparser_title_help () {
        const parser = new ErrorRaisingArgumentParser({ prog: 'PROG',
                                                      description: 'main description' })
        parser.add_argument('--foo', { action: 'store_true', help: 'foo help' })
        parser.add_argument('bar', { help: 'bar help' })
        const subparsers = parser.add_subparsers({ title: 'subcommands',
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

            options:
              -h, --help  show this help message and exit
              --foo       foo help

            subcommands:
              command help

              {1,2}       additional text
            `))
    }

    _test_subparser_help (args_str, expected_help) {
        const cm = this.assertRaises(ArgumentParserError, () =>
            this.parser.parse_args(args_str.split(/\s+/).filter(Boolean)))
        this.assertEqual(expected_help, cm.exception.stdout)
    }

    test_subparser1_help () {
        this._test_subparser_help('5.0 1 -h', textwrap.dedent(`\
            usage: PROG bar 1 [-h] [-w W] {a,b,c}

            1 description

            positional arguments:
              {a,b,c}     x help

            options:
              -h, --help  show this help message and exit
              -w W        w help
            `))
    }

    test_subparser2_help () {
        this._test_subparser_help('5.0 2 -h', textwrap.dedent(`\
            usage: PROG bar 2 [-h] [-y {1,2,3}] [z ...]

            2 description

            positional arguments:
              z           z help

            options:
              -h, --help  show this help message and exit
              -y {1,2,3}  y help
            `))
    }

    test_alias_invocation () {
        const parser = this._get_parser({ aliases: true })
        this.assertEqual(
            parser.parse_known_args('0.5 1alias1 b'.split(' ')),
            [NS({ foo: false, bar: 0.5, w: undefined, x: 'b' }), []]
        )
        this.assertEqual(
            parser.parse_known_args('0.5 1alias2 b'.split(' ')),
            [NS({ foo: false, bar: 0.5, w: undefined, x: 'b' }), []]
        )
    }

    test_error_alias_invocation () {
        const parser = this._get_parser({ aliases: true })
        this.assertArgumentParserError(() => parser.parse_args(
                                       '0.5 1alias3 b'.split(' ')))
    }

    test_alias_help () {
        const parser = this._get_parser({ aliases: true, subparser_help: true })
        this.maxDiff = undefined
        this.assertEqual(parser.format_help(), textwrap.dedent(`\
            usage: PROG [-h] [--foo] bar COMMAND ...

            main description

            positional arguments:
              bar                   bar help

            options:
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

    test_nongroup_first () {
        const parser = new ErrorRaisingArgumentParser()
        parser.add_argument('foo')
        const group = parser.add_argument_group('g')
        group.add_argument('bar')
        parser.add_argument('baz')
        const expected = NS({ foo: '1', bar: '2', baz: '3' })
        const result = parser.parse_args('1 2 3'.split(' '))
        this.assertEqual(expected, result)
    }

    test_group_first () {
        const parser = new ErrorRaisingArgumentParser()
        const group = parser.add_argument_group('xxx')
        group.add_argument('foo')
        parser.add_argument('bar')
        parser.add_argument('baz')
        const expected = NS({ foo: '1', bar: '2', baz: '3' })
        const result = parser.parse_args('1 2 3'.split(' '))
        this.assertEqual(expected, result)
    }

    test_interleaved_groups () {
        const parser = new ErrorRaisingArgumentParser()
        let group = parser.add_argument_group('xxx')
        parser.add_argument('foo')
        group.add_argument('bar')
        parser.add_argument('baz')
        group = parser.add_argument_group('yyy')
        group.add_argument('frell')
        const expected = NS({ foo: '1', bar: '2', baz: '3', frell: '4' })
        const result = parser.parse_args('1 2 3 4'.split(' '))
        this.assertEqual(expected, result)
    }
}).run()


;(new class TestGroupConstructor extends TestCase {

    assertGroupPrefixCharsWarning (prefix_chars) {
        const parser = new ErrorRaisingArgumentParser()
        const msg =
            "The use of the undocumented 'prefix_chars' parameter in " +
            'ArgumentParser.add_argument_group() is deprecated.'
        const warnings = []
        const emitWarning = process.emitWarning
        process.emitWarning = (warning, type) => warnings.push([warning, type])
        try {
            parser.add_argument_group({ prefix_chars })
        } finally {
            process.emitWarning = emitWarning
        }
        this.assertEqual([[msg, 'DeprecationWarning']], warnings)
    }

    test_group_prefix_chars () {
        this.assertGroupPrefixCharsWarning('-+')
    }

    test_group_prefix_chars_default () {
        // "default" isn't quite the right word here, but it's the same as
        // the parser's default prefix so it's a good test
        this.assertGroupPrefixCharsWarning('-')
    }

    test_nested_argument_group () {
        const parser = argparse.ArgumentParser()
        const group = parser.add_argument_group()
        const cm = this.assertRaises(TypeError, () => group.add_argument_group())
        this.assertRegex(String(cm.exception), /argument groups cannot be nested/)
    }
}).run()


// ===================
// Parent parser tests
// ===================

;(new class TestParentParsers extends TestCase {
    /* Tests that parsers can be created with parent parsers */

    force_color = false

    assertArgumentParserError (...args) {
        this.assertRaises(ArgumentParserError, ...args)
    }

    setUp () {
        super.setUp()
        this.wxyz_parent = new ErrorRaisingArgumentParser({ add_help: false })
        this.wxyz_parent.add_argument('--w')
        const x_group = this.wxyz_parent.add_argument_group('x')
        x_group.add_argument('-y')
        this.wxyz_parent.add_argument('z')

        this.abcd_parent = new ErrorRaisingArgumentParser({ add_help: false })
        this.abcd_parent.add_argument('a')
        this.abcd_parent.add_argument('-b')
        const c_group = this.abcd_parent.add_argument_group('c')
        c_group.add_argument('--d')

        this.w_parent = new ErrorRaisingArgumentParser({ add_help: false })
        this.w_parent.add_argument('--w')

        this.z_parent = new ErrorRaisingArgumentParser({ add_help: false })
        this.z_parent.add_argument('z')

        // parents with mutually exclusive groups
        this.ab_mutex_parent = new ErrorRaisingArgumentParser({ add_help: false })
        const group = this.ab_mutex_parent.add_mutually_exclusive_group()
        group.add_argument('-a', { action: 'store_true' })
        group.add_argument('-b', { action: 'store_true' })

        this.main_program = path.basename(process.argv[1])
    }

    test_single_parent () {
        const parser = new ErrorRaisingArgumentParser({ parents: [this.wxyz_parent] })
        this.assertEqual(parser.parse_args('-y 1 2 --w 3'.split(' ')),
                         NS({ w: '3', y: '1', z: '2' }))
    }

    test_single_parent_mutex () {
        this._test_mutex_ab(args => this.ab_mutex_parent.parse_args(args))
        const parser = new ErrorRaisingArgumentParser({ parents: [this.ab_mutex_parent] })
        this._test_mutex_ab(args => parser.parse_args(args))
    }

    test_single_grandparent_mutex () {
        const parents = [this.ab_mutex_parent]
        let parser = new ErrorRaisingArgumentParser({ add_help: false, parents })
        parser = new ErrorRaisingArgumentParser({ parents: [parser] })
        this._test_mutex_ab(args => parser.parse_args(args))
    }

    _test_mutex_ab (parse_args) {
        this.assertEqual(parse_args([]), NS({ a: false, b: false }))
        this.assertEqual(parse_args(['-a']), NS({ a: true, b: false }))
        this.assertEqual(parse_args(['-b']), NS({ a: false, b: true }))
        this.assertArgumentParserError(() => parse_args(['-a', '-b']))
        this.assertArgumentParserError(() => parse_args(['-b', '-a']))
        this.assertArgumentParserError(() => parse_args(['-c']))
        this.assertArgumentParserError(() => parse_args(['-a', '-c']))
        this.assertArgumentParserError(() => parse_args(['-b', '-c']))
    }

    test_multiple_parents () {
        const parents = [this.abcd_parent, this.wxyz_parent]
        const parser = new ErrorRaisingArgumentParser({ parents })
        this.assertEqual(parser.parse_args('--d 1 --w 2 3 4'.split(' ')),
                         NS({ a: '3', b: undefined, d: '1', w: '2', y: undefined, z: '4' }))
    }

    test_multiple_parents_mutex () {
        const parents = [this.ab_mutex_parent, this.wxyz_parent]
        const parser = new ErrorRaisingArgumentParser({ parents })
        this.assertEqual(parser.parse_args('-a --w 2 3'.split(' ')),
                         NS({ a: true, b: false, w: '2', y: undefined, z: '3' }))
        this.assertArgumentParserError(() =>
            parser.parse_args('-a --w 2 3 -b'.split(' ')))
        this.assertArgumentParserError(() =>
            parser.parse_args('-a -b --w 2 3'.split(' ')))
    }

    test_conflicting_parents () {
        this.assertRaises(
            argparse.ArgumentError,
            () => argparse.ArgumentParser({ parents: [this.w_parent, this.wxyz_parent] }))
    }

    test_conflicting_parents_mutex () {
        this.assertRaises(
            argparse.ArgumentError,
            () => argparse.ArgumentParser({ parents: [this.abcd_parent, this.ab_mutex_parent] }))
    }

    test_same_argument_name_parents () {
        const parents = [this.wxyz_parent, this.z_parent]
        const parser = new ErrorRaisingArgumentParser({ parents })
        this.assertEqual(parser.parse_args('1 2'.split(' ')),
                         NS({ w: undefined, y: undefined, z: '2' }))
    }

    test_subparser_parents () {
        const parser = new ErrorRaisingArgumentParser()
        const subparsers = parser.add_subparsers()
        const abcde_parser = subparsers.add_parser('bar', { parents: [this.abcd_parent] })
        abcde_parser.add_argument('e')
        this.assertEqual(parser.parse_args('bar -b 1 --d 2 3 4'.split(' ')),
                         NS({ a: '3', b: '1', d: '2', e: '4' }))
    }

    test_subparser_parents_mutex () {
        const parser = new ErrorRaisingArgumentParser()
        const subparsers = parser.add_subparsers()
        let parents = [this.ab_mutex_parent]
        const abc_parser = subparsers.add_parser('foo', { parents })
        const c_group = abc_parser.add_argument_group('c_group')
        c_group.add_argument('c')
        parents = [this.wxyz_parent, this.ab_mutex_parent]
        const wxyzabe_parser = subparsers.add_parser('bar', { parents })
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

    test_parent_help () {
        const parents = [this.abcd_parent, this.wxyz_parent]
        const parser = new ErrorRaisingArgumentParser({ prog: 'PROG', parents })
        const parser_help = parser.format_help()
        this.assertEqual(parser_help, textwrap.dedent(sub(`\
            usage: PROG [-h] [-b B] [--d D] [--w W] [-y Y] a z

            positional arguments:
              a
              z

            options:
              -h, --help  show this help message and exit
              -b B
              --w W

            c:
              --d D

            x:
              -y Y
        `)))
    }

    test_groups_parents () {
        const parent = new ErrorRaisingArgumentParser({ add_help: false })
        const g = parent.add_argument_group({ title: 'g', description: 'gd' })
        g.add_argument('-w')
        g.add_argument('-x')
        const m = parent.add_mutually_exclusive_group()
        m.add_argument('-y')
        m.add_argument('-z')
        const parser = new ErrorRaisingArgumentParser({ prog: 'PROG', parents: [parent] })

        this.assertRaises(ArgumentParserError, () =>
            parser.parse_args(['-y', 'Y', '-z', 'Z']))

        const parser_help = parser.format_help()
        this.assertEqual(parser_help, textwrap.dedent(sub(`\
            usage: PROG [-h] [-w W] [-x X] [-y Y | -z Z]

            options:
              -h, --help  show this help message and exit
              -y Y
              -z Z

            g:
              gd

              -w W
              -x X
        `)))
    }

    test_wrong_type_parents () {
        this.assertRaises(TypeError, () => new ErrorRaisingArgumentParser({ parents: [1] }))
    }

    test_mutex_groups_parents () {
        const parent = new ErrorRaisingArgumentParser({ add_help: false })
        const g = parent.add_argument_group({ title: 'g', description: 'gd' })
        g.add_argument('-w')
        g.add_argument('-x')
        const m = g.add_mutually_exclusive_group()
        m.add_argument('-y')
        m.add_argument('-z')
        const parser = new ErrorRaisingArgumentParser({ prog: 'PROG', parents: [parent] })

        this.assertRaises(ArgumentParserError, () =>
            parser.parse_args(['-y', 'Y', '-z', 'Z']))

        const parser_help = parser.format_help()
        this.assertEqual(parser_help, textwrap.dedent(`\
            usage: PROG [-h] [-w W] [-x X] [-y Y | -z Z]

            options:
              -h, --help  show this help message and exit

            g:
              gd

              -w W
              -x X
              -y Y
              -z Z
        `))
    }
}).run()

// ==============================
// Mutually exclusive group tests
// ==============================

class TestMutuallyExclusiveGroupErrors extends TestCase {
    force_color = false

    test_invalid_add_argument_group () {
        const parser = new ErrorRaisingArgumentParser()
        const raises = this.assertRaises
        raises(TypeError, () => parser.add_mutually_exclusive_group({ title: 'foo' }))
    }

    test_invalid_add_argument () {
        const parser = new ErrorRaisingArgumentParser()
        const group = parser.add_mutually_exclusive_group()
        const raises = this.assertRaises
        raises(TypeError, () => group.add_argument('--foo', { required: true }))
        raises(TypeError, () => group.add_argument('bar'))
        raises(TypeError, () => group.add_argument('bar', { nargs: '+' }))
        raises(TypeError, () => group.add_argument('bar', { nargs: 1 }))
        raises(TypeError, () => group.add_argument('bar', { nargs: argparse.PARSER }))
    }

    test_help () {
        const parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        const group1 = parser.add_mutually_exclusive_group()
        group1.add_argument('--foo', { action: 'store_true' })
        group1.add_argument('--bar', { action: 'store_false' })
        const group2 = parser.add_mutually_exclusive_group()
        group2.add_argument('--soup', { action: 'store_true' })
        group2.add_argument('--nuts', { action: 'store_false' })
        const expected = `\
            usage: PROG [-h] [--foo | --bar] [--soup | --nuts]

            options:
              -h, --help  show this help message and exit
              --foo
              --bar
              --soup
              --nuts
              `
        this.assertEqual(parser.format_help(), textwrap.dedent(expected))
    }

    test_optional_order () {
        let parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        let group = parser.add_mutually_exclusive_group({ required: true })
        group.add_argument('--foo')
        group.add_argument('bar', { nargs: '?' })
        const expected = `\
            usage: PROG [-h] (--foo FOO | bar)

            positional arguments:
              bar

            options:
              -h, --help  show this help message and exit
              --foo FOO
              `
        this.assertEqual(parser.format_help(), textwrap.dedent(expected))

        parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        group = parser.add_mutually_exclusive_group({ required: true })
        group.add_argument('bar', { nargs: '?' })
        group.add_argument('--foo')
        this.assertEqual(parser.format_help(), textwrap.dedent(expected))
    }

    test_help_subparser_all_mutually_exclusive_group_members_suppressed () {
        const parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        const commands = parser.add_subparsers({ title: 'commands', dest: 'command' })
        const cmd_foo = commands.add_parser('foo')
        const group = cmd_foo.add_mutually_exclusive_group()
        group.add_argument('--verbose', {
            action: 'store_true', help: argparse.SUPPRESS
        })
        group.add_argument('--quiet', {
            action: 'store_true', help: argparse.SUPPRESS
        })
        const longopt = '--' + 'long'.repeat(32)
        const longmeta = 'LONG'.repeat(32)
        cmd_foo.add_argument(longopt)
        const expected = `\
            usage: PROG foo [-h]
                            [${longopt} ${longmeta}]

            options:
              -h, --help            show this help message and exit
              ${longopt} ${longmeta}
              `
        this.assertEqual(cmd_foo.format_help(), textwrap.dedent(expected))
    }

    test_usage_empty_group () {
        // See issue 26952
        const parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        parser.add_mutually_exclusive_group()
        this.assertEqual(parser.format_usage(), 'usage: PROG [-h]\n')
    }

    test_nested_mutex_groups () {
        const parser = argparse.ArgumentParser({ prog: 'PROG' })
        const group = parser.add_mutually_exclusive_group()
        group.add_argument('--spam')
        const cm = this.assertRaises(TypeError, () =>
            group.add_mutually_exclusive_group())
        this.assertRegex(String(cm.exception),
            /mutually exclusive groups cannot be nested/)
    }
}

function MEMixin (cls) {
    return class MEMixin extends cls {

        force_not_colorized = new Set([
            'test_usage_when_not_required',
            'test_usage_when_required',
            'test_help_when_not_required',
            'test_help_when_required'
        ])

        test_failures_when_not_required () {
            const parser = this.get_parser({ required: false })
            const error = ArgumentParserError
            for (const args_string of this.failures) {
                this.assertRaises(error, () =>
                    parser.parse_args(args_string.split(/\s+/).filter(Boolean)))
            }
        }

        test_failures_when_required () {
            const parser = this.get_parser({ required: true })
            const error = ArgumentParserError
            for (const args_string of this.failures.concat([''])) {
                this.assertRaises(error, () =>
                    parser.parse_args(args_string.split(/\s+/).filter(Boolean)))
            }
        }

        test_successes_when_not_required () {
            const parser = this.get_parser({ required: false })
            const successes = this.successes.concat(this.successes_when_not_required)
            for (const [args_string, expected_ns] of successes) {
                const actual_ns = parser.parse_args(args_string.split(/\s+/).filter(Boolean))
                this.assertEqual(actual_ns, expected_ns)
            }
        }

        test_successes_when_required () {
            const parser = this.get_parser({ required: true })
            for (const [args_string, expected_ns] of this.successes) {
                const actual_ns = parser.parse_args(args_string.split(/\s+/).filter(Boolean))
                this.assertEqual(actual_ns, expected_ns)
            }
        }

        test_usage_when_not_required () {
            const parser = this.get_parser({ required: false })
            const expected_usage = this.usage_when_not_required
            this.assertEqual(parser.format_usage(), textwrap.dedent(expected_usage))
        }

        test_usage_when_required () {
            const parser = this.get_parser({ required: true })
            const expected_usage = this.usage_when_required
            this.assertEqual(parser.format_usage(), textwrap.dedent(expected_usage))
        }

        test_help_when_not_required () {
            const parser = this.get_parser({ required: false })
            const help = this.usage_when_not_required + this.help
            this.assertEqual(parser.format_help(), textwrap.dedent(help))
        }

        test_help_when_required () {
            const parser = this.get_parser({ required: true })
            const help = this.usage_when_required + this.help
            this.assertEqual(parser.format_help(), textwrap.dedent(help))
        }
    }
}


const MEMixin_TestCase = MEMixin(TestCase)

class TestMutuallyExclusiveSimple extends MEMixin_TestCase {

    get_parser ({ required = undefined } = {}) {
        const parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        const group = parser.add_mutually_exclusive_group({ required })
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

        options:
          -h, --help   show this help message and exit
          --bar BAR    bar help
          --baz [BAZ]  baz help
        `
}


class TestMutuallyExclusiveLong extends MEMixin_TestCase {

    get_parser ({ required = undefined } = {}) {
        const parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        parser.add_argument('--abcde', { help: 'abcde help' })
        parser.add_argument('--fghij', { help: 'fghij help' })
        const group = parser.add_mutually_exclusive_group({ required })
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
    usage: PROG [-h] [--abcde ABCDE] [--fghij FGHIJ] [--klmno KLMNO |
                --pqrst PQRST]
    `
    usage_when_required = `\
    usage: PROG [-h] [--abcde ABCDE] [--fghij FGHIJ] (--klmno KLMNO |
                --pqrst PQRST)
    `
    help = `\

    options:
      -h, --help     show this help message and exit
      --abcde ABCDE  abcde help
      --fghij FGHIJ  fghij help
      --klmno KLMNO  klmno help
      --pqrst PQRST  pqrst help
    `
}


class TestMutuallyExclusiveFirstSuppressed extends MEMixin_TestCase {

    get_parser ({ required = undefined } = {}) {
        const parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        const group = parser.add_mutually_exclusive_group({ required })
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

        options:
          -h, --help  show this help message and exit
          -y          y help
        `
}


class TestMutuallyExclusiveManySuppressed extends MEMixin_TestCase {

    get_parser ({ required = undefined } = {}) {
        const parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        const group = parser.add_mutually_exclusive_group({ required })
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

        options:
          -h, --help  show this help message and exit
        `
}


class TestMutuallyExclusiveOptionalAndPositional extends MEMixin_TestCase {

    get_parser ({ required = undefined } = {}) {
        const parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        const group = parser.add_mutually_exclusive_group({ required })
        group.add_argument('--foo', { action: 'store_true', help: 'FOO' })
        group.add_argument('--spam', { help: 'SPAM' })
        group.add_argument('badger', { nargs: '*', help: 'BADGER' })
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
        ['--foo', NS({ foo: true, spam: undefined, badger: [] })],
        ['--spam S', NS({ foo: false, spam: 'S', badger: [] })],
        ['X', NS({ foo: false, spam: undefined, badger: ['X'] })],
        ['X Y Z', NS({ foo: false, spam: undefined, badger: ['X', 'Y', 'Z'] })],
    ]
    successes_when_not_required = [
        ['', NS({ foo: false, spam: undefined, badger: [] })],
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

        options:
          -h, --help   show this help message and exit
          --foo        FOO
          --spam SPAM  SPAM
        `
}


class TestMutuallyExclusiveOptionalsMixed extends MEMixin_TestCase {

    get_parser ({ required = undefined } = {}) {
        const parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        parser.add_argument('-x', { action: 'store_true', help: 'x help' })
        const group = parser.add_mutually_exclusive_group({ required })
        group.add_argument('-a', { action: 'store_true', help: 'a help' })
        group.add_argument('-b', { action: 'store_true', help: 'b help' })
        parser.add_argument('-y', { action: 'store_true', help: 'y help' })
        group.add_argument('-c', { action: 'store_true', help: 'c help' })
        parser.add_argument('-z', { action: 'store_true', help: 'z help' })
        return parser
    }

    failures = ['-a -b', '-b -c', '-a -c', '-a -b -c']
    successes = [
        ['-a', NS({ a: true, b: false, c: false, x: false, y: false, z: false })],
        ['-b', NS({ a: false, b: true, c: false, x: false, y: false, z: false })],
        ['-c', NS({ a: false, b: false, c: true, x: false, y: false, z: false })],
        ['-a -x', NS({ a: true, b: false, c: false, x: true, y: false, z: false })],
        ['-y -b', NS({ a: false, b: true, c: false, x: false, y: true, z: false })],
        ['-x -y -c', NS({ a: false, b: false, c: true, x: true, y: true, z: false })],
    ]
    successes_when_not_required = [
        ['', NS({ a: false, b: false, c: false, x: false, y: false, z: false })],
        ['-x', NS({ a: false, b: false, c: false, x: true, y: false, z: false })],
        ['-y', NS({ a: false, b: false, c: false, x: false, y: true, z: false })],
    ]

    usage_when_not_required = `\
        usage: PROG [-h] [-x] [-a | -b | -c] [-y] [-z]
        `
    usage_when_required = `\
        usage: PROG [-h] [-x] (-a | -b | -c) [-y] [-z]
        `
    help = `\

        options:
          -h, --help  show this help message and exit
          -x          x help
          -a          a help
          -b          b help
          -y          y help
          -c          c help
          -z          z help
        `
}


;(new class TestMutuallyExclusiveInGroup extends MEMixin_TestCase {

    get_parser ({ required = undefined } = {}) {
        const parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        const titled_group = parser.add_argument_group({
            title: 'Titled group', description: 'Group description' })
        const mutex_group =
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

        options:
          -h, --help  show this help message and exit

        Titled group:
          Group description

          --bar BAR   bar help
          --baz BAZ   baz help
        `
}).run()


class TestMutuallyExclusiveOptionalsAndPositionalsMixed extends MEMixin_TestCase {

    get_parser ({ required = undefined } = {}) {
        const parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        parser.add_argument('x', { help: 'x help' })
        parser.add_argument('-y', { action: 'store_true', help: 'y help' })
        const group = parser.add_mutually_exclusive_group({ required })
        group.add_argument('a', { nargs: '?', help: 'a help' })
        group.add_argument('-b', { action: 'store_true', help: 'b help' })
        group.add_argument('-c', { action: 'store_true', help: 'c help' })
        parser.add_argument('-z', { action: 'store_true', help: 'z help' })
        return parser
    }

    failures = ['X A -b', '-b -c', '-c X A']
    successes = [
        ['X A', NS({ a: 'A', b: false, c: false, x: 'X', y: false, z: false })],
        ['X -b', NS({ a: undefined, b: true, c: false, x: 'X', y: false, z: false })],
        ['X -c', NS({ a: undefined, b: false, c: true, x: 'X', y: false, z: false })],
        ['X A -y', NS({ a: 'A', b: false, c: false, x: 'X', y: true, z: false })],
        ['X -y -b', NS({ a: undefined, b: true, c: false, x: 'X', y: true, z: false })],
    ]
    successes_when_not_required = [
        ['X', NS({ a: undefined, b: false, c: false, x: 'X', y: false, z: false })],
        ['X -y', NS({ a: undefined, b: false, c: false, x: 'X', y: true, z: false })],
    ]

    usage_when_not_required = `\
        usage: PROG [-h] [-y] [-z] x [-b | -c | a]
        `
    usage_when_required = `\
        usage: PROG [-h] [-y] [-z] x (-b | -c | a)
        `
    help = `\

        positional arguments:
          x           x help
          a           a help

        options:
          -h, --help  show this help message and exit
          -y          y help
          -b          b help
          -c          c help
          -z          z help
        `
}


class TestMutuallyExclusiveOptionalOptional extends MEMixin_TestCase {

    get_parser ({ required = undefined } = {}) {
        const parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        const group = parser.add_mutually_exclusive_group({ required })
        group.add_argument('--foo')
        group.add_argument('--bar', { nargs: '?' })
        return parser
    }

    failures = [
        '--foo X --bar Y',
        '--foo X --bar',
    ]
    successes = [
        ['--foo X', NS({ foo: 'X', bar: undefined })],
        ['--bar X', NS({ foo: undefined, bar: 'X' })],
        ['--bar', NS({ foo: undefined, bar: undefined })],
    ]
    successes_when_not_required = [
        ['', NS({ foo: undefined, bar: undefined })],
    ]
    usage_when_required = `\
        usage: PROG [-h] (--foo FOO | --bar [BAR])
        `
    usage_when_not_required = `\
        usage: PROG [-h] [--foo FOO | --bar [BAR]]
        `
    help = `\

        options:
          -h, --help   show this help message and exit
          --foo FOO
          --bar [BAR]
        `
}


class TestMutuallyExclusiveOptionalWithDefault extends MEMixin_TestCase {

    get_parser ({ required = undefined } = {}) {
        const parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        const group = parser.add_mutually_exclusive_group({ required })
        group.add_argument('--foo')
        group.add_argument('--bar', { type: Boolean, default: true })
        return parser
    }

    failures = [
        '--foo X --bar Y',
        '--foo X --bar=',
    ]
    successes = [
        ['--foo X', NS({ foo: 'X', bar: true })],
        ['--bar X', NS({ foo: undefined, bar: true })],
        ['--bar=', NS({ foo: undefined, bar: false })],
    ]
    successes_when_not_required = [
        ['', NS({ foo: undefined, bar: true })],
    ]
    usage_when_required = `\
        usage: PROG [-h] (--foo FOO | --bar BAR)
        `
    usage_when_not_required = `\
        usage: PROG [-h] [--foo FOO | --bar BAR]
        `
    help = `\

        options:
          -h, --help  show this help message and exit
          --foo FOO
          --bar BAR
        `
}


class TestMutuallyExclusivePositionalWithDefault extends MEMixin_TestCase {

    get_parser ({ required = undefined } = {}) {
        const parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        const group = parser.add_mutually_exclusive_group({ required })
        group.add_argument('--foo')
        group.add_argument('bar', { nargs: '?', type: Boolean, default: true })
        return parser
    }

    failures = [
        '--foo X Y',
    ]
    successes = [
        ['--foo X', NS({ foo: 'X', bar: true })],
        ['X', NS({ foo: undefined, bar: true })],
    ]
    successes_when_not_required = [
        ['', NS({ foo: undefined, bar: true })],
    ]
    usage_when_required = `\
        usage: PROG [-h] (--foo FOO | bar)
        `
    usage_when_not_required = `\
        usage: PROG [-h] [--foo FOO | bar]
        `
    help = `\

        positional arguments:
          bar

        options:
          -h, --help  show this help message and exit
          --foo FOO
        `
}

// =================================================
// Mutually exclusive group in parent parser tests
// =================================================

function MEPBase (cls) {

    return class MEPBase extends cls {
        get_parser ({ required = undefined } = {}) {
            const parent = super.get_parser({ required })
            const parser = new ErrorRaisingArgumentParser({
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


;(new TestMutuallyExclusiveOptionalOptional()).run()
;(new TestMutuallyExclusiveOptionalWithDefault()).run()
;(new TestMutuallyExclusivePositionalWithDefault()).run()


// =================
// Set default tests
// =================

;(new class TestSetDefaults extends TestCase {

    test_set_defaults_no_args () {
        const parser = new ErrorRaisingArgumentParser()
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

    test_set_defaults_with_args () {
        const parser = new ErrorRaisingArgumentParser()
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

    test_set_defaults_subparsers () {
        const parser = new ErrorRaisingArgumentParser()
        parser.set_defaults({ x: 'foo' })
        const subparsers = parser.add_subparsers()
        const parser_a = subparsers.add_parser('a')
        parser_a.set_defaults({ y: 'bar' })
        this.assertEqual(NS({ x: 'foo', y: 'bar' }),
                         parser.parse_args('a'.split(' ')))
    }

    test_set_defaults_parents () {
        const parent = new ErrorRaisingArgumentParser({ add_help: false })
        parent.set_defaults({ x: 'foo' })
        const parser = new ErrorRaisingArgumentParser({ parents: [parent] })
        this.assertEqual(NS({ x: 'foo' }), parser.parse_args([]))
    }

    test_set_defaults_on_parent_and_subparser () {
        const parser = argparse.ArgumentParser()
        const xparser = parser.add_subparsers().add_parser('X')
        parser.set_defaults({ foo: 1 })
        xparser.set_defaults({ foo: 2 })
        this.assertEqual(NS({ foo: 2 }), parser.parse_args(['X']))
    }

    test_set_defaults_same_as_add_argument () {
        const parser = new ErrorRaisingArgumentParser()
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

    test_set_defaults_same_as_add_argument_group () {
        const parser = new ErrorRaisingArgumentParser()
        parser.set_defaults({ w: 'W', x: 'X', y: 'Y', z: 'Z' })
        const group = parser.add_argument_group('foo')
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

    test_get_default () {
        const parser = new ErrorRaisingArgumentParser()
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

    test_empty () {
        const ns = argparse.Namespace()
        this.assertNotIn('', ns)
        this.assertNotIn('x', ns)
    }

    test_non_empty () {
        const ns = argparse.Namespace({ x: 1, y: 2 })
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

    constructor () {
        super()
        this.force_not_colorized = new Set()

        class AddTests {

            constructor (test_class, func_suffix, std_name) {
                this.func_suffix = func_suffix
                this.std_name = std_name

                for (const test_func of [this.test_format,
                                       this.test_print,
                                       this.test_print_file]) {
                    const test_name = sub('%s_%s', test_func.name, func_suffix)
                    test_class[test_name] = () => test_func.call(this, test_class)
                    test_class.force_not_colorized.add(test_name)
                }
            }

            _get_parser (tester) {
                const parser = new argparse.ArgumentParser(...tester.parser_signature)
                for (const argument_sig of tester.argument_signatures || []) {
                    parser.add_argument(...argument_sig)
                }
                const group_sigs = tester.argument_group_signatures || []
                for (const [group_sig, argument_sigs] of group_sigs) {
                    const group = parser.add_argument_group(...group_sig)
                    for (const argument_sig of argument_sigs) {
                        group.add_argument(...argument_sig)
                    }
                }
                const subparsers_sigs = tester.subparsers_signatures || []
                if (subparsers_sigs.length) {
                    const subparsers = parser.add_subparsers()
                    for (const subparser_sig of subparsers_sigs) {
                        subparsers.add_parser(...subparser_sig)
                    }
                }
                return parser
            }

            _test (tester, parser_text) {
                let expected_text = tester[this.func_suffix]
                expected_text = textwrap.dedent(expected_text)
                tester.assertEqual(expected_text, parser_text)
            }

            test_format (tester) {
                const parser = this._get_parser(tester)
                const format = parser[sub('format_%s', this.func_suffix)]
                this._test(tester, format.call(parser))
            }

            test_print (tester) {
                const parser = this._get_parser(tester)
                const print_ = parser[sub('print_%s', this.func_suffix)]
                const old_stream = Object.getOwnPropertyDescriptor(process, this.std_name)
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

            test_print_file (tester) {
                const parser = this._get_parser(tester)
                const print_ = parser[sub('print_%s', this.func_suffix)]
                const sfile = new StdIOBuffer()
                print_.call(parser, sfile)
                const parser_text = sfile.getvalue()
                this._test(tester, parser_text)
            }
        }

        // add tests for {format,print}_{usage,help}
        for (const [func_suffix, std_name] of [['usage', 'stdout'],
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

        options:
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
    setUp () {
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

        options:
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

        options:
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

        options:
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

        options:
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

        options:
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

        options:
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
        Sig('--bazz', { action: argparse.BooleanOptionalAction,
                        default: argparse.SUPPRESS, help: 'Bazz!' }),
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
                    [-f | --foobar | --no-foobar | --barfoo | --no-barfoo]
                    [--bazz | --no-bazz] [-y [Y]] [-z Z Z Z]
                    a b b [c] [d ...] e [e ...]
        `
    help = this.usage + `\

        positional arguments:
          a                     a
          b                     b
          c                     c

        options:
          -h, --help            show this help message and exit
          -w W [W ...]          w
          -x [X ...]            x
          --foo, --no-foo       Whether to foo
          --bar, --no-bar       Whether to bar
          -f, --foobar, --no-foobar, --barfoo, --no-barfoo
          --bazz, --no-bazz     Bazz!

        group:
          -y [Y]                y
          -z Z Z Z              z
          d                     d
          e                     e
        `
    version = ''
}).run()


;(new class TestHelpUsageWithParentheses extends HelpTestCase {
    parser_signature = Sig({ prog: 'PROG' })
    argument_signatures = [
        Sig('positional', { metavar: '(example) positional' }),
        Sig('-p', '--optional', { metavar: '{1 (option A), 2 (option B)}' }),
    ]

    usage = `\
        usage: PROG [-h] [-p {1 (option A), 2 (option B)}] (example) positional
        `
    help = this.usage + `\

        positional arguments:
          (example) positional

        options:
          -h, --help            show this help message and exit
          -p, --optional {1 (option A), 2 (option B)}
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

        options:
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

        options:
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

        options:
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

        options:
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

        options:
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

        options:
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


;(new class TestHelpUsageMetavarsSpacesParentheses extends HelpTestCase {
    // https://github.com/python/cpython/issues/62549
    // https://github.com/python/cpython/issues/89743
    parser_signature = Sig({ prog: 'PROG' })
    argument_signatures = [
        Sig('-n1', { metavar: '()', help: 'n1' }),
        Sig('-o1', { metavar: '(1, 2)', help: 'o1' }),
        Sig('-u1', { metavar: ' (uu) ', help: 'u1' }),
        Sig('-v1', { metavar: '( vv )', help: 'v1' }),
        Sig('-w1', { metavar: '(w)w', help: 'w1' }),
        Sig('-x1', { metavar: 'x(x)', help: 'x1' }),
        Sig('-y1', { metavar: 'yy)', help: 'y1' }),
        Sig('-z1', { metavar: '(zz', help: 'z1' }),
        Sig('-n2', { metavar: '[]', help: 'n2' }),
        Sig('-o2', { metavar: '[1, 2]', help: 'o2' }),
        Sig('-u2', { metavar: ' [uu] ', help: 'u2' }),
        Sig('-v2', { metavar: '[ vv ]', help: 'v2' }),
        Sig('-w2', { metavar: '[w]w', help: 'w2' }),
        Sig('-x2', { metavar: 'x[x]', help: 'x2' }),
        Sig('-y2', { metavar: 'yy]', help: 'y2' }),
        Sig('-z2', { metavar: '[zz', help: 'z2' }),
    ]

    usage = `\
        usage: PROG [-h] [-n1 ()] [-o1 (1, 2)] [-u1  (uu) ] [-v1 ( vv )] [-w1 (w)w]
                    [-x1 x(x)] [-y1 yy)] [-z1 (zz] [-n2 []] [-o2 [1, 2]] [-u2  [uu] ]
                    [-v2 [ vv ]] [-w2 [w]w] [-x2 x[x]] [-y2 yy]] [-z2 [zz]
        `
    help = this.usage + `\

        options:
          -h, --help  show this help message and exit
          -n1 ()      n1
          -o1 (1, 2)  o1
          -u1  (uu)   u1
          -v1 ( vv )  v1
          -w1 (w)w    w1
          -x1 x(x)    x1
          -y1 yy)     y1
          -z1 (zz     z1
          -n2 []      n2
          -o2 [1, 2]  o2
          -u2  [uu]   u2
          -v2 [ vv ]  v2
          -w2 [w]w    w2
          -x2 x[x]    x2
          -y2 yy]     y2
          -z2 [zz     z2
        `
    version = ''
}).run()


;(new class TestHelpUsageNoWhitespaceCrash extends TestCase {
    force_color = false

    test_all_suppressed_mutex_followed_by_long_arg () {
        // https://github.com/python/cpython/issues/62090
        // https://github.com/python/cpython/issues/96310
        const parser = argparse.ArgumentParser({ prog: 'PROG' })
        const mutex = parser.add_mutually_exclusive_group()
        mutex.add_argument('--spam', { help: argparse.SUPPRESS })
        parser.add_argument('--eggs-eggs-eggs-eggs-eggs-eggs')
        const usage = textwrap.dedent(`\
        usage: PROG [-h]
                    [--eggs-eggs-eggs-eggs-eggs-eggs EGGS_EGGS_EGGS_EGGS_EGGS_EGGS]
        `)
        this.assertEqual(parser.format_usage(), usage)
    }

    test_newline_in_metavar () {
        // https://github.com/python/cpython/issues/77048
        const mapping = ['123456', '12345', '12345', '123']
        const parser = argparse.ArgumentParser({ prog: '11111111111111' })
        parser.add_argument('-v', '--verbose',
                            { help: 'verbose mode', action: 'store_true' })
        parser.add_argument('targets', {
            help: 'installation targets',
            nargs: '+',
            metavar: mapping.join('\n')
        })
        const usage = textwrap.dedent(`\
        usage: 11111111111111 [-h] [-v]
                              123456
        12345
        12345
        123 [123456
        12345
        12345
        123 ...]
        `)
        this.assertEqual(parser.format_usage(), usage)
    }

    test_empty_metavar_required_arg () {
        // https://github.com/python/cpython/issues/82091
        const parser = argparse.ArgumentParser({ prog: 'PROG' })
        parser.add_argument('--nil', { metavar: '', required: true })
        parser.add_argument('--a', { metavar: 'A'.repeat(70) })
        const usage =
            'usage: PROG [-h] --nil \n' +
            '            [--a AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
            'AAAAAAAAAAAAAAAAAAAAAAA]\n'
        this.assertEqual(parser.format_usage(), usage)
    }

    test_all_suppressed_mutex_with_optional_nargs () {
        // https://github.com/python/cpython/issues/98666
        const parser = argparse.ArgumentParser({ prog: 'PROG' })
        const mutex = parser.add_mutually_exclusive_group()
        mutex.add_argument('--param1', {
            nargs: '?', const: 'default', metavar: 'NAME', help: argparse.SUPPRESS
        })
        mutex.add_argument('--param2', {
            nargs: '?', const: 'default', metavar: 'NAME', help: argparse.SUPPRESS
        })
        const usage = 'usage: PROG [-h]\n'
        this.assertEqual(parser.format_usage(), usage)
    }

    test_long_mutex_groups_wrap () {
        const parser = argparse.ArgumentParser({ prog: 'PROG' })
        const g = parser.add_mutually_exclusive_group()
        g.add_argument('--op1', { metavar: 'MET', nargs: '?' })
        g.add_argument('--op2', { metavar: ['MET1', 'MET2'], nargs: '*' })
        g.add_argument('--op3', { nargs: '*' })
        g.add_argument('--op4', { metavar: ['MET1', 'MET2'], nargs: '+' })
        g.add_argument('--op5', { nargs: '+' })
        g.add_argument('--op6', { nargs: 3 })
        g.add_argument('--op7', { metavar: ['MET1', 'MET2', 'MET3'], nargs: 3 })

        const usage = textwrap.dedent(`\
        usage: PROG [-h] [--op1 [MET] | --op2 [MET1 [MET2 ...]] | --op3 [OP3 ...] |
                    --op4 MET1 [MET2 ...] | --op5 OP5 [OP5 ...] | --op6 OP6 OP6 OP6 |
                    --op7 MET1 MET2 MET3]
        `)
        this.assertEqual(parser.format_usage(), usage)
    }

    test_mutex_groups_with_mixed_optionals_positionals_wrap () {
        // https://github.com/python/cpython/issues/75949
        // Mutually exclusive groups containing both optionals and positionals
        // should preserve pipe separators when the usage line wraps.
        const parser = argparse.ArgumentParser({ prog: 'PROG' })
        const g = parser.add_mutually_exclusive_group()
        g.add_argument('-v', '--verbose', { action: 'store_true' })
        g.add_argument('-q', '--quiet', { action: 'store_true' })
        g.add_argument('-x', '--extra-long-option-name', { nargs: '?' })
        g.add_argument('-y', '--yet-another-long-option', { nargs: '?' })
        g.add_argument('positional', { nargs: '?' })

        const usage = textwrap.dedent(`\
        usage: PROG [-h]
                    [-v | -q | -x [EXTRA_LONG_OPTION_NAME] |
                    -y [YET_ANOTHER_LONG_OPTION] | positional]
        `)
        this.assertEqual(parser.format_usage(), usage)
    }
}).run()


;(new class TestHelpVariableExpansion extends HelpTestCase {
    /* Test that variables are expanded properly in help messages */

    parser_signature = Sig({ prog: 'PROG' })
    argument_signatures = [
        Sig('-x', { type: 'int',
            help: 'x %(prog)s %(default)s %(type)s %%' }),
        Sig('-y', { action: 'store_const', default: 42, const: 'XXX',
            help: 'y %(prog)s %(default)s %(const)s' }),
        Sig('--foo', { choices: ['a', 'b', 'c'],
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

        options:
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

        options:
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

        options:
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

        options:
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

        options:
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

        options:
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

        options:
          ^^foo          foo help
          ;b, ;;bar BAR  bar help
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

        options:
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

        options:
          -h, --help  show this help message and exit
          --foo FOO
        `
    version = ''
}).run()


;(new class TestHelpTupleMetavarOptional extends HelpTestCase {
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

        options:
          -h, --help        show this help message and exit
          -w W1 [W2 ...]    w
          -x [X1 [X2 ...]]  x
          -y Y1 Y2 Y3       y
          -z [Z1]           z
        `
    version = ''
}).run()


;(new class TestHelpTupleMetavarPositional extends HelpTestCase {
    /* Test specifying metavar on a Positional as a tuple */

    parser_signature = Sig({ prog: 'PROG' })
    argument_signatures = [
        Sig('w', { help: 'w help', nargs: '+', metavar: ['W1', 'W2'] }),
        Sig('x', { help: 'x help', nargs: '*', metavar: ['X1', 'X2'] }),
        Sig('y', { help: 'y help', nargs: 3, metavar: ['Y1', 'Y2', 'Y3'] }),
        Sig('z', { help: 'z help', nargs: '?', metavar: ['Z1'] }),
    ]
    argument_group_signatures = []
    usage = `\
        usage: PROG [-h] W1 [W2 ...] [X1 [X2 ...]] Y1 Y2 Y3 [Z1]
        `
    help = this.usage + `\

        positional arguments:
          W1 W2       w help
          X1 X2       x help
          Y1 Y2 Y3    y help
          Z1          z help

        options:
          -h, --help  show this help message and exit
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

        options:
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

        options:
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
        Sig('--required', { required: true, help: 'some help' }),
        Sig('--taz', { action: argparse.BooleanOptionalAction,
            help: 'Whether to taz it', default: true }),
        Sig('--corge', { action: argparse.BooleanOptionalAction,
            help: 'Whether to corge it', default: argparse.SUPPRESS }),
        Sig('--quux', { help: 'Set the quux', default: 42 }),
        Sig('spam', { help: 'spam help' }),
        Sig('badger', { nargs: '?', default: 'wooden', help: 'badger help' }),
    ]
    argument_group_signatures = [
        [Sig('title', { description: 'description' }),
         [Sig('--baz', { type: 'int', default: 42, help: 'baz help' })]],
    ]
    usage = `\
        usage: PROG [-h] [--foo FOO] [--bar] --required REQUIRED [--taz | --no-taz]
                    [--corge | --no-corge] [--quux QUUX] [--baz BAZ]
                    spam [badger]
        `
    help = this.usage + `\

        description

        positional arguments:
          spam                 spam help
          badger               badger help (default: wooden)

        options:
          -h, --help           show this help message and exit
          --foo FOO            foo help - oh and by the way, undefined
          --bar                bar help (default: false)
          --required REQUIRED  some help
          --taz, --no-taz      Whether to taz it (default: true)
          --corge, --no-corge  Whether to corge it
          --quux QUUX          Set the quux (default: 42)

        title:
          description

          --baz BAZ            baz help (default: 42)
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

        options:
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

        options:
          -h, --help  show this help message and exit
          --foo FOO   foo help
        `
}).run()


;(new class TestHelpSubparsersOrdering extends HelpTestCase {
    /* Test ordering of subcommands in help matches the code */
    parser_signature = Sig({ prog: 'PROG',
                             description: 'display some subcommands' })
    argument_signatures = [Sig('-v', '--version', { action: 'version', version: '0.1' })]

    subparsers_signatures = ['a', 'b', 'c', 'd', 'e'].map(name => Sig({ name }))

    usage = `\
        usage: PROG [-h] [-v] {a,b,c,d,e} ...
        `

    help = this.usage + `\

        display some subcommands

        positional arguments:
          {a,b,c,d,e}

        options:
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

    subparsers_signatures = this.subcommand_data.map(([name, help]) => Sig({ name, help }))

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

        options:
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

        options:
          -h, --help      show this help message and exit
          -b custom_type
          -c SOME FLOAT
        `
    version = ''
}).run()


;(new class TestHelpCustomHelpFormatter extends TestCase {
    force_color = false

    test_custom_formatter_function () {
        function custom_formatter (options) {
            return argparse.RawTextHelpFormatter({
                ...options,
                indent_increment: 5
            })
        }

        const parser = argparse.ArgumentParser({
            prog: 'PROG',
            prefix_chars: '-+',
            formatter_class: custom_formatter
        })
        parser.add_argument('+f', '++foo', { help: 'foo help' })
        parser.add_argument('spam', { help: 'spam help' })

        const parser_help = parser.format_help()
        this.assertEqual(parser_help, textwrap.dedent(`\
            usage: PROG [-h] [+f FOO] spam

            positional arguments:
                 spam           spam help

            options:
                 -h, --help     show this help message and exit
                 +f, ++foo FOO  foo help
        `))
    }

    test_custom_formatter_class () {
        class CustomFormatter extends argparse.RawTextHelpFormatter {
            constructor (options) {
                super({ ...options, indent_increment: 5 })
            }
        }

        const parser = argparse.ArgumentParser({
            prog: 'PROG',
            prefix_chars: '-+',
            formatter_class: CustomFormatter
        })
        parser.add_argument('+f', '++foo', { help: 'foo help' })
        parser.add_argument('spam', { help: 'spam help' })

        const parser_help = parser.format_help()
        this.assertEqual(parser_help, textwrap.dedent(`\
            usage: PROG [-h] [+f FOO] spam

            positional arguments:
                 spam           spam help

            options:
                 -h, --help     show this help message and exit
                 +f, ++foo FOO  foo help
        `))
    }

    test_usage_long_subparser_command () {
        /* Test that subparser commands are formatted correctly in help */
        function custom_formatter (options) {
            return argparse.RawTextHelpFormatter({
                ...options,
                max_help_position: 50
            })
        }

        const parent_parser = argparse.ArgumentParser({
            prog: 'PROG',
            formatter_class: custom_formatter
        })

        const cmd_subparsers = parent_parser.add_subparsers({
            title: 'commands',
            metavar: 'CMD',
            help: 'command to use'
        })
        cmd_subparsers.add_parser('add', { help: 'add something' })
        cmd_subparsers.add_parser('remove', { help: 'remove something' })
        cmd_subparsers.add_parser('a-very-long-command', {
            help: 'command that does something'
        })

        const parser_help = parent_parser.format_help()
        this.assertEqual(parser_help, textwrap.dedent(`\
            usage: PROG [-h] CMD ...

            options:
              -h, --help             show this help message and exit

            commands:
              CMD                    command to use
                add                  add something
                remove               remove something
                a-very-long-command  command that does something
        `))
    }
}).run()


// =====================================
// Optional/Positional constructor tests
// =====================================

;(new class TestInvalidArgumentConstructors extends TestCase {
    /* Test a bunch of invalid Argument constructors */

    assertTypeError (...args) {
        let errmsg
        const kwargs = args[args.length - 1]
        if (kwargs && typeof kwargs === 'object' && 'errmsg' in kwargs) {
            const options = { ...kwargs }
            errmsg = options.errmsg
            delete options.errmsg
            args[args.length - 1] = options
        }
        const parser = argparse.ArgumentParser()
        const cm = this.assertRaises(TypeError, () => parser.add_argument(...args))
        if (errmsg !== undefined) {
            this.assertRegex(String(cm.exception), new RegExp(errmsg))
        }
    }

    assertValueError (...args) {
        let errmsg
        const kwargs = args[args.length - 1]
        if (kwargs && typeof kwargs === 'object' && 'errmsg' in kwargs) {
            const options = { ...kwargs }
            errmsg = options.errmsg
            delete options.errmsg
            args[args.length - 1] = options
        }
        const parser = argparse.ArgumentParser()
        // same as TypeError in js
        const cm = this.assertRaises(TypeError, () => parser.add_argument(...args))
        if (errmsg !== undefined) {
            this.assertRegex(String(cm.exception), new RegExp(errmsg))
        }
    }

    test_invalid_keyword_arguments () {
        this.assertTypeError('-x', { bar: undefined })
        this.assertTypeError('-y', { callback: 'foo' })
        this.assertTypeError('-y', { callback_args: [] })
        this.assertTypeError('-y', { callback_kwargs: {} })
    }

    test_missing_destination () {
        this.assertTypeError()
        for (const action of ['store', 'append', 'extend']) {
            this.assertTypeError({ action })
        }
    }

    test_invalid_option_strings () {
        this.assertTypeError('-', { errmsg: 'dest= is required' })
        this.assertTypeError('--', { errmsg: 'dest= is required' })
        this.assertTypeError('---', { errmsg: 'dest= is required' })
    }

    test_invalid_prefix () {
        this.assertValueError('--foo', '+foo', {
            errmsg: 'must start with a character'
        })
    }

    test_invalid_type () {
        this.assertTypeError('--foo', {
            type: 'Number', errmsg: "'Number' is not callable"
        })
        this.assertTypeError('--foo', {
            type: [Number, Number], errmsg: 'is not callable'
        })
    }

    test_invalid_action () {
        this.assertValueError('-x', { action: 'foo', errmsg: 'unknown action' })
        this.assertValueError('foo', { action: 'baz', errmsg: 'unknown action' })
        this.assertValueError('--foo', {
            action: ['store', 'append'], errmsg: 'unknown action'
        })
        this.assertValueError('--foo', { action: 'store-true', errmsg: 'unknown action' })
    }

    test_invalid_help () {
        this.assertValueError('--foo', {
            help: '%Y-%m-%d', errmsg: 'badly formed help string'
        })
        this.assertValueError('--foo', {
            help: '%(spam)s', errmsg: 'badly formed help string'
        })
        this.assertValueError('--foo', {
            help: '%(prog)d', errmsg: 'badly formed help string'
        })
    }

    test_multiple_dest () {
        const parser = argparse.ArgumentParser()
        parser.add_argument({ dest: 'foo' })
        const cm = this.assertRaises(TypeError, () =>
            parser.add_argument('bar', { dest: 'baz' }))
        this.assertRegex(String(cm.exception),
            /dest supplied twice for positional argument, did you mean metavar\?/)
    }

    test_no_argument_actions () {
        for (const action of ['store_const', 'store_true', 'store_false',
                              'append_const', 'count']) {
            for (const attrs of [{ type: 'int' }, { nargs: '+' },
                                 { choices: ['a', 'b'] }]) {
                this.assertTypeError('-x', { action, ...attrs })
                this.assertTypeError('x', { action, ...attrs })
            }
            this.assertValueError('x', { action,
                errmsg: `action '${action}' is not valid for positional arguments` })
            this.assertTypeError('-x', { action, nargs: 0 })
            this.assertValueError('x', { action, nargs: 0,
                errmsg: 'nargs for positionals must be != 0' })
        }
    }

    test_more_than_one_argument_actions () {
        for (const action of ['store', 'append', 'extend']) {
            // nargs=0 is disallowed
            const action_name = action === 'extend' ? 'append' : action
            const errmsg = `nargs for ${action_name} actions must be != 0`
            this.assertValueError('-x', { nargs: 0, action, errmsg })
            this.assertValueError('spam', { nargs: 0, action,
                errmsg: 'nargs for positionals must be != 0' })

            // const is disallowed with non-optional arguments
            for (const nargs of [1, '*', '+']) {
                this.assertValueError('-x', { const: 'foo', nargs, action })
                this.assertValueError('spam', { const: 'foo', nargs, action })
            }
        }
    }


    test_version_missing_params () {
        this.assertTypeError('command', { action: 'version' })
    }

    test_no_argument_no_const_actions () {
        // options with zero arguments
        for (const action of ['store_true', 'store_false', 'count']) {
            // const is always disallowed
            this.assertTypeError('-x', { const: 'foo', action })

            // nargs is always disallowed
            this.assertTypeError('-x', { nargs: '*', action })
        }
    }

    test_required_const_actions () {
        for (const action of ['store_const', 'append_const']) {
            // nargs is always disallowed
            this.assertTypeError('-x', { nargs: '+', action })
        }
    }

    test_parsers_action_missing_params () {
        this.assertTypeError('command', { action: 'parsers' })
        this.assertTypeError('command', { action: 'parsers', prog: 'PROG' })
        this.assertTypeError('command', {
            action: 'parsers', parser_class: argparse.ArgumentParser
        })
    }

    test_required_positional () {
        this.assertTypeError('foo', { required: true })
    }

    test_user_defined_action () {
        class Success extends Error {}

        class Action extends argparse.Action {
            constructor (...args) {
                super(...args)
                if (this.dest === 'spam' &&
                    this.const === Success &&
                    this.default === Success) {
                    throw new Success()
                }
            }

            call () {}
        }

        const parser = argparse.ArgumentParser()
        this.assertRaises(Success, () => parser.add_argument('--spam', {
            action: Action, default: Success, const: Success
        }))
        this.assertRaises(Success, () => parser.add_argument('spam', {
            action: Action, default: Success, const: Success
        }))
    }
}).run()

// ================================
// Actions returned by add_argument
// ================================

;(new class TestActionsReturned extends TestCase {

    test_dest () {
        const parser = argparse.ArgumentParser()
        let action = parser.add_argument('--foo')
        this.assertEqual(action.dest, 'foo')
        action = parser.add_argument('-b', '--bar')
        this.assertEqual(action.dest, 'bar')
        action = parser.add_argument('-x', '-y')
        this.assertEqual(action.dest, 'x')
    }

    test_misc () {
        const parser = argparse.ArgumentParser()
        const action = parser.add_argument('--foo', { nargs: '?', const: 42,
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
    force_not_colorized = new Set(['test_resolve_error'])

    test_bad_type () {
        this.assertRaises(TypeError,
                          () => argparse.ArgumentParser({ conflict_handler: 'foo' }))
    }

    test_conflict_error () {
        const parser = argparse.ArgumentParser()
        parser.add_argument('-x')
        this.assertRaises(argparse.ArgumentError,
                          () => parser.add_argument('-x'))
        parser.add_argument('--spam')
        this.assertRaises(argparse.ArgumentError,
                          () => parser.add_argument('--spam'))
    }

    test_resolve_error () {
        const get_parser = argparse.ArgumentParser
        const parser = get_parser({ prog: 'PROG', conflict_handler: 'resolve' })

        parser.add_argument('-x', { help: 'OLD X' })
        parser.add_argument('-x', { help: 'NEW X' })
        this.assertEqual(parser.format_help(), textwrap.dedent(`\
            usage: PROG [-h] [-x X]

            options:
              -h, --help  show this help message and exit
              -x X        NEW X
            `))

        parser.add_argument('--spam', { metavar: 'OLD_SPAM' })
        parser.add_argument('--spam', { metavar: 'NEW_SPAM' })
        this.assertEqual(parser.format_help(), textwrap.dedent(`\
            usage: PROG [-h] [-x X] [--spam NEW_SPAM]

            options:
              -h, --help       show this help message and exit
              -x X             NEW X
              --spam NEW_SPAM
            `))
    }

    test_subparser_conflict () {
        const parser = argparse.ArgumentParser()
        const sp = parser.add_subparsers()
        sp.add_parser('fullname', { aliases: ['alias'] })
        let cm = this.assertRaises(TypeError, () => sp.add_parser('fullname'))
        this.assertRegex(String(cm.exception), /conflicting subparser: fullname/)
        cm = this.assertRaises(TypeError, () => sp.add_parser('alias'))
        this.assertRegex(String(cm.exception), /conflicting subparser: alias/)
        cm = this.assertRaises(TypeError, () =>
            sp.add_parser('other', { aliases: ['fullname'] }))
        this.assertRegex(String(cm.exception), /conflicting subparser alias: fullname/)
        cm = this.assertRaises(TypeError, () =>
            sp.add_parser('other', { aliases: ['alias'] }))
        this.assertRegex(String(cm.exception), /conflicting subparser alias: alias/)
    }
}).run()


// =============================
// Help and Version option tests
// =============================

;(new class TestOptionalsHelpVersionActions extends TestCase {
    /* Test the help and version actions */

    force_color = false

    assertPrintHelpExit (parser, args_str) {
        const cm = this.assertRaises(ArgumentParserError, () =>
            parser.parse_args(args_str.split(/\s+/).filter(Boolean)))
        this.assertEqual(parser.format_help(), cm.exception.stdout)
    }

    assertArgumentParserError (parser, ...args) {
        this.assertRaises(ArgumentParserError, () => parser.parse_args(args))
    }

    test_version () {
        const parser = new ErrorRaisingArgumentParser()
        parser.add_argument('-v', '--version', { action: 'version', version: '1.0' })
        this.assertPrintHelpExit(parser, '-h')
        this.assertPrintHelpExit(parser, '--help')
        this.assertNotIn('format_version', parser)
    }

    test_version_format () {
        const parser = new ErrorRaisingArgumentParser({ prog: 'PPP' })
        parser.add_argument('-v', '--version', { action: 'version', version: '%(prog)s 3.5' })
        const cm = this.assertRaises(ArgumentParserError, () =>
            parser.parse_args(['-v']))
        this.assertEqual('PPP 3.5\n', cm.exception.stdout)
    }

    test_version_no_help () {
        const parser = new ErrorRaisingArgumentParser({ add_help: false })
        parser.add_argument('-v', '--version', { action: 'version', version: '1.0' })
        this.assertArgumentParserError(parser, '-h')
        this.assertArgumentParserError(parser, '--help')
        this.assertNotIn('format_version', parser)
    }

    test_version_action () {
        const parser = new ErrorRaisingArgumentParser({ prog: 'XXX' })
        parser.add_argument('-V', { action: 'version', version: '%(prog)s 3.7' })
        const cm = this.assertRaises(ArgumentParserError, () =>
            parser.parse_args(['-V']))
        this.assertEqual('XXX 3.7\n', cm.exception.stdout)
    }

    test_no_help () {
        const parser = new ErrorRaisingArgumentParser({ add_help: false })
        this.assertArgumentParserError(parser, '-h')
        this.assertArgumentParserError(parser, '--help')
        this.assertArgumentParserError(parser, '-v')
        this.assertArgumentParserError(parser, '--version')
    }

    test_alternate_help_version () {
        const parser = new ErrorRaisingArgumentParser()
        parser.add_argument('-x', { action: 'help' })
        parser.add_argument('-y', { action: 'version' })
        this.assertPrintHelpExit(parser, '-x')
        this.assertArgumentParserError(parser, '-v')
        this.assertArgumentParserError(parser, '--version')
        this.assertNotIn('format_version', parser)
    }

    test_help_version_extra_arguments () {
        const parser = new ErrorRaisingArgumentParser()
        parser.add_argument('--version', { action: 'version', version: '1.0' })
        parser.add_argument('-x', { action: 'store_true' })
        parser.add_argument('y')

        // try all combinations of valid prefixes and suffixes
        const valid_prefixes = ['', '-x', 'foo', '-x bar', 'baz -x']
        const valid_suffixes = valid_prefixes.concat(['--bad-option', 'foo bar baz'])
        for (const prefix of valid_prefixes) {
            let format
            for (const suffix of valid_suffixes) {
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

    assertStringEqual (obj, result_string) {
        const str = String, repr = util.inspect
        for (const func of [str, repr]) {
            this.assertEqual(func(obj), result_string)
        }
    }

    test_optional () {
        const option = argparse.Action({
            option_strings: ['--foo', '-a', '-b'],
            dest: 'b',
            type: 'int',
            nargs: '+',
            default: 42,
            choices: [1, 2, 3],
            required: false,
            help: 'HELP',
            metavar: 'METAVAR' })
        const string = (
            "Action(option_strings=[ '--foo', '-a', '-b' ], dest='b', " +
            "nargs='+', const=undefined, default=42, type='int', " +
            "choices=[ 1, 2, 3 ], required=false, help='HELP', " +
            "metavar='METAVAR', deprecated=false)")
        this.assertStringEqual(option, string)
    }

    test_argument () {
        const argument = argparse.Action({
            option_strings: [],
            dest: 'x',
            type: Number,
            nargs: '?',
            default: 2.5,
            choices: [0.5, 1.5, 2.5],
            required: true,
            help: 'H HH H',
            metavar: 'MV MV MV' })
        const string = sub(
            "Action(option_strings=[], dest='x', nargs='?', " +
            "const=undefined, default=2.5, type=%r, choices=[ 0.5, 1.5, 2.5 ], " +
            "required=true, help='H HH H', metavar='MV MV MV', " +
            "deprecated=false)", Number)
        this.assertStringEqual(argument, string)
    }

    test_namespace () {
        const ns = argparse.Namespace({ foo: 42, bar: 'spam' })
        const string = "Namespace(foo=42, bar='spam')"
        this.assertStringEqual(ns, string)
    }

    test_namespace_starkwargs_notidentifier () {
        const ns = argparse.Namespace({'"': 'quote'})
        const string = `Namespace(**{ '"': 'quote' })`
        this.assertStringEqual(ns, string)
    }

    test_namespace_kwargs_and_starkwargs_notidentifier () {
        const ns = argparse.Namespace({ a: 1, '"': 'quote'})
        const string = `Namespace(a=1, **{ '"': 'quote' })`
        this.assertStringEqual(ns, string)
    }

    test_namespace_starkwargs_identifier () {
        const ns = argparse.Namespace({valid: true})
        const string = "Namespace(valid=true)"
        this.assertStringEqual(ns, string)
    }

    test_parser () {
        const parser = argparse.ArgumentParser({ prog: 'PROG' })
        const string = sub(
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

    test_constructor () {
        const ns = argparse.Namespace({ a: 42, b: 'spam' })
        this.assertEqual(ns.a, 42)
        this.assertEqual(ns.b, 'spam')
    }

    test_equality () {
        const ns1 = argparse.Namespace({ a: 1, b: 2 })
        const ns2 = argparse.Namespace({ b: 2, a: 1 })
        const ns3 = argparse.Namespace({ a: 1 })
        const ns4 = argparse.Namespace({ b: 2 })

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

    test_argument_error () {
        const msg = "my error here"
        const error = argparse.ArgumentError(undefined, msg)
        this.assertEqual(error.message, msg)
    }
}).run()

// =======================
// ArgumentTypeError tests
// =======================

;(new class TestArgumentTypeError extends TestCase {
    force_not_colorized = new Set(['test_argument_type_error'])

    test_argument_type_error () {

        function spam (/* string */) {
            throw argparse.ArgumentTypeError('spam!')
        }

        const parser = new ErrorRaisingArgumentParser({ prog: 'PROG', add_help: false })
        parser.add_argument('x', { type: spam })
        const cm = this.assertRaises(ArgumentParserError, () => parser.parse_args(['XXX']))
        this.assertEqual('usage: PROG x\nPROG: error: argument x: spam!\n',
                         cm.exception.stderr)
    }
}).run()

// =========================
// MessageContentError tests
// =========================

;(new class TestMessageContentError extends TestCase {

    test_missing_argument_name_in_message () {
        const parser = new ErrorRaisingArgumentParser({ prog: 'PROG', usage: '' })
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

    test_optional_optional_not_in_message () {
        const parser = new ErrorRaisingArgumentParser({ prog: 'PROG', usage: '' })
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

    test_optional_positional_not_in_message () {
        const parser = new ErrorRaisingArgumentParser({ prog: 'PROG', usage: '' })
        parser.add_argument('req_pos')
        parser.add_argument('optional_positional', { nargs: '?', default: 'eggs' })
        const cm = this.assertRaises(ArgumentParserError, () =>
            parser.parse_args([]))
        const msg = String(cm.exception)
        this.assertRegex(msg, /req_pos/)
        this.assertNotRegex(msg, /optional_positional/)
    }
}).run()


// ================================================
// Check that the type function is called only once
// ================================================

;(new class TestTypeFunctionCallOnlyOnce extends TestCase {

    test_type_function_call_only_once () {
        const spam = string_to_convert => {
            this.assertEqual(string_to_convert, 'spam!')
            return 'foo_converted'
        }

        const parser = argparse.ArgumentParser()
        parser.add_argument('--foo', { type: spam, default: 'bar' })
        const args = parser.parse_args('--foo spam!'.split(' '))
        this.assertEqual(NS({ foo: 'foo_converted' }), args)
    }
}).run()


// ==============================================
// Check that deprecated arguments output warning
// ==============================================

;(new class TestDeprecatedArguments extends TestCase {

    test_deprecated_option () {
        const parser = argparse.ArgumentParser()
        parser.add_argument('-f', '--foo', { deprecated: true })

        let stderr = captured_stderr(() => parser.parse_args(['--foo', 'spam']))
        this.assertRegex(stderr, /warning: option '--foo' is deprecated/)
        this.assertEqual(1, stderr.split('is deprecated').length - 1)

        stderr = captured_stderr(() => parser.parse_args(['-f', 'spam']))
        this.assertRegex(stderr, /warning: option '-f' is deprecated/)
        this.assertEqual(1, stderr.split('is deprecated').length - 1)

        stderr = captured_stderr(() =>
            parser.parse_args(['--foo', 'spam', '-f', 'ham']))
        this.assertRegex(stderr, /warning: option '--foo' is deprecated/)
        this.assertRegex(stderr, /warning: option '-f' is deprecated/)
        this.assertEqual(2, stderr.split('is deprecated').length - 1)

        stderr = captured_stderr(() =>
            parser.parse_args(['--foo', 'spam', '--foo', 'ham']))
        this.assertRegex(stderr, /warning: option '--foo' is deprecated/)
        this.assertEqual(1, stderr.split('is deprecated').length - 1)
    }

    test_deprecated_boolean_option () {
        const parser = argparse.ArgumentParser()
        parser.add_argument('-f', '--foo', {
            action: argparse.BooleanOptionalAction,
            deprecated: true
        })

        let stderr = captured_stderr(() => parser.parse_args(['--foo']))
        this.assertRegex(stderr, /warning: option '--foo' is deprecated/)
        this.assertEqual(1, stderr.split('is deprecated').length - 1)

        stderr = captured_stderr(() => parser.parse_args(['-f']))
        this.assertRegex(stderr, /warning: option '-f' is deprecated/)
        this.assertEqual(1, stderr.split('is deprecated').length - 1)

        stderr = captured_stderr(() => parser.parse_args(['--no-foo']))
        this.assertRegex(stderr, /warning: option '--no-foo' is deprecated/)
        this.assertEqual(1, stderr.split('is deprecated').length - 1)

        stderr = captured_stderr(() => parser.parse_args(['--foo', '--no-foo']))
        this.assertRegex(stderr, /warning: option '--foo' is deprecated/)
        this.assertRegex(stderr, /warning: option '--no-foo' is deprecated/)
        this.assertEqual(2, stderr.split('is deprecated').length - 1)
    }

    test_deprecated_arguments () {
        const parser = argparse.ArgumentParser()
        parser.add_argument('foo', { nargs: '?', deprecated: true })
        parser.add_argument('bar', { nargs: '?', deprecated: true })

        let stderr = captured_stderr(() => parser.parse_args([]))
        this.assertEqual(0, stderr.split('is deprecated').length - 1)

        stderr = captured_stderr(() => parser.parse_args(['spam']))
        this.assertRegex(stderr, /warning: argument 'foo' is deprecated/)
        this.assertEqual(1, stderr.split('is deprecated').length - 1)

        stderr = captured_stderr(() => parser.parse_args(['spam', 'ham']))
        this.assertRegex(stderr, /warning: argument 'foo' is deprecated/)
        this.assertRegex(stderr, /warning: argument 'bar' is deprecated/)
        this.assertEqual(2, stderr.split('is deprecated').length - 1)
    }

    test_deprecated_varargument () {
        const parser = argparse.ArgumentParser()
        parser.add_argument('foo', { nargs: '*', deprecated: true })

        let stderr = captured_stderr(() => parser.parse_args([]))
        this.assertEqual(0, stderr.split('is deprecated').length - 1)

        stderr = captured_stderr(() => parser.parse_args(['spam']))
        this.assertRegex(stderr, /warning: argument 'foo' is deprecated/)
        this.assertEqual(1, stderr.split('is deprecated').length - 1)

        stderr = captured_stderr(() => parser.parse_args(['spam', 'ham']))
        this.assertRegex(stderr, /warning: argument 'foo' is deprecated/)
        this.assertEqual(1, stderr.split('is deprecated').length - 1)
    }

    test_deprecated_subparser () {
        const parser = argparse.ArgumentParser()
        const subparsers = parser.add_subparsers()
        subparsers.add_parser('foo', { aliases: ['baz'], deprecated: true })
        subparsers.add_parser('bar')

        let stderr = captured_stderr(() => parser.parse_args(['bar']))
        this.assertEqual(0, stderr.split('is deprecated').length - 1)

        stderr = captured_stderr(() => parser.parse_args(['foo']))
        this.assertRegex(stderr, /warning: command 'foo' is deprecated/)
        this.assertEqual(1, stderr.split('is deprecated').length - 1)

        stderr = captured_stderr(() => parser.parse_args(['baz']))
        this.assertRegex(stderr, /warning: command 'baz' is deprecated/)
        this.assertEqual(1, stderr.split('is deprecated').length - 1)
    }
}).run()


// ==================================================================
// Check semantics regarding the default argument and type conversion
// ==================================================================

;(new class TestTypeFunctionCalledOnDefault extends TestCase {

    test_type_function_call_with_non_string_default () {
        const spam = int_to_convert => {
            this.assertEqual(int_to_convert, 0)
            return 'foo_converted'
        }

        const parser = argparse.ArgumentParser()
        parser.add_argument('--foo', { type: spam, default: 0 })
        const args = parser.parse_args([])
        // foo should *not* be converted because its default is not a string.
        this.assertEqual(NS({ foo: 0 }), args)
    }

    test_type_function_call_with_string_default () {
        const spam = (/* int_to_convert */) =>
            'foo_converted'

        const parser = argparse.ArgumentParser()
        parser.add_argument('--foo', { type: spam, default: '0' })
        const args = parser.parse_args([])
        // foo is converted because its default is a string.
        this.assertEqual(NS({ foo: 'foo_converted' }), args)
    }

    test_no_double_type_conversion_of_default () {
        const extend = str_to_convert =>
            str_to_convert + '*'

        const parser = argparse.ArgumentParser()
        parser.add_argument('--test', { type: extend, default: '*' })
        const args = parser.parse_args([])
        // The test argument will be two stars, one coming from the default
        // value and one coming from the type conversion being called exactly
        // once.
        this.assertEqual(NS({ test: '**' }), args)
    }

    test_issue_15906 () {
        // Issue #15906: When action='append', type=str, default=[] are
        // providing, the dest value was the string representation "[]" when it
        // should have been an empty list.
        const parser = argparse.ArgumentParser()
        parser.add_argument('--test', { dest: 'test', type: 'str',
                            default: [], action: 'append' })
        const args = parser.parse_args([])
        this.assertEqual(args.test, [])
    }
}).run()

// ======================
// parse_known_args tests
// ======================

;(new class TestParseKnownArgs extends TestCase {

    test_arguments_list () {
        const parser = argparse.ArgumentParser()
        parser.parse_args([])
    }

    test_arguments_list_positional () {
        const parser = argparse.ArgumentParser()
        parser.add_argument('x')
        parser.parse_args(['x'])
    }

    test_optionals () {
        const parser = argparse.ArgumentParser()
        parser.add_argument('--foo')
        const [args, extras] = parser.parse_known_args('--foo F --bar --baz'.split(' '))
        this.assertEqual(NS({ foo: 'F' }), args)
        this.assertEqual(['--bar', '--baz'], extras)
    }

    test_mixed () {
        const parser = argparse.ArgumentParser()
        parser.add_argument('-v', { nargs: '?', const: 1, type: 'int' })
        parser.add_argument('--spam', { action: 'store_false' })
        parser.add_argument('badger')

        const argv = ["B", "C", "--foo", "-v", "3", "4"]
        const [args, extras] = parser.parse_known_args(argv)
        this.assertEqual(NS({ v: 3, spam: true, badger: "B" }), args)
        this.assertEqual(["C", "--foo", "4"], extras)
    }

    test_zero_or_more_optional () {
        const parser = argparse.ArgumentParser()
        parser.add_argument('x', { nargs: '*', choices: ['x', 'y'] })
        const args = parser.parse_args([])
        this.assertEqual(NS({ x: [] }), args)
    }

}).run()


;(new class TestDoubleDash extends TestCase {

    test_single_argument_option () {
        const parser = argparse.ArgumentParser({ exit_on_error: false })
        parser.add_argument('-f', '--foo')
        parser.add_argument('bar', { nargs: '*' })

        let args = parser.parse_args(['--foo=--'])
        this.assertEqual(NS({ foo: '--', bar: [] }), args)
        let cm = this.assertRaises(argparse.ArgumentError,
            () => parser.parse_args(['--foo', '--']))
        this.assertRegex(cm.exception.message, /argument -f\/--foo: expected one argument/)
        args = parser.parse_args(['-f--'])
        this.assertEqual(NS({ foo: '--', bar: [] }), args)
        cm = this.assertRaises(argparse.ArgumentError,
            () => parser.parse_args(['-f', '--']))
        this.assertRegex(cm.exception.message, /argument -f\/--foo: expected one argument/)
        args = parser.parse_args(['--foo', 'a', '--', 'b', 'c'])
        this.assertEqual(NS({ foo: 'a', bar: ['b', 'c'] }), args)
        args = parser.parse_args(['a', 'b', '--foo', 'c'])
        this.assertEqual(NS({ foo: 'c', bar: ['a', 'b'] }), args)
        args = parser.parse_args(['a', '--', 'b', '--foo', 'c'])
        this.assertEqual(NS({ foo: undefined, bar: ['a', 'b', '--foo', 'c'] }), args)
        args = parser.parse_args(['a', '--', 'b', '--', 'c', '--foo', 'd'])
        this.assertEqual(NS({ foo: undefined, bar: ['a', 'b', '--', 'c', '--foo', 'd'] }), args)

    }

    test_multiple_argument_option () {
        const parser = argparse.ArgumentParser({ exit_on_error: false })
        parser.add_argument('-f', '--foo', { nargs: '*' })
        parser.add_argument('bar', { nargs: '*' })

        let args = parser.parse_args(['--foo=--'])
        this.assertEqual(NS({ foo: ['--'], bar: [] }), args)
        args = parser.parse_args(['--foo', '--'])
        this.assertEqual(NS({ foo: [], bar: [] }), args)
        args = parser.parse_args(['-f--'])
        this.assertEqual(NS({ foo: ['--'], bar: [] }), args)
        args = parser.parse_args(['-f', '--'])
        this.assertEqual(NS({ foo: [], bar: [] }), args)
        args = parser.parse_args(['--foo', 'a', 'b', '--', 'c', 'd'])
        this.assertEqual(NS({ foo: ['a', 'b'], bar: ['c', 'd'] }), args)
        args = parser.parse_args(['a', 'b', '--foo', 'c', 'd'])
        this.assertEqual(NS({ foo: ['c', 'd'], bar: ['a', 'b'] }), args)
        args = parser.parse_args(['a', '--', 'b', '--foo', 'c', 'd'])
        this.assertEqual(NS({ foo: undefined, bar: ['a', 'b', '--foo', 'c', 'd'] }), args)
        let argv
        ;[args, argv] = parser.parse_known_args(['a', 'b', '--foo', 'c', '--', 'd'])
        this.assertEqual(NS({ foo: ['c'], bar: ['a', 'b'] }), args)
        this.assertEqual(['--', 'd'], argv)

    }

    test_multiple_double_dashes () {
        const parser = argparse.ArgumentParser({ exit_on_error: false })
        parser.add_argument('foo')
        parser.add_argument('bar', { nargs: '*' })

        let args = parser.parse_args(['--', 'a', 'b', 'c'])
        this.assertEqual(NS({ foo: 'a', bar: ['b', 'c'] }), args)
        args = parser.parse_args(['a', '--', 'b', 'c'])
        this.assertEqual(NS({ foo: 'a', bar: ['b', 'c'] }), args)
        args = parser.parse_args(['a', 'b', '--', 'c'])
        this.assertEqual(NS({ foo: 'a', bar: ['b', 'c'] }), args)
        args = parser.parse_args(['a', '--', 'b', '--', 'c'])
        this.assertEqual(NS({ foo: 'a', bar: ['b', '--', 'c'] }), args)
        args = parser.parse_args(['--', '--', 'a', '--', 'b', 'c'])
        this.assertEqual(NS({ foo: '--', bar: ['a', '--', 'b', 'c'] }), args)

    }

    test_remainder () {
        let parser = argparse.ArgumentParser({ exit_on_error: false })
        parser.add_argument('foo')
        parser.add_argument('bar', { nargs: '...' })

        let args = parser.parse_args(['--', 'a', 'b', 'c'])
        this.assertEqual(NS({ foo: 'a', bar: ['b', 'c'] }), args)
        args = parser.parse_args(['a', '--', 'b', 'c'])
        this.assertEqual(NS({ foo: 'a', bar: ['b', 'c'] }), args)
        args = parser.parse_args(['a', 'b', '--', 'c'])
        this.assertEqual(NS({ foo: 'a', bar: ['b', '--', 'c'] }), args)
        args = parser.parse_args(['a', '--', 'b', '--', 'c'])
        this.assertEqual(NS({ foo: 'a', bar: ['b', '--', 'c'] }), args)

        parser = argparse.ArgumentParser({ exit_on_error: false })
        parser.add_argument('--foo')
        parser.add_argument('bar', { nargs: '...' })
        args = parser.parse_args(['--foo', 'a', '--', 'b', '--', 'c'])
        this.assertEqual(NS({ foo: 'a', bar: ['--', 'b', '--', 'c'] }), args)
    }

    test_subparser () {
        const parser = argparse.ArgumentParser({ exit_on_error: false })
        parser.add_argument('foo')
        const subparsers = parser.add_subparsers()
        const parser1 = subparsers.add_parser('run')
        parser1.add_argument('-f')
        parser1.add_argument('bar', { nargs: '*' })

        let args = parser.parse_args(['x', 'run', 'a', 'b', '-f', 'c'])
        this.assertEqual(NS({ foo: 'x', f: 'c', bar: ['a', 'b'] }), args)
        args = parser.parse_args(['x', 'run', 'a', 'b', '--', '-f', 'c'])
        this.assertEqual(NS({ foo: 'x', f: undefined, bar: ['a', 'b', '-f', 'c'] }), args)
        args = parser.parse_args(['x', 'run', 'a', '--', 'b', '-f', 'c'])
        this.assertEqual(NS({ foo: 'x', f: undefined, bar: ['a', 'b', '-f', 'c'] }), args)
        args = parser.parse_args(['x', 'run', '--', 'a', 'b', '-f', 'c'])
        this.assertEqual(NS({ foo: 'x', f: undefined, bar: ['a', 'b', '-f', 'c'] }), args)
        args = parser.parse_args(['x', '--', 'run', 'a', 'b', '-f', 'c'])
        this.assertEqual(NS({ foo: 'x', f: 'c', bar: ['a', 'b'] }), args)
        args = parser.parse_args(['--', 'x', 'run', 'a', 'b', '-f', 'c'])
        this.assertEqual(NS({ foo: 'x', f: 'c', bar: ['a', 'b'] }), args)
        args = parser.parse_args(['x', 'run', '--', 'a', '--', 'b'])
        this.assertEqual(NS({ foo: 'x', f: undefined, bar: ['a', '--', 'b'] }), args)
        args = parser.parse_args(['x', '--', 'run', '--', 'a', '--', 'b'])
        this.assertEqual(NS({ foo: 'x', f: undefined, bar: ['a', '--', 'b'] }), args)
        const cm = this.assertRaises(argparse.ArgumentError,
            () => parser.parse_args(['--', 'x', '--', 'run', 'a', 'b']))
        this.assertRegex(cm.exception.message, /invalid choice: '--'/)
    }

    test_subparser_after_multiple_argument_option () {
        const parser = argparse.ArgumentParser({ exit_on_error: false })
        parser.add_argument('--foo', { nargs: '*' })
        const subparsers = parser.add_subparsers()
        const parser1 = subparsers.add_parser('run')
        parser1.add_argument('-f')
        parser1.add_argument('bar', { nargs: '*' })

        const args = parser.parse_args(['--foo', 'x', 'y', '--', 'run', 'a', 'b', '-f', 'c'])
        this.assertEqual(NS({ foo: ['x', 'y'], f: 'c', bar: ['a', 'b'] }), args)
        const cm = this.assertRaises(argparse.ArgumentError,
            () => parser.parse_args(['--foo', 'x', '--', '--', 'run', 'a', 'b']))
        this.assertRegex(cm.exception.message, /invalid choice: '--'/)
    }
}).run()

// ===========================
// parse_intermixed_args tests
// ===========================

;(new class TestIntermixedArgs extends TestCase {
    test_basic () {
        // test parsing intermixed optionals and positionals
        const parser = argparse.ArgumentParser({ prog: 'PROG' })
        parser.add_argument('--foo', { dest: 'foo' })
        const bar = parser.add_argument('--bar', { dest: 'bar', required: true })
        parser.add_argument('cmd')
        parser.add_argument('rest', { nargs: '*', type: 'int' })
        let argv = 'cmd --foo x 1 --bar y 2 3'.split(' ')
        let args = parser.parse_intermixed_args(argv)
        // rest gets [1,2,3] despite the foo and bar strings
        this.assertEqual(NS({ bar: 'y', cmd: 'cmd', foo: 'x', rest: [1, 2, 3] }), args)

        let extras
        ;[args, extras] = parser.parse_known_args(argv)
        // cannot parse the '1,2,3'
        this.assertEqual(NS({ bar: 'y', cmd: 'cmd', foo: 'x', rest: [1] }), args)
        this.assertEqual(["2", "3"], extras)

        ;[args, extras] = parser.parse_known_intermixed_args(argv)
        this.assertEqual(NS({ bar: 'y', cmd: 'cmd', foo: 'x', rest: [1, 2, 3] }), args)
        this.assertEqual([], extras)

        // unknown optionals go into extras
        argv = 'cmd --foo x --error 1 2 --bar y 3'.split(' ')
        ;[args, extras] = parser.parse_known_intermixed_args(argv)
        this.assertEqual(NS({ bar: 'y', cmd: 'cmd', foo: 'x', rest: [1, 2, 3] }), args)
        this.assertEqual(['--error'], extras)
        argv = 'cmd --foo x 1 --error 2 --bar y 3'.split(' ')
        ;[args, extras] = parser.parse_known_intermixed_args(argv)
        this.assertEqual(NS({ bar: 'y', cmd: 'cmd', foo: 'x', rest: [1, 2, 3] }), args)
        this.assertEqual(['--error'], extras)
        argv = 'cmd --foo x 1 2 --error --bar y 3'.split(' ')
        ;[args, extras] = parser.parse_known_intermixed_args(argv)
        this.assertEqual(NS({ bar: 'y', cmd: 'cmd', foo: 'x', rest: [1, 2, 3] }), args)
        this.assertEqual(['--error'], extras)

        // restores attributes that were temporarily changed
        this.assertIsNone(parser.usage)
        this.assertEqual(bar.required, true)
    }

    test_remainder () {
        // Intermixed and remainder are incompatible
        const parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        parser.add_argument('-z')
        parser.add_argument('x')
        parser.add_argument('y', { nargs: '...' })
        const argv = 'X A B -z Z'.split(' ')
        // intermixed fails with '...' (also 'A...')
        // this.assertRaises(TypeError, parser.parse_intermixed_args, argv)
        const cm = this.assertRaises(TypeError, () => parser.parse_intermixed_args(argv))
        this.assertRegex(String(cm.exception), /\.\.\./)
    }

    test_required_exclusive () {
        // required mutually exclusive group; intermixed works fine
        const parser = argparse.ArgumentParser({ prog: 'PROG', exit_on_error: false })
        const group = parser.add_mutually_exclusive_group({ required: true })
        group.add_argument('--foo', { action: 'store_true', help: 'FOO' })
        group.add_argument('--spam', { help: 'SPAM' })
        parser.add_argument('badger', { nargs: '*', default: 'X', help: 'BADGER' })
        let args = parser.parse_intermixed_args('--foo 1 2'.split(' '))
        this.assertEqual(NS({ badger: ['1', '2'], foo: true, spam: undefined }), args)
        args = parser.parse_intermixed_args('1 --foo 2'.split(' '))
        this.assertEqual(NS({ badger: ['1', '2'], foo: true, spam: undefined }), args)
        const cm = this.assertRaises(argparse.ArgumentError, () =>
            parser.parse_intermixed_args('1 2'.split(' ')))
        this.assertRegex(cm.exception.message,
                         /one of the arguments --foo --spam is required/)
        this.assertEqual(group.required, true)
    }

    test_required_exclusive_with_positional () {
        // required mutually exclusive group with positional argument
        const parser = argparse.ArgumentParser({ prog: 'PROG', exit_on_error: false })
        const group = parser.add_mutually_exclusive_group({ required: true })
        group.add_argument('--foo', { action: 'store_true', help: 'FOO' })
        group.add_argument('--spam', { help: 'SPAM' })
        group.add_argument('badger', { nargs: '*', default: 'X', help: 'BADGER' })
        let args = parser.parse_intermixed_args(['--foo'])
        this.assertEqual(NS({ foo: true, spam: undefined, badger: 'X' }), args)
        args = parser.parse_intermixed_args(['a', 'b'])
        this.assertEqual(NS({ foo: false, spam: undefined, badger: ['a', 'b'] }), args)
        let cm = this.assertRaises(argparse.ArgumentError, () =>
            parser.parse_intermixed_args([]))
        this.assertRegex(cm.exception.message,
                         /one of the arguments --foo --spam badger is required/)
        cm = this.assertRaises(argparse.ArgumentError, () =>
            parser.parse_intermixed_args(['--foo', 'a', 'b']))
        this.assertRegex(cm.exception.message,
                         /argument badger: not allowed with argument --foo/)
        cm = this.assertRaises(argparse.ArgumentError, () =>
            parser.parse_intermixed_args(['a', '--foo', 'b']))
        this.assertRegex(cm.exception.message,
                         /argument badger: not allowed with argument --foo/)
        this.assertEqual(group.required, true)
    }

    test_invalid_args () {
        const parser = new ErrorRaisingArgumentParser({ prog: 'PROG' })
        this.assertRaises(ArgumentParserError, () => parser.parse_intermixed_args(['a']))
    }
}).run()

;(new class TestIntermixedMessageContentError extends TestCase {
    // case where Intermixed gives different error message
    // error is raised by 1st parsing step
    test_missing_argument_name_in_message () {
        const parser = new ErrorRaisingArgumentParser({ prog: 'PROG', usage: '' })
        parser.add_argument('req_pos', { type: 'str' })
        parser.add_argument('-req_opt', { type: 'int', required: true })

        let cm = this.assertRaises(ArgumentParserError, () => parser.parse_args([]))
        let msg = String(cm.exception)
        this.assertRegex(msg, /req_pos/)
        this.assertRegex(msg, /req_opt/)

        cm = this.assertRaises(ArgumentParserError, () => parser.parse_intermixed_args([]))
        msg = String(cm.exception)
        this.assertRegex(msg, /req_pos/)
        this.assertRegex(msg, /req_opt/)
    }
}).run()

// ==========================
// add_argument metavar tests
// ==========================

;(new class TestAddArgumentMetavar extends TestCase {

    EXPECTED_MESSAGE = "length of metavar tuple does not match nargs"

    do_test_no_exception ({ nargs, metavar }) {
        const parser = argparse.ArgumentParser()
        parser.add_argument("--foo", { nargs, metavar })
    }

    do_test_exception ({ nargs, metavar }) {
        const parser = argparse.ArgumentParser()
        const cm = this.assertRaises(TypeError, () => parser.add_argument("--foo", { nargs, metavar }))
        this.assertEqual(cm.exception.message, this.EXPECTED_MESSAGE)
    }

    // Unit tests for different values of metavar when nargs=None

    test_nargs_None_metavar_string () {
        this.do_test_no_exception({ nargs: undefined, metavar: "1" })
    }

    test_nargs_undefined_metavar_length0 () {
        this.do_test_exception({ nargs: undefined, metavar: [] })
    }

    test_nargs_undefined_metavar_length1 () {
        this.do_test_no_exception({ nargs: undefined, metavar: ["1"] })
    }

    test_nargs_undefined_metavar_length2 () {
        this.do_test_exception({ nargs: undefined, metavar: ["1", "2"] })
    }

    test_nargs_undefined_metavar_length3 () {
        this.do_test_exception({ nargs: undefined, metavar: ["1", "2", "3"] })
    }

    // Unit tests for different values of metavar when nargs=?

    test_nargs_optional_metavar_string () {
        this.do_test_no_exception({ nargs: "?", metavar: "1" })
    }

    test_nargs_optional_metavar_length0 () {
        this.do_test_exception({ nargs: "?", metavar: [] })
    }

    test_nargs_optional_metavar_length1 () {
        this.do_test_no_exception({ nargs: "?", metavar: ["1"] })
    }

    test_nargs_optional_metavar_length2 () {
        this.do_test_exception({ nargs: "?", metavar: ["1", "2"] })
    }

    test_nargs_optional_metavar_length3 () {
        this.do_test_exception({ nargs: "?", metavar: ["1", "2", "3"] })
    }

    // Unit tests for different values of metavar when nargs=*

    test_nargs_zeroormore_metavar_string () {
        this.do_test_no_exception({ nargs: "*", metavar: "1" })
    }

    test_nargs_zeroormore_metavar_length0 () {
        this.do_test_exception({ nargs: "*", metavar: [] })
    }

    test_nargs_zeroormore_metavar_length1 () {
        this.do_test_no_exception({ nargs: "*", metavar: ["1"] })
    }

    test_nargs_zeroormore_metavar_length2 () {
        this.do_test_no_exception({ nargs: "*", metavar: ["1", "2"] })
    }

    test_nargs_zeroormore_metavar_length3 () {
        this.do_test_exception({ nargs: "*", metavar: ["1", "2", "3"] })
    }

    // Unit tests for different values of metavar when nargs=+

    test_nargs_oneormore_metavar_string () {
        this.do_test_no_exception({ nargs: "+", metavar: "1" })
    }

    test_nargs_oneormore_metavar_length0 () {
        this.do_test_exception({ nargs: "+", metavar: [] })
    }

    test_nargs_oneormore_metavar_length1 () {
        this.do_test_exception({ nargs: "+", metavar: ["1"] })
    }

    test_nargs_oneormore_metavar_length2 () {
        this.do_test_no_exception({ nargs: "+", metavar: ["1", "2"] })
    }

    test_nargs_oneormore_metavar_length3 () {
        this.do_test_exception({ nargs: "+", metavar: ["1", "2", "3"] })
    }

    // Unit tests for different values of metavar when nargs=...

    test_nargs_remainder_metavar_string () {
        this.do_test_no_exception({ nargs: "...", metavar: "1" })
    }

    test_nargs_remainder_metavar_length0 () {
        this.do_test_no_exception({ nargs: "...", metavar: [] })
    }

    test_nargs_remainder_metavar_length1 () {
        this.do_test_no_exception({ nargs: "...", metavar: ["1"] })
    }

    test_nargs_remainder_metavar_length2 () {
        this.do_test_no_exception({ nargs: "...", metavar: ["1", "2"] })
    }

    test_nargs_remainder_metavar_length3 () {
        this.do_test_no_exception({ nargs: "...", metavar: ["1", "2", "3"] })
    }

    // Unit tests for different values of metavar when nargs=A...

    test_nargs_parser_metavar_string () {
        this.do_test_no_exception({ nargs: "A...", metavar: "1" })
    }

    test_nargs_parser_metavar_length0 () {
        this.do_test_exception({ nargs: "A...", metavar: [] })
    }

    test_nargs_parser_metavar_length1 () {
        this.do_test_no_exception({ nargs: "A...", metavar: ["1"] })
    }

    test_nargs_parser_metavar_length2 () {
        this.do_test_exception({ nargs: "A...", metavar: ["1", "2"] })
    }

    test_nargs_parser_metavar_length3 () {
        this.do_test_exception({ nargs: "A...", metavar: ["1", "2", "3"] })
    }

    // Unit tests for different values of metavar when nargs=1

    test_nargs_1_metavar_string () {
        this.do_test_no_exception({ nargs: 1, metavar: "1" })
    }

    test_nargs_1_metavar_length0 () {
        this.do_test_exception({ nargs: 1, metavar: [] })
    }

    test_nargs_1_metavar_length1 () {
        this.do_test_no_exception({ nargs: 1, metavar: ["1"] })
    }

    test_nargs_1_metavar_length2 () {
        this.do_test_exception({ nargs: 1, metavar: ["1", "2"] })
    }

    test_nargs_1_metavar_length3 () {
        this.do_test_exception({ nargs: 1, metavar: ["1", "2", "3"] })
    }

    // Unit tests for different values of metavar when nargs=2

    test_nargs_2_metavar_string () {
        this.do_test_no_exception({ nargs: 2, metavar: "1" })
    }

    test_nargs_2_metavar_length0 () {
        this.do_test_exception({ nargs: 2, metavar: [] })
    }

    test_nargs_2_metavar_length1 () {
        this.do_test_exception({ nargs: 2, metavar: ["1"] })
    }

    test_nargs_2_metavar_length2 () {
        this.do_test_no_exception({ nargs: 2, metavar: ["1", "2"] })
    }

    test_nargs_2_metavar_length3 () {
        this.do_test_exception({ nargs: 2, metavar: ["1", "2", "3"] })
    }

    // Unit tests for different values of metavar when nargs=3

    test_nargs_3_metavar_string () {
        this.do_test_no_exception({ nargs: 3, metavar: "1" })
    }

    test_nargs_3_metavar_length0 () {
        this.do_test_exception({ nargs: 3, metavar: [] })
    }

    test_nargs_3_metavar_length1 () {
        this.do_test_exception({ nargs: 3, metavar: ["1"] })
    }

    test_nargs_3_metavar_length2 () {
        this.do_test_exception({ nargs: 3, metavar: ["1", "2"] })
    }

    test_nargs_3_metavar_length3 () {
        this.do_test_no_exception({ nargs: 3, metavar: ["1", "2", "3"] })
    }
}).run()


;(new class TestInvalidNargs extends TestCase {

    EXPECTED_INVALID_MESSAGE = "invalid nargs value"
    EXPECTED_RANGE_MESSAGE = ("nargs for store actions must be != 0; if you " +
                              "have nothing to store, actions such as store " +
                              "true or store const may be more appropriate")

    do_test_range_exception ({ nargs }) {
        const parser = argparse.ArgumentParser()
        const cm = this.assertRaises(TypeError, () => parser.add_argument("--foo", { nargs }))
        this.assertEqual(cm.exception.message, this.EXPECTED_RANGE_MESSAGE)
    }

    do_test_invalid_exception ({ nargs }) {
        const parser = argparse.ArgumentParser()
        const cm = this.assertRaises(TypeError, () => parser.add_argument("--foo", { nargs }))
        this.assertEqual(cm.exception.message, this.EXPECTED_INVALID_MESSAGE)
    }

    // Unit tests for different values of nargs

    test_nargs_alphabetic () {
        this.do_test_invalid_exception({ nargs: 'a' })
        this.do_test_invalid_exception({ nargs: "abcd" })
    }

    test_nargs_zero () {
        this.do_test_range_exception({ nargs: 0 })
    }
}).run()

// ============================
// CommonJS public exports tests
// ============================

;(new class TestImportStar extends TestCase {

    expected_exports = [
        'Action',
        'ArgumentDefaultsHelpFormatter',
        'ArgumentError',
        'ArgumentParser',
        'ArgumentTypeError',
        'BooleanOptionalAction',
        'FileType',
        'HelpFormatter',
        'MetavarTypeHelpFormatter',
        'Namespace',
        'ONE_OR_MORE',
        'OPTIONAL',
        'PARSER',
        'REMAINDER',
        'RawDescriptionHelpFormatter',
        'RawTextHelpFormatter',
        'SUPPRESS',
        'ZERO_OR_MORE',
    ]

    test () {
        for (const name of this.expected_exports) {
            assert(Object.hasOwn(argparse, name))
        }
    }

    test_all_exports_everything () {
        this.assertEqual(this.expected_exports, Object.keys(argparse).sort())
    }
}).run()


;(new class TestWrappingMetavar extends TestCase {
    force_not_colorized = new Set(['test_help_with_metavar'])

    setUp () {
        super.setUp()
        this.parser = new ErrorRaisingArgumentParser(
            { prog: 'this_is_spammy_prog_with_a_long_name_sorry_about_the_name' }
        )
        // this metavar was triggering library assertion errors due to usage
        // message formatting incorrectly splitting on the ] chars within
        const metavar = '<http[s]://example:1234>'
        this.parser.add_argument('--proxy', { metavar })
    }

    test_help_with_metavar () {
        const help_text = this.parser.format_help()
        this.assertEqual(help_text, textwrap.dedent(`\
            usage: this_is_spammy_prog_with_a_long_name_sorry_about_the_name
                   [-h] [--proxy <http[s]://example:1234>]

            options:
              -h, --help            show this help message and exit
              --proxy <http[s]://example:1234>
            `))
    }
}).run()


;(new class TestExitOnError extends TestCase {

    setUp () {
        this.parser = argparse.ArgumentParser({
            exit_on_error: false, fromfile_prefix_chars: '@' })
        this.parser.add_argument('--integers', { metavar: 'N', type: 'int' })
    }

    test_exit_on_error_with_good_args () {
        const ns = this.parser.parse_args('--integers 4'.split(' '))
        this.assertEqual(ns, argparse.Namespace({ integers: 4 }))
    }

    test_exit_on_error_with_bad_args () {
        this.assertRaises(argparse.ArgumentError, () => {
            this.parser.parse_args('--integers a'.split(' '))
        })
    }

    test_unrecognized_args () {
        const cm = this.assertRaises(argparse.ArgumentError, () => {
            this.parser.parse_args('--foo bar'.split(' '))
        })
        this.assertRegex(cm.exception.message, /unrecognized arguments: --foo bar/)
    }

    test_unrecognized_intermixed_args () {
        const cm = this.assertRaises(argparse.ArgumentError, () => {
            this.parser.parse_intermixed_args('--foo bar'.split(' '))
        })
        this.assertRegex(cm.exception.message, /unrecognized arguments: --foo bar/)
    }

    test_required_args () {
        this.parser.add_argument('bar')
        this.parser.add_argument('baz')
        const cm = this.assertRaises(argparse.ArgumentError, () => {
            this.parser.parse_args([])
        })
        this.assertRegex(cm.exception.message,
                         /the following arguments are required: bar, baz$/)
    }

    test_required_args_with_metavar () {
        this.parser.add_argument('bar')
        this.parser.add_argument('baz', { metavar: 'BaZ' })
        const cm = this.assertRaises(argparse.ArgumentError, () => {
            this.parser.parse_args([])
        })
        this.assertRegex(cm.exception.message,
                         /the following arguments are required: bar, BaZ$/)
    }

    test_required_args_n () {
        this.parser.add_argument('bar')
        this.parser.add_argument('baz', { nargs: 3 })
        const cm = this.assertRaises(argparse.ArgumentError, () => {
            this.parser.parse_args([])
        })
        this.assertRegex(cm.exception.message,
                         /the following arguments are required: bar, baz$/)
    }

    test_required_args_n_with_metavar () {
        this.parser.add_argument('bar')
        this.parser.add_argument('baz', { nargs: 3, metavar: ['B', 'A', 'Z'] })
        const cm = this.assertRaises(argparse.ArgumentError, () => {
            this.parser.parse_args([])
        })
        this.assertRegex(cm.exception.message,
                         /the following arguments are required: bar, B, A, Z$/)
    }

    test_required_args_optional () {
        this.parser.add_argument('bar')
        this.parser.add_argument('baz', { nargs: '?' })
        const cm = this.assertRaises(argparse.ArgumentError, () => {
            this.parser.parse_args([])
        })
        this.assertRegex(cm.exception.message,
                         /the following arguments are required: bar$/)
    }

    test_required_args_zero_or_more () {
        this.parser.add_argument('bar')
        this.parser.add_argument('baz', { nargs: '*' })
        const cm = this.assertRaises(argparse.ArgumentError, () => {
            this.parser.parse_args([])
        })
        this.assertRegex(cm.exception.message,
                         /the following arguments are required: bar$/)
    }

    test_required_args_one_or_more () {
        this.parser.add_argument('bar')
        this.parser.add_argument('baz', { nargs: '+' })
        const cm = this.assertRaises(argparse.ArgumentError, () => {
            this.parser.parse_args([])
        })
        this.assertRegex(cm.exception.message,
                         /the following arguments are required: bar, baz$/)
    }

    test_required_args_one_or_more_with_metavar () {
        this.parser.add_argument('bar')
        this.parser.add_argument('baz', { nargs: '+', metavar: ['BaZ1', 'BaZ2'] })
        const cm = this.assertRaises(argparse.ArgumentError, () => {
            this.parser.parse_args([])
        })
        this.assertRegex(cm.exception.message,
                         /the following arguments are required: bar, BaZ1\[, BaZ2]$/)
    }

    test_required_args_remainder () {
        this.parser.add_argument('bar')
        this.parser.add_argument('baz', { nargs: '...' })
        const cm = this.assertRaises(argparse.ArgumentError, () => {
            this.parser.parse_args([])
        })
        this.assertRegex(cm.exception.message,
                         /the following arguments are required: bar$/)
    }

    test_required_mutually_exclusive_args () {
        const group = this.parser.add_mutually_exclusive_group({ required: true })
        group.add_argument('--bar')
        group.add_argument('--baz')
        const cm = this.assertRaises(argparse.ArgumentError, () => {
            this.parser.parse_args([])
        })
        this.assertRegex(cm.exception.message,
                         /one of the arguments --bar --baz is required/)
    }

    test_conflicting_mutually_exclusive_args_optional_with_metavar () {
        const group = this.parser.add_mutually_exclusive_group()
        group.add_argument('--bar')
        group.add_argument('baz', { nargs: '?', metavar: 'BaZ' })
        let cm = this.assertRaises(argparse.ArgumentError, () => {
            this.parser.parse_args(['--bar', 'a', 'b'])
        })
        this.assertRegex(cm.exception.message,
                         /argument BaZ: not allowed with argument --bar$/)
        cm = this.assertRaises(argparse.ArgumentError, () => {
            this.parser.parse_args(['a', '--bar', 'b'])
        })
        this.assertRegex(cm.exception.message,
                         /argument --bar: not allowed with argument BaZ$/)
    }

    test_conflicting_mutually_exclusive_args_zero_or_more_with_metavar1 () {
        const group = this.parser.add_mutually_exclusive_group()
        group.add_argument('--bar')
        group.add_argument('baz', { nargs: '*', metavar: ['BAZ1'] })
        let cm = this.assertRaises(argparse.ArgumentError, () => {
            this.parser.parse_args(['--bar', 'a', 'b'])
        })
        this.assertRegex(cm.exception.message,
                         /argument BAZ1: not allowed with argument --bar$/)
        cm = this.assertRaises(argparse.ArgumentError, () => {
            this.parser.parse_args(['a', '--bar', 'b'])
        })
        this.assertRegex(cm.exception.message,
                         /argument --bar: not allowed with argument BAZ1$/)
    }

    test_conflicting_mutually_exclusive_args_zero_or_more_with_metavar2 () {
        const group = this.parser.add_mutually_exclusive_group()
        group.add_argument('--bar')
        group.add_argument('baz', { nargs: '*', metavar: ['BAZ1', 'BAZ2'] })
        let cm = this.assertRaises(argparse.ArgumentError, () => {
            this.parser.parse_args(['--bar', 'a', 'b'])
        })
        this.assertRegex(cm.exception.message,
                         /argument BAZ1\[, BAZ2]: not allowed with argument --bar$/)
        cm = this.assertRaises(argparse.ArgumentError, () => {
            this.parser.parse_args(['a', '--bar', 'b'])
        })
        this.assertRegex(cm.exception.message,
                         /argument --bar: not allowed with argument BAZ1\[, BAZ2]$/)
    }

    test_ambiguous_option () {
        this.parser.add_argument('--foobaz')
        this.parser.add_argument('--fooble', { action: 'store_true' })
        this.parser.add_argument('--foogle')
        let cm = this.assertRaises(argparse.ArgumentError, () => {
            this.parser.parse_args(['--foob'])
        })
        this.assertRegex(cm.exception.message,
                         /ambiguous option: --foob could match --foobaz, --fooble/)
        cm = this.assertRaises(argparse.ArgumentError, () => {
            this.parser.parse_args(['--foob=1'])
        })
        this.assertRegex(cm.exception.message,
                         /ambiguous option: --foob=1 could match --foobaz, --fooble$/)
        cm = this.assertRaises(argparse.ArgumentError, () => {
            this.parser.parse_args(['--foob', '1', '--foogle', '2'])
        })
        this.assertRegex(cm.exception.message,
                         /ambiguous option: --foob could match --foobaz, --fooble$/)
        cm = this.assertRaises(argparse.ArgumentError, () => {
            this.parser.parse_args(['--foob=1', '--foogle', '2'])
        })
        this.assertRegex(cm.exception.message,
                         /ambiguous option: --foob=1 could match --foobaz, --fooble$/)
    }

    test_os_error () {
        this.parser.add_argument('file')
        const cm = this.assertRaises(argparse.ArgumentError, () => {
            this.parser.parse_args(['@no-such-file'])
        })
        this.assertRegex(cm.exception.message,
                         /no such file or directory.*no-such-file/i)
    }
}).run()


// =========================
// Default program name tests
// =========================

;(new class TestProgName extends TempDirMixin(TestCase) {

    source = `\
        const argparse = require(${JSON.stringify(require.resolve('../'))})
        argparse.ArgumentParser().parse_args()
    `

    check_usage (expected, ...args) {
        const result = child_process.spawnSync(process.execPath,
                                                [...args, '-h'],
                                                { encoding: 'utf8' })
        this.assertEqual(0, result.status)
        this.assertEqual('', result.stderr)
        this.assertEqual(`usage: ${expected} [-h]`,
                         result.stdout.split(/\r?\n/, 1)[0])
    }

    test_script () {
        const script_name = path.join(this.temp_dir, 'example.js')
        fs.writeFileSync(script_name, this.source)
        this.check_usage(path.basename(script_name), script_name)
    }

    test_package () {
        const package_name = path.join(this.temp_dir, 'package_entry')
        fs.mkdirSync(package_name)
        fs.writeFileSync(path.join(package_name, 'index.js'), this.source)
        fs.writeFileSync(path.join(package_name, 'package.json'),
                         JSON.stringify({ main: 'index.js' }))
        this.check_usage(path.basename(package_name), package_name)
    }
}).run()


// ===========
// Color tests
// ===========

;(new class TestColorized extends TestCase {
    setUp () {
        super.setUp()
        this.can_colorize = _colorize.can_colorize
        _colorize.can_colorize = () => true
        this.theme = _colorize.get_theme({ force_color: true }).argparse
    }

    tearDown () {
        _colorize.can_colorize = this.can_colorize
    }

    test_argparse_color () {
        const parser = argparse.ArgumentParser({
            color: true,
            description: 'Colorful help',
            formatter_class: argparse.ArgumentDefaultsHelpFormatter,
            prefix_chars: '-+',
            prog: 'PROG'
        })
        const group = parser.add_mutually_exclusive_group()
        group.add_argument('-v', '--verbose', { action: 'store_true', help: 'more spam' })
        group.add_argument('-q', '--quiet', { action: 'store_true', help: 'less spam' })
        parser.add_argument('x', { type: 'int', help: 'the base' })
        parser.add_argument('y', { type: 'int', help: 'the exponent', deprecated: true })
        parser.add_argument('this_indeed_is_a_very_long_action_name', {
            type: 'int',
            help: 'the exponent'
        })
        parser.add_argument('-o', '--optional1', { action: 'store_true', deprecated: true })
        parser.add_argument('--optional2', { help: 'pick one' })
        parser.add_argument('--optional3', { choices: ['X', 'Y', 'Z'] })
        parser.add_argument('--optional4', { choices: ['X', 'Y', 'Z'], help: 'pick one' })
        parser.add_argument('--optional5', { choices: ['X', 'Y', 'Z'], help: 'pick one' })
        parser.add_argument('--optional6', { choices: ['X', 'Y', 'Z'], help: 'pick one' })
        parser.add_argument('-p', '--optional7', {
            choices: ['Aaaaa', 'Bbbbb', 'Ccccc', 'Ddddd'],
            help: 'pick one'
        })
        parser.add_argument('+f')
        parser.add_argument('++bar')
        parser.add_argument('-+baz')
        parser.add_argument('-c', '--count')

        const subparsers = parser.add_subparsers({
            title: 'subcommands',
            description: 'valid subcommands',
            help: 'additional help'
        })
        subparsers.add_parser('sub1', { deprecated: true, help: 'sub1 help' })
        const sub2 = subparsers.add_parser('sub2', { deprecated: true, help: 'sub2 help' })
        sub2.add_argument('--baz', { choices: ['X', 'Y', 'Z'], help: 'baz help' })

        const {
            prog,
            heading,
            summary_long_option: long,
            summary_short_option: short,
            summary_label: label,
            summary_action: pos,
            long_option: long_b,
            short_option: short_b,
            label: label_b,
            action: pos_b,
            reset
        } = this.theme

        this.assertEqual(textwrap.dedent(`\
            ${heading}usage: ${reset}${prog}PROG${reset} [${short}-h${reset}] [${short}-v${reset} | ${short}-q${reset}] [${short}-o${reset}] [${long}--optional2 ${label}OPTIONAL2${reset}] [${long}--optional3 ${label}{X,Y,Z}${reset}]
                        [${long}--optional4 ${label}{X,Y,Z}${reset}] [${long}--optional5 ${label}{X,Y,Z}${reset}] [${long}--optional6 ${label}{X,Y,Z}${reset}]
                        [${short}-p ${label}{Aaaaa,Bbbbb,Ccccc,Ddddd}${reset}] [${short}+f ${label}F${reset}] [${long}++bar ${label}BAR${reset}] [${long}-+baz ${label}BAZ${reset}]
                        [${short}-c ${label}COUNT${reset}]
                        ${pos}x${reset} ${pos}y${reset} ${pos}this_indeed_is_a_very_long_action_name${reset} ${pos}{sub1,sub2} ...${reset}

            Colorful help

            ${heading}positional arguments:${reset}
              ${pos_b}x${reset}                     the base
              ${pos_b}y${reset}                     the exponent
              ${pos_b}this_indeed_is_a_very_long_action_name${reset}
                                    the exponent

            ${heading}options:${reset}
              ${short_b}-h${reset}, ${long_b}--help${reset}            show this help message and exit
              ${short_b}-v${reset}, ${long_b}--verbose${reset}         more spam (default: false)
              ${short_b}-q${reset}, ${long_b}--quiet${reset}           less spam (default: false)
              ${short_b}-o${reset}, ${long_b}--optional1${reset}
              ${long_b}--optional2${reset} ${label_b}OPTIONAL2${reset}
                                    pick one (default: undefined)
              ${long_b}--optional3${reset} ${label_b}{X,Y,Z}${reset}
              ${long_b}--optional4${reset} ${label_b}{X,Y,Z}${reset}   pick one (default: undefined)
              ${long_b}--optional5${reset} ${label_b}{X,Y,Z}${reset}   pick one (default: undefined)
              ${long_b}--optional6${reset} ${label_b}{X,Y,Z}${reset}   pick one (default: undefined)
              ${short_b}-p${reset}, ${long_b}--optional7${reset} ${label_b}{Aaaaa,Bbbbb,Ccccc,Ddddd}${reset}
                                    pick one (default: undefined)
              ${short_b}+f${reset} ${label_b}F${reset}
              ${long_b}++bar${reset} ${label_b}BAR${reset}
              ${long_b}-+baz${reset} ${label_b}BAZ${reset}
              ${short_b}-c${reset}, ${long_b}--count${reset} ${label_b}COUNT${reset}

            ${heading}subcommands:${reset}
              valid subcommands

              ${pos_b}{sub1,sub2}${reset}           additional help
                ${pos_b}sub1${reset}                sub1 help
                ${pos_b}sub2${reset}                sub2 help
        `), parser.format_help())
    }

    test_argparse_color_mutually_exclusive_group_usage () {
        const parser = argparse.ArgumentParser({ color: true, prog: 'PROG' })
        const group = parser.add_mutually_exclusive_group()
        group.add_argument('--foo', { action: 'store_true', help: 'FOO' })
        group.add_argument('--spam', { help: 'SPAM' })
        group.add_argument('badger', { nargs: '*', help: 'BADGER' })

        const {
            prog,
            heading,
            summary_long_option: long,
            summary_short_option: short,
            summary_label: label,
            summary_action: pos,
            reset
        } = this.theme

        this.assertEqual(
            `${heading}usage: ${reset}${prog}PROG${reset} [${short}-h${reset}] ` +
            `[${long}--foo${reset} | ${long}--spam ${label}SPAM${reset} | ` +
            `${pos}badger ...${reset}]\n`,
            parser.format_usage()
        )
    }

    test_argparse_color_custom_usage () {
        const parser = argparse.ArgumentParser({
            add_help: false,
            color: true,
            description: 'Test prog and usage colors',
            prog: 'PROG',
            usage: '[prefix] %(prog)s [suffix]'
        })
        const { heading, prog, prog_extra: usage, reset } = this.theme

        this.assertEqual(textwrap.dedent(`\
            ${heading}usage: ${reset}${usage}[prefix] ${prog}PROG${reset}${usage} [suffix]${reset}

            Test prog and usage colors
        `), parser.format_help())
    }

    test_custom_formatter_function () {
        function custom_formatter (options) {
            return argparse.RawTextHelpFormatter({ ...options, indent_increment: 5 })
        }

        const parser = argparse.ArgumentParser({
            prog: 'PROG',
            prefix_chars: '-+',
            formatter_class: custom_formatter,
            color: true
        })
        parser.add_argument('+f', '++foo', { help: 'foo help' })
        parser.add_argument('spam', { help: 'spam help' })

        const {
            prog,
            heading,
            summary_short_option: short,
            summary_label: label,
            summary_action: pos,
            long_option: long_b,
            short_option: short_b,
            label: label_b,
            action: pos_b,
            reset
        } = this.theme

        this.assertEqual(textwrap.dedent(`\
            ${heading}usage: ${reset}${prog}PROG${reset} [${short}-h${reset}] [${short}+f ${label}FOO${reset}] ${pos}spam${reset}

            ${heading}positional arguments:${reset}
                 ${pos_b}spam${reset}           spam help

            ${heading}options:${reset}
                 ${short_b}-h${reset}, ${long_b}--help${reset}     show this help message and exit
                 ${short_b}+f${reset}, ${long_b}++foo${reset} ${label_b}FOO${reset}  foo help
        `), parser.format_help())
    }

    test_custom_formatter_class () {
        class CustomFormatter extends argparse.RawTextHelpFormatter {
            constructor (options) {
                super({ ...options, indent_increment: 5 })
            }
        }

        const parser = argparse.ArgumentParser({
            prog: 'PROG',
            prefix_chars: '-+',
            formatter_class: CustomFormatter,
            color: true
        })
        parser.add_argument('+f', '++foo', { help: 'foo help' })
        parser.add_argument('spam', { help: 'spam help' })

        const {
            prog,
            heading,
            summary_short_option: short,
            summary_label: label,
            summary_action: pos,
            long_option: long_b,
            short_option: short_b,
            label: label_b,
            action: pos_b,
            reset
        } = this.theme

        this.assertEqual(textwrap.dedent(`\
            ${heading}usage: ${reset}${prog}PROG${reset} [${short}-h${reset}] [${short}+f ${label}FOO${reset}] ${pos}spam${reset}

            ${heading}positional arguments:${reset}
                 ${pos_b}spam${reset}           spam help

            ${heading}options:${reset}
                 ${short_b}-h${reset}, ${long_b}--help${reset}     show this help message and exit
                 ${short_b}+f${reset}, ${long_b}++foo${reset} ${label_b}FOO${reset}  foo help
        `), parser.format_help())
    }

    test_subparser_prog_is_stored_without_color () {
        const parser = argparse.ArgumentParser({ prog: 'complex', color: true })
        const sub = parser.add_subparsers({ dest: 'command' })
        const demo_parser = sub.add_parser('demo')

        assert(!demo_parser.prog.includes('\x1b['))

        demo_parser.color = false
        assert(!demo_parser.format_help().includes('\x1b['))
    }
}).run()
