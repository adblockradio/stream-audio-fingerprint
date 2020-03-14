// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Copyright (c) 2018 Alexandre Storelli
const md5 = require('md5');

const decoder = require('child_process').spawn('ffmpeg', [
	'-i', 'pipe:0',
	'-acodec', 'pcm_s16le',
	'-ar', 22050,
	'-ac', 1,
	'-f', 'wav',
	'-v', 'fatal',
	'pipe:1'
], { stdio: ['pipe', 'pipe', process.stderr] });
process.stdin.pipe(decoder.stdin); //.write(data);

/**
 * BEGIN TEMP
 */
/*
process.stdin.on("data", function(data) {
	console.log(data);
});

decoder.stdout.on("end", function() {
	console.log("stream ended");
});
*/
decoder.stdout.on("data", function(data) {
	// to compare outputs from ffmpeg
	// console.log(md5(data.toString()));
});
/**
 * END TEMP
 */

const Codegen = require("./codegen_landmark.js");
const fingerprinter = new Codegen();
decoder.stdout.pipe(fingerprinter);

fingerprinter.on("data", function(data) {
	// for (let i=0; i<data.tcodes.length; i++) {
	// 	console.log("time=" + data.tcodes[i] + " fingerprint=" + data.hcodes[i]);
	// }
});

fingerprinter.on("end", function() {
	console.log("fingerprints stream ended");
});
