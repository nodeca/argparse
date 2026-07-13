// Port of python's argparse module, version 3.9.0:
// https://github.com/python/cpython/blob/v3.9.0rc1/Lib/argparse.py

'use strict'

// Copyright (C) 2010-2020 Python Software Foundation.
// Copyright (C) 2020 argparse.js authors

/*
 * Command-line parsing library
 *
 * This module is an optparse-inspired command-line parsing library that:
 *
 *     - handles both optional and positional arguments
 *     - produces highly informative usage messages
 *     - supports parsers that dispatch to sub-parsers
 *
 * The following is a simple usage example that sums integers from the
 * command-line and writes the result to a file::
 *
 *     parser = argparse.ArgumentParser(
 *         description='sum the integers at the command line')
 *     parser.add_argument(
 *         'integers', metavar='int', nargs='+', type=int,
 *         help='an integer to be summed')
 *     parser.add_argument(
 *         '--log', default=sys.stdout, type=argparse.FileType('w'),
 *         help='the file where the sum should be written')
 *     args = parser.parse_args()
 *     args.log.write('%s' % sum(args.integers))
 *     args.log.close()
 *
 * The module contains the following public classes:
 *
 *     - ArgumentParser -- The main entry point for command-line parsing. As the
 *         example above shows, the add_argument() method is used to populate
 *         the parser with actions for optional and positional arguments. Then
 *         the parse_args() method is invoked to convert the args at the
 *         command-line into an object with attributes.
 *
 *     - ArgumentError -- The exception raised by ArgumentParser objects when
 *         there are errors with the parser's actions. Errors raised while
 *         parsing the command-line are caught by ArgumentParser and emitted
 *         as command-line messages.
 *
 *     - FileType -- A factory for defining types of files to be created. As the
 *         example above shows, instances of FileType are typically passed as
 *         the type= argument of add_argument() calls.
 *
 *     - Action -- The base class for parser actions. Typically actions are
 *         selected by passing strings like 'store_true' or 'append_const' to
 *         the action= argument of add_argument(). However, for greater
 *         customization of ArgumentParser actions, subclasses of Action may
 *         be defined and passed as the action= argument.
 *
 *     - HelpFormatter, RawDescriptionHelpFormatter, RawTextHelpFormatter,
 *         ArgumentDefaultsHelpFormatter -- Formatter classes which
 *         may be passed as the formatter_class= argument to the
 *         ArgumentParser constructor. HelpFormatter is the default,
 *         RawDescriptionHelpFormatter and RawTextHelpFormatter tell the parser
 *         not to change the formatting for help text, and
 *         ArgumentDefaultsHelpFormatter adds information about argument defaults
 *         to the help.
 *
 * All other classes in this module are considered implementation details.
 * (Also note that HelpFormatter and RawDescriptionHelpFormatter are only
 * considered public as object names -- the API of the formatter objects is
 * still considered an implementation detail.)
 */

const SUPPRESS = '==SUPPRESS=='

const OPTIONAL = '?'
const ZERO_OR_MORE = '*'
const ONE_OR_MORE = '+'
const PARSER = 'A...'
const REMAINDER = '...'
const _UNRECOGNIZED_ARGS_ATTR = '_unrecognized_args'


// ==================================
// Utility functions used for porting
// ==================================
const assert = require('assert')
const util = require('util')
const fs = require('fs')
const sub = require('./sub')
const path = require('path')
const repr = util.inspect

function get_argv () {
    // omit first argument (which is assumed to be interpreter - `node`, `coffee`, `ts-node`, etc.)
    return process.argv.slice(1)
}

function get_terminal_size () {
    return {
        columns: +process.env.COLUMNS || process.stdout.columns || 80
    }
}

function hasattr (object, name) {
    return Object.prototype.hasOwnProperty.call(object, name)
}

function getattr (object, name, value) {
    return hasattr(object, name) ? object[name] : value
}

function setattr (object, name, value) {
    object[name] = value
}

function setdefault (object, name, value) {
    if (!hasattr(object, name)) object[name] = value
    return object[name]
}

function delattr (object, name) {
    delete object[name]
}

function range (from, to, step = 1) {
    // range(10) is equivalent to range(0, 10)
    if (arguments.length === 1) [to, from] = [from, 0]
    if (typeof from !== 'number' || typeof to !== 'number' || typeof step !== 'number') {
        throw new TypeError('argument cannot be interpreted as an integer')
    }
    if (step === 0) throw new TypeError('range() arg 3 must not be zero')

    const result = []
    if (step > 0) {
        for (let i = from; i < to; i += step) result.push(i)
    } else {
        for (let i = from; i > to; i += step) result.push(i)
    }
    return result
}

function splitlines (str, keepends = false) {
    let result
    if (!keepends) {
        result = str.split(/\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/)
    } else {
        result = []
        const parts = str.split(/(\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029])/)
        for (let i = 0; i < parts.length; i += 2) {
            result.push(parts[i] + (i + 1 < parts.length ? parts[i + 1] : ''))
        }
    }
    if (!result[result.length - 1]) result.pop()
    return result
}

function _string_lstrip (string, prefix_chars) {
    let idx = 0
    while (idx < string.length && prefix_chars.includes(string[idx])) idx++
    return idx ? string.slice(idx) : string
}

function _string_split (string, sep, maxsplit) {
    let result = string.split(sep)
    if (result.length > maxsplit) {
        result = result.slice(0, maxsplit).concat([result.slice(maxsplit).join(sep)])
    }
    return result
}

function _array_equal (array1, array2) {
    if (array1.length !== array2.length) return false
    for (let i = 0; i < array1.length; i++) {
        if (array1[i] !== array2[i]) return false
    }
    return true
}

function _array_remove (array, item) {
    const idx = array.indexOf(item)
    if (idx === -1) throw new TypeError(sub('%r not in list', item))
    array.splice(idx, 1)
}

// normalize choices to array;
// this isn't required in python because `in` and `map` operators work with anything,
// but in js dealing with multiple types here is too clunky
function _choices_to_array (choices) {
    if (choices === undefined) {
        return []
    } else if (Array.isArray(choices)) {
        return choices
    } else if (choices !== null && typeof choices[Symbol.iterator] === 'function') {
        return Array.from(choices)
    } else if (typeof choices === 'object' && choices !== null) {
        return Object.keys(choices)
    } else {
        throw new Error(sub('invalid choices value: %r', choices))
    }
}

// decorator that allows a class to be called without new
function _callable (cls) {
    const result = { // object is needed for inferred class name
        [cls.name]: function (...args) {
            const this_class = new.target === result || !new.target
            return Reflect.construct(cls, args, this_class ? cls : new.target)
        }
    }
    result[cls.name].prototype = cls.prototype
    // fix default tag for toString, e.g. [object Action] instead of [object Object]
    cls.prototype[Symbol.toStringTag] = cls.name
    return result[cls.name]
}

// parse options
const no_default = Symbol('no_default_value')
function _parse_opts (args, descriptor) {
    function get_name () {
        const stack = new Error().stack.split('\n')
            .map(x => x.match(/^    at (.*) \(.*\)$/))
            .filter(Boolean)
            .map(m => m[1])
            .map(fn => fn.match(/[^ .]*$/)[0])

        if (stack.length && stack[0] === get_name.name) stack.shift()
        if (stack.length && stack[0] === _parse_opts.name) stack.shift()
        return stack.length ? stack[0] : ''
    }

    args = Array.from(args)
    let kwargs = {}
    const result = []
    const last_opt = args.length && args[args.length - 1]

    if (typeof last_opt === 'object' && last_opt !== null && !Array.isArray(last_opt) &&
        (!last_opt.constructor || last_opt.constructor.name === 'Object')) {
        kwargs = Object.assign({}, args.pop())
    }

    const missing_positionals = []
    const positional_count = args.length

    for (const [key, def] of Object.entries(descriptor)) {
        if (key[0] === '*') {
            if (key.length > 0 && key[1] === '*') {
                result.push(kwargs)
                kwargs = {}
            } else {
                result.push(args)
                args = []
            }
        } else if (key in kwargs && args.length > 0) {
            throw new TypeError(sub('%s() got multiple values for argument %r', get_name(), key))
        } else if (key in kwargs) {
            result.push(kwargs[key])
            delete kwargs[key]
        } else if (args.length > 0) {
            result.push(args.shift())
        } else if (def !== no_default) {
            result.push(def)
        } else {
            missing_positionals.push(key)
        }
    }

    if (Object.keys(kwargs).length) {
        throw new TypeError(sub('%s() got an unexpected keyword argument %r',
            get_name(), Object.keys(kwargs)[0]))
    }

    if (args.length) {
        const from = Object.entries(descriptor).filter(([k, v]) => k[0] !== '*' && v !== no_default).length
        const to = Object.entries(descriptor).filter(([k]) => k[0] !== '*').length
        throw new TypeError(sub('%s() takes %s positional argument%s but %s %s given',
            get_name(),
            from === to ? sub('from %s to %s', from, to) : to,
            from === to && to === 1 ? '' : 's',
            positional_count,
            positional_count === 1 ? 'was' : 'were'))
    }

    if (missing_positionals.length) {
        const strs = missing_positionals.map(repr)
        if (strs.length > 1) strs[strs.length - 1] = 'and ' + strs[strs.length - 1]
        const str_joined = strs.join(strs.length === 2 ? '' : ', ')
        throw new TypeError(sub('%s() missing %i required positional argument%s: %s',
            get_name(), strs.length, strs.length === 1 ? '' : 's', str_joined))
    }

    return result
}

// =============================
// Utility functions and classes
// =============================
function _AttributeHolder (cls = Object) {
    /*
     *  Abstract base class that provides __repr__.
     *
     *  The __repr__ method returns a string in the format::
     *      ClassName(attr=name, attr=name, ...)
     *  The attributes are determined either by a class-level attribute,
     *  '_kwarg_names', or by inspecting the instance __dict__.
     */

    return class _AttributeHolder extends cls {
        [util.inspect.custom] () {
            const type_name = this.constructor.name
            const arg_strings = []
            const star_args = {}
            for (const arg of this._get_args()) {
                arg_strings.push(repr(arg))
            }
            for (const [name, value] of this._get_kwargs()) {
                if (/^[a-z_][a-z0-9_$]*$/i.test(name)) {
                    arg_strings.push(sub('%s=%r', name, value))
                } else {
                    star_args[name] = value
                }
            }
            if (Object.keys(star_args).length) {
                arg_strings.push(sub('**%s', repr(star_args)))
            }
            return sub('%s(%s)', type_name, arg_strings.join(', '))
        }

        toString () {
            return this[util.inspect.custom]()
        }

        _get_kwargs () {
            return Object.entries(this)
        }

        _get_args () {
            return []
        }
    }
}


function _copy_items (items) {
    if (items === undefined) {
        return []
    }
    return items.slice(0)
}


