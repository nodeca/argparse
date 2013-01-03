/*global describe, it*/

'use strict';

var assert = require('assert');

var ArgumentParser = require('../lib/argparse').ArgumentParser;
describe('ArgumentParser', function () {
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
    
    it("TestParserDefault42", function () {
      // Test actions with a parser-level default of 42
      parser = new ArgumentParser({debug: true, argumentDefault: 42, version: '1.0'});
      parser.addArgument(['foo'], {nargs: '?'});
      parser.addArgument(['bar'], {nargs: '*'});
      parser.addArgument(['--baz'], {action: 'storeTrue'});

      args = parser.parseArgs([]);
      assert.deepEqual(args, {bar: 42, foo: 42, baz: 42 });
      // problem is with 42 being assigned as default to help
    });
    
    it("TestPositionalsActionAppend", function () {
      // Test the 'append' action
      parser = new ArgumentParser({debug: true});
      parser.addArgument(['spam'], {action: 'append'});
      parser.addArgument(['spam'], {action: 'append', nargs: 2});

      args = parser.parseArgs('a b c'.split(' '));
      assert.deepEqual(args, {spam: [ 'a', [ 'b', 'c' ] ]});
      //
    });
    
    it("TestOptionalsAlternatePrefixCharsAddedHelp", function () {
      /* When ``-`` not in prefix_chars, default operators created for help
      *  should use the prefix_chars in use rather than - or --
      *  http://bugs.python.org/issue9444
      */
      parser = new ArgumentParser({debug: true, prefixChars: '+:/', addHelp: true});
      parser.addArgument(['+f'], {action: 'storeTrue'});
      parser.addArgument(['::bar']);
      parser.addArgument(['/baz'], {action: 'storeConst', constant: 42});
      // parser.printHelp()
      args = parser.parseArgs([]);
      assert.deepEqual(args, {f: false, bar: null, baz: null});
      //
    });
        
    it("TestPositionalsNargsOptional", function () {
      // Tests an Optional Positional
      parser = new ArgumentParser({debug: true});
      parser.addArgument(['foo'], {nargs: '?'});

      args = parser.parseArgs([]);
      assert.deepEqual(args, {foo: null});
      // sample case where null value is not in the namespace
    });
  });
});

/*

*/
