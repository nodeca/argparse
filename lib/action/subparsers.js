/**
 * class ActionSubparsers
 *
 * Support the creation of such sub-commands with the addSubparsers()
 *
 * This class inherited from [[Action]]
 **/
'use strict';

var util = require('util');
var _ = require('underscore');
_.str = require('underscore.string');

var Action = require('../action');

// Constants
var $$ = require('../const');

// Errors
var argumentErrorHelper = require('../argument/error');

/**
 * new ActionSubparsers(options)
 * - options (object): options hash see [[Action.new]]
 *
 **/
var ActionSubparsers = module.exports = function ActionSubparsers(options) {
  options = options || {};
  options.dest = options.dest || $$.SUPPRESS;
  options.nargs = $$.PARSER;

  this._progPrefix = options.prog;
  this._parserClass = options.parserClass;
  this._nameParserMap = {};
  this._choicesActions = [];

  options.choices = this._nameParserMap;
  Action.call(this, options);
};
util.inherits(ActionSubparsers, Action);

/**
 * ActionSubparsers#addParser(name, options) -> ArgumentParser
 * - name (string): sub-command name
 * - options (object): see [[ArgumentParser.new]]
 *
 *  Note:
 *  addParser supports an additional aliases option,
 *  which allows multiple strings to refer to the same subparser.
 *  This example, like svn, aliases co as a shorthand for checkout
 *
 **/
ActionSubparsers.prototype.addParser = function (name, options) {
  var parser;

  var self = this;

  options = options || {};

  // set program from the existing prefix
  if (!options.prog) {
    options.prog = this._progPrefix + ' ' + name;
  }

  var aliases = options.aliases || [];

  // ToDo create a pseudo-action to hold the choice help
 
  // create the parser and add it to the map
  parser = new this._parserClass(options);
  this._nameParserMap[name] = parser;

  // make parser available under aliases also
  aliases.forEach(function(alias) {
    self._nameParserMap[alias] = parser;
  });

  return parser;
};

ActionSubparsers.prototype._getSubactions = function () {
  return this._choicesActions;
};

/**
 * ActionSubparsers#call(parser, namespace, values, optionString) -> void
 * - parser (ArgumentParser): current parser
 * - namespace (Namespace): namespace for output data
 * - values (Array): parsed values
 * - optionString (Array): input option string(not parsed)
 *
 * Call the action. Parse input aguments
 **/
ActionSubparsers.prototype.call = function (parser, namespace, values, optionString) {
  var parserName = values[0];
  var argStrings = values.slice(1);

  // set the parser name if requested
  if (this.dest !== $$.SUPPRESS) {
    namespace[this.dest] = parserName;
  }

  // select the parser
  if (!!this._nameParserMap[parserName]) {
    parser = this._nameParserMap[parserName];
  } else {
    throw argumentErrorHelper(_.str.sprintf(
      'Unknown parser "%(name)s" (choices: [%(choices)s]).',
      {
        name: parserName,
        choices: _.keys(this._nameParserMap).join(', ')
      }
    ));
  }

  // parse all the remaining options into the namespace
  parser.parseArgs(argStrings, namespace);
};