// ===============
// Formatting Help
// ===============
const HelpFormatter = _callable(class HelpFormatter {
    /*
     *  Formatter for generating usage messages and argument help strings.
     *
     *  Only the name of this class is considered a public API. All the methods
     *  provided by the class are considered an implementation detail.
     */

    constructor () {
        let [
            prog,
            indent_increment,
            max_help_position,
            width
        ] = _parse_opts(arguments, {
            prog: no_default,
            indent_increment: 2,
            max_help_position: 24,
            width: undefined
        })

        // default setting for width
        if (width === undefined) {
            width = get_terminal_size().columns
            width -= 2
        }

        this._prog = prog
        this._indent_increment = indent_increment
        this._max_help_position = Math.min(max_help_position,
                                      Math.max(width - 20, indent_increment * 2))
        this._width = width

        this._current_indent = 0
        this._level = 0
        this._action_max_length = 0

        this._root_section = this._Section(this, undefined)
        this._current_section = this._root_section

        this._whitespace_matcher = /[ \t\n\r\f\v]+/g // equivalent to python /\s+/ with ASCII flag
        this._long_break_matcher = /\n\n\n+/g
    }

    // ===============================
    // Section and indentation methods
    // ===============================
    _indent () {
        this._current_indent += this._indent_increment
        this._level += 1
    }

    _dedent () {
        this._current_indent -= this._indent_increment
        assert(this._current_indent >= 0, 'Indent decreased below 0.')
        this._level -= 1
    }

    _add_item (func, args) {
        this._current_section.items.push([func, args])
    }

    // ========================
    // Message building methods
    // ========================
    start_section (heading) {
        this._indent()
        const section = this._Section(this, this._current_section, heading)
        this._add_item(section.format_help.bind(section), [])
        this._current_section = section
    }

    end_section () {
        this._current_section = this._current_section.parent
        this._dedent()
    }

    add_text (text) {
        if (text !== SUPPRESS && text !== undefined) {
            this._add_item(this._format_text.bind(this), [text])
        }
    }

    add_usage (usage, actions, groups, prefix = undefined) {
        if (usage !== SUPPRESS) {
            const args = [usage, actions, groups, prefix]
            this._add_item(this._format_usage.bind(this), args)
        }
    }

    add_argument (action) {
        if (action.help !== SUPPRESS) {

            // find all invocations
            const invocations = [this._format_action_invocation(action)]
            for (const subaction of this._iter_indented_subactions(action)) {
                invocations.push(this._format_action_invocation(subaction))
            }

            // update the maximum item length
            const invocation_length = Math.max(...invocations.map(invocation => invocation.length))
            const action_length = invocation_length + this._current_indent
            this._action_max_length = Math.max(this._action_max_length,
                                               action_length)

            // add the item to the list
            this._add_item(this._format_action.bind(this), [action])
        }
    }

    add_arguments (actions) {
        for (const action of actions) {
            this.add_argument(action)
        }
    }

    // =======================
    // Help-formatting methods
    // =======================
    format_help () {
        let help = this._root_section.format_help()
        if (help) {
            help = help.replace(this._long_break_matcher, '\n\n')
            help = help.replace(/^\n+|\n+$/g, '') + '\n'
        }
        return help
    }

    _join_parts (part_strings) {
        return part_strings.filter(part => part && part !== SUPPRESS).join('')
    }

    _format_usage (usage, actions, groups, prefix) {
        if (prefix === undefined) {
            prefix = 'usage: '
        }

        // if usage is specified, use that
        if (usage !== undefined) {
            usage = sub(usage, { prog: this._prog })

        // if no optionals or positionals are available, usage is just prog
        } else if (usage === undefined && !actions.length) {
            usage = sub('%(prog)s', { prog: this._prog })

        // if optionals and positionals are available, calculate usage
        } else if (usage === undefined) {
            const prog = sub('%(prog)s', { prog: this._prog })

            // split optionals from positionals
            const optionals = []
            const positionals = []
            for (const action of actions) {
                if (action.option_strings.length) {
                    optionals.push(action)
                } else {
                    positionals.push(action)
                }
            }

            // build full usage string
            const action_usage = this._format_actions_usage([].concat(optionals).concat(positionals), groups)
            usage = [prog, action_usage].map(String).join(' ')

            // wrap the usage parts if it's too long
            const text_width = this._width - this._current_indent
            if (prefix.length + usage.length > text_width) {

                // break usage into wrappable parts
                const part_regexp = /\(.*?\)+(?=\s|$)|\[.*?\]+(?=\s|$)|\S+/g
                const opt_usage = this._format_actions_usage(optionals, groups)
                const pos_usage = this._format_actions_usage(positionals, groups)
                const opt_parts = opt_usage.match(part_regexp) || []
                const pos_parts = pos_usage.match(part_regexp) || []
                assert(opt_parts.join(' ') === opt_usage)
                assert(pos_parts.join(' ') === pos_usage)

                // helper for wrapping lines
                const get_lines = (parts, indent, prefix = undefined) => {
                    const lines = []
                    let line = []
                    let line_len
                    if (prefix !== undefined) {
                        line_len = prefix.length - 1
                    } else {
                        line_len = indent.length - 1
                    }
                    for (const part of parts) {
                        if (line_len + 1 + part.length > text_width && line) {
                            lines.push(indent + line.join(' '))
                            line = []
                            line_len = indent.length - 1
                        }
                        line.push(part)
                        line_len += part.length + 1
                    }
                    if (line.length) {
                        lines.push(indent + line.join(' '))
                    }
                    if (prefix !== undefined) {
                        lines[0] = lines[0].slice(indent.length)
                    }
                    return lines
                }

                let lines

                // if prog is short, follow it with optionals or positionals
                if (prefix.length + prog.length <= 0.75 * text_width) {
                    const indent = ' '.repeat(prefix.length + prog.length + 1)
                    if (opt_parts.length) {
                        lines = get_lines([prog].concat(opt_parts), indent, prefix)
                        lines = lines.concat(get_lines(pos_parts, indent))
                    } else if (pos_parts.length) {
                        lines = get_lines([prog].concat(pos_parts), indent, prefix)
                    } else {
                        lines = [prog]
                    }

                // if prog is long, put it on its own line
                } else {
                    const indent = ' '.repeat(prefix.length)
                    const parts = [].concat(opt_parts).concat(pos_parts)
                    lines = get_lines(parts, indent)
                    if (lines.length > 1) {
                        lines = []
                        lines = lines.concat(get_lines(opt_parts, indent))
                        lines = lines.concat(get_lines(pos_parts, indent))
                    }
                    lines = [prog].concat(lines)
                }

                // join lines into usage
                usage = lines.join('\n')
            }
        }

        // prefix with 'usage:'
        return sub('%s%s\n\n', prefix, usage)
    }

    _format_actions_usage (actions, groups) {
        // find group indices and identify actions in groups
        const group_actions = new Set()
        const inserts = {}
        for (const group of groups) {
            if (!group._group_actions.length) {
                throw new TypeError(sub('empty group %r', group))
            }

            const start = actions.indexOf(group._group_actions[0])
            if (start === -1) {
                continue
            } else {
                const end = start + group._group_actions.length
                if (_array_equal(actions.slice(start, end), group._group_actions)) {
                    for (const action of group._group_actions) {
                        group_actions.add(action)
                    }
                    if (!group.required) {
                        if (start in inserts) {
                            inserts[start] += ' ['
                        } else {
                            inserts[start] = '['
                        }
                        if (end in inserts) {
                            inserts[end] += ']'
                        } else {
                            inserts[end] = ']'
                        }
                    } else {
                        if (start in inserts) {
                            inserts[start] += ' ('
                        } else {
                            inserts[start] = '('
                        }
                        if (end in inserts) {
                            inserts[end] += ')'
                        } else {
                            inserts[end] = ')'
                        }
                    }
                    for (const i of range(start + 1, end)) {
                        inserts[i] = '|'
                    }
                }
            }
        }

        // collect all actions format strings
        const parts = []
        for (const [i, action] of Object.entries(actions)) {

            // suppressed arguments are marked with None
            // remove | separators for suppressed arguments
            if (action.help === SUPPRESS) {
                parts.push(undefined)
                if (inserts[+i] === '|') {
                    delete inserts[+i]
                } else if (inserts[+i + 1] === '|') {
                    delete inserts[+i + 1]
                }

            // produce all arg strings
            } else if (!action.option_strings.length) {
                const default_value = this._get_default_metavar_for_positional(action)
                let part = this._format_args(action, default_value)

                // if it's in a group, strip the outer []
                if (group_actions.has(action)) {
                    if (part[0] === '[' && part[part.length - 1] === ']') {
                        part = part.slice(1, -1)
                    }
                }

                // add the action string to the list
                parts.push(part)

            // produce the first way to invoke the option in brackets
            } else {
                const option_string = action.option_strings[0]
                let part

                // if the Optional doesn't take a value, format is:
                //    -s or --long
                if (action.nargs === 0) {
                    part = action.format_usage()

                // if the Optional takes a value, format is:
                //    -s ARGS or --long ARGS
                } else {
                    const default_value = this._get_default_metavar_for_optional(action)
                    const args_string = this._format_args(action, default_value)
                    part = sub('%s %s', option_string, args_string)
                }

                // make it look optional if it's not required or in a group
                if (!action.required && !group_actions.has(action)) {
                    part = sub('[%s]', part)
                }

                // add the action string to the list
                parts.push(part)
            }
        }

        // insert things at the necessary indices
        for (const i of Object.keys(inserts).map(Number).sort((a, b) => b - a)) {
            parts.splice(+i, 0, inserts[+i])
        }

        // join all the action items with spaces
        let text = parts.filter(Boolean).join(' ')

        // clean up separators for mutually exclusive groups
        text = text.replace(/([\[(]) /g, '$1')
        text = text.replace(/ ([\])])/g, '$1')
        text = text.replace(/[\[(] *[\])]/g, '')
        text = text.replace(/\(([^|]*)\)/g, '$1', text)
        text = text.trim()

        // return the text
        return text
    }

    _format_text (text) {
        if (text.includes('%(prog)')) {
            text = sub(text, { prog: this._prog })
        }
        const text_width = Math.max(this._width - this._current_indent, 11)
        const indent = ' '.repeat(this._current_indent)
        return this._fill_text(text, text_width, indent) + '\n\n'
    }

    _format_action (action) {
        // determine the required width and the entry label
        const help_position = Math.min(this._action_max_length + 2,
                                     this._max_help_position)
        const help_width = Math.max(this._width - help_position, 11)
        const action_width = help_position - this._current_indent - 2
        let action_header = this._format_action_invocation(action)
        let indent_first

        // no help; start on same line and add a final newline
        if (!action.help) {
            const tup = [this._current_indent, '', action_header]
            action_header = sub('%*s%s\n', ...tup)

        // short action name; start on the same line and pad two spaces
        } else if (action_header.length <= action_width) {
            const tup = [this._current_indent, '', action_width, action_header]
            action_header = sub('%*s%-*s  ', ...tup)
            indent_first = 0

        // long action name; start on the next line
        } else {
            const tup = [this._current_indent, '', action_header]
            action_header = sub('%*s%s\n', ...tup)
            indent_first = help_position
        }

        // collect the pieces of the action help
        const parts = [action_header]

        // if there was help for the action, add lines of help text
        if (action.help && action.help.trim()) {
            const help_text = this._expand_help(action)
            if (help_text) {
                const help_lines = this._split_lines(help_text, help_width)
                parts.push(sub('%*s%s\n', indent_first, '', help_lines[0]))
                for (const line of help_lines.slice(1)) {
                    parts.push(sub('%*s%s\n', help_position, '', line))
                }
            }

        // or add a newline if the description doesn't end with one
        } else if (!action_header.endsWith('\n')) {
            parts.push('\n')
        }

        // if there are any sub-actions, add their help as well
        for (const subaction of this._iter_indented_subactions(action)) {
            parts.push(this._format_action(subaction))
        }

        // return a single string
        return this._join_parts(parts)
    }

    _format_action_invocation (action) {
        if (!action.option_strings.length) {
            const default_value = this._get_default_metavar_for_positional(action)
            const metavar = this._metavar_formatter(action, default_value)(1)[0]
            return metavar

        } else {
            let parts = []

            // if the Optional doesn't take a value, format is:
            //    -s, --long
            if (action.nargs === 0) {
                parts = parts.concat(action.option_strings)

            // if the Optional takes a value, format is:
            //    -s ARGS, --long ARGS
            } else {
                const default_value = this._get_default_metavar_for_optional(action)
                const args_string = this._format_args(action, default_value)
                for (const option_string of action.option_strings) {
                    parts.push(sub('%s %s', option_string, args_string))
                }
            }

            return parts.join(', ')
        }
    }

    _metavar_formatter (action, default_metavar) {
        let result
        if (action.metavar !== undefined) {
            result = action.metavar
        } else if (action.choices !== undefined) {
            const choice_strs = _choices_to_array(action.choices).map(String)
            result = sub('{%s}', choice_strs.join(','))
        } else {
            result = default_metavar
        }

        function format (tuple_size) {
            if (Array.isArray(result)) {
                return result
            } else {
                return Array(tuple_size).fill(result)
            }
        }
        return format
    }

    _format_args (action, default_metavar) {
        const get_metavar = this._metavar_formatter(action, default_metavar)
        let result
        if (action.nargs === undefined) {
            result = sub('%s', ...get_metavar(1))
        } else if (action.nargs === OPTIONAL) {
            result = sub('[%s]', ...get_metavar(1))
        } else if (action.nargs === ZERO_OR_MORE) {
            const metavar = get_metavar(1)
            if (metavar.length === 2) {
                result = sub('[%s [%s ...]]', ...metavar)
            } else {
                result = sub('[%s ...]', ...metavar)
            }
        } else if (action.nargs === ONE_OR_MORE) {
            result = sub('%s [%s ...]', ...get_metavar(2))
        } else if (action.nargs === REMAINDER) {
            result = '...'
        } else if (action.nargs === PARSER) {
            result = sub('%s ...', ...get_metavar(1))
        } else if (action.nargs === SUPPRESS) {
            result = ''
        } else {
            let formats
            try {
                formats = range(action.nargs).map(() => '%s')
            } catch (err) {
                throw new TypeError('invalid nargs value')
            }
            result = sub(formats.join(' '), ...get_metavar(action.nargs))
        }
        return result
    }

    _expand_help (action) {
        const params = Object.assign({ prog: this._prog }, action)
        for (const name of Object.keys(params)) {
            if (params[name] === SUPPRESS) {
                delete params[name]
            }
        }
        for (const name of Object.keys(params)) {
            if (params[name] && params[name].name) {
                params[name] = params[name].name
            }
        }
        if (params.choices !== undefined) {
            const choices_str = _choices_to_array(params.choices).map(String).join(', ')
            params.choices = choices_str
        }
        return sub(this._get_help_string(action), params)
    }

    * _iter_indented_subactions (action) {
        if (typeof action._get_subactions === 'function') {
            this._indent()
            yield * action._get_subactions()
            this._dedent()
        }
    }

    _split_lines (text, width) {
        text = text.replace(this._whitespace_matcher, ' ').trim()
        // The textwrap module is used only for formatting help.
        // Delay its import for speeding up the common usage of argparse.
        const textwrap = require('./textwrap')
        return textwrap.wrap(text, { width })
    }

    _fill_text (text, width, indent) {
        text = text.replace(this._whitespace_matcher, ' ').trim()
        const textwrap = require('./textwrap')
        return textwrap.fill(text, { width,
                                     initial_indent: indent,
                                     subsequent_indent: indent })
    }

    _get_help_string (action) {
        return action.help
    }

    _get_default_metavar_for_optional (action) {
        return action.dest.toUpperCase()
    }

    _get_default_metavar_for_positional (action) {
        return action.dest
    }
})

