/*global describe, it*/

'use strict';

var assert = require('assert');

var ArgumentParser = require('../lib/argparse').ArgumentParser;

describe('optionals', function () {
  var parser;
  var args;

  it('TestOptionLike', function () {
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestOptionLike',
      description: 'Tests options that may or may not be arguments'
    });
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
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestOptionalsActionAppend',
      description: 'Tests the append action for an Optional'
    });
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
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestOptionalsActionAppendConst',
      description: 'Tests the append_const action for an Optional'
    });
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
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestOptionalsActionAppendConstWithDefault',
      description: 'Tests the append_const action for an Optional'
    });
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
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestOptionalsActionAppendWithDefault',
      description: 'Tests the append action for an Optional'
    });
    parser.addArgument(
      [ '--baz' ],
      { default: [ 'X' ], action: 'append', defaultValue: [ 'X' ] }
    );

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
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestOptionalsActionCount',
      description: 'Tests the count action for an Optional'
    });
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
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestOptionalsActionStore',
      description: 'Tests the store action for an Optional'
    });
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
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestOptionalsActionStoreConst',
      description: 'Tests the store_const action for an Optional'
    });
    parser.addArgument(
      [ '-y' ],
      { action: 'storeConst', const: 'object', constant: 'object' }
    );

    args = parser.parseArgs([]);
    assert.deepEqual(args, { y: null });
    args = parser.parseArgs([ '-y' ]);
    assert.deepEqual(args, { y: 'object' });

    assert.throws(function () {
      args = parser.parseArgs([ 'a' ]);
    });
  });

  it('TestOptionalsActionStoreFalse', function () {
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestOptionalsActionStoreFalse',
      description: 'Tests the store_false action for an Optional'
    });
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
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestOptionalsActionStoreTrue',
      description: 'Tests the store_true action for an Optional'
    });
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
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestOptionalsAlmostNumericAndPositionals',
      description: 'Tests negative number args when almost numeric options are present'
    });
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


  it('TestOptionalsChoices', function () {
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestOptionalsChoices',
      description: 'Tests specifying the choices for an Optional'
    });
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
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestOptionalsDefault',
      description: 'Tests specifying a default for an Optional'
    });
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
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestOptionalsDest',
      description: 'Tests various means of setting destination'
    });
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
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestOptionalsDoubleDash',
      description: 'Test an Optional with a double-dash option string'
    });
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
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestOptionalsDoubleDashPartialMatch',
      description: 'Tests partial matching with a double-dash option string'
    });
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

  

  it('TestOptionalsNumeric', function () {
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestOptionalsNumeric',
      description: 'Test an Optional with a short opt string'
    });
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
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestOptionalsNumericAndPositionals',
      description: 'Tests negative number args when numeric options are present'
    });
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
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestOptionalsRequired',
      description: 'Tests the an optional action that is required'
    });
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
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestOptionalsShortLong',
      description: 'Test a combination of single- and double-dash option strings'
    });
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
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestOptionalsSingleDash',
      description: 'Test an Optional with a single-dash option string'
    });
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
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestOptionalsSingleDashAmbiguous',
      description: 'Test Optionals that partially match but are not subsets'
    });
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
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestOptionalsSingleDashCombined',
      description: 'Test an Optional with a single-dash option string'
    });
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
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestOptionalsSingleDashLong',
      description: 'Test an Optional with a multi-character single-dash option string'
    });
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
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestOptionalsSingleDashSubsetAmbiguous',
      description: 'Test Optionals where option strings are subsets of each other'
    });
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
    parser = new ArgumentParser({
      debug: true,
      prog: 'TestOptionalsSingleDoubleDash',
      description: 'Test an Optional with single- and double-dash option strings'
    });
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

});
