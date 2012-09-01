/*global describe, it, before, after, beforeEach, afterEach*/


'use strict';

var assert = require('assert');

var ArgumentParser = require('../lib/argparse').ArgumentParser;
describe('ArgumentParser', function () {
  describe('base', function () {
    var parser;
    var args;
    beforeEach(function() {
      parser = new ArgumentParser({debug: true});
      parser.addArgument([ '-f', '--foo' ]);
    });

    it("should parse argument in short form", function () {
      args = parser.parseArgs('-f 1'.split(' '));
      assert.equal(args.foo, 1);
      args = parser.parseArgs('-f=1'.split(' '));
      assert.equal(args.foo, 1);
      args = parser.parseArgs('-f1'.split(' '));
      assert.equal(args.foo, 1);
    });

    it("should parse argument in long form", function() {
      args = parser.parseArgs('--foo 1'.split(' '));
      assert.equal(args.foo, 1);
      args = parser.parseArgs('--foo=1'.split(' '));
      assert.equal(args.foo, 1);
    });

    it("should parse multiple arguments", function(){
      parser.addArgument(['--bar' ]);
      args = parser.parseArgs('--foo 5 --bar 6'.split(' '));
      assert.equal(args.foo, 5);
      assert.equal(args.bar, 6);
    });

    it("should check argument type", function(){
      parser.addArgument(['--bar' ], {type:'int'});
      assert.throws(function () { parser.parseArgs('--bar bar'.split(' '));});
      assert.doesNotThrow(function () { parser.parseArgs('--bar 1'.split(' '));});
    });

    it("should not drop down with empty args (without positional arguments)", function(){
      assert.doesNotThrow(function () {parser.parseArgs([]); });
    });

    it("should drop down with empty args (positional arguments)", function(){
      parser.addArgument([ 'baz']);
      assert.throws(
        function () {parser.parseArgs([]); },
        /too few arguments/
      );
    });

    it("should support pseudo-argument", function() {
      parser.addArgument([ 'bar' ], { nargs: '+' });
      args = parser.parseArgs([ '-f', 'foo', '--', '-f', 'bar' ]);
      assert.equal(args.foo, 'foo');
      assert.equal(args.bar.length, 2);
    });
  });
});

