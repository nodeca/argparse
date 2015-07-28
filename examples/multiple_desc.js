#!/usr/bin/env node
'use strict';

var ArgumentParser = require('../lib/argparse').ArgumentParser;
var parser = new ArgumentParser({
  version: '0.0.1',
  addHelp: true,
  description: [
    'Argparse examples: multiple description paragraphs.',
    'This is an example of multiple paragraphs in the description. Pass an ' +
    'array instead of a string to do this.'
  ],
  epilog: 'help epilog',
  prog: 'help_example_prog'
});
parser.printHelp();
