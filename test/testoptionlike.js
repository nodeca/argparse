/*global describe, it*/

'use strict';

var assert = require('assert');

var ArgumentParser = require('../lib/argparse').ArgumentParser;

describe('....', function () {
  var parser;
  var args;

  it("TestOptionLike", function () {
    // Tests options that may or may not be arguments
    parser = new ArgumentParser({debug: true});
    parser.addArgument(['-x'], {type: 'float'});
    parser.addArgument(['-3'], {type: 'float', dest: 'y'});
    parser.addArgument(['z'], {nargs: '*'});

    args = parser.parseArgs([]);
    assert.deepEqual(args, {x: null, y: null, z: []});
    args = parser.parseArgs('-x 2.5 a'.split(' '));
    assert.deepEqual(args, {x: 2.5, y: null, z: ['a']});
    args = parser.parseArgs('-3 1 a'.split(' '));
    assert.deepEqual(args, {x: null, y: 1.0, z: ['a']});

    assert.throws(function () {
      parser.parseArgs('-x -2.5'.split(' '));
    },
    /expected one argument/i
    );
    assert.throws(function () {
      parser.parseArgs('-x -2.5 a'.split(' '));
    },
    /expected one argument/i
    );
    // problem with missing '^' in pattern match
    assert.throws(function () {
      parser.parseArgs('-3 -1 a'.split(' '));
    },
    /expected one argument/i
    );
  });
});

