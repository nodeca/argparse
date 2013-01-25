'use strict';
/*
test_argparse.py
class TempDirMixin
class TestArgumentsFromFile
there is another test for a custom parser.convert_arg_line_to_args()
*/

var NS, failures, file_texts, oldcwd, parser, path, psplit, setup_tempdir, successes, teardown_tempdir;

var fs = require('fs');
var os = require('os');
var path = require('path');
var assert = require('assert');
var _ = require('underscore');
_.str = require('underscore.string');

var ArgumentParser = require('../lib/argparse').ArgumentParser;

function psplit(argv) {
  // split string into argv array, removing empty strings
  return argv.split(' ').filter(function (a) {return a !== ''; });
}

function NS(args) {
  // simplified namespace object
  return args;
}

file_texts = [['hello', 'hello world!\n'],
              ['recursive', '-a\n', 'A\n', '@hello'],
              ['invalid', '@no-such-path\n']];

function setup_tempdir() {
  // setup a temporary directory as cwd
  var tdir = path.join(os.tmpDir(), 'argparse_temp');
  try {
    fs.mkdirSync(tdir);
  } catch (error) {
    if (!error.message.match(/EEXIST/)) {
      throw error;
    }
  }
  var oldcwd = process.cwd();
  process.chdir(tdir);
  console.log('Now in ' + process.cwd());
  return oldcwd;
}

function teardown_tempdir(oldcwd) {
  // remove the temp dir
  var f, tdir, _i, _len, _ref;
  tdir = process.cwd();
  process.chdir(oldcwd);
  if (_.str.startsWith(tdir, os.tmpDir())) {
    _ref = fs.readdirSync(tdir);
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      f = _ref[_i];
      fs.unlinkSync(path.join(tdir, f));
    }
    fs.rmdir(tdir);
    return console.log('Removed ' + tdir);
  }
}

oldcwd = setup_tempdir();

// write the test files
file_texts.forEach(function (tpl) {
    var filename = tpl[0];
    var data = tpl.slice(1).join('');
    fs.writeFileSync(filename, data);
  });

// parser with the fromfilePrefixChars
var parser = new ArgumentParser({debug: true, fromfilePrefixChars: '@'});

parser.addArgument(['-a']);
parser.addArgument(['x']);
parser.addArgument(['y'], {nargs: '+'});

console.log(parser.formatHelp());

console.log(parser.parseArgs(['X', 'Y']));

failures = ['', '-b', 'X', '@invalid', '@missing'];

successes = [
  ['X Y', NS({a: null, x: 'X', y: ['Y']})],
  ['X -a A Y Z', NS({ a: 'A',  x: 'X',  y: ['Y', 'Z'] })],
  ['@hello X', NS({a: null, x: 'hello world!', y: ['X']})],
  ['X @hello', NS({a: null, x: 'X', y: ['hello world!']})],
  ['-a B @recursive Y Z', NS({a: 'A', x: 'hello world!', y: ['Y', 'Z']})],
  ['X @recursive Z -a B', NS({a: 'B', x: 'X', y: ['hello world!', 'Z']})]
];

failures.forEach(function (argv) {
  // argv = failures[_j];
  try {
    var args = parser.parseArgs(psplit(argv));
    console.log("TODO, expected error for '" + argv + "'");
    console.log(args);
  } catch (error) {
    console.log(_.str.strip(error.message));
    console.log("error as expected for '" + argv + "'");
  }
  console.log('');
});

successes.forEach(function (arg) {
  var argv = arg[0];
  var ns = arg[1];
  console.log(argv, '=>', ns);
  try {
    var args = parser.parseArgs(psplit(argv));
    assert.deepEqual(args, ns);
  } catch (error) {
    console.log('TODO', error);
  }
  console.log('');
});

teardown_tempdir(oldcwd);

/*
another test creates new ArgumentParser class, one with a custom
convert_arg_line_to_args() function

    class FromFileConverterArgumentParser(ErrorRaisingArgumentParser):

        def convert_arg_line_to_args(self, arg_line):
            for arg in arg_line.split():
                if not arg.strip():
                    continue
                yield arg
    parser_class = FromFileConverterArgumentParser
*/

