"use strict";
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Copyright (c) 2018 Alexandre Storelli
var child_process_1 = __importDefault(require("child_process"));
var index_1 = require("./lib/index");
var decoder = child_process_1.default.spawn('ffmpeg', [
    '-i', 'pipe:0',
    '-acodec', 'pcm_s16le',
    '-ar', '22050',
    '-ac', '1',
    '-f', 'wav',
    '-v', 'fatal',
    'pipe:1'
], { stdio: ['pipe', 'pipe', process.stderr] });
var fingerprinter = new index_1.Codegen();
// Pipe ouput of ffmpeg decoder to fingerprinter
decoder.stdout.pipe(fingerprinter);
// Pipe input to this file to ffmpeg decoder
process.stdin.pipe(decoder.stdin);
// Log all the found fingerprints as they come in
fingerprinter.on('data', function (data) {
    for (var i = 0; i < data.tcodes.length; i++) {
        console.log("time=" + data.tcodes[i] + " fingerprint=" + data.hcodes[i]);
    }
});
fingerprinter.on('end', function () {
    console.log("Fingerprints stream ended.");
});
