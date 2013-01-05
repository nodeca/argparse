# usage
# use test_argparse_convert.py to json serialize as many python tests as it can
# use this program to test an argparse implementation

# coffee test_argparse.coffee   # to see results
# coffee test_argparse.coffee|grep TODO   # to see if any tests need attention
# coffee test_argparse.coffee|grep > test_argparse_results.txt  # to collect in file
# 
# change 'COFFEE' to change which parser it uses (could be based on process.argv)

assert = require('assert')
util = require('util')

_ = require('underscore')
_.str = require('underscore.string')

print = console.log

epilog = 'Redirect stdout to file, less, grep TODO etc'
AP = require('argparse').ArgumentParser
parser = new AP(epilog: epilog )
parser.addArgument(['-j', '--jsonfile'], {defaultValue: './testpy', help: 'json file to load, ./testpy(.json) default'})
parser.addArgument(['-m', '--mocha'], {action: 'storeTrue', help: 'write mocha test cases'})
parser.addArgument(['-r', '--require'], {defaultValue: 'argparse', help: 'module to test, argparse default'})
parser.addArgument(['-f', '--flag'], {defaultValue: 'TODO', help: 'error flag, e.g. TODO'})
parser.addArgument(['-n', '--ignorenulls'], {action: 'storeTrue', help: 'ignore null values in namespace'})

# I use TODO because my editor is set up to flag such a line
# grep with this flag to filter for such lines
# the python Namespace includes null default values;

pargs = parser.parseArgs()

if not pargs.mocha
  argparse = require(pargs.require)
  #print "testing #{pargs.require}"
  COFFEE = pargs.require == 'argcoffee'
  ArgumentParser = argparse.ArgumentParser
  #Namespace = argparse.Namespace
  #NS = Namespace

camelize = (obj) ->
  # camelize the keys of an object (e.g. parser arguments)
  for key of obj
    key1 = _.str.camelize(key)
    if key1 == 'const' then key1 = 'constant'
    if key1 == 'default' then key1 = 'defaultValue'
    value = obj[key]
    if not COFFEE
      if key1 == 'action' 
        value = _.str.camelize(value)
    obj[key1] = value
  obj

nnequal = (a,b) ->
  # deep equal, ignoring null values
  aKeys = (k for own k,v of a when v!= null)
  bKeys = (k for own k,v of b when v!= null)
  print aKeys, bKeys
  return false if aKeys.length isnt bKeys.length
  return false for key in aKeys when !(key in bKeys) or !_.isEqual(a[key], b[key])
  return true

psplit = (astring) ->
  # split that is closer the python split()
  # psplit('') produces [], not ['']
  if astring.split?
    result = astring.split(' ')
    result = (r for r in result when r) # remove ''
    return result
  return astring # it probably is a list already

runtests = (objlist) ->
  casecnt = 0
  for obj in objlist
    # each of these should be a separate test
    casecnt += 1
    print '\n', casecnt, "====================="
    testobj(obj)
    
testobj = (obj) ->
  # test one 'obj' (python test class)
  print obj.name
  if obj.parser_signature?
    # some cases have a specialized parser signature
    options = obj.parser_signature[1]
    options = camelize(options)
    print 'camelized:', options
  else
    options = {}
  options.debug = true
  options.prog = obj.name
  options.description = obj.doc
  # collect info for error display; clone in case options is modified when used
  argsigs = [_.clone(options)]  
  try
    parser = new ArgumentParser(options)
  catch error
    print "#{pargs.flag}: ArgumentParser",error
    print argsigs
    return # continue
    
  err = false
  for sig in obj.argument_signatures
    sig[1] = camelize(sig[1])
    argsigs.push([sig[0], _.clone(sig[1])])  # for error display
    parser.addArgument(sig[0], sig[1])
  
  cnt = 0
  for testcase in obj.successes
    [argv, ns] = testcase
    argv = psplit(argv)
    args = parser.parseArgs(argv)
    print _.isEqual(args,ns)
    try
      if pargs.ignorenulls
        assert.ok(nnequal(args,ns))
      else
        assert.deepEqual(args,ns)
      print "for '#{argv.join(' ')}' got:", args
    catch error   
      print "for '#{argv.join(' ')}' got:", args, 'expected:', ns
      print error
      cnt -= 1
      err = true
    cnt += 1
  astr = if cnt<obj.successes.length then "#{pargs.flag}: SUCCESSES TESTS:" else 'successes tests:'
  print "#{astr} #{cnt} of #{obj.successes.length}, (#{obj.name})"
  
  cnt = 0
  for testcase in obj.failures
    try
      args = parser.parseArgs(psplit(testcase))
      print 'OOPS, expected an error', testcase
      cnt -= 1
      err = true
    catch error
      print "[#{testcase}]", error.message
    try
      assert.throws(
        () -> 
          args = parser.parse_args(psplit(testcase))
        , Error
      ) # the expected error is not specified in py orginal
    catch error
      print 'OOPS', error 
    cnt += 1
  astr = if cnt<obj.failures.length then "#{pargs.flag}: FAILURE TESTS:" else 'failure tests:'
  print "#{astr} #{cnt} of #{obj.failures.length}, (#{obj.name})"
  
  if err
    # display the collected argument sigs if there was an error
    print 'ARGUMENTS:'
    print argsigs

preformatobjs = (objlist) ->
  # convert objlist into data that can be passed to fns like
  # ArgumentParser, addArgument, parseArgs
  casecnt = 0
  results = []
  for obj in objlist
    casecnt += 1
    result = {cnt: casecnt}
    results.push(result)
    if obj.parser_signature?
      options = obj.parser_signature[1]
      options = camelize(options)
    else
      options = {}
    options.debug = true
    options.prog = obj.name
    options.description = obj.doc
    result.parser_options = options
    result.arguments = ([sig[0], camelize(sig[1])] for sig in obj.argument_signatures)
    result.successes = ([psplit(argv[0]), argv[1]] for argv in obj.successes)
    result.failures = (psplit(testcase) for testcase in obj.failures)
  results

fmt = (obj) ->
  util.inspect(obj, false, null)

mochatest = (obj)->
  # format a mocha it(){} test
  result = ["    it('#{obj.parser_options.prog}', function () {"]
  str = "      parser = new ArgumentParser(#{fmt(obj.parser_options)});"
  result.push(str)
  for x in obj.arguments
    str = "      parser.addArgument(#{fmt(x[0])}, #{fmt(x[1])});"
    result.push(str)
  result.push('')
  for x in obj.successes
    str = "      args = parser.parseArgs(#{fmt(x[0])});"
    result.push(str)
    str = "      assert.deepEqual(args, #{fmt(x[1])});"
    result.push(str)
  result.push('')
  for x in obj.failures
    str = "      assert.throws(function () {\n        args = parser.parseArgs(#{fmt(x)});\n      });"
    result.push(str)
  result.push("    });\n")
  result.join('\n')
  
mochaheader = '''/*global describe, it*/

'use strict';

var assert = require('assert');

var ArgumentParser = require('../lib/argparse').ArgumentParser;
describe('ArgumentParser', function () {
  describe('....', function () {
    var parser;
    var args;
'''
mochatrailer = '''  });
});
'''
  
testlist = require(pargs.jsonfile)  

if pargs.mocha
  objs = preformatobjs(testlist)
  # print util.inspect(preformatobjs(testlist), false, null)
  print mochaheader
  for obj in objs
    print mochatest(obj)
  print mochatrailer
else
  # direct test of argparse with these cases
  # in case of an error, output is more detailed than mocha gives
  print testlist.length, 'test cases'
  runtests(testlist)
