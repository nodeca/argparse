/*global describe, it*/

'use strict';

var assert = require('assert');

var ArgumentParser = require('../lib/argparse').ArgumentParser;

describe('....', function () {
  var parser;
  var args;

  it("TestPositionalsNargsOptional", function () {
    // Tests an Optional Positional
    parser = new ArgumentParser({debug: true});
    parser.addArgument(['foo'], {nargs: '?'});

    args = parser.parseArgs([]);
    assert.deepEqual(args, {foo: null});
    // sample case where null value is not in the namespace
  });
});

