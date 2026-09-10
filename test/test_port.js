// Only for places where JS and Python differ and the port cannot hide it.
// Such tests have no upstream counterpart. Nothing else goes in this file.

'use strict'

const assert = require('assert')
const { describe, it } = require('node:test')
const argparse = require('../')


// Number conversion: CPython calls the int() / float() builtins, the port
// calls Number(), and they accept different literals.

const ERR = Symbol('ValueError')

// what CPython 3.14 int(s) / float(s) return for the same string
const conversions = [
    // input         int    float
    ['',             ERR,   ERR],
    ['   ',          ERR,   ERR],
    ['\t\n',         ERR,   ERR],
    ['0',            0,     0],
    [' 0 ',          0,     0],
    ['+5',           5,     5],
    ['-0',           0,     -0],
    ['0x10',         ERR,   ERR],
    ['0b101',        ERR,   ERR],
    ['0o17',         ERR,   ERR],
    ['1e3',          ERR,   1000],
    ['1.0',          ERR,   1],
    ['5.',           ERR,   5],
    ['.5',           ERR,   0.5],
    ['.',            ERR,   ERR],
    ['1e',           ERR,   ERR],
    ['1,5',          ERR,   ERR],
    ['--5',          ERR,   ERR],
    ['inf',          ERR,   Infinity],
    ['-inf',         ERR,   -Infinity],
    ['Infinity',     ERR,   Infinity],
    ['INFINITY',     ERR,   Infinity],
    ['nan',          ERR,   NaN],
    ['NaN',          ERR,   NaN],
    // underscores, PEP 515: allowed between digits only
    ['1_000',        1000,  1000],
    ['\t1_000\n',    1000,  1000],
    ['1_0.0_1e1_0',  ERR,   100100000000],
    ['1e1_0',        ERR,   10000000000],
    ['1_e10',        ERR,   ERR],
    ['1e_10',        ERR,   ERR],
    ['1__0',         ERR,   ERR],
    ['_1',           ERR,   ERR],
    ['1_',           ERR,   ERR],
    ['1_.5',         ERR,   ERR],
    ['1._5',         ERR,   ERR],
    ['0x1_0',        ERR,   ERR]
]

function parse (type, value) {
    const parser = new argparse.ArgumentParser({ exit_on_error: false })
    parser.add_argument('--value', { type })
    // "--value=..." so that '-inf' is not taken for an option, as in CPython
    return parser.parse_args([`--value=${value}`]).value
}


for (const type of ['int', 'float']) {
    describe(`type '${type}' matches CPython`, () => {
        for (const [input, int_expected, float_expected] of conversions) {
            const expected = type === 'int' ? int_expected : float_expected
            const name = `${type}(${JSON.stringify(input)})`

            it(name, () => {
                if (expected === ERR) {
                    assert.throws(() => parse(type, input), argparse.ArgumentError)
                    return
                }
                const actual = parse(type, input)
                assert.ok(Object.is(actual, expected),
                    `${name} returned ${String(actual)}, expected ${String(expected)}`)
            })
        }
    })
}