HelpFormatter.prototype._Section = _callable(class _Section {

    constructor (formatter, parent, heading = undefined) {
        this.formatter = formatter
        this.parent = parent
        this.heading = heading
        this.items = []
    }

    format_help () {
        // format the indented section
        if (this.parent !== undefined) {
            this.formatter._indent()
        }
        const item_help = this.formatter._join_parts(this.items.map(([func, args]) => func.apply(null, args)))
        if (this.parent !== undefined) {
            this.formatter._dedent()
        }

        // return nothing if the section was empty
        if (!item_help) {
            return ''
        }

        // add the heading if the section was non-empty
        let heading
        if (this.heading !== SUPPRESS && this.heading !== undefined) {
            const current_indent = this.formatter._current_indent
            heading = sub('%*s%s:\n', current_indent, '', this.heading)
        } else {
            heading = ''
        }

        // join the section-initial newline, the heading and the help
        return this.formatter._join_parts(['\n', heading, item_help, '\n'])
    }
})


const RawDescriptionHelpFormatter = _callable(class RawDescriptionHelpFormatter extends HelpFormatter {
    /*
     *  Help message formatter which retains any formatting in descriptions.
     *
     *  Only the name of this class is considered a public API. All the methods
     *  provided by the class are considered an implementation detail.
     */

    _fill_text (text, width, indent) {
        return splitlines(text, true).map(line => indent + line).join('')
    }
})


const RawTextHelpFormatter = _callable(class RawTextHelpFormatter extends RawDescriptionHelpFormatter {
    /*
     *  Help message formatter which retains formatting of all help text.
     *
     *  Only the name of this class is considered a public API. All the methods
     *  provided by the class are considered an implementation detail.
     */

    _split_lines (text/*, width */) {
        return splitlines(text)
    }
})


const ArgumentDefaultsHelpFormatter = _callable(class ArgumentDefaultsHelpFormatter extends HelpFormatter {
    /*
     *  Help message formatter which adds default values to argument help.
     *
     *  Only the name of this class is considered a public API. All the methods
     *  provided by the class are considered an implementation detail.
     */

    _get_help_string (action) {
        let help = action.help
        if (help === undefined) {
            help = ''
        }

        if (!help.includes('%(default)')) {
            if (action.default !== SUPPRESS) {
                const defaulting_nargs = [OPTIONAL, ZERO_OR_MORE]
                if (action.option_strings.length || defaulting_nargs.includes(action.nargs)) {
                    help += ' (default: %(default)s)'
                }
            }
        }
        return help
    }
})


const MetavarTypeHelpFormatter = _callable(class MetavarTypeHelpFormatter extends HelpFormatter {
    /*
     *  Help message formatter which uses the argument 'type' as the default
     *  metavar value (instead of the argument 'dest')
     *
     *  Only the name of this class is considered a public API. All the methods
     *  provided by the class are considered an implementation detail.
     */

    _get_default_metavar_for_optional (action) {
        return typeof action.type === 'function' ? action.type.name : action.type
    }

    _get_default_metavar_for_positional (action) {
        return typeof action.type === 'function' ? action.type.name : action.type
    }
})


// =====================
// Options and Arguments
// =====================
function _get_action_name (argument) {
    if (argument === undefined) {
        return undefined
    } else if (argument.option_strings.length) {
        return argument.option_strings.join('/')
    } else if (![undefined, SUPPRESS].includes(argument.metavar)) {
        return argument.metavar
    } else if (![undefined, SUPPRESS].includes(argument.dest)) {
        return argument.dest
    } else if (argument.choices) {
        return sub('{%s}', _choices_to_array(argument.choices).join(','))
    } else {
        return undefined
    }
}


const ArgumentError = _callable(class ArgumentError extends Error {
    /*
     *  An error from creating or using an argument (optional or positional).
     *
     *  The string value of this exception is the message, augmented with
     *  information about the argument that caused it.
     */

    constructor (argument, message) {
        super()
        this.name = 'ArgumentError'
        this._argument_name = _get_action_name(argument)
        this._message = message
        this.message = this.str()
    }

    str () {
        let format
        if (this._argument_name === undefined) {
            format = '%(message)s'
        } else {
            format = 'argument %(argument_name)s: %(message)s'
        }
        return sub(format, { message: this._message,
                             argument_name: this._argument_name })
    }
})


const ArgumentTypeError = _callable(class ArgumentTypeError extends Error {
    /*
     * An error from trying to convert a command line string to a type.
     */

    constructor (message) {
        super(message)
        this.name = 'ArgumentTypeError'
    }
})


// ==============
// Action classes
// ==============
const Action = _callable(class Action extends _AttributeHolder(Function) {
    /*
     *  Information about how to convert command line strings to Python objects.
     *
     *  Action objects are used by an ArgumentParser to represent the information
     *  needed to parse a single argument from one or more strings from the
     *  command line. The keyword arguments to the Action constructor are also
     *  all attributes of Action instances.
     *
     *  Keyword Arguments:
     *
     *      - option_strings -- A list of command-line option strings which
     *          should be associated with this action.
     *
     *      - dest -- The name of the attribute to hold the created object(s)
     *
     *      - nargs -- The number of command-line arguments that should be
     *          consumed. By default, one argument will be consumed and a single
     *          value will be produced.  Other values include:
     *              - N (an integer) consumes N arguments (and produces a list)
     *              - '?' consumes zero or one arguments
     *              - '*' consumes zero or more arguments (and produces a list)
     *              - '+' consumes one or more arguments (and produces a list)
     *          Note that the difference between the default and nargs=1 is that
     *          with the default, a single value will be produced, while with
     *          nargs=1, a list containing a single value will be produced.
     *
     *      - const -- The value to be produced if the option is specified and the
     *          option uses an action that takes no values.
     *
     *      - default -- The value to be produced if the option is not specified.
     *
     *      - type -- A callable that accepts a single string argument, and
     *          returns the converted value.  The standard Python types str, int,
     *          float, and complex are useful examples of such callables.  If None,
     *          str is used.
     *
     *      - choices -- A container of values that should be allowed. If not None,
     *          after a command-line argument has been converted to the appropriate
     *          type, an exception will be raised if it is not a member of this
     *          collection.
     *
     *      - required -- True if the action must always be specified at the
     *          command line. This is only meaningful for optional command-line
     *          arguments.
     *
     *      - help -- The help string describing the argument.
     *
     *      - metavar -- The name to be used for the option's argument with the
     *          help string. If None, the 'dest' value will be used as the name.
     */

    constructor () {
        const [
            option_strings,
            dest,
            nargs,
            const_value,
            default_value,
            type,
            choices,
            required,
            help,
            metavar
        ] = _parse_opts(arguments, {
            option_strings: no_default,
            dest: no_default,
            nargs: undefined,
            const: undefined,
            default: undefined,
            type: undefined,
            choices: undefined,
            required: false,
            help: undefined,
            metavar: undefined
        })

        // when this class is called as a function, redirect it to .call() method of itself
        super('return arguments.callee.call.apply(arguments.callee, arguments)')

        this.option_strings = option_strings
        this.dest = dest
        this.nargs = nargs
        this.const = const_value
        this.default = default_value
        this.type = type
        this.choices = choices
        this.required = required
        this.help = help
        this.metavar = metavar
    }

    _get_kwargs () {
        const names = [
            'option_strings',
            'dest',
            'nargs',
            'const',
            'default',
            'type',
            'choices',
            'help',
            'metavar'
        ]
        return names.map(name => [name, getattr(this, name)])
    }

    format_usage () {
        return this.option_strings[0]
    }

    call (/* parser, namespace, values, option_string = undefined */) {
        throw new Error('.call() not defined')
    }
})


const BooleanOptionalAction = _callable(class BooleanOptionalAction extends Action {

    constructor () {
        const [
            option_strings,
            dest,
            default_value,
            type,
            choices,
            required,
            help,
            metavar
        ] = _parse_opts(arguments, {
            option_strings: no_default,
            dest: no_default,
            default: undefined,
            type: undefined,
            choices: undefined,
            required: false,
            help: undefined,
            metavar: undefined
        })

        const _option_strings = []
        for (let option_string of option_strings) {
            _option_strings.push(option_string)

            if (option_string.startsWith('--')) {
                option_string = '--no-' + option_string.slice(2)
                _option_strings.push(option_string)
            }
        }

        super({
            option_strings: _option_strings,
            dest,
            nargs: 0,
            default: default_value,
            type,
            choices,
            required,
            help,
            metavar
        })
    }

    call (parser, namespace, values, option_string = undefined) {
        if (this.option_strings.includes(option_string)) {
            setattr(namespace, this.dest, !option_string.startsWith('--no-'))
        }
    }

    format_usage () {
        return this.option_strings.join(' | ')
    }
})


const _StoreAction = _callable(class _StoreAction extends Action {

    constructor () {
        const [
            option_strings,
            dest,
            nargs,
            const_value,
            default_value,
            type,
            choices,
            required,
            help,
            metavar
        ] = _parse_opts(arguments, {
            option_strings: no_default,
            dest: no_default,
            nargs: undefined,
            const: undefined,
            default: undefined,
            type: undefined,
            choices: undefined,
            required: false,
            help: undefined,
            metavar: undefined
        })

        if (nargs === 0) {
            throw new TypeError('nargs for store actions must be != 0; if you ' +
                        'have nothing to store, actions such as store ' +
                        'true or store const may be more appropriate')
        }
        if (const_value !== undefined && nargs !== OPTIONAL) {
            throw new TypeError(sub('nargs must be %r to supply const', OPTIONAL))
        }
        super({
            option_strings,
            dest,
            nargs,
            const: const_value,
            default: default_value,
            type,
            choices,
            required,
            help,
            metavar
        })
    }

    call (parser, namespace, values/*, option_string = undefined */) {
        setattr(namespace, this.dest, values)
    }
})


