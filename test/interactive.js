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
 *	  conditions like racing.
 */
function interactive(script){
	// The main problem trying to emulate complex, time dependant, input;
	// I need some way to capture the error stacktrace. If we don't have that,
	// it's kinda hard to diagnose problems.
	script = "try{" + script + "} catch (e){ console.error(e); process.exit(1) }";

	let stacktrace = null; // Keep a place to store stacktraces for later;
	let node = subprocess.spawn("node", ["-i"], {
		// Puts all of our interactive node sessions into the root directory of the
		// repository to make sure we can find all our node modules automatically.
		pwd: path.resolve(__dirname, "../")
	});

	/* sinkhole; TODO: verbose logging of some kind for bug hunting */
	//node.stdout.on("data", (d)=> { console.log(d.toString()); });
	node.stderr.on("data", (d) => { stacktrace = d.toString(); });

	node.stdin.write(script, "UTF-8")
	node.stdin.write("\n.exit\n", "UTF-8"); // buffer will toss this in last.

	return new Promise((resolve, reject) => {
		node.on("close", (code) => {
			if (code == 0) resolve(null);
			else reject(new Error(stacktrace));
		});
	});

}

describe('Interactive NodeJS', () => {
	it('Can instantiate empty ArgumentParser interactively', async() => {
		await interactive(`
			var ArgumentParser = require('./lib/argparse').ArgumentParser;

			let parser = new ArgumentParser();
		`);
	});
});
