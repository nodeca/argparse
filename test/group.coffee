# python 2.7 argparse doc examples
# coffeescript rendition
try
  argparse = require('../lib/argparse')
catch error
  argparse = require('argparse')  # from node_modules dir
  
ArgumentParser = argparse.ArgumentParser

print = console.log
header = (arg) ->
    print '\n=== '+arg+' ==='

ArgumentParser::add_argument =  (args..., options) ->
        # Python like arguments; 
        # options still needs to be specified, even if only {}
        @addArgument(args, options)
ArgumentParser::parse_args = (args, namespace) ->
        @parseArgs(args, namespace)
ArgumentParser::print_help = (args) ->
        @printHelp(args)
ArgumentParser::add_subparsers = (args) ->
        @addSubparsers(args)
ArgumentParser::parse_known_args = (args) ->
        @parseKnownArgs(args)


header 'argument group'
parser = new ArgumentParser({prog: 'PROG', addHelp: false, debug:true})
group = parser.addArgumentGroup({title: 'group'})
group.addArgument(['--foo'], {help: 'foo help'})
group.addArgument(['bar'], {help: 'bar help'})
parser.print_help()
# addArgGroup needs options obj


parser = new ArgumentParser({prog:'PROG', addHelp:false, debug:true})
group1 = parser.addArgumentGroup({title:'group1', description:'group1 description'})
group1.addArgument(['foo'], {help:'foo help'})
group2 = parser.addArgumentGroup({title:'group2', description:'group2 description'})
group2.addArgument(['--bar'], {help:'bar help'})
parser.print_help()

# print group1
print 'group1 action', group1._groupActions[0].dest
print 'parser action groups', (action.title for action in parser._actionGroups)

header 'mutual exclusion'
parser = new ArgumentParser({prog: 'PROG', debug:true})
group = parser.addMutuallyExclusiveGroup()
group.addArgument(['--foo'], {action: 'storeTrue'})
group.addArgument(['--bar'], {action: 'storeFalse'})
print "[] => defaults ", parser.parseArgs([])

print "['--foo'] =>", parser.parseArgs(['--foo'])

print "['--bar'] =>", parser.parseArgs(['--bar'])

print argv = ['--foo', '--bar']
try 
    argv = ['--foo', '--bar']
    print parser.parseArgs(argv)
catch error
    print error
    print 'dont allow both'

parser = new ArgumentParser({prog: 'PROG', debug:true})
group = parser.addMutuallyExclusiveGroup({required:true})
group.addArgument(['--foo'], {action: 'storeTrue'})
barAction = group.addArgument(['--bar'], {action: 'storeFalse'})
try
    argv = []
    print argv, '=>', parser.parseArgs(argv)
catch error
    print error
    print  argv, 'require one'

print 'group._groupActions', (action.dest for action in group._groupActions)
print '2 container pointers? ', group.container == group._container
# has both container and _container, why?

print '== add a 2nd group =='
group2 = parser.addMutuallyExclusiveGroup()
group2.addArgument(['--baz'], {action: 'storeTrue'})
# is it possible to add an overlapping option to this group?
# not like this
print '== trying to add overlapping argument =='
try
  group2.addArgument(['--bar'], {action: 'storeFalse'})
catch error
  print error
  
print '== push existing action onto new group =='
group2._groupActions.push(barAction)
print parser.parseArgs(['--foo','--baz'])
print parser.parseArgs(['--bar'])
try
  print parser.parseArgs(['--bar','--baz'])
catch error
  print error
  
###
Python output
=== argument group ===
usage: PROG [--foo FOO] bar

group:
  --foo FOO  foo help
  bar        bar help
usage: PROG [--bar BAR] foo

group1:
  group1 description

  foo        foo help

group2:
  group2 description

  --bar BAR  bar help
=== mutual exclusion ===
Namespace(bar=True, foo=True)
Namespace(bar=False, foo=False)
usage: PROG [-h] [--foo | --bar]
PROG: error: argument --bar: not allowed with argument --foo
no allow both
usage: PROG [-h] (--foo | --bar)
PROG: error: one of the arguments --foo --bar is required
require one

argparse dev branch matches the group output
so does master

JS is giving
[TypeError: argument "--bar": Not allowed with argument "--bar".]
actionConflict.getName() (ln 386) is giving bar rather than foo

error messages need to be cleaned
group._groupActions, list of actions, one with dest 'foo', other 'bar'
group._mutuallyExclusiveGroups
group.required == true

###
