print = console.log
try
  argparse = require('../lib/argparse')
catch error
  argparse = require('argparse')
ArgumentParser = argparse.ArgumentParser

parser = new ArgumentParser({debug:true})
parser.addArgument(['-c'],{dest:'-c',choice:['0','*','?'],defaultValue:'0'})
parser.addArgument(['-x','--xxx'],{action:'storeTrue'})
parser.addArgument(['-y'],{dest:'yyy', nargs:1})
parser.addArgument(['-z','--zzz'],{action:'storeTrue'})
parser.addArgument(['-d'],{dest:'d',defaultValue:'DEFAULT'})
parser.printHelp()
args = parser.parseArgs([])
print  'defaults',args
print  'parser.getDefaults(dest) test'
print ("#{action.dest}: #{parser.getDefault(action.dest)}" for action in parser._actions)

print 'positional defaults test'
parser = new ArgumentParser({debug:true,description:'positional with 0 defaultValue'})
parser.addArgument(['pos'],{type:'int',nargs:'?',defaultValue:0})
print  parser.description, 'should be {pos: 0}'
print  parser.parseArgs([])

parser = new ArgumentParser({debug:true,description:'positional with ? nargs'})
parser.addArgument(['pos'],{nargs:'?',defaultValue:42})
print  parser.description, 'should be {pos:42}'
print  parser.parseArgs([])

parser = new ArgumentParser({debug:true,description:'positional with * nargs'})
parser.addArgument(['pos'],{nargs:'*',defaultValue:42})
print  parser.description, 'should be {pos:[42]}'
print  parser.parseArgs([])
