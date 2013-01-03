# JSON serialize test classes from test_argparse.py for use by Javascript versions
# use python2.7

import inspect
import sys
import json
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('-j','--jsonfile', default='testpy.json')
args = parser.parse_args()
jsonfile = 'testpy.json'  # from argv?

class Sig(object):

    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs
        
class NS(object):

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)

    def __repr__(self):
        sorted_items = sorted(self.__dict__.items())
        kwarg_str = ', '.join(['%s=%r' % tup for tup in sorted_items])
        return '%s(%s)' % (type(self).__name__, kwarg_str)

    __hash__ = None

    def __eq__(self, other):
        return vars(self) == vars(other)

    def __ne__(self, other):
        return not (self == other)

class ParserTestCase(object):
    pass
    @classmethod
    def show(cls):
        print cls.__name__
        print cls.__doc__
        for sig in cls.argument_signatures:
            print '%s, %s'%(list(sig.args), sig.kwargs)
        print cls.failures
        for ns in cls.successes:
            if len(ns)==2:
                print "'%s', %s"%(ns[0], ns[1].__dict__)
            else:
                print 'more than 2 items'
                print ns
                
    @classmethod
    def forJSON(cls):
        obj = {'name': cls.__name__, 'doc': cls.__doc__}
        if hasattr(cls, 'parser_signature'):
            sig = cls.parser_signature
            sig = [list(sig.args), sig.kwargs]
            obj['parser_signature'] = sig  
        sigs = [[list(sig.args), sig.kwargs] for sig in cls.argument_signatures]
        obj['argument_signatures'] = sigs
        obj['failures'] = cls.failures
        sucs = [[ns[0], ns[1].__dict__] for ns in cls.successes]
        obj['successes'] = sucs
        return obj



# changes to enable JSON serializing
# omit cases involving Mixins
# omit cases defining funs
# omit cases involving filetypes
# convert float to 'float'
# convert Exception to 'Exception'
# convert object to 'object'
# convert int to 'int'
# change set('abcdefg') to list()
###############################################

#with open('testpy.json','w') as fp:
    #allobj = []
    #for cls in testclasses:
        #clsobj = cls.forJSON()
        #try:
            ## test to see if this cls is serializable
            #astr = json.dumps(clsobj)
            #allobj.append(clsobj)
        #except TypeError, e:
            #print e
    #json.dump(allobj,fp,indent=0)

import test_argparse as me

# me.ParserTestCase = ParserTestCase # redefine a base class

if 0:
    acls = me.TestOptionalsSingleDash
    print acls.__mro__
    print acls.__name__, acls.__doc__
    print acls.successes

def mydefault(obj):
    if obj == int:
        return 'int'
    elif obj == float:
        return 'float'
    elif obj == object:
        return 'object'
    elif isinstance(obj,set):
        return list(obj)
    #elif obj == complex:
    #    return 'complex'
    elif isinstance(obj,complex):
        return abs(obj)
    elif obj == Exception:
        return 'Exception'
    elif isinstance(obj,Exception):
        return 'Exception'
    else:
        raise TypeError("%s is not serializable"%obj)

def convert(options):
    for k,v in options.items():
        chg = False
        if v == int:
            options[k] = 'int'
            print 'convert int'
            chg = True
        elif v == float:
            options[k] = 'float'
            print 'convert float'
            chg = True
        elif v == set(['a', 'c', 'b', 'e', 'd', 'g', 'f']):
            options[k] = ['a', 'c', 'b', 'e', 'd', 'g', 'f']
            print 'convert set'
            chg = True
        elif v == object:
            options[k] = 'object'
            print 'convert object'
            chg = True
        elif v == Exception:
            options[k] = 'Exception'
            print 'convert Exception'
            chg = True   
        elif v == [Exception]:  # should be Exception anywhere in a list
            options[k] = ['Exception']
            print 'convert [Exception]'
            chg = True     
        if chg:
            print options
    return options
# cannot convert a case to type Complex
# cannot convert a case action: 'OptionalAction'

def convert(obj):
    # do nothing version
    return obj
    
def forJSON(cls):
    obj = {'name': cls.__name__, 'doc': cls.__doc__}
    if hasattr(cls, 'parser_signature'):
        sig = cls.parser_signature
        sig = [list(sig.args), sig.kwargs]
        obj['parser_signature'] = sig  
    sigs = [[list(sig.args), convert(sig.kwargs)] for sig in cls.argument_signatures]
    obj['argument_signatures'] = sigs
    obj['failures'] = cls.failures
    sucs = [[ns[0], convert(ns[1].__dict__)] for ns in cls.successes]
    obj['successes'] = sucs
    return obj
        

testclasses = [getattr(me,c) for c in dir(me) if c.startswith('Test')]
testclasses = [c for c in testclasses if inspect.isclass(c)]
testclasses = [c for c in testclasses if me.ParserTestCase in c.__mro__]
testclasses = [c for c in testclasses if not me.TempDirMixin in c.mro()]
print len(testclasses)

allobj = []
for cls in testclasses:
    try:
        clsobj = forJSON(cls) # collect attributes like argument_signatures
        astr = json.dumps(clsobj, default=mydefault) # try to serialize
        allobj.append(clsobj)
        print 'JSON', cls.__name__
    except AttributeError, e:
        # common error
        # type object 'TestParentParsers' has no attribute 'argument_signatures'
        print
        print e
        try:
            print clsobj
        except AttributeError,e:
            print e
    except TypeError, e:
        # e.g. TypeError: <class 'test_argparse.OptionalAction'> is not JSON serializable
        # but which object?
        print
        print e
        try:
            print clsobj
        except AttributeError,e:
            print e

with open(args.jsonfile,'w') as fp:
    print 'writing: %s'%jsonfile
    json.dump(allobj,fp, default=mydefault)