const _StoreConstAction = _callable(class _StoreConstAction extends Action {

    constructor () {
        const [
            option_strings,
            dest,
            const_value,
            default_value,
            required,
            help
            //, metavar
        ] = _parse_opts(arguments, {
            option_strings: no_default,
            dest: no_default,
            const: undefined,
            default: undefined,
            required: false,
            help: undefined,
            metavar: undefined
        })

        super({
            option_strings,
            dest,
            nargs: 0,
            const: const_value,
            default: default_value,
            required,
            help
        })
    }

    call (parser, namespace/*, values, option_string = undefined */) {
        setattr(namespace, this.dest, this.const)
    }
})


const _StoreTrueAction = _callable(class _StoreTrueAction extends _StoreConstAction {

    constructor () {
        const [
            option_strings,
            dest,
            default_value,
            required,
            help
        ] = _parse_opts(arguments, {
            option_strings: no_default,
            dest: no_default,
            default: false,
            required: false,
            help: undefined
        })

        super({
            option_strings,
            dest,
            const: true,
            default: default_value,
            required,
            help
        })
    }
})


const _StoreFalseAction = _callable(class _StoreFalseAction extends _StoreConstAction {

    constructor () {
        const [
            option_strings,
            dest,
            default_value,
            required,
            help
        ] = _parse_opts(arguments, {
            option_strings: no_default,
            dest: no_default,
            default: true,
            required: false,
            help: undefined
        })

        super({
            option_strings,
            dest,
            const: false,
            default: default_value,
            required,
            help
        })
    }
})


const _AppendAction = _callable(class _AppendAction extends Action {

    constructor () {
        const [
            option_strings,
            dest,
            nargs,
            const_value,
            default_value,
            type,
            choices,
            required,
            help,
            metavar
        ] = _parse_opts(arguments, {
            option_strings: no_default,
            dest: no_default,
            nargs: undefined,
            const: undefined,
            default: undefined,
            type: undefined,
            choices: undefined,
            required: false,
            help: undefined,
            metavar: undefined
        })

        if (nargs === 0) {
            throw new TypeError('nargs for append actions must be != 0; if arg ' +
                        'strings are not supplying the value to append, ' +
                        'the append const action may be more appropriate')
        }
        if (const_value !== undefined && nargs !== OPTIONAL) {
            throw new TypeError(sub('nargs must be %r to supply const', OPTIONAL))
        }
        super({
            option_strings,
            dest,
            nargs,
            const: const_value,
            default: default_value,
            type,
            choices,
            required,
            help,
            metavar
        })
    }

    call (parser, namespace, values/*, option_string = undefined */) {
        let items = getattr(namespace, this.dest, undefined)
        items = _copy_items(items)
        items.push(values)
        setattr(namespace, this.dest, items)
    }
})


const _AppendConstAction = _callable(class _AppendConstAction extends Action {

    constructor () {
        const [
            option_strings,
            dest,
            const_value,
            default_value,
            required,
            help,
            metavar
        ] = _parse_opts(arguments, {
            option_strings: no_default,
            dest: no_default,
            const: undefined,
            default: undefined,
            required: false,
            help: undefined,
            metavar: undefined
        })

        super({
            option_strings,
            dest,
            nargs: 0,
            const: const_value,
            default: default_value,
            required,
            help,
            metavar
        })
    }

    call (parser, namespace/*, values, option_string = undefined */) {
        let items = getattr(namespace, this.dest, undefined)
        items = _copy_items(items)
        items.push(this.const)
        setattr(namespace, this.dest, items)
    }
})


const _CountAction = _callable(class _CountAction extends Action {

    constructor () {
        const [
            option_strings,
            dest,
            default_value,
            required,
            help
        ] = _parse_opts(arguments, {
            option_strings: no_default,
            dest: no_default,
            default: undefined,
            required: false,
            help: undefined
        })

        super({
            option_strings,
            dest,
            nargs: 0,
            default: default_value,
            required,
            help
        })
    }

    call (parser, namespace/*, values, option_string = undefined */) {
        let count = getattr(namespace, this.dest, undefined)
        if (count === undefined) {
            count = 0
        }
        setattr(namespace, this.dest, count + 1)
    }
})


const _HelpAction = _callable(class _HelpAction extends Action {

    constructor () {
        const [
            option_strings,
            dest,
            default_value,
            help
        ] = _parse_opts(arguments, {
            option_strings: no_default,
            dest: SUPPRESS,
            default: SUPPRESS,
            help: undefined
        })

        super({
            option_strings,
            dest,
            default: default_value,
            nargs: 0,
            help
        })
    }

    call (parser/*, namespace, values, option_string = undefined */) {
        parser.print_help()
        parser.exit()
    }
})


const _VersionAction = _callable(class _VersionAction extends Action {

    constructor () {
        const [
            option_strings,
            version,
            dest,
            default_value,
            help
        ] = _parse_opts(arguments, {
            option_strings: no_default,
            version: undefined,
            dest: SUPPRESS,
            default: SUPPRESS,
            help: "show program's version number and exit"
        })

        super({
            option_strings,
            dest,
            default: default_value,
            nargs: 0,
            help
        })
        this.version = version
    }

    call (parser/*, namespace, values, option_string = undefined */) {
        let version = this.version
        if (version === undefined) {
            version = parser.version
        }
        const formatter = parser._get_formatter()
        formatter.add_text(version)
        parser._print_message(formatter.format_help(), process.stdout)
        parser.exit()
    }
})


const _SubParsersAction = _callable(class _SubParsersAction extends Action {

    constructor () {
        const [
            option_strings,
            prog,
            parser_class,
            dest,
            required,
            help,
            metavar
        ] = _parse_opts(arguments, {
            option_strings: no_default,
            prog: no_default,
            parser_class: no_default,
            dest: SUPPRESS,
            required: false,
            help: undefined,
            metavar: undefined
        })

        const name_parser_map = {}

        super({
            option_strings,
            dest,
            nargs: PARSER,
            choices: name_parser_map,
            required,
            help,
            metavar
        })

        this._prog_prefix = prog
        this._parser_class = parser_class
        this._name_parser_map = name_parser_map
        this._choices_actions = []
    }

    add_parser () {
        const [
            name,
            kwargs
        ] = _parse_opts(arguments, {
            name: no_default,
            '**kwargs': no_default
        })

        // set prog from the existing prefix
        if (kwargs.prog === undefined) {
            kwargs.prog = sub('%s %s', this._prog_prefix, name)
        }

        const aliases = getattr(kwargs, 'aliases', [])
        delete kwargs.aliases

        if (hasattr(this._name_parser_map, name)) {
            throw new ArgumentError(this, sub('conflicting subparser: %s', name))
        }
        for (const alias of aliases) {
            if (hasattr(this._name_parser_map, alias)) {
                throw new ArgumentError(this, sub('conflicting subparser alias: %s', alias))
            }
        }

        // create a pseudo-action to hold the choice help
        if ('help' in kwargs) {
            const help = kwargs.help
            delete kwargs.help
            const choice_action = this._ChoicesPseudoAction(name, aliases, help)
            this._choices_actions.push(choice_action)
        }

        // create the parser and add it to the map
        const parser = new this._parser_class(kwargs)
        this._name_parser_map[name] = parser

        // make parser available under aliases also
        for (const alias of aliases) {
            this._name_parser_map[alias] = parser
        }

        return parser
    }

    _get_subactions () {
        return this._choices_actions
    }

    call (parser, namespace, values/*, option_string = undefined */) {
        const parser_name = values[0]
        let arg_strings = values.slice(1)

        // set the parser name if requested
        if (this.dest !== SUPPRESS) {
            setattr(namespace, this.dest, parser_name)
        }

        // select the parser
        if (hasattr(this._name_parser_map, parser_name)) {
            parser = this._name_parser_map[parser_name]
        } else {
            const args = {parser_name,
                        choices: this._name_parser_map.join(', ')}
            const msg = sub('unknown parser %(parser_name)r (choices: %(choices)s)', args)
            throw new ArgumentError(this, msg)
        }

        // parse all the remaining options into the namespace
        // store any unrecognized options on the object, so that the top
        // level parser can decide what to do with them

        // In case this subparser defines new defaults, we parse them
        // in a new namespace object and then update the original
        // namespace for the relevant parts.
        let subnamespace
        [subnamespace, arg_strings] = parser.parse_known_args(arg_strings, undefined)
        for (const [key, value] of Object.entries(subnamespace)) {
            setattr(namespace, key, value)
        }

        if (arg_strings.length) {
            setdefault(namespace, _UNRECOGNIZED_ARGS_ATTR, [])
            getattr(namespace, _UNRECOGNIZED_ARGS_ATTR).push(...arg_strings)
        }
    }
})


_SubParsersAction.prototype._ChoicesPseudoAction = _callable(class _ChoicesPseudoAction extends Action {
    constructor (name, aliases, help) {
        let metavar = name
        const dest = name
        if (aliases.length) {
            metavar += sub(' (%s)', aliases.join(', '))
        }
        super({ option_strings: [], dest, help, metavar })
    }
})


const _ExtendAction = _callable(class _ExtendAction extends _AppendAction {
    call (parser, namespace, values/*, option_string = undefined */) {
        let items = getattr(namespace, this.dest, undefined)
        items = _copy_items(items)
        items = items.concat(values)
        setattr(namespace, this.dest, items)
    }
})


// ==============
// Type classes
// ==============
const FileType = _callable(class FileType extends Function {
    /*
     *  Factory for creating file object types
     *
     *  Instances of FileType are typically passed as type= arguments to the
     *  ArgumentParser add_argument() method.
     *
     *  Keyword Arguments:
     *      - mode -- A string indicating how the file is to be opened. Accepts the
     *          same values as the builtin open() function.
     *      - bufsize -- The file's desired buffer size. Accepts the same values as
     *          the builtin open() function.
     *      - encoding -- The file's encoding. Accepts the same values as the
     *          builtin open() function.
     *      - errors -- A string indicating how encoding and decoding errors are to
     *          be handled. Accepts the same value as the builtin open() function.
     */

    constructor () {
        const [
            flags,
            encoding,
            mode,
            autoClose,
            emitClose,
            start,
            end,
            highWaterMark,
            fs
        ] = _parse_opts(arguments, {
            flags: 'r',
            encoding: undefined,
            mode: undefined, // 0o666
            autoClose: undefined, // true
            emitClose: undefined, // false
            start: undefined, // 0
            end: undefined, // Infinity
            highWaterMark: undefined, // 64 * 1024
            fs: undefined
        })

        // when this class is called as a function, redirect it to .call() method of itself
        super('return arguments.callee.call.apply(arguments.callee, arguments)')

        Object.defineProperty(this, 'name', {
            get () {
                return sub('FileType(%r)', flags)
            }
        })
        this._flags = flags
        this._options = {}
        if (encoding !== undefined) this._options.encoding = encoding
        if (mode !== undefined) this._options.mode = mode
        if (autoClose !== undefined) this._options.autoClose = autoClose
        if (emitClose !== undefined) this._options.emitClose = emitClose
        if (start !== undefined) this._options.start = start
        if (end !== undefined) this._options.end = end
        if (highWaterMark !== undefined) this._options.highWaterMark = highWaterMark
        if (fs !== undefined) this._options.fs = fs
    }

    call (string) {
        // the special argument "-" means sys.std{in,out}
        if (string === '-') {
            if (this._flags.includes('r')) {
                return process.stdin
            } else if (this._flags.includes('w')) {
                return process.stdout
            } else {
                const msg = sub('argument "-" with mode %r', this._flags)
                throw new TypeError(msg)
            }
        }

        // all other arguments are used as file names
        let fd
        try {
            fd = fs.openSync(string, this._flags, this._options.mode)
        } catch (e) {
            const args = { filename: string, error: e.message }
            const message = "can't open '%(filename)s': %(error)s"
            throw new ArgumentTypeError(sub(message, args))
        }

        const options = Object.assign({ fd, flags: this._flags }, this._options)
        if (this._flags.includes('r')) {
            return fs.createReadStream(undefined, options)
        } else if (this._flags.includes('w')) {
            return fs.createWriteStream(undefined, options)
        } else {
            const msg = sub('argument "%s" with mode %r', string, this._flags)
            throw new TypeError(msg)
        }
    }

    [util.inspect.custom] () {
        const args = [this._flags]
        const kwargs = Object.entries(this._options).map(([k, v]) => {
            if (k === 'mode') v = { value: v, [util.inspect.custom] () { return '0o' + this.value.toString(8) } }
            return [k, v]
        })
        const args_str = []
                .concat(args.filter(arg => arg !== -1).map(repr))
                .concat(kwargs.filter(([/* kw */, arg]) => arg !== undefined)
                    .map(([kw, arg]) => sub('%s=%r', kw, arg)))
                .join(', ')
        return sub('%s(%s)', this.constructor.name, args_str)
    }

    toString () {
        return this[util.inspect.custom]()
    }
})

