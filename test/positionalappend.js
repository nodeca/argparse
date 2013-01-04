/*global describe, it*/

'use strict';

var assert = require('assert');

var ArgumentParser = require('../lib/argparse').ArgumentParser;
describe('ArgumentParser', function () {
  describe('....', function () {
    var parser;
    var args;
    
    it("TestPositionalsActionAppend", function () {
      // Test the 'append' action
      parser = new ArgumentParser({debug: true});
      parser.addArgument(['spam'], {action: 'append'});
      parser.addArgument(['spam'], {action: 'append', nargs: 2});

      args = parser.parseArgs('a b c'.split(' '));
      assert.deepEqual(args, {spam: [ 'a', [ 'b', 'c' ] ]});
      //
    });
  });
});

/*

*/
