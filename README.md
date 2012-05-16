argparse
========

CLI arguments parser for node.js. JS port of python's [argparse][main] module version 3.2 .

Example
=======

example.js:

````javascript
#!/usr/bin/env node
'use strict';

var ArgumentParser = require('../lib/argparse').ArgumentParser;
var parser = new ArgumentParser({
  version: '0.0.1',
  addHelp:true,
  description: 'Argparse examples'
});
parser.addArgument(
  [ '-f', '--foo' ],
  {
    help: 'foo bar'
  }
);
parser.addArgument(
  [ '-b', '--bar' ],
  {
    help: 'bar foo'
  }
);
var args = parser.parseArgs('-f 1 -b2'.split(' '));
console.dir(args);
````

Help

````
$ ./example.js -h
usage: example.js [-h] [-v] [-f FOO] [-b BAR]

Argparse examples

Optional arguments:
  -h, --help         Show this help message and exit.
  -v, --version      Show program's version number and exit.
  -f FOO, --foo FOO  foo bar
  -b BAR, --bar BAR  bar foo

````

Parse string

````
$ ./example.js -f=3 --bar=4
{ foo: '3', bar: '4' }

````

Additional [examples][examples]

ArgumentParser objects
======================

````
new ArgumentParser({paramters hash});
````
Create a new ArgumentParser object. Short parameters description they are:

```description``` - Text to display before the argument help.

```epilog``` - Text to display after the argument help.

```addHelp``` - Add a -h/–help option to the parser. (default: True)

```argumentDefault``` - Set the global default value for arguments. (default: None)

```parents``` - A list of ArgumentParser objects whose arguments should also be included.

```prefixChars``` - The set of characters that prefix optional arguments. (default: ‘-‘)

```formatterClass``` - A class for customizing the help output.

```prog``` - The name of the program (default: sys.argv[0])

```usage``` - The string describing the program usage (default: generated)

**Not supportied yet**

```fromfilePrefixChars``` - The set of characters that prefix files from which additional arguments should be read.

```conflictHandler``` - Usually unnecessary, defines strategy for resolving conflicting optionals.

Details in [original guide][parser]

The addArgument() method
=========================

```
ArgumentParser.add_argument([names or flags], {options})
```

Define how a single command-line argument should be parsed. Each parameter has its own more detailed description below, but in short they are:

```name or flags``` - Either a name or a list of option strings, e.g. foo or -f, --foo.

```action``` - The basic type of action to be taken when this argument is encountered at the command line.

```nargs```- The number of command-line arguments that should be consumed.

```constant``` - A constant value required by some action and nargs selections.

```defaultValue``` - The value produced if the argument is absent from the command line.

```type``` - The type to which the command-line argument should be converted.

```choices``` - A container of the allowable values for the argument.

```required``` - Whether or not the command-line option may be omitted (optionals only).

```help``` - A brief description of what the argument does.

```metavar``` - A name for the argument in usage messages.

```dest``` - The name of the attribute to be added to the object returned by parseArgs().

Details in [original guide][add_argument]


Action (some details)
================

ArgumentParser objects associate command-line arguments with actions. These actions can do just about anything with the command-line arguments associated with them, though most actions simply add an attribute to the object returned by parseArgs(). The action keyword argument specifies how the command-line arguments should be handled. The supported actions are:

```store``` - This just stores the argument’s value. This is the default action.

```storeConstant``` - This stores the value specified by the const keyword argument. (Note that the const keyword argument defaults to the rather unhelpful None.) The 'store_const' action is most commonly used with optional arguments that specify some sort of flag.

```storeTrue``` and ```store_false``` - These store the values True and False respectively. These are special cases of 'store_const'.

```append``` - This stores a list, and appends each argument value to the list. This is useful to allow an option to be specified multiple times.

```appendConst``` - This stores a list, and appends the value specified by the const keyword argument to the list. (Note that the const keyword argument defaults to None.) The 'append_const' action is typically useful when multiple arguments need to store constants to the same list.

```count``` - This counts the number of times a keyword argument occurs. For example, this is useful for increasing verbosity levels.

```help``` - This prints a complete help message for all the options in the current parser and then exits. By default a help action is automatically added to the parser. See ArgumentParser for details of how the output is created.

```version``` - This expects a version= keyword argument in the addArgument() call, and prints version information and exit.

Details in [original guide][action]

Sub-commands
============

ArgumentParser.addSubparsers()

Many programs split up their functionality into a number of sub-commands, for example, the svn program can invoke sub-commands like svn checkout, svn update, and svn commit. Splitting up functionality this way can be a particularly good idea when a program performs several different functions which require different kinds of command-line arguments. ArgumentParser supports the creation of such sub-commands with the addSubparsers() method. The addSubparsers() method is normally called with no arguments and returns an special action object. This object has a single method, addParser(), which takes a command name and any ArgumentParser constructor arguments, and returns an ArgumentParser object that can be modified as usual.

Some example usage:

sub_commands.js
````javascript
#!/usr/bin/env node
'use strict';

var ArgumentParser = require('../lib/argparse').ArgumentParser;
var parser = new ArgumentParser({
  version: '0.0.1',
  addHelp:true,
  description: 'Argparse examples: sub-commands',
});

var subparsers = parser.addSubparsers({
  title:'subcommands',
  dest:"subcommand_name"
});

var bar = subparsers.addParser('c1', {addHelp:true});
bar.addArgument(
  [ '-f', '--foo' ],
  {
    action: 'store',
    help: 'foo3 bar3'
  }
);
var bar = subparsers.addParser(
  'c2',
  {aliases:['co'], addHelp:true}
);
bar.addArgument(
  [ '-b', '--bar' ],
  {
    action: 'store',
    type: 'int',
    help: 'foo3 bar3'
  }
);

````

Details in [original guide][subcommands]


Author
======

[Eugene Shkuropat][author]


License
=======

Copyright (c) 2012 [Vitaly Puzrin][owner]
Released under the MIT license. See [LICENSE][license] for details.




[main]:http://docs.python.org/dev/library/argparse.html
[examples]:https://github.com/nodeca/argparse/tree/master/examples
[parser]:http://docs.python.org/dev/library/argparse.html#argumentparser-objects
[add_argument]:http://docs.python.org/dev/library/argparse.html#the-add-argument-method
[action]:http://docs.python.org/dev/library/argparse.html#action
[subcommands]:http://docs.python.org/dev/library/argparse.html#sub-commands
[author]:https://github.com/shkuropat
[owner]:https://github.com/puzrin
[license]:https://github.com/nodeca/argparse/blob/master/LICENSE
[repo]:https://github.com/nodeca/argparse