// ===========================
// Optional and Positional Parsing
// ===========================
const Namespace = _callable(class Namespace extends _AttributeHolder() {
    /*
     *  Simple object for storing attributes.
     *
     *  Implements equality by attribute names and values, and provides a simple
     *  string representation.
     */

    constructor (options = {}) {
        super()
        Object.assign(this, options)
    }
})

// unset string tag to mimic plain object
Namespace.prototype[Symbol.toStringTag] = undefined


const _ActionsContainer = _callable(class _ActionsContainer {

    constructor () {
        const [
            description,
            prefix_chars,
            argument_default,
            conflict_handler
        ] = _parse_opts(arguments, {
            description: no_default,
            prefix_chars: no_default,
            argument_default: no_default,
            conflict_handler: no_default
        })

        this.description = description
        this.argument_default = argument_default
        this.prefix_chars = prefix_chars
        this.conflict_handler = conflict_handler

        // set up registries
        this._registries = {}

        // register actions
        this.register('action', undefined, _StoreAction)
        this.register('action', 'store', _StoreAction)
        this.register('action', 'store_const', _StoreConstAction)
        this.register('action', 'store_true', _StoreTrueAction)
        this.register('action', 'store_false', _StoreFalseAction)
        this.register('action', 'append', _AppendAction)
        this.register('action', 'append_const', _AppendConstAction)
        this.register('action', 'count', _CountAction)
        this.register('action', 'help', _HelpAction)
        this.register('action', 'version', _VersionAction)
        this.register('action', 'parsers', _SubParsersAction)
        this.register('action', 'extend', _ExtendAction)
        // raise an exception if the conflict handler is invalid
        this._get_handler()

        // action storage
        this._actions = []
        this._option_string_actions = {}

        // groups
        this._action_groups = []
        this._mutually_exclusive_groups = []

        // defaults storage
        this._defaults = {}

        // determines whether an "option" looks like a negative number
        this._negative_number_matcher = /^-\d+$|^-\d*\.\d+$/

        // whether or not there are any optionals that look like negative
        // numbers -- uses a list so it can be shared and edited
        this._has_negative_number_optionals = []
    }

    // ====================
    // Registration methods
    // ====================
    register (registry_name, value, object) {
        const registry = setdefault(this._registries, registry_name, {})
        registry[value] = object
    }

    _registry_get (registry_name, value, default_value = undefined) {
        return getattr(this._registries[registry_name], value, default_value)
    }

    // ==================================
    // Namespace default accessor methods
    // ==================================
    set_defaults (kwargs) {
        Object.assign(this._defaults, kwargs)

        // if these defaults match any existing arguments, replace
        // the previous default on the object with the new one
        for (const action of this._actions) {
            if (action.dest in kwargs) {
                action.default = kwargs[action.dest]
            }
        }
    }

    get_default (dest) {
        for (const action of this._actions) {
            if (action.dest === dest && action.default !== undefined) {
                return action.default
            }
        }
        return this._defaults[dest]
    }


    // =======================
    // Adding argument actions
    // =======================
    add_argument () {
        /*
         *  add_argument(dest, ..., name=value, ...)
         *  add_argument(option_string, option_string, ..., name=value, ...)
         */
        let [
            args,
            kwargs
        ] = _parse_opts(arguments, {
            '*args': no_default,
            '**kwargs': no_default
        })
        // argparse v1 accepted an array of argument names here. Python argparse
        // accepts only individual string names and rejects a list; reject it
        // explicitly because JS would otherwise coerce the array to a string.
        if (args.some(arg => typeof arg !== 'string')) {
            throw new TypeError('argument name must be a string')
        }
        // if no positional args are supplied or only one is supplied and
        // it doesn't look like an option string, parse a positional
        // argument
        const chars = this.prefix_chars
        if (!args.length || args.length === 1 && !chars.includes(args[0][0])) {
            if (args.length && 'dest' in kwargs) {
                throw new TypeError('dest supplied twice for positional argument')
            }
            kwargs = this._get_positional_kwargs(...args, kwargs)

        // otherwise, we're adding an optional argument
        } else {
            kwargs = this._get_optional_kwargs(...args, kwargs)
        }

        // if no default was supplied, use the parser-level default
        if (!('default' in kwargs)) {
            const dest = kwargs.dest
            if (dest in this._defaults) {
                kwargs.default = this._defaults[dest]
            } else if (this.argument_default !== undefined) {
                kwargs.default = this.argument_default
            }
        }

        // create the action object, and add it to the parser
        const action_class = this._pop_action_class(kwargs)
        if (typeof action_class !== 'function') {
            throw new TypeError(sub('unknown action "%s"', action_class))
        }
        // eslint-disable-next-line new-cap
        const action = new action_class(kwargs)

        // raise an error if the action type is not callable
        const type_func = this._registry_get('type', action.type, action.type)
        if (typeof type_func !== 'function') {
            throw new TypeError(sub('%r is not callable', type_func))
        }

        if (type_func === FileType) {
            throw new TypeError(sub('%r is a FileType class object, instance of it' +
                                    ' must be passed', type_func))
        }

        // raise an error if the metavar does not match the type
        if ('_get_formatter' in this) {
            try {
                this._get_formatter()._format_args(action, undefined)
            } catch (err) {
                // check for 'invalid nargs value' is an artifact of TypeError and ValueError in js being the same
                if (err instanceof TypeError && err.message !== 'invalid nargs value') {
                    throw new TypeError('length of metavar tuple does not match nargs')
                } else {
                    throw err
                }
            }
        }

        return this._add_action(action)
    }

    add_argument_group () {
        const group = _ArgumentGroup(this, ...arguments)
        this._action_groups.push(group)
        return group
    }

    add_mutually_exclusive_group () {

        const group = _MutuallyExclusiveGroup(this, ...arguments)
        this._mutually_exclusive_groups.push(group)
        return group
    }

    _add_action (action) {
        // resolve any conflicts
        this._check_conflict(action)

        // add to actions list
        this._actions.push(action)
        action.container = this

        // index the action by any option strings it has
        for (const option_string of action.option_strings) {
            this._option_string_actions[option_string] = action
        }

        // set the flag if any option strings look like negative numbers
        for (const option_string of action.option_strings) {
            if (this._negative_number_matcher.test(option_string)) {
                if (!this._has_negative_number_optionals.length) {
                    this._has_negative_number_optionals.push(true)
                }
            }
        }

        // return the created action
        return action
    }

    _remove_action (action) {
        _array_remove(this._actions, action)
    }

    _add_container_actions (container) {
        // collect groups by titles
        const title_group_map = {}
        for (const group of this._action_groups) {
            if (group.title in title_group_map) {
                const msg = 'cannot merge actions - two groups are named %r'
                throw new TypeError(sub(msg, group.title))
            }
            title_group_map[group.title] = group
        }

        // map each action to its group
        const group_map = new Map()
        for (const group of container._action_groups) {

            // if a group with the title exists, use that, otherwise
            // create a new group matching the container's group
            if (!(group.title in title_group_map)) {
                title_group_map[group.title] = this.add_argument_group({
                    title: group.title,
                    description: group.description,
                    conflict_handler: group.conflict_handler
                })
            }

            // map the actions to their new group
            for (const action of group._group_actions) {
                group_map.set(action, title_group_map[group.title])
            }
        }

        // add container's mutually exclusive groups
        // NOTE: if add_mutually_exclusive_group ever gains title= and
        // description= then this code will need to be expanded as above
        for (const group of container._mutually_exclusive_groups) {
            const mutex_group = this.add_mutually_exclusive_group({
                required: group.required
            })

            // map the actions to their new mutex group
            for (const action of group._group_actions) {
                group_map.set(action, mutex_group)
            }
        }

        // add all actions to this container or their group
        for (const action of container._actions) {
            group_map.get(action)._add_action(action)
        }
    }

    _get_positional_kwargs () {
        const [
            dest,
            kwargs
        ] = _parse_opts(arguments, {
            dest: no_default,
            '**kwargs': no_default
        })

        // make sure required is not specified
        if ('required' in kwargs) {
            const msg = "'required' is an invalid argument for positionals"
            throw new TypeError(msg)
        }

        // mark positional arguments as required if at least one is
        // always required
        if (![OPTIONAL, ZERO_OR_MORE].includes(kwargs.nargs)) {
            kwargs.required = true
        }
        if (kwargs.nargs === ZERO_OR_MORE && !('default' in kwargs)) {
            kwargs.required = true
        }

        // return the keyword arguments with no option strings
        return Object.assign(kwargs, { dest, option_strings: [] })
    }

    _get_optional_kwargs () {
        const [
            args,
            kwargs
        ] = _parse_opts(arguments, {
            '*args': no_default,
            '**kwargs': no_default
        })

        // determine short and long option strings
        const option_strings = []
        const long_option_strings = []
        let option_string
        for (option_string of args) {
            // error on strings that don't start with an appropriate prefix
            if (!this.prefix_chars.includes(option_string[0])) {
                const args = {option: option_string,
                            prefix_chars: this.prefix_chars}
                const msg = 'invalid option string %(option)r: ' +
                          'must start with a character %(prefix_chars)r'
                throw new TypeError(sub(msg, args))
            }

            // strings starting with two prefix characters are long options
            option_strings.push(option_string)
            if (option_string.length > 1 && this.prefix_chars.includes(option_string[1])) {
                long_option_strings.push(option_string)
            }
        }

        // infer destination, '--foo-bar' -> 'foo_bar' and '-x' -> 'x'
        let dest = kwargs.dest
        delete kwargs.dest
        if (dest === undefined) {
            let dest_option_string
            if (long_option_strings.length) {
                dest_option_string = long_option_strings[0]
            } else {
                dest_option_string = option_strings[0]
            }
            dest = _string_lstrip(dest_option_string, this.prefix_chars)
            if (!dest) {
                const msg = 'dest= is required for options like %r'
                throw new TypeError(sub(msg, option_string))
            }
            dest = dest.replace(/-/g, '_')
        }

        // return the updated keyword arguments
        return Object.assign(kwargs, { dest, option_strings })
    }

    _pop_action_class (kwargs, default_value = undefined) {
        const action = getattr(kwargs, 'action', default_value)
        delete kwargs.action
        return this._registry_get('action', action, action)
    }

    _get_handler () {
        // determine function from conflict handler string
        const handler_func_name = sub('_handle_conflict_%s', this.conflict_handler)
        if (typeof this[handler_func_name] === 'function') {
            return this[handler_func_name]
        } else {
            const msg = 'invalid conflict_resolution value: %r'
            throw new TypeError(sub(msg, this.conflict_handler))
        }
    }

    _check_conflict (action) {

        // find all options that conflict with this option
        const confl_optionals = []
        for (const option_string of action.option_strings) {
            if (hasattr(this._option_string_actions, option_string)) {
                const confl_optional = this._option_string_actions[option_string]
                confl_optionals.push([option_string, confl_optional])
            }
        }

        // resolve any conflicts
        if (confl_optionals.length) {
            const conflict_handler = this._get_handler()
            conflict_handler.call(this, action, confl_optionals)
        }
    }

    _handle_conflict_error (action, conflicting_actions) {
        const message = conflicting_actions.length === 1 ?
            'conflicting option string: %s' :
            'conflicting option strings: %s'
        const conflict_string = conflicting_actions.map(([option_string]) => option_string).join(', ')
        throw new ArgumentError(action, sub(message, conflict_string))
    }

    _handle_conflict_resolve (action, conflicting_actions) {

        // remove all conflicting options
        for (const [option_string, action] of conflicting_actions) {

            // remove the conflicting option
            _array_remove(action.option_strings, option_string)
            delete this._option_string_actions[option_string]

            // if the option now has no option string, remove it from the
            // container holding it
            if (!action.option_strings.length) {
                action.container._remove_action(action)
            }
        }
    }
})


