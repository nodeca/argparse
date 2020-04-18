/***
 * Tests cases where argument parser instance was generated within an
 * interactive NodeJS instance rather than from a script NodeJS is executing.
 */

'use strict';

var subprocess = require('child_process');
var assert = require('assert');
var path = require('path');
var fs = require('fs');

var ArgumentParser = require('../lib/argparse').ArgumentParser;

/**
 * Does it's best to imitate interactively playing with node.
 * There are limits on how live execution can be emulated based on the
 * REPL model.
 *
 * TODO:
 *	* Add time dependant input to include capture potential for special,
 *	  conditions like racing. Had to make things sync to accomodate for
 *    old NodeJS version support.
 */
function interactive(script){
	// Wraps the script in a try loop that catches thrown javascript errors
	// so they aren't ignored unless the script application processes them.
	script = "try{ "+ script +" } catch (e){ console.error(e); process.exit(1) }";
	script = script + "\n.exit;";  // don't forget to exit when done.

	var node = subprocess.spawnSync("node", ["-i"], {
		// Puts all of our interactive node sessions into the root directory of the
		// repository to make sure we can find all our node modules automatically.
		pwd: path.resolve(__dirname, "../"),

		// Just shove script directly into the standard input for the program.
		input: script
	});

	if (node.status !== 0 && !node.signal) {
		throw Error(node.stderr);
	}
}

describe('Interactive NodeJS', () => {
	it('Can instantiate empty ArgumentParser interactively', function (){
		return interactive(
			"var ArgumentParser = require('./lib/argparse').ArgumentParser;" +
			"var parser = new ArgumentParser();"
		);
	});
});
