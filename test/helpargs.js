/*global describe, it*/

'use strict';

var assert = require('assert');

var ArgumentParser = require('../lib/argparse').ArgumentParser;

describe('....', function () {
  var parser;
  var args;

  it("TestParserDefault42", function () {
    // Test actions with a parser-level default of 42
    parser = new ArgumentParser({debug: true, argumentDefault: 42, version: '1.0'});
    parser.addArgument(['foo'], {nargs: '?'});
    parser.addArgument(['bar'], {nargs: '*'});
    parser.addArgument(['--baz'], {action: 'storeTrue'});

    args = parser.parseArgs([]);
    assert.deepEqual(args, {bar: 42, foo: 42, baz: 42 });
    // problem is with 42 being assigned as default to help
  });

  it("TestOptionalsAlternatePrefixCharsAddedHelp", function () {
    /* When ``-`` not in prefix_chars, default operators created for help
    *  should use the prefix_chars in use rather than - or --
    *  http://bugs.python.org/issue9444
    */
    parser = new ArgumentParser({debug: true, prefixChars: '+:/', addHelp: true});
    parser.addArgument(['+f'], {action: 'storeTrue'});
    parser.addArgument(['::bar']);
    parser.addArgument(['/baz'], {action: 'storeConst', constant: 42});
    // parser.printHelp()
    args = parser.parseArgs([]);
    assert.deepEqual(args, {f: false, bar: null, baz: null});
    //
  });
});