const _ArgumentGroup = _callable(class _ArgumentGroup extends _ActionsContainer {

    constructor () {
        const [
            container,
            title,
            description,
            kwargs
        ] = _parse_opts(arguments, {
            container: no_default,
            title: undefined,
            description: undefined,
            '**kwargs': no_default
        })

        // add any missing keyword arguments by checking the container
        setdefault(kwargs, 'conflict_handler', container.conflict_handler)
        setdefault(kwargs, 'prefix_chars', container.prefix_chars)
        setdefault(kwargs, 'argument_default', container.argument_default)
        super(Object.assign({ description }, kwargs))

        // group attributes
        this.title = title
        this._group_actions = []

        // share most attributes with the container
        this._registries = container._registries
        this._actions = container._actions
        this._option_string_actions = container._option_string_actions
        this._defaults = container._defaults
        this._has_negative_number_optionals =
            container._has_negative_number_optionals
        this._mutually_exclusive_groups = container._mutually_exclusive_groups
    }

    _add_action (action) {
        action = super._add_action(action)
        this._group_actions.push(action)
        return action
    }

    _remove_action (action) {
        super._remove_action(action)
        _array_remove(this._group_actions, action)
    }
})


const _MutuallyExclusiveGroup = _callable(class _MutuallyExclusiveGroup extends _ArgumentGroup {

    constructor () {
        const [
            container,
            required
        ] = _parse_opts(arguments, {
            container: no_default,
            required: false
        })

        super(container)
        this.required = required
        this._container = container
    }

    _add_action (action) {
        if (action.required) {
            const msg = 'mutually exclusive arguments must be optional'
            throw new TypeError(msg)
        }
        action = this._container._add_action(action)
        this._group_actions.push(action)
        return action
    }

    _remove_action (action) {
        this._container._remove_action(action)
        _array_remove(this._group_actions, action)
    }
})


