#!/usr/bin/env node
'use strict';

var ArgumentParser = require('../lib/argparse').ArgumentParser;
var parser = new ArgumentParser({
  version: '0.0.1',
  addHelp: true,
  description: 'Argparse examples: inferring the option dest'
});
parser.addArgument(['-f', '--foo']); // from longoption
parser.addArgument(['-g']);  // from short option
parser.addArgument(['-x'],{dest:'xxx'}); // from dest keyword
parser.addArgument(['--foo-bar']); // '-' to '_'

parser.printHelp();
console.log('-----------');

var args;
args = parser.parseArgs(['-f', '1']);
console.dir(args);
args = parser.parseArgs(['-g','2']);
console.dir(args);
args = parser.parseArgs(['-f',1,'-g',2,'-x',3,'--foo-bar','FOO BAR']);
console.dir(args);
// expect: { foo: 1, g: 2, xxx: 3, foo_bar: 'FOO BAR' }

