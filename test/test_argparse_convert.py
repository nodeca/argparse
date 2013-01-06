"""Python to JSON test converter
input test_argparse.py;  output: JSON serialized for Javascript use

use python2.7

- import test_argparse.py
- collect test classes that it can JSON serialize with limited conversion
- convert class attributes to a dictionary
- JSON dump at list of these class objects
A JS file will import this json object, and create mocha tests

test classes have parser_signature, argument_signatures, successes, and failures
"""
import inspect
# import sys
import json
import argparse



def mydefault(obj):
    """ 'default' used by dump
    converts some Python functions or classes to strings"""
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
    #elif isinstance(obj,complex):
    #    return abs(obj)
    elif obj == Exception:
        return 'Exception'
    elif isinstance(obj,Exception):
        return 'Exception'
    else:
        raise TypeError("%s is not serializable"%obj)
    
def forJSON(cls):
    """take a test class, return an dictionary with adjusted attributes"""
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

def convert_classes(testclasses):
    """collect a serializable obj for each test class
    Skip class if some part can't be serialized
    """
    allobj = []
    for cls in testclasses:
        # convert classes to serializable object
        try:
            clsobj = forJSON(cls) # collect attributes like argument_signatures
            astr = json.dumps(clsobj, default=mydefault) # try to serialize
            # add to allobj if it can be serialized
            # otherwise write diagnositic messages
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
    return allobj
        
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('-j','--jsonfile', default='testpy.json')
    args = parser.parse_args()

    import test_argparse as testcases
    # from objects in the file, filter by name, by class, by parent class
    # skip ones that include the Mixin
    testclasses = [getattr(testcases, c) for c in dir(testcases) if c.startswith('Test')]
    testclasses = [c for c in testclasses if inspect.isclass(c)]
    testclasses = [c for c in testclasses if testcases.ParserTestCase in c.__mro__]
    testclasses = [c for c in testclasses if not testcases.TempDirMixin in c.mro()]
    print '# of test cases:', len(testclasses)
    
    allobj = convert_classes(testclasses)
    with open(args.jsonfile,'w') as fp:
        print 'writing: %s' % fp.name
        json.dump(allobj, fp, default = mydefault)

###############################################

"""
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

# code to use if cut-n-pasting testcases into this file
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
    # modified version that only knows how to show or JSON its values
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
    
# sample test class from test_argparse.py
class TestOptionalsDefault(ParserTestCase):
    #Tests specifying a default for an Optional

    argument_signatures = [Sig('-x'), Sig('-y', default=42)]
    failures = ['a']
    successes = [
        ('', NS(x=None, y=42)),
        ('-xx', NS(x='x', y=42)),
        ('-yy', NS(x=None, y='y')),
    ]
    
changes to enable JSON serializing
omit cases involving Mixins
omit cases defining funs
omit cases involving filetypes
convert float to 'float'
convert Exception to 'Exception'
convert object to 'object'
convert int to 'int'
change set('abcdefg') to list()
"""