const ArgumentParser = _callable(class ArgumentParser extends _AttributeHolder(_ActionsContainer) {
    /*
     *  Object for parsing command line strings into Python objects.
     *
     *  Keyword Arguments:
     *      - prog -- The name of the program (default: sys.argv[0])
     *      - usage -- A usage message (default: auto-generated from arguments)
     *      - description -- A description of what the program does
     *      - epilog -- Text following the argument descriptions
     *      - parents -- Parsers whose arguments should be copied into this one
     *      - formatter_class -- HelpFormatter class for printing help messages
     *      - prefix_chars -- Characters that prefix optional arguments
     *      - fromfile_prefix_chars -- Characters that prefix files containing
     *          additional arguments
     *      - argument_default -- The default value for all arguments
     *      - conflict_handler -- String indicating how to handle conflicts
     *      - add_help -- Add a -h/-help option
     *      - allow_abbrev -- Allow long options to be abbreviated unambiguously
     *      - exit_on_error -- Determines whether or not ArgumentParser exits with
     *          error info when an error occurs
     */

    constructor () {
        let [
            prog,
            usage,
            description,
            epilog,
            parents,
            formatter_class,
            prefix_chars,
            fromfile_prefix_chars,
            argument_default,
            conflict_handler,
            add_help,
            allow_abbrev,
            exit_on_error
        ] = _parse_opts(arguments, {
            prog: undefined,
            usage: undefined,
            description: undefined,
            epilog: undefined,
            parents: [],
            formatter_class: HelpFormatter,
            prefix_chars: '-',
            fromfile_prefix_chars: undefined,
            argument_default: undefined,
            conflict_handler: 'error',
            add_help: true,
            allow_abbrev: true,
            exit_on_error: true
        })

        super({
            description,
            prefix_chars,
            argument_default,
            conflict_handler
        })

        // default setting for prog
        if (prog === undefined) {
            prog = path.basename(get_argv()[0] || '')
        }

        this.prog = prog
        this.usage = usage
        this.epilog = epilog
        this.formatter_class = formatter_class
        this.fromfile_prefix_chars = fromfile_prefix_chars
        this.add_help = add_help
        this.allow_abbrev = allow_abbrev
        this.exit_on_error = exit_on_error

        this._positionals = this.add_argument_group('positional arguments')
        this._optionals = this.add_argument_group('options')
        this._subparsers = undefined

        // register types
        function identity (string) {
            return string
        }
        this.register('type', undefined, identity)
        this.register('type', null, identity)
        this.register('type', 'auto', identity)
        this.register('type', 'int', function (x) {
            const result = Number(x)
            if (!Number.isInteger(result)) {
                throw new TypeError(sub('could not convert string to int: %r', x))
            }
            return result
        })
        this.register('type', 'float', function (x) {
            const result = Number(x)
            if (isNaN(result)) {
                throw new TypeError(sub('could not convert string to float: %r', x))
            }
            return result
        })
        this.register('type', 'str', String)

        // add help argument if necessary
        // (using explicit default to override global argument_default)
        const default_prefix = prefix_chars.includes('-') ? '-' : prefix_chars[0]
        if (this.add_help) {
            this.add_argument(
                default_prefix + 'h',
                default_prefix.repeat(2) + 'help',
                {
                    action: 'help',
                    default: SUPPRESS,
                    help: 'show this help message and exit'
                }
            )
        }
        // add parent arguments and defaults
        for (const parent of parents) {
            this._add_container_actions(parent)
            Object.assign(this._defaults, parent._defaults)
        }
    }

    // =======================
    // Pretty __repr__ methods
    // =======================
    _get_kwargs () {
        const names = [
            'prog',
            'usage',
            'description',
            'formatter_class',
            'conflict_handler',
            'add_help'
        ]
        return names.map(name => [name, getattr(this, name)])
    }

    // ==================================
    // Optional/Positional adding methods
    // ==================================
    add_subparsers () {
        const [
            kwargs
        ] = _parse_opts(arguments, {
            '**kwargs': no_default
        })

        if (this._subparsers !== undefined) {
            this.error('cannot have multiple subparser arguments')
        }

        // add the parser class to the arguments if it's not present
        setdefault(kwargs, 'parser_class', this.constructor)

        if ('title' in kwargs || 'description' in kwargs) {
            const title = getattr(kwargs, 'title', 'subcommands')
            const description = getattr(kwargs, 'description', undefined)
            delete kwargs.title
            delete kwargs.description
            this._subparsers = this.add_argument_group(title, description)
        } else {
            this._subparsers = this._positionals
        }

        // prog defaults to the usage message of this parser, skipping
        // optional arguments and with no "usage:" prefix
        if (kwargs.prog === undefined) {
            const formatter = this._get_formatter()
            const positionals = this._get_positional_actions()
            const groups = this._mutually_exclusive_groups
            formatter.add_usage(this.usage, positionals, groups, '')
            kwargs.prog = formatter.format_help().trim()
        }

        // create the parsers action and add it to the positionals list
        const parsers_class = this._pop_action_class(kwargs, 'parsers')
        // eslint-disable-next-line new-cap
        const action = new parsers_class(Object.assign({ option_strings: [] }, kwargs))
        this._subparsers._add_action(action)

        // return the created parsers action
        return action
    }

    _add_action (action) {
        if (action.option_strings.length) {
            this._optionals._add_action(action)
        } else {
            this._positionals._add_action(action)
        }
        return action
    }

    _get_optional_actions () {
        return this._actions.filter(action => action.option_strings.length)
    }

    _get_positional_actions () {
        return this._actions.filter(action => !action.option_strings.length)
    }

    // =====================================
    // Command line argument parsing methods
    // =====================================
    parse_args (args = undefined, namespace = undefined) {
        let argv
        [args, argv] = this.parse_known_args(args, namespace)
        if (argv && argv.length > 0) {
            const msg = 'unrecognized arguments: %s'
            this.error(sub(msg, argv.join(' ')))
        }
        return args
    }

    parse_known_args (args = undefined, namespace = undefined) {
        if (args === undefined) {
            args = get_argv().slice(1)
        }

        // default Namespace built from parser defaults
        if (namespace === undefined) {
            namespace = new Namespace()
        }

        // add any action defaults that aren't present
        for (const action of this._actions) {
            if (action.dest !== SUPPRESS) {
                if (!hasattr(namespace, action.dest)) {
                    if (action.default !== SUPPRESS) {
                        setattr(namespace, action.dest, action.default)
                    }
                }
            }
        }

        // add any parser defaults that aren't present
        for (const dest of Object.keys(this._defaults)) {
            if (!hasattr(namespace, dest)) {
                setattr(namespace, dest, this._defaults[dest])
            }
        }

        // parse the arguments and exit if there are any errors
        if (this.exit_on_error) {
            try {
                [namespace, args] = this._parse_known_args(args, namespace)
            } catch (err) {
                if (err instanceof ArgumentError) {
                    this.error(err.message)
                } else {
                    throw err
                }
            }
        } else {
            [namespace, args] = this._parse_known_args(args, namespace)
        }

        if (hasattr(namespace, _UNRECOGNIZED_ARGS_ATTR)) {
            args = args.concat(getattr(namespace, _UNRECOGNIZED_ARGS_ATTR))
            delattr(namespace, _UNRECOGNIZED_ARGS_ATTR)
        }

        return [namespace, args]
    }

    _parse_known_args (arg_strings, namespace) {
        // replace arg strings that are file references
        if (this.fromfile_prefix_chars !== undefined) {
            arg_strings = this._read_args_from_files(arg_strings)
        }

        // map all mutually exclusive arguments to the other arguments
        // they can't occur with
        const action_conflicts = new Map()
        for (const mutex_group of this._mutually_exclusive_groups) {
            const group_actions = mutex_group._group_actions
            for (const [i, mutex_action] of Object.entries(mutex_group._group_actions)) {
                let conflicts = action_conflicts.get(mutex_action) || []
                conflicts = conflicts.concat(group_actions.slice(0, +i))
                conflicts = conflicts.concat(group_actions.slice(+i + 1))
                action_conflicts.set(mutex_action, conflicts)
            }
        }

        // find all option indices, and determine the arg_string_pattern
        // which has an 'O' if there is an option at an index,
        // an 'A' if there is an argument, or a '-' if there is a '--'
        const option_string_indices = {}
        const arg_string_pattern_parts = []
        const arg_strings_iter = Object.entries(arg_strings)[Symbol.iterator]()
        for (let [i, arg_string] of arg_strings_iter) {

            // all args after -- are non-options
            if (arg_string === '--') {
                arg_string_pattern_parts.push('-')
                for ([i, arg_string] of arg_strings_iter) {
                    arg_string_pattern_parts.push('A')
                }

            // otherwise, add the arg to the arg strings
            // and note the index if it was an option
            } else {
                const option_tuple = this._parse_optional(arg_string)
                let pattern
                if (option_tuple === undefined) {
                    pattern = 'A'
                } else {
                    option_string_indices[i] = option_tuple
                    pattern = 'O'
                }
                arg_string_pattern_parts.push(pattern)
            }
        }

        // join the pieces together to form the pattern
        const arg_strings_pattern = arg_string_pattern_parts.join('')

        // converts arg strings to the appropriate and then takes the action
        const seen_actions = new Set()
        const seen_non_default_actions = new Set()
        let extras

        const take_action = (action, argument_strings, option_string = undefined) => {
            seen_actions.add(action)
            const argument_values = this._get_values(action, argument_strings)

            // error if this argument is not allowed with other previously
            // seen arguments, assuming that actions that use the default
            // value don't really count as "present"
            if (argument_values !== action.default) {
                seen_non_default_actions.add(action)
                for (const conflict_action of action_conflicts.get(action) || []) {
                    if (seen_non_default_actions.has(conflict_action)) {
                        const msg = 'not allowed with argument %s'
                        const action_name = _get_action_name(conflict_action)
                        throw new ArgumentError(action, sub(msg, action_name))
                    }
                }
            }

            // take the action if we didn't receive a SUPPRESS value
            // (e.g. from a default)
            if (argument_values !== SUPPRESS) {
                action(this, namespace, argument_values, option_string)
            }
        }

        // function to convert arg_strings into an optional action
        const consume_optional = start_index => {

            // get the optional identified at this index
            const option_tuple = option_string_indices[start_index]
            let [action, option_string, explicit_arg] = option_tuple

            // identify additional optionals in the same arg string
            // (e.g. -xyz is the same as -x -y -z if no args are required)
            const action_tuples = []
            let stop
            for (;;) {

                // if we found no optional action, skip it
                if (action === undefined) {
                    extras.push(arg_strings[start_index])
                    return start_index + 1
                }

                // if there is an explicit argument, try to match the
                // optional's string arguments to only this
                if (explicit_arg !== undefined) {
                    const arg_count = this._match_argument(action, 'A')

                    // if the action is a single-dash option and takes no
                    // arguments, try to parse more single-dash options out
                    // of the tail of the option string
                    const chars = this.prefix_chars
                    if (arg_count === 0 &&
                        !chars.includes(option_string[1]) &&
                        explicit_arg !== '') {
                        action_tuples.push([action, [], option_string])
                        const char = option_string[0]
                        option_string = char + explicit_arg[0]
                        const new_explicit_arg = explicit_arg.slice(1) || undefined
                        const optionals_map = this._option_string_actions
                        if (hasattr(optionals_map, option_string)) {
                            action = optionals_map[option_string]
                            explicit_arg = new_explicit_arg
                        } else {
                            const msg = 'ignored explicit argument %r'
                            throw new ArgumentError(action, sub(msg, explicit_arg))
                        }

                    // if the action expect exactly one argument, we've
                    // successfully matched the option; exit the loop
                    } else if (arg_count === 1) {
                        stop = start_index + 1
                        const args = [explicit_arg]
                        action_tuples.push([action, args, option_string])
                        break

                    // error if a double-dash option did not use the
                    // explicit argument
                    } else {
                        const msg = 'ignored explicit argument %r'
                        throw new ArgumentError(action, sub(msg, explicit_arg))
                    }

                // if there is no explicit argument, try to match the
                // optional's string arguments with the following strings
                // if successful, exit the loop
                } else {
                    const start = start_index + 1
                    const selected_patterns = arg_strings_pattern.slice(start)
                    const arg_count = this._match_argument(action, selected_patterns)
                    stop = start + arg_count
                    const args = arg_strings.slice(start, stop)
                    action_tuples.push([action, args, option_string])
                    break
                }
            }

            // add the Optional to the list and return the index at which
            // the Optional's string args stopped
            assert(action_tuples.length)
            for (const [action, args, option_string] of action_tuples) {
                take_action(action, args, option_string)
            }
            return stop
        }

        // the list of Positionals left to be parsed; this is modified
        // by consume_positionals()
        let positionals = this._get_positional_actions()

        // function to convert arg_strings into positional actions
        const consume_positionals = start_index => {
            // match as many Positionals as possible
            const selected_pattern = arg_strings_pattern.slice(start_index)
            const arg_counts = this._match_arguments_partial(positionals, selected_pattern)

            // slice off the appropriate arg strings for each Positional
            // and add the Positional and its args to the list
            for (let i = 0; i < positionals.length && i < arg_counts.length; i++) {
                const action = positionals[i]
                const arg_count = arg_counts[i]
                const args = arg_strings.slice(start_index, start_index + arg_count)
                start_index += arg_count
                take_action(action, args)
            }

            // slice off the Positionals that we just parsed and return the
            // index at which the Positionals' string args stopped
            positionals = positionals.slice(arg_counts.length)
            return start_index
        }

        // consume Positionals and Optionals alternately, until we have
        // passed the last option string
        extras = []
        let start_index = 0
        const max_option_string_index = Math.max(-1, ...Object.keys(option_string_indices).map(Number))
        while (start_index <= max_option_string_index) {

            // consume any Positionals preceding the next option
            const next_option_string_index = Math.min(

                ...Object.keys(option_string_indices).map(Number).filter(index => index >= start_index)
            )
            if (start_index !== next_option_string_index) {
                const positionals_end_index = consume_positionals(start_index)

                // only try to parse the next optional if we didn't consume
                // the option string during the positionals parsing
                if (positionals_end_index > start_index) {
                    start_index = positionals_end_index
                    continue
                } else {
                    start_index = positionals_end_index
                }
            }

            // if we consumed all the positionals we could and we're not
            // at the index of an option string, there were extra arguments
            if (!(start_index in option_string_indices)) {
                const strings = arg_strings.slice(start_index, next_option_string_index)
                extras = extras.concat(strings)
                start_index = next_option_string_index
            }

            // consume the next optional and any arguments for it
            start_index = consume_optional(start_index)
        }

        // consume any positionals following the last Optional
        const stop_index = consume_positionals(start_index)

        // if we didn't consume all the argument strings, there were extras
        extras = extras.concat(arg_strings.slice(stop_index))

        // make sure all required actions were present and also convert
        // action defaults which were not given as arguments
        const required_actions = []
        for (const action of this._actions) {
            if (!seen_actions.has(action)) {
                if (action.required) {
                    required_actions.push(_get_action_name(action))
                } else {
                    // Convert action default now instead of doing it before
                    // parsing arguments to avoid calling convert functions
                    // twice (which may fail) if the argument was given, but
                    // only if it was defined already in the namespace
                    if (action.default !== undefined &&
                        typeof action.default === 'string' &&
                        hasattr(namespace, action.dest) &&
                        action.default === getattr(namespace, action.dest)) {
                        setattr(namespace, action.dest,
                                this._get_value(action, action.default))
                    }
                }
            }
        }

        if (required_actions.length) {
            this.error(sub('the following arguments are required: %s',
                       required_actions.join(', ')))
        }

        // make sure all required groups had one option present
        for (const group of this._mutually_exclusive_groups) {
            if (group.required) {
                let no_actions_used = true
                for (const action of group._group_actions) {
                    if (seen_non_default_actions.has(action)) {
                        no_actions_used = false
                        break
                    }
                }

                // if no actions were used, report the error
                if (no_actions_used) {
                    const names = group._group_actions
                        .filter(action => action.help !== SUPPRESS)
                        .map(action => _get_action_name(action))
                    const msg = 'one of the arguments %s is required'
                    this.error(sub(msg, names.join(' ')))
                }
            }
        }

        // return the updated namespace and the extra arguments
        return [namespace, extras]
    }

    _read_args_from_files (arg_strings) {
        // expand arguments referencing files
        let new_arg_strings = []
        for (const arg_string of arg_strings) {

            // for regular arguments, just add them back into the list
            if (!arg_string || !this.fromfile_prefix_chars.includes(arg_string[0])) {
                new_arg_strings.push(arg_string)

            // replace arguments referencing files with the file content
            } else {
                try {
                    const args_file = fs.readFileSync(arg_string.slice(1), 'utf8')
                    let arg_strings = []
                    for (const arg_line of splitlines(args_file)) {
                        for (const arg of this.convert_arg_line_to_args(arg_line)) {
                            arg_strings.push(arg)
                        }
                    }
                    arg_strings = this._read_args_from_files(arg_strings)
                    new_arg_strings = new_arg_strings.concat(arg_strings)
                } catch (err) {
                    this.error(err.message)
                }
            }
        }

        // return the modified argument list
        return new_arg_strings
    }

    convert_arg_line_to_args (arg_line) {
        return [arg_line]
    }

    _match_argument (action, arg_strings_pattern) {
        // match the pattern for this action to the arg strings
        const nargs_pattern = this._get_nargs_pattern(action)
        const match = arg_strings_pattern.match(new RegExp('^' + nargs_pattern))

        // raise an exception if we weren't able to find a match
        if (match === null) {
            const nargs_errors = {
                undefined: 'expected one argument',
                [OPTIONAL]: 'expected at most one argument',
                [ONE_OR_MORE]: 'expected at least one argument'
            }
            let msg = nargs_errors[action.nargs]
            if (msg === undefined) {
                msg = sub(action.nargs === 1 ? 'expected %s argument' : 'expected %s arguments', action.nargs)
            }
            throw new ArgumentError(action, msg)
        }

        // return the number of arguments matched
        return match[1].length
    }

    _match_arguments_partial (actions, arg_strings_pattern) {
        // progressively shorten the actions list by slicing off the
        // final actions until we find a match
        let result = []
        for (const i of range(actions.length, 0, -1)) {
            const actions_slice = actions.slice(0, i)
            const pattern = actions_slice.map(action => this._get_nargs_pattern(action)).join('')
            const match = arg_strings_pattern.match(new RegExp('^' + pattern))
            if (match !== null) {
                result = result.concat(match.slice(1).map(string => string.length))
                break
            }
        }

        // return the list of arg string counts
        return result
    }

    _parse_optional (arg_string) {
        // if it's an empty string, it was meant to be a positional
        if (!arg_string) {
            return undefined
        }

        // if it doesn't start with a prefix, it was meant to be positional
        if (!this.prefix_chars.includes(arg_string[0])) {
            return undefined
        }

        // if the option string is present in the parser, return the action
        if (arg_string in this._option_string_actions) {
            const action = this._option_string_actions[arg_string]
            return [action, arg_string, undefined]
        }

        // if it's just a single character, it was meant to be positional
        if (arg_string.length === 1) {
            return undefined
        }

        // if the option string before the "=" is present, return the action
        if (arg_string.includes('=')) {
            const [option_string, explicit_arg] = _string_split(arg_string, '=', 1)
            if (option_string in this._option_string_actions) {
                const action = this._option_string_actions[option_string]
                return [action, option_string, explicit_arg]
            }
        }

        // search through all possible prefixes of the option string
        // and all actions in the parser for possible interpretations
        const option_tuples = this._get_option_tuples(arg_string)

        // if multiple actions match, the option string was ambiguous
        if (option_tuples.length > 1) {
            const options = option_tuples.map(([, option_string]) => option_string).join(', ')
            const args = {option: arg_string, matches: options}
            const msg = 'ambiguous option: %(option)s could match %(matches)s'
            this.error(sub(msg, args))

        // if exactly one action matched, this segmentation is good,
        // so return the parsed action
        } else if (option_tuples.length === 1) {
            const [option_tuple] = option_tuples
            return option_tuple
        }

        // if it was not found as an option, but it looks like a negative
        // number, it was meant to be positional
        // unless there are negative-number-like options
        if (this._negative_number_matcher.test(arg_string)) {
            if (!this._has_negative_number_optionals.length) {
                return undefined
            }
        }

        // if it contains a space, it was meant to be a positional
        if (arg_string.includes(' ')) {
            return undefined
        }

        // it was meant to be an optional but there is no such option
        // in this parser (though it might be a valid option in a subparser)
        return [undefined, arg_string, undefined]
    }

    _get_option_tuples (option_string) {
        const result = []

        // option strings starting with two prefix characters are only
        // split at the '='
        const chars = this.prefix_chars
        if (chars.includes(option_string[0]) && chars.includes(option_string[1])) {
            if (this.allow_abbrev) {
                let option_prefix, explicit_arg
                if (option_string.includes('=')) {
                    [option_prefix, explicit_arg] = _string_split(option_string, '=', 1)
                } else {
                    option_prefix = option_string
                    explicit_arg = undefined
                }
                for (const option_string of Object.keys(this._option_string_actions)) {
                    if (option_string.startsWith(option_prefix)) {
                        const action = this._option_string_actions[option_string]
                        const tup = [action, option_string, explicit_arg]
                        result.push(tup)
                    }
                }
            }

        // single character options can be concatenated with their arguments
        // but multiple character options always have to have their argument
        // separate
        } else if (chars.includes(option_string[0]) && !chars.includes(option_string[1])) {
            const option_prefix = option_string
            const explicit_arg = undefined
            const short_option_prefix = option_string.slice(0, 2)
            const short_explicit_arg = option_string.slice(2)

            for (const option_string of Object.keys(this._option_string_actions)) {
                if (option_string === short_option_prefix) {
                    const action = this._option_string_actions[option_string]
                    const tup = [action, option_string, short_explicit_arg]
                    result.push(tup)
                } else if (option_string.startsWith(option_prefix)) {
                    const action = this._option_string_actions[option_string]
                    const tup = [action, option_string, explicit_arg]
                    result.push(tup)
                }
            }

        // shouldn't ever get here
        } else {
            this.error(sub('unexpected option string: %s', option_string))
        }

        // return the collected option tuples
        return result
    }

    _get_nargs_pattern (action) {
        // in all examples below, we have to allow for '--' args
        // which are represented as '-' in the pattern
        const nargs = action.nargs
        let nargs_pattern

        // the default (None) is assumed to be a single argument
        if (nargs === undefined) {
            nargs_pattern = '(-*A-*)'

        // allow zero or one arguments
        } else if (nargs === OPTIONAL) {
            nargs_pattern = '(-*A?-*)'

        // allow zero or more arguments
        } else if (nargs === ZERO_OR_MORE) {
            nargs_pattern = '(-*[A-]*)'

        // allow one or more arguments
        } else if (nargs === ONE_OR_MORE) {
            nargs_pattern = '(-*A[A-]*)'

        // allow any number of options or arguments
        } else if (nargs === REMAINDER) {
            nargs_pattern = '([-AO]*)'

        // allow one argument followed by any number of options or arguments
        } else if (nargs === PARSER) {
            nargs_pattern = '(-*A[-AO]*)'

        // suppress action, like nargs=0
        } else if (nargs === SUPPRESS) {
            nargs_pattern = '(-*-*)'

        // all others should be integers
        } else {
            nargs_pattern = sub('(-*%s-*)', 'A'.repeat(nargs).split('').join('-*'))
        }

        // if this is an optional action, -- is not allowed
        if (action.option_strings.length) {
            nargs_pattern = nargs_pattern.replace(/-\*/g, '')
            nargs_pattern = nargs_pattern.replace(/-/g, '')
        }

        // return the pattern
        return nargs_pattern
    }

    // ========================
    // Alt command line argument parsing, allowing free intermix
    // ========================

    parse_intermixed_args (args = undefined, namespace = undefined) {
        let argv
        [args, argv] = this.parse_known_intermixed_args(args, namespace)
        if (argv.length) {
            const msg = 'unrecognized arguments: %s'
            this.error(sub(msg, argv.join(' ')))
        }
        return args
    }

    parse_known_intermixed_args (args = undefined, namespace = undefined) {
        // returns a namespace and list of extras
        //
        // positional can be freely intermixed with optionals.  optionals are
        // first parsed with all positional arguments deactivated.  The 'extras'
        // are then parsed.  If the parser definition is incompatible with the
        // intermixed assumptions (e.g. use of REMAINDER, subparsers) a
        // TypeError is raised.
        //
        // positionals are 'deactivated' by setting nargs and default to
        // SUPPRESS.  This blocks the addition of that positional to the
        // namespace

        let extras
        const positionals = this._get_positional_actions()
        const a = positionals.filter(action => [PARSER, REMAINDER].includes(action.nargs))
        if (a.length) {
            throw new TypeError(sub('parse_intermixed_args: positional arg' +
                                    ' with nargs=%s', a[0].nargs))
        }

        for (const group of this._mutually_exclusive_groups) {
            for (const action of group._group_actions) {
                if (positionals.includes(action)) {
                    throw new TypeError('parse_intermixed_args: positional in' +
                                        ' mutuallyExclusiveGroup')
                }
            }
        }

        let save_usage
        try {
            save_usage = this.usage
            let remaining_args
            try {
                if (this.usage === undefined) {
                    // capture the full usage for use in error messages
                    this.usage = this.format_usage().slice(7)
                }
                for (const action of positionals) {
                    // deactivate positionals
                    action.save_nargs = action.nargs
                    // action.nargs = 0
                    action.nargs = SUPPRESS
                    action.save_default = action.default
                    action.default = SUPPRESS
                }
                [namespace, remaining_args] = this.parse_known_args(args,
                                                                      namespace)
                for (const action of positionals) {
                    // remove the empty positional values from namespace
                    const attr = getattr(namespace, action.dest)
                    if (Array.isArray(attr) && attr.length === 0) {

                        console.warn(sub('Do not expect %s in %s', action.dest, namespace))
                        delattr(namespace, action.dest)
                    }
                }
            } finally {
                // restore nargs and usage before exiting
                for (const action of positionals) {
                    action.nargs = action.save_nargs
                    action.default = action.save_default
                }
            }
            const optionals = this._get_optional_actions()
            try {
                // parse positionals.  optionals aren't normally required, but
                // they could be, so make sure they aren't.
                for (const action of optionals) {
                    action.save_required = action.required
                    action.required = false
                }
                for (const group of this._mutually_exclusive_groups) {
                    group.save_required = group.required
                    group.required = false
                }
                [namespace, extras] = this.parse_known_args(remaining_args,
                                                              namespace)
            } finally {
                // restore parser values before exiting
                for (const action of optionals) {
                    action.required = action.save_required
                }
                for (const group of this._mutually_exclusive_groups) {
                    group.required = group.save_required
                }
            }
        } finally {
            this.usage = save_usage
        }
        return [namespace, extras]
    }

    // ========================
    // Value conversion methods
    // ========================
    _get_values (action, arg_strings) {
        // for everything but PARSER, REMAINDER args, strip out first '--'
        if (![PARSER, REMAINDER].includes(action.nargs)) {
            try {
                _array_remove(arg_strings, '--')
            } catch (err) {}
        }

        let value
        // optional argument produces a default when not present
        if (!arg_strings.length && action.nargs === OPTIONAL) {
            if (action.option_strings.length) {
                value = action.const
            } else {
                value = action.default
            }
            if (typeof value === 'string') {
                value = this._get_value(action, value)
                this._check_value(action, value)
            }

        // when nargs='*' on a positional, if there were no command-line
        // args, use the default if it is anything other than None
        } else if (!arg_strings.length && action.nargs === ZERO_OR_MORE &&
              !action.option_strings.length) {
            if (action.default !== undefined) {
                value = action.default
                this._check_value(action, value)
            } else {
                // since arg_strings is always [] at this point
                // there is no need to use this._check_value(action, value)
                value = arg_strings
            }

        // single argument or optional argument produces a single value
        } else if (arg_strings.length === 1 && [undefined, OPTIONAL].includes(action.nargs)) {
            const arg_string = arg_strings[0]
            value = this._get_value(action, arg_string)
            this._check_value(action, value)

        // REMAINDER arguments convert all values, checking none
        } else if (action.nargs === REMAINDER) {
            value = arg_strings.map(v => this._get_value(action, v))

        // PARSER arguments convert all values, but check only the first
        } else if (action.nargs === PARSER) {
            value = arg_strings.map(v => this._get_value(action, v))
            this._check_value(action, value[0])

        // SUPPRESS argument does not put anything in the namespace
        } else if (action.nargs === SUPPRESS) {
            value = SUPPRESS

        // all other types of nargs produce a list
        } else {
            value = arg_strings.map(v => this._get_value(action, v))
            for (const v of value) {
                this._check_value(action, v)
            }
        }

        // return the converted value
        return value
    }

    _get_value (action, arg_string) {
        const type_func = this._registry_get('type', action.type, action.type)
        if (typeof type_func !== 'function') {
            const msg = '%r is not callable'
            throw new ArgumentError(action, sub(msg, type_func))
        }

        // convert the value to the appropriate type
        let result
        try {
            try {
                result = type_func(arg_string)
            } catch (err) {
                // Dear TC39, why would you ever consider making es6 classes not callable?
                // We had one universal interface, [[Call]], which worked for anything
                // (with familiar this-instanceof guard for classes). Now we have two.
                if (err instanceof TypeError &&
                    /Class constructor .* cannot be invoked without 'new'/.test(err.message)) {
                    // eslint-disable-next-line new-cap
                    result = new type_func(arg_string)
                } else {
                    throw err
                }
            }

        } catch (err) {
            // ArgumentTypeErrors indicate errors
            if (err instanceof ArgumentTypeError) {
                // let name = getattr(action.type, 'name', repr(action.type))
                const msg = err.message
                throw new ArgumentError(action, msg)

            // TypeErrors or ValueErrors also indicate errors
            } else if (err instanceof TypeError) {
                const name = getattr(action.type, 'name', repr(action.type))
                const args = {type: name, value: arg_string}
                const msg = 'invalid %(type)s value: %(value)r'
                throw new ArgumentError(action, sub(msg, args))
            } else {
                throw err
            }
        }

        // return the converted value
        return result
    }

    _check_value (action, value) {
        // converted value must be one of the choices (if specified)
        if (action.choices !== undefined && !_choices_to_array(action.choices).includes(value)) {
            const args = {value,
                        choices: _choices_to_array(action.choices).map(repr).join(', ')}
            const msg = 'invalid choice: %(value)r (choose from %(choices)s)'
            throw new ArgumentError(action, sub(msg, args))
        }
    }

    // =======================
    // Help-formatting methods
    // =======================
    format_usage () {
        const formatter = this._get_formatter()
        formatter.add_usage(this.usage, this._actions,
                            this._mutually_exclusive_groups)
        return formatter.format_help()
    }

    format_help () {
        const formatter = this._get_formatter()

        // usage
        formatter.add_usage(this.usage, this._actions,
                            this._mutually_exclusive_groups)

        // description
        formatter.add_text(this.description)

        // positionals, optionals and user-defined groups
        for (const action_group of this._action_groups) {
            formatter.start_section(action_group.title)
            formatter.add_text(action_group.description)
            formatter.add_arguments(action_group._group_actions)
            formatter.end_section()
        }

        // epilog
        formatter.add_text(this.epilog)

        // determine help from format above
        return formatter.format_help()
    }

    _get_formatter () {
        // eslint-disable-next-line new-cap
        return new this.formatter_class({ prog: this.prog })
    }

    // =====================
    // Help-printing methods
    // =====================
    print_usage (file = undefined) {
        if (file === undefined) file = process.stdout
        this._print_message(this.format_usage(), file)
    }

    print_help (file = undefined) {
        if (file === undefined) file = process.stdout
        this._print_message(this.format_help(), file)
    }

    _print_message (message, file = undefined) {
        if (message) {
            if (file === undefined) file = process.stderr
            file.write(message)
        }
    }

    // ===============
    // Exiting methods
    // ===============
    exit (status = 0, message = undefined) {
        if (message) {
            this._print_message(message, process.stderr)
        }
        process.exit(status)
    }

    error (message) {
        /*
         *  error(message: string)
         *
         *  Prints a usage message incorporating the message to stderr and
         *  exits.
         *
         *  If you override this in a subclass, it should not return -- it
         *  should either exit or raise an exception.
         */

        this.print_usage(process.stderr)
        const args = {prog: this.prog, message}
        this.exit(2, sub('%(prog)s: error: %(message)s\n', args))
    }
})


module.exports = {
    ArgumentParser,
    ArgumentError,
    ArgumentTypeError,
    BooleanOptionalAction,
    FileType,
    HelpFormatter,
    ArgumentDefaultsHelpFormatter,
    RawDescriptionHelpFormatter,
    RawTextHelpFormatter,
    MetavarTypeHelpFormatter,
    Namespace,
    Action,
    ONE_OR_MORE,
    OPTIONAL,
    PARSER,
    REMAINDER,
    SUPPRESS,
    ZERO_OR_MORE
}
