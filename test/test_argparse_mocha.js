/*global describe, it*/

'use strict';

var assert = require('assert');

var ArgumentParser = require('../lib/argparse').ArgumentParser;
describe('ArgumentParser', function () {
  describe('....', function () {
    var parser;
    var args;
    it('TestDefaultSuppress', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestDefaultSuppress',
  description: 'Test actions with suppressed defaults' });
      parser.addArgument([ 'foo' ], { default: '==SUPPRESS==',
  nargs: '?',
  defaultValue: '==SUPPRESS==' });
      parser.addArgument([ 'bar' ], { default: '==SUPPRESS==',
  nargs: '*',
  defaultValue: '==SUPPRESS==' });
      parser.addArgument([ '--baz' ], { default: '==SUPPRESS==',
  action: 'storeTrue',
  defaultValue: '==SUPPRESS==' });

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

    it('TestEmptyAndSpaceContainingArguments', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestEmptyAndSpaceContainingArguments',
  description: null });
      parser.addArgument([ 'x' ], { nargs: '?' });
      parser.addArgument([ '-y', '--yyy' ], { dest: 'y' });

      args = parser.parseArgs([ '' ]);
      assert.deepEqual(args, { y: null, x: '' });
      args = parser.parseArgs([ 'a badger' ]);
      assert.deepEqual(args, { y: null, x: 'a badger' });
      args = parser.parseArgs([ '-a badger' ]);
      assert.deepEqual(args, { y: null, x: '-a badger' });
      args = parser.parseArgs([ '-y', '' ]);
      assert.deepEqual(args, { y: '', x: null });
      args = parser.parseArgs([ '-y', 'a badger' ]);
      assert.deepEqual(args, { y: 'a badger', x: null });
      args = parser.parseArgs([ '-y', '-a badger' ]);
      assert.deepEqual(args, { y: '-a badger', x: null });
      args = parser.parseArgs([ '--yyy=a badger' ]);
      assert.deepEqual(args, { y: 'a badger', x: null });
      args = parser.parseArgs([ '--yyy=-a badger' ]);
      assert.deepEqual(args, { y: '-a badger', x: null });

      assert.throws(function () {
        args = parser.parseArgs([ '-y' ]);
      });
    });

    it('TestNargsRemainder', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestNargsRemainder',
  description: 'Tests specifying a positional with nargs=REMAINDER' });
      parser.addArgument([ 'x' ], {});
      parser.addArgument([ 'y' ], { nargs: '...' });
      parser.addArgument([ '-z' ], {});

      args = parser.parseArgs([ 'X' ]);
      assert.deepEqual(args, { y: [], x: 'X', z: null });
      args = parser.parseArgs([ '-z', 'Z', 'X' ]);
      assert.deepEqual(args, { y: [], x: 'X', z: 'Z' });
      args = parser.parseArgs([ 'X', 'A', 'B', '-z', 'Z' ]);
      assert.deepEqual(args, { y: [ 'A', 'B', '-z', 'Z' ], x: 'X', z: null });
      args = parser.parseArgs([ 'X', 'Y', '--foo' ]);
      assert.deepEqual(args, { y: [ 'Y', '--foo' ], x: 'X', z: null });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-z' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-z', 'Z' ]);
      });
    });

    it('TestNargsZeroOrMore', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestNargsZeroOrMore',
  description: 'Tests specifying an args for an Optional that accepts zero or more' });
      parser.addArgument([ '-x' ], { nargs: '*' });
      parser.addArgument([ 'y' ], { nargs: '*' });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { y: [], x: null });
      args = parser.parseArgs([ '-x' ]);
      assert.deepEqual(args, { y: [], x: [] });
      args = parser.parseArgs([ '-x', 'a' ]);
      assert.deepEqual(args, { y: [], x: [ 'a' ] });
      args = parser.parseArgs([ '-x', 'a', '--', 'b' ]);
      assert.deepEqual(args, { y: [ 'b' ], x: [ 'a' ] });
      args = parser.parseArgs([ 'a' ]);
      assert.deepEqual(args, { y: [ 'a' ], x: null });
      args = parser.parseArgs([ 'a', '-x' ]);
      assert.deepEqual(args, { y: [ 'a' ], x: [] });
      args = parser.parseArgs([ 'a', '-x', 'b' ]);
      assert.deepEqual(args, { y: [ 'a' ], x: [ 'b' ] });

    });

    it('TestOptionLike', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionLike',
  description: 'Tests options that may or may not be arguments' });
      parser.addArgument([ '-x' ], { type: 'float' });
      parser.addArgument([ '-3' ], { dest: 'y', type: 'float' });
      parser.addArgument([ 'z' ], { nargs: '*' });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { y: null, x: null, z: [] });
      args = parser.parseArgs([ '-x', '2.5' ]);
      assert.deepEqual(args, { y: null, x: 2.5, z: [] });
      args = parser.parseArgs([ '-x', '2.5', 'a' ]);
      assert.deepEqual(args, { y: null, x: 2.5, z: [ 'a' ] });
      args = parser.parseArgs([ '-3.5' ]);
      assert.deepEqual(args, { y: 0.5, x: null, z: [] });
      args = parser.parseArgs([ '-3-.5' ]);
      assert.deepEqual(args, { y: -0.5, x: null, z: [] });
      args = parser.parseArgs([ '-3', '.5' ]);
      assert.deepEqual(args, { y: 0.5, x: null, z: [] });
      args = parser.parseArgs([ 'a', '-3.5' ]);
      assert.deepEqual(args, { y: 0.5, x: null, z: [ 'a' ] });
      args = parser.parseArgs([ 'a' ]);
      assert.deepEqual(args, { y: null, x: null, z: [ 'a' ] });
      args = parser.parseArgs([ 'a', '-x', '1' ]);
      assert.deepEqual(args, { y: null, x: 1, z: [ 'a' ] });
      args = parser.parseArgs([ '-x', '1', 'a' ]);
      assert.deepEqual(args, { y: null, x: 1, z: [ 'a' ] });
      args = parser.parseArgs([ '-3', '1', 'a' ]);
      assert.deepEqual(args, { y: 1, x: null, z: [ 'a' ] });

      assert.throws(function () {
        args = parser.parseArgs([ '-x' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-y2.5' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-xa' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-x', '-a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-x', '-3' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-x', '-3.5' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-3', '-3.5' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-x', '-2.5' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-x', '-2.5', 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-3', '-.5' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', 'x', '-1' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-x', '-1', 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-3', '-1', 'a' ]);
      });
    });

    it('TestOptionalsActionAppend', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsActionAppend',
  description: 'Tests the append action for an Optional' });
      parser.addArgument([ '--baz' ], { action: 'append' });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { baz: null });
      args = parser.parseArgs([ '--baz', 'a' ]);
      assert.deepEqual(args, { baz: [ 'a' ] });
      args = parser.parseArgs([ '--baz', 'a', '--baz', 'b' ]);
      assert.deepEqual(args, { baz: [ 'a', 'b' ] });

      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--baz' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', '--baz' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--baz', 'a', 'b' ]);
      });
    });

    it('TestOptionalsActionAppendConst', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsActionAppendConst',
  description: 'Tests the append_const action for an Optional' });
      parser.addArgument([ '-b' ], { action: 'appendConst',
  const: 'Exception',
  constant: 'Exception' });
      parser.addArgument([ '-c' ], { dest: 'b', action: 'append' });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { b: null });
      args = parser.parseArgs([ '-b' ]);
      assert.deepEqual(args, { b: [ 'Exception' ] });
      args = parser.parseArgs([ '-b', '-cx', '-b', '-cyz' ]);
      assert.deepEqual(args, { b: [ 'Exception', 'x', 'Exception', 'yz' ] });

      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-c' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', '-c' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-bx' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-b', 'x' ]);
      });
    });

    it('TestOptionalsActionAppendConstWithDefault', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsActionAppendConstWithDefault',
  description: 'Tests the append_const action for an Optional' });
      parser.addArgument([ '-b' ], { default: [ 'X' ],
  action: 'appendConst',
  const: 'Exception',
  defaultValue: [ 'X' ],
  constant: 'Exception' });
      parser.addArgument([ '-c' ], { dest: 'b', action: 'append' });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { b: [ 'X' ] });
      args = parser.parseArgs([ '-b' ]);
      assert.deepEqual(args, { b: [ 'X', 'Exception' ] });
      args = parser.parseArgs([ '-b', '-cx', '-b', '-cyz' ]);
      assert.deepEqual(args, { b: [ 'X', 'Exception', 'x', 'Exception', 'yz' ] });

      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-c' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', '-c' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-bx' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-b', 'x' ]);
      });
    });

    it('TestOptionalsActionAppendWithDefault', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsActionAppendWithDefault',
  description: 'Tests the append action for an Optional' });
      parser.addArgument([ '--baz' ], { default: [ 'X' ], action: 'append', defaultValue: [ 'X' ] });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { baz: [ 'X' ] });
      args = parser.parseArgs([ '--baz', 'a' ]);
      assert.deepEqual(args, { baz: [ 'X', 'a' ] });
      args = parser.parseArgs([ '--baz', 'a', '--baz', 'b' ]);
      assert.deepEqual(args, { baz: [ 'X', 'a', 'b' ] });

      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--baz' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', '--baz' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--baz', 'a', 'b' ]);
      });
    });

    it('TestOptionalsActionCount', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsActionCount',
  description: 'Tests the count action for an Optional' });
      parser.addArgument([ '-x' ], { action: 'count' });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { x: null });
      args = parser.parseArgs([ '-x' ]);
      assert.deepEqual(args, { x: 1 });

      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-x', 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-x', 'b' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-x', 'a', '-x', 'b' ]);
      });
    });

    it('TestOptionalsActionStore', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsActionStore',
  description: 'Tests the store action for an Optional' });
      parser.addArgument([ '-x' ], { action: 'store' });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { x: null });
      args = parser.parseArgs([ '-xfoo' ]);
      assert.deepEqual(args, { x: 'foo' });

      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', '-x' ]);
      });
    });

    it('TestOptionalsActionStoreConst', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsActionStoreConst',
  description: 'Tests the store_const action for an Optional' });
      parser.addArgument([ '-y' ], { action: 'storeConst', const: 'object', constant: 'object' });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { y: null });
      args = parser.parseArgs([ '-y' ]);
      assert.deepEqual(args, { y: 'object' });

      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
    });

    it('TestOptionalsActionStoreFalse', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsActionStoreFalse',
  description: 'Tests the store_false action for an Optional' });
      parser.addArgument([ '-z' ], { action: 'storeFalse' });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { z: true });
      args = parser.parseArgs([ '-z' ]);
      assert.deepEqual(args, { z: false });

      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-za' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-z', 'a' ]);
      });
    });

    it('TestOptionalsActionStoreTrue', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsActionStoreTrue',
  description: 'Tests the store_true action for an Optional' });
      parser.addArgument([ '--apple' ], { action: 'storeTrue' });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { apple: false });
      args = parser.parseArgs([ '--apple' ]);
      assert.deepEqual(args, { apple: true });

      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--apple=b' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--apple', 'b' ]);
      });
    });

    it('TestOptionalsAlmostNumericAndPositionals', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsAlmostNumericAndPositionals',
  description: 'Tests negative number args when almost numeric options are present' });
      parser.addArgument([ 'x' ], { nargs: '?' });
      parser.addArgument([ '-k4' ], { action: 'storeTrue', dest: 'y' });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { y: false, x: null });
      args = parser.parseArgs([ '-2' ]);
      assert.deepEqual(args, { y: false, x: '-2' });
      args = parser.parseArgs([ 'a' ]);
      assert.deepEqual(args, { y: false, x: 'a' });
      args = parser.parseArgs([ '-k4' ]);
      assert.deepEqual(args, { y: true, x: null });
      args = parser.parseArgs([ '-k4', 'a' ]);
      assert.deepEqual(args, { y: true, x: 'a' });

      assert.throws(function () {
        args = parser.parseArgs([ '-k3' ]);
      });
    });

    it('TestOptionalsAlternatePrefixChars', function () {
      parser = new ArgumentParser({ add_help: false,
  prefix_chars: '+:/',
  addHelp: false,
  prefixChars: '+:/',
  debug: true,
  prog: 'TestOptionalsAlternatePrefixChars',
  description: 'Test an Optional with option strings with custom prefixes' });
      parser.addArgument([ '+f' ], { action: 'storeTrue' });
      parser.addArgument([ '::bar' ], {});
      parser.addArgument([ '/baz' ], { action: 'storeConst', const: 42, constant: 42 });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { bar: null, baz: null, f: false });
      args = parser.parseArgs([ '+f' ]);
      assert.deepEqual(args, { bar: null, baz: null, f: true });
      args = parser.parseArgs([ '::ba', 'B' ]);
      assert.deepEqual(args, { bar: 'B', baz: null, f: false });
      args = parser.parseArgs([ '+f', '::bar', 'B' ]);
      assert.deepEqual(args, { bar: 'B', baz: null, f: true });
      args = parser.parseArgs([ '+f', '/b' ]);
      assert.deepEqual(args, { bar: null, baz: 42, f: true });
      args = parser.parseArgs([ '/ba', '+f' ]);
      assert.deepEqual(args, { bar: null, baz: 42, f: true });

      assert.throws(function () {
        args = parser.parseArgs([ '--bar' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-fbar' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-b', 'B' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'B' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-f' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--bar', 'B' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-baz' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-h' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--help' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '+h' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '::help' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '/help' ]);
      });
    });

    it('TestOptionalsAlternatePrefixCharsAddedHelp', function () {
      parser = new ArgumentParser({ add_help: true,
  prefix_chars: '+:/',
  addHelp: true,
  prefixChars: '+:/',
  debug: true,
  prog: 'TestOptionalsAlternatePrefixCharsAddedHelp',
  description: 'When ``-`` not in prefix_chars, default operators created for help\n       should use the prefix_chars in use rather than - or --\n       http://bugs.python.org/issue9444' });
      parser.addArgument([ '+f' ], { action: 'storeTrue' });
      parser.addArgument([ '::bar' ], {});
      parser.addArgument([ '/baz' ], { action: 'storeConst', const: 42, constant: 42 });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { bar: null, baz: null, f: false });
      args = parser.parseArgs([ '+f' ]);
      assert.deepEqual(args, { bar: null, baz: null, f: true });
      args = parser.parseArgs([ '::ba', 'B' ]);
      assert.deepEqual(args, { bar: 'B', baz: null, f: false });
      args = parser.parseArgs([ '+f', '::bar', 'B' ]);
      assert.deepEqual(args, { bar: 'B', baz: null, f: true });
      args = parser.parseArgs([ '+f', '/b' ]);
      assert.deepEqual(args, { bar: null, baz: 42, f: true });
      args = parser.parseArgs([ '/ba', '+f' ]);
      assert.deepEqual(args, { bar: null, baz: 42, f: true });

      assert.throws(function () {
        args = parser.parseArgs([ '--bar' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-fbar' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-b', 'B' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'B' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-f' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--bar', 'B' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-baz' ]);
      });
    });

    it('TestOptionalsAlternatePrefixCharsMultipleShortArgs', function () {
      parser = new ArgumentParser({ add_help: false,
  prefix_chars: '+-',
  addHelp: false,
  prefixChars: '+-',
  debug: true,
  prog: 'TestOptionalsAlternatePrefixCharsMultipleShortArgs',
  description: 'Verify that Optionals must be called with their defined prefixes' });
      parser.addArgument([ '-x' ], { action: 'storeTrue' });
      parser.addArgument([ '+y' ], { action: 'storeTrue' });
      parser.addArgument([ '+z' ], { action: 'storeTrue' });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { y: false, x: false, z: false });
      args = parser.parseArgs([ '-x' ]);
      assert.deepEqual(args, { y: false, x: true, z: false });
      args = parser.parseArgs([ '+y', '-x' ]);
      assert.deepEqual(args, { y: true, x: true, z: false });
      args = parser.parseArgs([ '+yz', '-x' ]);
      assert.deepEqual(args, { y: true, x: true, z: true });

      assert.throws(function () {
        args = parser.parseArgs([ '-w' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-xyz' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '+x' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-y' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '+xyz' ]);
      });
    });

    it('TestOptionalsChoices', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsChoices',
  description: 'Tests specifying the choices for an Optional' });
      parser.addArgument([ '-f' ], { choices: 'abc' });
      parser.addArgument([ '-g' ], { type: 'int', choices: [ 0, 1, 2, 3, 4 ] });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { g: null, f: null });
      args = parser.parseArgs([ '-f', 'a' ]);
      assert.deepEqual(args, { g: null, f: 'a' });
      args = parser.parseArgs([ '-f', 'c' ]);
      assert.deepEqual(args, { g: null, f: 'c' });
      args = parser.parseArgs([ '-g', '0' ]);
      assert.deepEqual(args, { g: 0, f: null });
      args = parser.parseArgs([ '-g', '03' ]);
      assert.deepEqual(args, { g: 3, f: null });
      args = parser.parseArgs([ '-fb', '-g4' ]);
      assert.deepEqual(args, { g: 4, f: 'b' });

      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-f', 'd' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-fad' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-ga' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-g', '6' ]);
      });
    });

    it('TestOptionalsDefault', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsDefault',
  description: 'Tests specifying a default for an Optional' });
      parser.addArgument([ '-x' ], {});
      parser.addArgument([ '-y' ], { default: 42, defaultValue: 42 });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { y: 42, x: null });
      args = parser.parseArgs([ '-xx' ]);
      assert.deepEqual(args, { y: 42, x: 'x' });
      args = parser.parseArgs([ '-yy' ]);
      assert.deepEqual(args, { y: 'y', x: null });

      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
    });

    it('TestOptionalsDest', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsDest',
  description: 'Tests various means of setting destination' });
      parser.addArgument([ '--foo-bar' ], {});
      parser.addArgument([ '--baz' ], { dest: 'zabbaz' });

      args = parser.parseArgs([ '--foo-bar', 'f' ]);
      assert.deepEqual(args, { zabbaz: null, foo_bar: 'f' });
      args = parser.parseArgs([ '--baz', 'g' ]);
      assert.deepEqual(args, { zabbaz: 'g', foo_bar: null });
      args = parser.parseArgs([ '--foo-bar', 'h', '--baz', 'i' ]);
      assert.deepEqual(args, { zabbaz: 'i', foo_bar: 'h' });
      args = parser.parseArgs([ '--baz', 'j', '--foo-bar', 'k' ]);
      assert.deepEqual(args, { zabbaz: 'j', foo_bar: 'k' });

      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
    });

    it('TestOptionalsDoubleDash', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsDoubleDash',
  description: 'Test an Optional with a double-dash option string' });
      parser.addArgument([ '--foo' ], {});

      args = parser.parseArgs([]);
      assert.deepEqual(args, { foo: null });
      args = parser.parseArgs([ '--foo', 'a' ]);
      assert.deepEqual(args, { foo: 'a' });
      args = parser.parseArgs([ '--foo=a' ]);
      assert.deepEqual(args, { foo: 'a' });
      args = parser.parseArgs([ '--foo', '-2.5' ]);
      assert.deepEqual(args, { foo: '-2.5' });
      args = parser.parseArgs([ '--foo=-2.5' ]);
      assert.deepEqual(args, { foo: '-2.5' });

      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-f' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-f', 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--foo', '-x' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--foo', '--bar' ]);
      });
    });

    it('TestOptionalsDoubleDashPartialMatch', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsDoubleDashPartialMatch',
  description: 'Tests partial matching with a double-dash option string' });
      parser.addArgument([ '--badger' ], { action: 'storeTrue' });
      parser.addArgument([ '--bat' ], {});

      args = parser.parseArgs([]);
      assert.deepEqual(args, { bat: null, badger: false });
      args = parser.parseArgs([ '--bat', 'X' ]);
      assert.deepEqual(args, { bat: 'X', badger: false });
      args = parser.parseArgs([ '--bad' ]);
      assert.deepEqual(args, { bat: null, badger: true });
      args = parser.parseArgs([ '--badg' ]);
      assert.deepEqual(args, { bat: null, badger: true });
      args = parser.parseArgs([ '--badge' ]);
      assert.deepEqual(args, { bat: null, badger: true });
      args = parser.parseArgs([ '--badger' ]);
      assert.deepEqual(args, { bat: null, badger: true });

      assert.throws(function () {
        args = parser.parseArgs([ '--bar' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--b' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--ba' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--b=2' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--ba=4' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--badge', '5' ]);
      });
    });

    it('TestOptionalsDoubleDashPrefixMatch', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsDoubleDashPrefixMatch',
  description: 'Tests when one double-dash option string is a prefix of another' });
      parser.addArgument([ '--badger' ], { action: 'storeTrue' });
      parser.addArgument([ '--ba' ], {});

      args = parser.parseArgs([]);
      assert.deepEqual(args, { ba: null, badger: false });
      args = parser.parseArgs([ '--ba', 'X' ]);
      assert.deepEqual(args, { ba: 'X', badger: false });
      args = parser.parseArgs([ '--ba=X' ]);
      assert.deepEqual(args, { ba: 'X', badger: false });
      args = parser.parseArgs([ '--bad' ]);
      assert.deepEqual(args, { ba: null, badger: true });
      args = parser.parseArgs([ '--badg' ]);
      assert.deepEqual(args, { ba: null, badger: true });
      args = parser.parseArgs([ '--badge' ]);
      assert.deepEqual(args, { ba: null, badger: true });
      args = parser.parseArgs([ '--badger' ]);
      assert.deepEqual(args, { ba: null, badger: true });

      assert.throws(function () {
        args = parser.parseArgs([ '--bar' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--b' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--ba' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--b=2' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--badge', '5' ]);
      });
    });

    it('TestOptionalsNargs1', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsNargs1',
  description: 'Tests specifying the 1 arg for an Optional' });
      parser.addArgument([ '-x' ], { nargs: 1 });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { x: null });
      args = parser.parseArgs([ '-x', 'a' ]);
      assert.deepEqual(args, { x: [ 'a' ] });

      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-x' ]);
      });
    });

    it('TestOptionalsNargs3', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsNargs3',
  description: 'Tests specifying the 3 args for an Optional' });
      parser.addArgument([ '-x' ], { nargs: 3 });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { x: null });
      args = parser.parseArgs([ '-x', 'a', 'b', 'c' ]);
      assert.deepEqual(args, { x: [ 'a', 'b', 'c' ] });

      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-x' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-x', 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-x', 'a', 'b' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', '-x' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', '-x', 'b' ]);
      });
    });

    it('TestOptionalsNargsDefault', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsNargsDefault',
  description: 'Tests not specifying the number of args for an Optional' });
      parser.addArgument([ '-x' ], {});

      args = parser.parseArgs([]);
      assert.deepEqual(args, { x: null });
      args = parser.parseArgs([ '-x', 'a' ]);
      assert.deepEqual(args, { x: 'a' });

      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-x' ]);
      });
    });

    it('TestOptionalsNargsOneOrMore', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsNargsOneOrMore',
  description: 'Tests specifying an args for an Optional that accepts one or more' });
      parser.addArgument([ '-x' ], { nargs: '+' });
      parser.addArgument([ '-y' ], { default: 'spam', nargs: '+', defaultValue: 'spam' });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { y: 'spam', x: null });
      args = parser.parseArgs([ '-x', 'a' ]);
      assert.deepEqual(args, { y: 'spam', x: [ 'a' ] });
      args = parser.parseArgs([ '-x', 'a', 'b' ]);
      assert.deepEqual(args, { y: 'spam', x: [ 'a', 'b' ] });
      args = parser.parseArgs([ '-y', 'a' ]);
      assert.deepEqual(args, { y: [ 'a' ], x: null });
      args = parser.parseArgs([ '-y', 'a', 'b' ]);
      assert.deepEqual(args, { y: [ 'a', 'b' ], x: null });

      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-x' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-y' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', '-x' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', '-y', 'b' ]);
      });
    });

    it('TestOptionalsNargsOptional', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsNargsOptional',
  description: 'Tests specifying an Optional arg for an Optional' });
      parser.addArgument([ '-w' ], { nargs: '?' });
      parser.addArgument([ '-x' ], { const: 42, nargs: '?', constant: 42 });
      parser.addArgument([ '-y' ], { default: 'spam', nargs: '?', defaultValue: 'spam' });
      parser.addArgument([ '-z' ], { default: '84',
  nargs: '?',
  type: 'int',
  const: '42',
  defaultValue: '84',
  constant: '42' });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { y: 'spam', x: null, z: 84, w: null });
      args = parser.parseArgs([ '-w' ]);
      assert.deepEqual(args, { y: 'spam', x: null, z: 84, w: null });
      args = parser.parseArgs([ '-w', '2' ]);
      assert.deepEqual(args, { y: 'spam', x: null, z: 84, w: '2' });
      args = parser.parseArgs([ '-x' ]);
      assert.deepEqual(args, { y: 'spam', x: 42, z: 84, w: null });
      args = parser.parseArgs([ '-x', '2' ]);
      assert.deepEqual(args, { y: 'spam', x: '2', z: 84, w: null });
      args = parser.parseArgs([ '-y' ]);
      assert.deepEqual(args, { y: null, x: null, z: 84, w: null });
      args = parser.parseArgs([ '-y', '2' ]);
      assert.deepEqual(args, { y: '2', x: null, z: 84, w: null });
      args = parser.parseArgs([ '-z' ]);
      assert.deepEqual(args, { y: 'spam', x: null, z: 42, w: null });
      args = parser.parseArgs([ '-z', '2' ]);
      assert.deepEqual(args, { y: 'spam', x: null, z: 2, w: null });

      assert.throws(function () {
        args = parser.parseArgs([ '2' ]);
      });
    });

    it('TestOptionalsNargsZeroOrMore', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsNargsZeroOrMore',
  description: 'Tests specifying an args for an Optional that accepts zero or more' });
      parser.addArgument([ '-x' ], { nargs: '*' });
      parser.addArgument([ '-y' ], { default: 'spam', nargs: '*', defaultValue: 'spam' });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { y: 'spam', x: null });
      args = parser.parseArgs([ '-x' ]);
      assert.deepEqual(args, { y: 'spam', x: [] });
      args = parser.parseArgs([ '-x', 'a' ]);
      assert.deepEqual(args, { y: 'spam', x: [ 'a' ] });
      args = parser.parseArgs([ '-x', 'a', 'b' ]);
      assert.deepEqual(args, { y: 'spam', x: [ 'a', 'b' ] });
      args = parser.parseArgs([ '-y' ]);
      assert.deepEqual(args, { y: [], x: null });
      args = parser.parseArgs([ '-y', 'a' ]);
      assert.deepEqual(args, { y: [ 'a' ], x: null });
      args = parser.parseArgs([ '-y', 'a', 'b' ]);
      assert.deepEqual(args, { y: [ 'a', 'b' ], x: null });

      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
    });

    it('TestOptionalsNumeric', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsNumeric',
  description: 'Test an Optional with a short opt string' });
      parser.addArgument([ '-1' ], { dest: 'one' });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { one: null });
      args = parser.parseArgs([ '-1', 'a' ]);
      assert.deepEqual(args, { one: 'a' });
      args = parser.parseArgs([ '-1a' ]);
      assert.deepEqual(args, { one: 'a' });
      args = parser.parseArgs([ '-1-2' ]);
      assert.deepEqual(args, { one: '-2' });

      assert.throws(function () {
        args = parser.parseArgs([ '-1' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-1', '--foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-1', '-y' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-1', '-1' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-1', '-2' ]);
      });
    });

    it('TestOptionalsNumericAndPositionals', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsNumericAndPositionals',
  description: 'Tests negative number args when numeric options are present' });
      parser.addArgument([ 'x' ], { nargs: '?' });
      parser.addArgument([ '-4' ], { action: 'storeTrue', dest: 'y' });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { y: false, x: null });
      args = parser.parseArgs([ 'a' ]);
      assert.deepEqual(args, { y: false, x: 'a' });
      args = parser.parseArgs([ '-4' ]);
      assert.deepEqual(args, { y: true, x: null });
      args = parser.parseArgs([ '-4', 'a' ]);
      assert.deepEqual(args, { y: true, x: 'a' });

      assert.throws(function () {
        args = parser.parseArgs([ '-2' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-315' ]);
      });
    });

    it('TestOptionalsRequired', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsRequired',
  description: 'Tests the an optional action that is required' });
      parser.addArgument([ '-x' ], { required: true, type: 'int' });

      args = parser.parseArgs([ '-x', '1' ]);
      assert.deepEqual(args, { x: 1 });
      args = parser.parseArgs([ '-x42' ]);
      assert.deepEqual(args, { x: 42 });

      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([]);
      });
    });

    it('TestOptionalsShortLong', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsShortLong',
  description: 'Test a combination of single- and double-dash option strings' });
      parser.addArgument([ '-v', '--verbose', '-n', '--noisy' ], { action: 'storeTrue' });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { verbose: false });
      args = parser.parseArgs([ '-v' ]);
      assert.deepEqual(args, { verbose: true });
      args = parser.parseArgs([ '--verbose' ]);
      assert.deepEqual(args, { verbose: true });
      args = parser.parseArgs([ '-n' ]);
      assert.deepEqual(args, { verbose: true });
      args = parser.parseArgs([ '--noisy' ]);
      assert.deepEqual(args, { verbose: true });

      assert.throws(function () {
        args = parser.parseArgs([ '--x', '--verbose' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-N' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-v', 'x' ]);
      });
    });

    it('TestOptionalsSingleDash', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsSingleDash',
  description: 'Test an Optional with a single-dash option string' });
      parser.addArgument([ '-x' ], {});

      args = parser.parseArgs([]);
      assert.deepEqual(args, { x: null });
      args = parser.parseArgs([ '-x', 'a' ]);
      assert.deepEqual(args, { x: 'a' });
      args = parser.parseArgs([ '-xa' ]);
      assert.deepEqual(args, { x: 'a' });
      args = parser.parseArgs([ '-x', '-1' ]);
      assert.deepEqual(args, { x: '-1' });
      args = parser.parseArgs([ '-x-1' ]);
      assert.deepEqual(args, { x: '-1' });

      assert.throws(function () {
        args = parser.parseArgs([ '-x' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-x', '--foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-x', '-y' ]);
      });
    });

    it('TestOptionalsSingleDashAmbiguous', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsSingleDashAmbiguous',
  description: 'Test Optionals that partially match but are not subsets' });
      parser.addArgument([ '-foobar' ], {});
      parser.addArgument([ '-foorab' ], {});

      args = parser.parseArgs([]);
      assert.deepEqual(args, { foorab: null, foobar: null });
      args = parser.parseArgs([ '-foob', 'a' ]);
      assert.deepEqual(args, { foorab: null, foobar: 'a' });
      args = parser.parseArgs([ '-foor', 'a' ]);
      assert.deepEqual(args, { foorab: 'a', foobar: null });
      args = parser.parseArgs([ '-fooba', 'a' ]);
      assert.deepEqual(args, { foorab: null, foobar: 'a' });
      args = parser.parseArgs([ '-foora', 'a' ]);
      assert.deepEqual(args, { foorab: 'a', foobar: null });
      args = parser.parseArgs([ '-foobar', 'a' ]);
      assert.deepEqual(args, { foorab: null, foobar: 'a' });
      args = parser.parseArgs([ '-foorab', 'a' ]);
      assert.deepEqual(args, { foorab: 'a', foobar: null });

      assert.throws(function () {
        args = parser.parseArgs([ '-f' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-f', 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-fa' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-foa' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-fo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-foo', 'b' ]);
      });
    });

    it('TestOptionalsSingleDashCombined', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsSingleDashCombined',
  description: 'Test an Optional with a single-dash option string' });
      parser.addArgument([ '-x' ], { action: 'storeTrue' });
      parser.addArgument([ '-yyy' ], { action: 'storeConst', const: 42, constant: 42 });
      parser.addArgument([ '-z' ], {});

      args = parser.parseArgs([]);
      assert.deepEqual(args, { x: false, z: null, yyy: null });
      args = parser.parseArgs([ '-x' ]);
      assert.deepEqual(args, { x: true, z: null, yyy: null });
      args = parser.parseArgs([ '-za' ]);
      assert.deepEqual(args, { x: false, z: 'a', yyy: null });
      args = parser.parseArgs([ '-z', 'a' ]);
      assert.deepEqual(args, { x: false, z: 'a', yyy: null });
      args = parser.parseArgs([ '-xza' ]);
      assert.deepEqual(args, { x: true, z: 'a', yyy: null });
      args = parser.parseArgs([ '-xz', 'a' ]);
      assert.deepEqual(args, { x: true, z: 'a', yyy: null });
      args = parser.parseArgs([ '-x', '-za' ]);
      assert.deepEqual(args, { x: true, z: 'a', yyy: null });
      args = parser.parseArgs([ '-x', '-z', 'a' ]);
      assert.deepEqual(args, { x: true, z: 'a', yyy: null });
      args = parser.parseArgs([ '-y' ]);
      assert.deepEqual(args, { x: false, z: null, yyy: 42 });
      args = parser.parseArgs([ '-yyy' ]);
      assert.deepEqual(args, { x: false, z: null, yyy: 42 });
      args = parser.parseArgs([ '-x', '-yyy', '-za' ]);
      assert.deepEqual(args, { x: true, z: 'a', yyy: 42 });
      args = parser.parseArgs([ '-x', '-yyy', '-z', 'a' ]);
      assert.deepEqual(args, { x: true, z: 'a', yyy: 42 });

      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-xa' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-x', '--foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-x', '-z' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-z', '-x' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-yx' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-yz', 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-yyyx' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-yyyza' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-xyza' ]);
      });
    });

    it('TestOptionalsSingleDashLong', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsSingleDashLong',
  description: 'Test an Optional with a multi-character single-dash option string' });
      parser.addArgument([ '-foo' ], {});

      args = parser.parseArgs([]);
      assert.deepEqual(args, { foo: null });
      args = parser.parseArgs([ '-foo', 'a' ]);
      assert.deepEqual(args, { foo: 'a' });
      args = parser.parseArgs([ '-foo', '-1' ]);
      assert.deepEqual(args, { foo: '-1' });
      args = parser.parseArgs([ '-fo', 'a' ]);
      assert.deepEqual(args, { foo: 'a' });
      args = parser.parseArgs([ '-f', 'a' ]);
      assert.deepEqual(args, { foo: 'a' });

      assert.throws(function () {
        args = parser.parseArgs([ '-foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-foo', '--foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-foo', '-y' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-fooa' ]);
      });
    });

    it('TestOptionalsSingleDashSubsetAmbiguous', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsSingleDashSubsetAmbiguous',
  description: 'Test Optionals where option strings are subsets of each other' });
      parser.addArgument([ '-f' ], {});
      parser.addArgument([ '-foobar' ], {});
      parser.addArgument([ '-foorab' ], {});

      args = parser.parseArgs([]);
      assert.deepEqual(args, { foorab: null, f: null, foobar: null });
      args = parser.parseArgs([ '-f', 'a' ]);
      assert.deepEqual(args, { foorab: null, f: 'a', foobar: null });
      args = parser.parseArgs([ '-fa' ]);
      assert.deepEqual(args, { foorab: null, f: 'a', foobar: null });
      args = parser.parseArgs([ '-foa' ]);
      assert.deepEqual(args, { foorab: null, f: 'oa', foobar: null });
      args = parser.parseArgs([ '-fooa' ]);
      assert.deepEqual(args, { foorab: null, f: 'ooa', foobar: null });
      args = parser.parseArgs([ '-foobar', 'a' ]);
      assert.deepEqual(args, { foorab: null, f: null, foobar: 'a' });
      args = parser.parseArgs([ '-foorab', 'a' ]);
      assert.deepEqual(args, { foorab: 'a', f: null, foobar: null });

      assert.throws(function () {
        args = parser.parseArgs([ '-f' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-fo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-foo', 'b' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-foob' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-fooba' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-foora' ]);
      });
    });

    it('TestOptionalsSingleDoubleDash', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestOptionalsSingleDoubleDash',
  description: 'Test an Optional with single- and double-dash option strings' });
      parser.addArgument([ '-f' ], { action: 'storeTrue' });
      parser.addArgument([ '--bar' ], {});
      parser.addArgument([ '-baz' ], { action: 'storeConst', const: 42, constant: 42 });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { bar: null, baz: null, f: false });
      args = parser.parseArgs([ '-f' ]);
      assert.deepEqual(args, { bar: null, baz: null, f: true });
      args = parser.parseArgs([ '--ba', 'B' ]);
      assert.deepEqual(args, { bar: 'B', baz: null, f: false });
      args = parser.parseArgs([ '-f', '--bar', 'B' ]);
      assert.deepEqual(args, { bar: 'B', baz: null, f: true });
      args = parser.parseArgs([ '-f', '-b' ]);
      assert.deepEqual(args, { bar: null, baz: 42, f: true });
      args = parser.parseArgs([ '-ba', '-f' ]);
      assert.deepEqual(args, { bar: null, baz: 42, f: true });

      assert.throws(function () {
        args = parser.parseArgs([ '--bar' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-fbar' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-fbaz' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-bazf' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-b', 'B' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'B' ]);
      });
    });

    it('TestParserDefault42', function () {
      parser = new ArgumentParser({ version: '1.0',
  argument_default: 42,
  argumentDefault: 42,
  debug: true,
  prog: 'TestParserDefault42',
  description: 'Test actions with a parser-level default of 42' });
      parser.addArgument([ 'foo' ], { nargs: '?' });
      parser.addArgument([ 'bar' ], { nargs: '*' });
      parser.addArgument([ '--baz' ], { action: 'storeTrue' });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { bar: 42, foo: 42, baz: 42 });
      args = parser.parseArgs([ 'a' ]);
      assert.deepEqual(args, { bar: 42, foo: 'a', baz: 42 });
      args = parser.parseArgs([ 'a', 'b' ]);
      assert.deepEqual(args, { bar: [ 'b' ], foo: 'a', baz: 42 });
      args = parser.parseArgs([ '--baz' ]);
      assert.deepEqual(args, { bar: 42, foo: 42, baz: true });
      args = parser.parseArgs([ 'a', '--baz' ]);
      assert.deepEqual(args, { bar: 42, foo: 'a', baz: true });
      args = parser.parseArgs([ '--baz', 'a', 'b' ]);
      assert.deepEqual(args, { bar: [ 'b' ], foo: 'a', baz: true });

      assert.throws(function () {
        args = parser.parseArgs([ '-x' ]);
      });
    });

    it('TestParserDefaultSuppress', function () {
      parser = new ArgumentParser({ argument_default: '==SUPPRESS==',
  argumentDefault: '==SUPPRESS==',
  debug: true,
  prog: 'TestParserDefaultSuppress',
  description: 'Test actions with a parser-level default of SUPPRESS' });
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

    it('TestPositionalsActionAppend', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsActionAppend',
  description: 'Test the \'append\' action' });
      parser.addArgument([ 'spam' ], { action: 'append' });
      parser.addArgument([ 'spam' ], { action: 'append', nargs: 2 });

      args = parser.parseArgs([ 'a', 'b', 'c' ]);
      assert.deepEqual(args, { spam: [ 'a', [ 'b', 'c' ] ] });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', 'b' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', 'b', 'c', 'd' ]);
      });
    });

    it('TestPositionalsChoicesInt', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsChoicesInt',
  description: 'Test a set of integer choices' });
      parser.addArgument([ 'spam' ], { type: 'int',
  choices: [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19 ] });

      args = parser.parseArgs([ '4' ]);
      assert.deepEqual(args, { spam: 4 });
      args = parser.parseArgs([ '15' ]);
      assert.deepEqual(args, { spam: 15 });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'h' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '42' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'ef' ]);
      });
    });

    it('TestPositionalsChoicesString', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsChoicesString',
  description: 'Test a set of single-character choices' });
      parser.addArgument([ 'spam' ], { choices: [ 'a', 'c', 'b', 'e', 'd', 'g', 'f' ] });

      args = parser.parseArgs([ 'a' ]);
      assert.deepEqual(args, { spam: 'a' });
      args = parser.parseArgs([ 'g' ]);
      assert.deepEqual(args, { spam: 'g' });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'h' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '42' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'ef' ]);
      });
    });

    it('TestPositionalsNargs1', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargs1',
  description: 'Test a Positional that specifies an nargs of 1' });
      parser.addArgument([ 'foo' ], { nargs: 1 });

      args = parser.parseArgs([ 'a' ]);
      assert.deepEqual(args, { foo: [ 'a' ] });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-x' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', 'b' ]);
      });
    });

    it('TestPositionalsNargs2', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargs2',
  description: 'Test a Positional that specifies an nargs of 2' });
      parser.addArgument([ 'foo' ], { nargs: 2 });

      args = parser.parseArgs([ 'a', 'b' ]);
      assert.deepEqual(args, { foo: [ 'a', 'b' ] });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-x' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', 'b', 'c' ]);
      });
    });

    it('TestPositionalsNargs2None', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargs2None',
  description: 'Test a Positional with 2 nargs followed by one with none' });
      parser.addArgument([ 'foo' ], { nargs: 2 });
      parser.addArgument([ 'bar' ], {});

      args = parser.parseArgs([ 'a', 'b', 'c' ]);
      assert.deepEqual(args, { foo: [ 'a', 'b' ], bar: 'c' });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', 'b' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', 'b', 'c', 'd' ]);
      });
    });

    it('TestPositionalsNargs2OneOrMore', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargs2OneOrMore',
  description: 'Test a Positional with 2 nargs followed by one with one or more' });
      parser.addArgument([ 'foo' ], { nargs: 2 });
      parser.addArgument([ 'bar' ], { nargs: '+' });

      args = parser.parseArgs([ 'a', 'b', 'c' ]);
      assert.deepEqual(args, { foo: [ 'a', 'b' ], bar: [ 'c' ] });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', 'b' ]);
      });
    });

    it('TestPositionalsNargs2Optional', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargs2Optional',
  description: 'Test a Positional with 2 nargs followed by one optional' });
      parser.addArgument([ 'foo' ], { nargs: 2 });
      parser.addArgument([ 'bar' ], { nargs: '?' });

      args = parser.parseArgs([ 'a', 'b' ]);
      assert.deepEqual(args, { foo: [ 'a', 'b' ], bar: null });
      args = parser.parseArgs([ 'a', 'b', 'c' ]);
      assert.deepEqual(args, { foo: [ 'a', 'b' ], bar: 'c' });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', 'b', 'c', 'd' ]);
      });
    });

    it('TestPositionalsNargs2ZeroOrMore', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargs2ZeroOrMore',
  description: 'Test a Positional with 2 nargs followed by one with unlimited' });
      parser.addArgument([ 'foo' ], { nargs: 2 });
      parser.addArgument([ 'bar' ], { nargs: '*' });

      args = parser.parseArgs([ 'a', 'b' ]);
      assert.deepEqual(args, { foo: [ 'a', 'b' ], bar: [] });
      args = parser.parseArgs([ 'a', 'b', 'c' ]);
      assert.deepEqual(args, { foo: [ 'a', 'b' ], bar: [ 'c' ] });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
    });

    it('TestPositionalsNargsNone', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargsNone',
  description: 'Test a Positional that doesn\'t specify nargs' });
      parser.addArgument([ 'foo' ], {});

      args = parser.parseArgs([ 'a' ]);
      assert.deepEqual(args, { foo: 'a' });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-x' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', 'b' ]);
      });
    });

    it('TestPositionalsNargsNone1', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargsNone1',
  description: 'Test a Positional with no nargs followed by one with 1' });
      parser.addArgument([ 'foo' ], {});
      parser.addArgument([ 'bar' ], { nargs: 1 });

      args = parser.parseArgs([ 'a', 'b' ]);
      assert.deepEqual(args, { foo: 'a', bar: [ 'b' ] });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', 'b', 'c' ]);
      });
    });

    it('TestPositionalsNargsNoneNone', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargsNoneNone',
  description: 'Test two Positionals that don\'t specify nargs' });
      parser.addArgument([ 'foo' ], {});
      parser.addArgument([ 'bar' ], {});

      args = parser.parseArgs([ 'a', 'b' ]);
      assert.deepEqual(args, { foo: 'a', bar: 'b' });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-x' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', 'b', 'c' ]);
      });
    });

    it('TestPositionalsNargsNoneOneOrMore', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargsNoneOneOrMore',
  description: 'Test a Positional with no nargs followed by one with one or more' });
      parser.addArgument([ 'foo' ], {});
      parser.addArgument([ 'bar' ], { nargs: '+' });

      args = parser.parseArgs([ 'a', 'b' ]);
      assert.deepEqual(args, { foo: 'a', bar: [ 'b' ] });
      args = parser.parseArgs([ 'a', 'b', 'c' ]);
      assert.deepEqual(args, { foo: 'a', bar: [ 'b', 'c' ] });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
    });

    it('TestPositionalsNargsNoneOneOrMore1', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargsNoneOneOrMore1',
  description: 'Test three Positionals: no nargs, one or more nargs and 1 nargs' });
      parser.addArgument([ 'foo' ], {});
      parser.addArgument([ 'bar' ], { nargs: '+' });
      parser.addArgument([ 'baz' ], { nargs: 1 });

      args = parser.parseArgs([ 'a', 'b', 'c' ]);
      assert.deepEqual(args, { bar: [ 'b' ], foo: 'a', baz: [ 'c' ] });
      args = parser.parseArgs([ 'a', 'b', 'c', 'd' ]);
      assert.deepEqual(args, { bar: [ 'b', 'c' ], foo: 'a', baz: [ 'd' ] });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'b' ]);
      });
    });

    it('TestPositionalsNargsNoneOptional', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargsNoneOptional',
  description: 'Test a Positional with no nargs followed by one with an Optional' });
      parser.addArgument([ 'foo' ], {});
      parser.addArgument([ 'bar' ], { nargs: '?' });

      args = parser.parseArgs([ 'a' ]);
      assert.deepEqual(args, { foo: 'a', bar: null });
      args = parser.parseArgs([ 'a', 'b' ]);
      assert.deepEqual(args, { foo: 'a', bar: 'b' });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', 'b', 'c' ]);
      });
    });

    it('TestPositionalsNargsNoneOptional1', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargsNoneOptional1',
  description: 'Test three Positionals: no nargs, optional narg and 1 nargs' });
      parser.addArgument([ 'foo' ], {});
      parser.addArgument([ 'bar' ], { default: 0.625, nargs: '?', defaultValue: 0.625 });
      parser.addArgument([ 'baz' ], { nargs: 1 });

      args = parser.parseArgs([ 'a', 'b' ]);
      assert.deepEqual(args, { bar: 0.625, foo: 'a', baz: [ 'b' ] });
      args = parser.parseArgs([ 'a', 'b', 'c' ]);
      assert.deepEqual(args, { bar: 'b', foo: 'a', baz: [ 'c' ] });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
    });

    it('TestPositionalsNargsNoneZeroOrMore', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargsNoneZeroOrMore',
  description: 'Test a Positional with no nargs followed by one with unlimited' });
      parser.addArgument([ 'foo' ], {});
      parser.addArgument([ 'bar' ], { nargs: '*' });

      args = parser.parseArgs([ 'a' ]);
      assert.deepEqual(args, { foo: 'a', bar: [] });
      args = parser.parseArgs([ 'a', 'b' ]);
      assert.deepEqual(args, { foo: 'a', bar: [ 'b' ] });
      args = parser.parseArgs([ 'a', 'b', 'c' ]);
      assert.deepEqual(args, { foo: 'a', bar: [ 'b', 'c' ] });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
    });

    it('TestPositionalsNargsNoneZeroOrMore1', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargsNoneZeroOrMore1',
  description: 'Test three Positionals: no nargs, unlimited nargs and 1 nargs' });
      parser.addArgument([ 'foo' ], {});
      parser.addArgument([ 'bar' ], { nargs: '*' });
      parser.addArgument([ 'baz' ], { nargs: 1 });

      args = parser.parseArgs([ 'a', 'b' ]);
      assert.deepEqual(args, { bar: [], foo: 'a', baz: [ 'b' ] });
      args = parser.parseArgs([ 'a', 'b', 'c' ]);
      assert.deepEqual(args, { bar: [ 'b' ], foo: 'a', baz: [ 'c' ] });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
    });

    it('TestPositionalsNargsOneOrMore', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargsOneOrMore',
  description: 'Test a Positional that specifies one or more nargs' });
      parser.addArgument([ 'foo' ], { nargs: '+' });

      args = parser.parseArgs([ 'a' ]);
      assert.deepEqual(args, { foo: [ 'a' ] });
      args = parser.parseArgs([ 'a', 'b' ]);
      assert.deepEqual(args, { foo: [ 'a', 'b' ] });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '-x' ]);
      });
    });

    it('TestPositionalsNargsOneOrMore1', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargsOneOrMore1',
  description: 'Test a Positional with one or more nargs followed by one with 1' });
      parser.addArgument([ 'foo' ], { nargs: '+' });
      parser.addArgument([ 'bar' ], { nargs: 1 });

      args = parser.parseArgs([ 'a', 'b' ]);
      assert.deepEqual(args, { foo: [ 'a' ], bar: [ 'b' ] });
      args = parser.parseArgs([ 'a', 'b', 'c' ]);
      assert.deepEqual(args, { foo: [ 'a', 'b' ], bar: [ 'c' ] });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
    });

    it('TestPositionalsNargsOneOrMoreNone', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargsOneOrMoreNone',
  description: 'Test a Positional with one or more nargs followed by one with none' });
      parser.addArgument([ 'foo' ], { nargs: '+' });
      parser.addArgument([ 'bar' ], {});

      args = parser.parseArgs([ 'a', 'b' ]);
      assert.deepEqual(args, { foo: [ 'a' ], bar: 'b' });
      args = parser.parseArgs([ 'a', 'b', 'c' ]);
      assert.deepEqual(args, { foo: [ 'a', 'b' ], bar: 'c' });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a' ]);
      });
    });

    it('TestPositionalsNargsOptional', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargsOptional',
  description: 'Tests an Optional Positional' });
      parser.addArgument([ 'foo' ], { nargs: '?' });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { foo: null });
      args = parser.parseArgs([ 'a' ]);
      assert.deepEqual(args, { foo: 'a' });

      assert.throws(function () {
        args = parser.parseArgs([ '-x' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', 'b' ]);
      });
    });

    it('TestPositionalsNargsOptional1', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargsOptional1',
  description: 'Test a Positional with an Optional nargs followed by one with 1' });
      parser.addArgument([ 'foo' ], { nargs: '?' });
      parser.addArgument([ 'bar' ], { nargs: 1 });

      args = parser.parseArgs([ 'a' ]);
      assert.deepEqual(args, { foo: null, bar: [ 'a' ] });
      args = parser.parseArgs([ 'a', 'b' ]);
      assert.deepEqual(args, { foo: 'a', bar: [ 'b' ] });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', 'b', 'c' ]);
      });
    });

    it('TestPositionalsNargsOptionalConvertedDefault', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargsOptionalConvertedDefault',
  description: 'Tests an Optional Positional with a default value\n    that needs to be converted to the appropriate type.\n    ' });
      parser.addArgument([ 'foo' ], { default: '42', type: 'int', nargs: '?', defaultValue: '42' });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { foo: 42 });
      args = parser.parseArgs([ '1' ]);
      assert.deepEqual(args, { foo: 1 });

      assert.throws(function () {
        args = parser.parseArgs([ '-x' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', 'b' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '1', '2' ]);
      });
    });

    it('TestPositionalsNargsOptionalDefault', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargsOptionalDefault',
  description: 'Tests an Optional Positional with a default value' });
      parser.addArgument([ 'foo' ], { default: 42, nargs: '?', defaultValue: 42 });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { foo: 42 });
      args = parser.parseArgs([ 'a' ]);
      assert.deepEqual(args, { foo: 'a' });

      assert.throws(function () {
        args = parser.parseArgs([ '-x' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', 'b' ]);
      });
    });

    it('TestPositionalsNargsOptionalNone', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargsOptionalNone',
  description: 'Test a Positional with an Optional nargs followed by one with none' });
      parser.addArgument([ 'foo' ], { default: 42, nargs: '?', defaultValue: 42 });
      parser.addArgument([ 'bar' ], {});

      args = parser.parseArgs([ 'a' ]);
      assert.deepEqual(args, { foo: 42, bar: 'a' });
      args = parser.parseArgs([ 'a', 'b' ]);
      assert.deepEqual(args, { foo: 'a', bar: 'b' });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', 'b', 'c' ]);
      });
    });

    it('TestPositionalsNargsOptionalOneOrMore', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargsOptionalOneOrMore',
  description: 'Test an Optional narg followed by one or more nargs' });
      parser.addArgument([ 'foo' ], { nargs: '?' });
      parser.addArgument([ 'bar' ], { nargs: '+' });

      args = parser.parseArgs([ 'a' ]);
      assert.deepEqual(args, { foo: null, bar: [ 'a' ] });
      args = parser.parseArgs([ 'a', 'b' ]);
      assert.deepEqual(args, { foo: 'a', bar: [ 'b' ] });
      args = parser.parseArgs([ 'a', 'b', 'c' ]);
      assert.deepEqual(args, { foo: 'a', bar: [ 'b', 'c' ] });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
    });

    it('TestPositionalsNargsOptionalOptional', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargsOptionalOptional',
  description: 'Test two optional nargs' });
      parser.addArgument([ 'foo' ], { nargs: '?' });
      parser.addArgument([ 'bar' ], { default: 42, nargs: '?', defaultValue: 42 });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { foo: null, bar: 42 });
      args = parser.parseArgs([ 'a' ]);
      assert.deepEqual(args, { foo: 'a', bar: 42 });
      args = parser.parseArgs([ 'a', 'b' ]);
      assert.deepEqual(args, { foo: 'a', bar: 'b' });

      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ 'a', 'b', 'c' ]);
      });
    });

    it('TestPositionalsNargsOptionalZeroOrMore', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargsOptionalZeroOrMore',
  description: 'Test an Optional narg followed by unlimited nargs' });
      parser.addArgument([ 'foo' ], { nargs: '?' });
      parser.addArgument([ 'bar' ], { nargs: '*' });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { foo: null, bar: [] });
      args = parser.parseArgs([ 'a' ]);
      assert.deepEqual(args, { foo: 'a', bar: [] });
      args = parser.parseArgs([ 'a', 'b' ]);
      assert.deepEqual(args, { foo: 'a', bar: [ 'b' ] });
      args = parser.parseArgs([ 'a', 'b', 'c' ]);
      assert.deepEqual(args, { foo: 'a', bar: [ 'b', 'c' ] });

      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
    });

    it('TestPositionalsNargsZeroOrMore', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargsZeroOrMore',
  description: 'Test a Positional that specifies unlimited nargs' });
      parser.addArgument([ 'foo' ], { nargs: '*' });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { foo: [] });
      args = parser.parseArgs([ 'a' ]);
      assert.deepEqual(args, { foo: [ 'a' ] });
      args = parser.parseArgs([ 'a', 'b' ]);
      assert.deepEqual(args, { foo: [ 'a', 'b' ] });

      assert.throws(function () {
        args = parser.parseArgs([ '-x' ]);
      });
    });

    it('TestPositionalsNargsZeroOrMore1', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargsZeroOrMore1',
  description: 'Test a Positional with unlimited nargs followed by one with 1' });
      parser.addArgument([ 'foo' ], { nargs: '*' });
      parser.addArgument([ 'bar' ], { nargs: 1 });

      args = parser.parseArgs([ 'a' ]);
      assert.deepEqual(args, { foo: [], bar: [ 'a' ] });
      args = parser.parseArgs([ 'a', 'b' ]);
      assert.deepEqual(args, { foo: [ 'a' ], bar: [ 'b' ] });
      args = parser.parseArgs([ 'a', 'b', 'c' ]);
      assert.deepEqual(args, { foo: [ 'a', 'b' ], bar: [ 'c' ] });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
    });

    it('TestPositionalsNargsZeroOrMoreDefault', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargsZeroOrMoreDefault',
  description: 'Test a Positional that specifies unlimited nargs and a default' });
      parser.addArgument([ 'foo' ], { default: 'bar', nargs: '*', defaultValue: 'bar' });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { foo: 'bar' });
      args = parser.parseArgs([ 'a' ]);
      assert.deepEqual(args, { foo: [ 'a' ] });
      args = parser.parseArgs([ 'a', 'b' ]);
      assert.deepEqual(args, { foo: [ 'a', 'b' ] });

      assert.throws(function () {
        args = parser.parseArgs([ '-x' ]);
      });
    });

    it('TestPositionalsNargsZeroOrMoreNone', function () {
      parser = new ArgumentParser({ debug: true,
  prog: 'TestPositionalsNargsZeroOrMoreNone',
  description: 'Test a Positional with unlimited nargs followed by one with none' });
      parser.addArgument([ 'foo' ], { nargs: '*' });
      parser.addArgument([ 'bar' ], {});

      args = parser.parseArgs([ 'a' ]);
      assert.deepEqual(args, { foo: [], bar: 'a' });
      args = parser.parseArgs([ 'a', 'b' ]);
      assert.deepEqual(args, { foo: [ 'a' ], bar: 'b' });
      args = parser.parseArgs([ 'a', 'b', 'c' ]);
      assert.deepEqual(args, { foo: [ 'a', 'b' ], bar: 'c' });

      assert.throws(function () {
        args = parser.parseArgs([]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '--foo' ]);
      });
    });

    it('TestPrefixCharacterOnlyArguments', function () {
      parser = new ArgumentParser({ prefix_chars: '-+',
  prefixChars: '-+',
  debug: true,
  prog: 'TestPrefixCharacterOnlyArguments',
  description: null });
      parser.addArgument([ '-' ], { dest: 'x', const: 'badger', nargs: '?', constant: 'badger' });
      parser.addArgument([ '+' ], { default: 42, dest: 'y', type: 'int', defaultValue: 42 });
      parser.addArgument([ '-+-' ], { action: 'storeTrue', dest: 'z' });

      args = parser.parseArgs([]);
      assert.deepEqual(args, { y: 42, x: null, z: false });
      args = parser.parseArgs([ '-' ]);
      assert.deepEqual(args, { y: 42, x: 'badger', z: false });
      args = parser.parseArgs([ '-', 'X' ]);
      assert.deepEqual(args, { y: 42, x: 'X', z: false });
      args = parser.parseArgs([ '+', '-3' ]);
      assert.deepEqual(args, { y: -3, x: null, z: false });
      args = parser.parseArgs([ '-+-' ]);
      assert.deepEqual(args, { y: 42, x: null, z: true });
      args = parser.parseArgs([ '-', '===' ]);
      assert.deepEqual(args, { y: 42, x: '===', z: false });

      assert.throws(function () {
        args = parser.parseArgs([ '-y' ]);
      });
      assert.throws(function () {
        args = parser.parseArgs([ '+', '-' ]);
      });
    });

  });
});
