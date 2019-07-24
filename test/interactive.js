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
 * There are limits to how execution can be split based on the REPL model.
 */
function interactive(script){ // or lines
	// if (! Array.isArray(script)){
	// 	if ( (typeof script) == (typeof "") )
	// 		script = script.split("\n").map(s => s+"\n");
	// 	else
	// 		// TODO: better error handling
	// 		console.error("derp");
	// }

	// script.unshift('try{');
	// script.push('');

	// here's my limitation pretty much.
	script = "try{" + script + "} catch (e){ console.error(e); process.exit(1) }";
	let stacktrace = null;

	let node = subprocess.spawn("node", ["-i"], {
		// make sure we can find all our node modules automatically.
		pwd: path.resolve(__dirname, "../")
	});
	/*sinkhole; TODO: something usefull here*/
	//node.stdout.on("data", (d)=> { console.log(d.toString()); });
	node.stderr.on("data", (d) => { stacktrace = d.toString(); });

	// Too lazy to worry about the buffer clogging rn.
	// Not enough data to make that happen yet.
	//script.forEach( line => node.stdin.write(line, "UTF-8") );
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
	// If only this would have worked as nicely as I'd liked.
	// But now, we have to do things the hard way apparently.
	//
	// it('All Scripted Tests Pass Interactively', () => {
	// 	fs.readdirSync(__dirname).forEach(async (filename)=>{
	// 		switch (filename){
	// 			// skip this file to avoid loop
	// 			case "interactive.js": case "fixtures": return;
	// 		}
	// 		let fullpath = path.join(__dirname, filename);
	//
	// 		// spawn a new subprocess for each test just to make sure we have a
	// 		// clean environment for working with.
	//
	// 		let node = subprocess.spawn("node", ["-i"], {
	// 			// ... okay that wasn't the problem after all.
	// 			argv0: "", // interactive mode should not have argv[0] no matter what.
	// 		});
	// 		node.stdout.on("data", (d)=> { /*sinkhole; TODO: something usefull here*/ });
	// 		node.stderr.on("data", (d)=> {});
	//
	// 		let testPromise = new Promise((resolve, reject) => {
	// 			let done = false;
	//
	// 			node.on("close", (code) => {
	// 				if (code == 0) resolve(true);
	// 				else resolve(false);
	//
	// 				done = true;
	// 			});
	// 		});
	//
	// 		let injectedScript = fs.readFileSync(fullpath, { encoding: "UTF-8" });
	// 		let scriptlines = injectedScript.split("\n");
	// 		let inc = 1;
	//
	// 		node.stdin.on("drain", () => {
	// 			if (inc < scriptlines.length)
	// 				node.stdin.write(scriptlines[inc]+"\n", "UTF-8");
	// 			else
	// 				node.stdin.write("\n.exit\n", "UTF-8");
	//
	// 			inc++;
	// 		});
	//
	// 		node.stdin.write(scriptlines[0]+"\n", "UTF-8");
	//
	// 		assert(await testPromise);
	// 	});
	// });
	it('Can instantiate empty ArgumentParser interactively', async() => {
		await interactive(`
			var ArgumentParser = require('./lib/argparse').ArgumentParser;

			let parser = new ArgumentParser();
			console.log(process.argv);
		`);
	});
});
