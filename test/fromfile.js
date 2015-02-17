/*global describe, it, beforeEach, before, after*/

'use strict';

var assert = require('assert');

var ArgumentParser = require('../lib/argparse').ArgumentParser;

var assert  = require('assert');
var path    = require('path');


var orig_cwd   = process.cwd();

describe('from file', function () {
  var parser;
  var args;
  before(function () {
    orig_cwd = process.cwd();
    process.chdir(path.normalize('./test/fixtures'));
  });
  beforeEach(function () {
    parser = new ArgumentParser({debug: true, fromfilePrefixChars: '@'});
    parser.addArgument(['-a']);
    parser.addArgument(['x']);
    parser.addArgument(['y'], {nargs: '+'});
  });
  after(function () {
    process.chdir(orig_cwd);
  });
  it("test reading arguments from a file", function () {
    args = parser.parseArgs(['X', 'Y']);
    assert.deepEqual(args, {a: null, x: 'X', y: ['Y']});
    args = parser.parseArgs(['X', '-a', 'A', 'Y', 'Z']);
    assert.deepEqual(args, { a: 'A',  x: 'X',  y: ['Y', 'Z']});
    args = parser.parseArgs(['@hello', 'X']);
    assert.deepEqual(args, {a: null, x: 'hello world!', y: ['X']});
    args = parser.parseArgs(['X', '@hello']);
    assert.deepEqual(args, {a: null, x: 'X', y: ['hello world!']});
  });
  it("test recursive reading arguments from files", function () {
    args = parser.parseArgs(['-a', 'B', '@recursive', 'Y', 'Z']);
    assert.deepEqual(args, {a: 'A', x: 'hello world!', y: ['Y', 'Z']});
    args = parser.parseArgs(['X', '@recursive', 'Z', '-a', 'B']);
    assert.deepEqual(args, {a: 'B', x: 'X', y: ['hello world!', 'Z']});
  });
  it('fest reading arguments from an invalid file', function () {
    assert.throws(
      function () {
        args = parser.parseArgs(['@invalid']);
      },
      /ENOENT, no such file or directory/
    );
  });
  it('test reading arguments from an missing file', function () {
    assert.throws(
      function () {
        args = parser.parseArgs(['@missing']);
      },
      /ENOENT, no such file or directory/
    );
  });
  it('test custom convertArgLineToArgs function', function () {
    parser.convertArgLineToArgs = function (argLine) {
        // split line into 'words'
        args = argLine.split(' ');
        args = args.map(function (arg) {return arg.trim(); });
        args = args.filter(function (arg) {return arg.length > 0; });
        return args;
      };
    args = parser.parseArgs(['X', '@hello']);
    assert.deepEqual(args, {a: null, x: 'X', y: ['hello', 'world!']});
  });
});

