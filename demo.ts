// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Copyright (c) 2018 Alexandre Storelli

import childProcess from 'child_process';
import { Codegen } from './lib/index';

const decoder = childProcess.spawn('ffmpeg', [
	'-i', 'pipe:0',
	'-acodec', 'pcm_s16le',
	'-ar', '22050',
	'-ac', '1',
	'-f', 'wav',
	'-v', 'fatal',
	'pipe:1'
], { stdio: ['pipe', 'pipe', process.stderr] });

const fingerprinter = new Codegen();

// Pipe ouput of ffmpeg decoder to fingerprinter
decoder.stdout.pipe(fingerprinter);

// Pipe input to this file to ffmpeg decoder
process.stdin.pipe(decoder.stdin);

// Log all the found fingerprints as they come in
fingerprinter.on('data', data => {
	for (let i = 0; i < data.tcodes.length; i++) {
		console.log(`time=${data.tcodes[i]} fingerprint=${data.hcodes[i]}`);
	}
});

fingerprinter.on('end', () => {
	console.log(`Fingerprints stream ended.`);
});
