#!/usr/bin/env coffee

print = console.log
try
  argparse = require('../lib/argparse')
catch error
  argparse = require('argparse')

parseArgs = (fun, dummy=null) ->
  # convenience for repeated testing of parsing
  try
    args = parser.parseArgs()  # note cammelcase
    fun(args)
  catch error
    print  error

print 'default values test'
parser = new argparse.ArgumentParser({debug: true}) 
parser.addArgument(["square"], {
  help:"the base",
  type:"int"
  defaultValue: 0,
  nargs:'?'
  })
parser.addArgument(["power"], {
  help:"the exponent",
  type:"int"
  defaultValue: 2,
  nargs:'?'
  })
  
parser.addArgument(["-v","--verbosity"], {
  help:"increase output verbosity",
  action: "count",
  defaultValue: 0   # otherwise default is null
  })

# alternate way of setting default 
parser.setDefaults({help: 'testing', zcnt: 0})  
parser.addArgument(["-z"],{dest:"zcnt", action: "count"})
# parser.addArgument(["-t"],{dest:"tf", action: "storeTrue"})

print parser.formatHelp()
parseArgs((args)->
  print 'defaults using parser.getDefault'
  print ("#{action.dest}: #{parser.getDefault(action.dest)}" for action in parser._actions)
  print "args"
  print (args)
  if args.square is undefined
    print 'DEFAULT error'
  if args.verbosity is null
    print 'DEFAULT error'
  answer = Math.pow(args.square,args.power)
  print "verbosity: #{args.verbosity}"
  # in contrast to Python, 'null' verbosity does not mess up the comparison
  if args.verbosity>=2
    print "the #{args.power} power of #{args.square} equals #{answer}"
  else if args.verbosity==1
    print "#{args.square}^#{args.power}=#{answer}"
  else
    print answer 
  )
  
print "-------------------------------------"
print "argumentDefault test"
# could also test ArgumentParser option argumentDefault, though this not commonly used
parser = new argparse.ArgumentParser({debug: true, argumentDefault:"None"}) 
#parser = new argparse.ArgumentParser({debug: true}) 
parser.addArgument(['--foo'])
parser.addArgument(['bar'], {nargs:'?'})
args = parser.parseArgs(['--foo', '1', 'BAR'])
print "expect: Namespace(bar='BAR', foo='1')"
print args
args =parser.parseArgs([])
#print "expect: Namespace()"
print args
