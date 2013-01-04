/*global describe, it*/

'use strict';

var assert = require('assert');

var ArgumentParser = require('../lib/argparse').ArgumentParser;
describe('ArgumentParser', function () {
  describe('....', function () {
    var parser;
    var args;

    it("TestOptionalsNargsZeroOrMore(ParserTestCase", function () {
      // Tests specifying an args for an Optional that accepts zero or more
      parser = new ArgumentParser({debug: true});
      parser.addArgument(['-x'], {nargs: '*'});
      parser.addArgument(['-y'], {nargs: '*', defaultValue: 'spam'});
      
      args = parser.parseArgs([]);
      assert.deepEqual(args, {x: null, y: 'spam'});
      args = parser.parseArgs('-x a b'.split(' '));
      assert.deepEqual(args, {x: ['a', 'b'], y: 'spam'});
      args = parser.parseArgs('-y'.split(' '));
      assert.deepEqual(args, {x: null, y: []});
      // problem is y not getting its default
    });
  });
});

/*

*/
