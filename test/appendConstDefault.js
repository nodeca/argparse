/*global describe, it*/

'use strict';

var assert = require('assert');

var ArgumentParser = require('../lib/argparse').ArgumentParser;
describe('ArgumentParser', function () {
  describe('....', function () {
    var parser;
    var args;

    it("TestOptionalsActionAppendConstWithDefault", function () {
      // Tests the append_const action for an Optional
      parser = new ArgumentParser({debug: true});
      parser.addArgument(['-b'], {action: 'appendConst', constant: 'Exception', defaultValue: ['X']});
      parser.addArgument(['-c'], {action: 'append', dest: 'b'});
      
      args = parser.parseArgs([]);
      assert.deepEqual(args, {b: ['X']});
      args = parser.parseArgs('-b'.split(' '));
      assert.deepEqual(args, {b: ['X', 'Exception']});
      args = parser.parseArgs('-b -cx -b -cyz'.split(' '));
      assert.deepEqual(args, {b: ['X', 'Exception', 'x', 'Exception', 'yz']});
      // problem is b not getting 'X' default
    });
  });
});

/*

*/
