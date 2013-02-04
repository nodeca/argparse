/*global describe, it*/

'use strict';

var assert = require('assert');

var ArgumentParser = require('../lib/argparse').ArgumentParser;
var $$ = require('../lib/const');

describe('suppress', function () {
  var parser;
  var args;
  it('TestDefaultSuppress', function () {
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestDefaultSuppress',
      description: 'Test actions with suppressed defaults'
    });

    parser.addArgument([ 'foo' ], {
      default: $$.SUPPRESS,
      nargs: '?',
      defaultValue: $$.SUPPRESS
    });
    parser.addArgument([ 'bar' ], {
      default: $$.SUPPRESS,
      nargs: '*',
      defaultValue: $$.SUPPRESS
    });
    parser.addArgument([ '--baz' ], {
      default: $$.SUPPRESS,
      action: 'storeTrue',
      defaultValue: $$.SUPPRESS
    });

    args = parser.parseArgs([]);
    assert.deepEqual(args, {});
    args = parser.parseArgs([ 'a' ]);
    assert.deepEqual(args, { foo: 'a' });
    args = parser.parseArgs([ 'a', 'b' ]);
    assert.deepEqual(args, { foo: 'a', bar: [ 'b' ] });
    args = parser.parseArgs([ '--baz' ]);
    assert.deepEqual(args, { baz: true });
    args = parser.parseArgs([ 'a', '--baz' ]);
    assert.deepEqual(args, { foo: 'a', baz: true });
    args = parser.parseArgs([ '--baz', 'a', 'b' ]);
    assert.deepEqual(args, { bar: [ 'b' ], foo: 'a', baz: true });

    assert.throws(function () {
      args = parser.parseArgs([ '-x' ]);
    });
  });

  it('TestParserDefaultSuppress', function () {
    parser = new ArgumentParser({
      argument_default: $$.SUPPRESS,
      argumentDefault: $$.SUPPRESS,
      debug: true,
      prog: 'TestParserDefaultSuppress',
      description: 'Test actions with a parser-level default of SUPPRESS'
    });
    parser.addArgument([ 'foo' ], { nargs: '?' });
    parser.addArgument([ 'bar' ], { nargs: '*' });
    parser.addArgument([ '--baz' ], { action: 'storeTrue' });

    args = parser.parseArgs([]);
    assert.deepEqual(args, {});
    args = parser.parseArgs([ 'a' ]);
    assert.deepEqual(args, { foo: 'a' });
    args = parser.parseArgs([ 'a', 'b' ]);
    assert.deepEqual(args, { foo: 'a', bar: [ 'b' ] });
    args = parser.parseArgs([ '--baz' ]);
    assert.deepEqual(args, { baz: true });
    args = parser.parseArgs([ 'a', '--baz' ]);
    assert.deepEqual(args, { foo: 'a', baz: true });
    args = parser.parseArgs([ '--baz', 'a', 'b' ]);
    assert.deepEqual(args, { bar: [ 'b' ], foo: 'a', baz: true });

    assert.throws(function () {
      args = parser.parseArgs([ '-x' ]);
    });
  });

});
