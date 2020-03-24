"use strict";
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Copyright (c) 2018 Alexandre Storelli
// Online implementation of the landmark audio fingerprinting algorithm.
// inspired by D. Ellis (2009), "Robust Landmark-Based Audio Fingerprinting"
// http://labrosa.ee.columbia.edu/matlab/fingerprint/
// itself inspired by Wang 2003 paper
// This module exports Codegen, an instance of stream.Transform
// By default, the writable side must be fed with an input signal with the following properties:
// - single channel
// - 16bit PCM
// - 22050 Hz sampling rate
//
// The readable side outputs objects of the form
// { tcodes: [time stamps], hcodes: [fingerprints] }
var stream_1 = require("stream");
var dsp_js_1 = __importDefault(require("dsp.js"));
var log = console.log;
var SAMPLING_RATE = 22050;
// sampling rate in Hz. If you change this, you must adapt WINDOW_DT and PRUNING_DT below to match your needs
// set the Nyquist frequency, SAMPLING_RATE/2, so as to match the max frequencies you want to get landmark fingerprints.
var BPS = 2;
// bytes per sample, 2 for 16 bit PCM. If you change this, you must change readInt16LE methods in the code.
var MNLM = 5;
// maximum number of local maxima for each spectrum. useful to tune the amount of fingerprints at output
var MPPP = 3;
// maximum of hashes each peak can lead to. useful to tune the amount of fingerprints at output
var NFFT = 512; // size of the FFT window. As we use real signals, the spectra will have nfft/2 points.
// Increasing it will give more spectral precision, less temporal precision.
// It may be good or bad depending on the sounds you want to match and on whether your input is deformed by EQ or noise.
var STEP = NFFT / 2; // 50 % overlap
// if SAMPLING_RATE is 22050 Hz, this leads to a sampling frequency
// fs = (SAMPLING_RATE / STEP) /s = 86/s, or dt = 1/fs = 11,61 ms.
// It's not really useful to change the overlap ratio.
var DT = 1 / (SAMPLING_RATE / STEP);
var FFT = new dsp_js_1.default.FFT(NFFT, SAMPLING_RATE);
var HWIN = new Array(NFFT); // prepare the hann window
for (var i = 0; i < NFFT; i++) {
    HWIN[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (NFFT - 1)));
}
var MASK_DECAY_LOG = Math.log(0.995); // threshold decay factor between frames.
// frequency window to generate landmark pairs, in units of DF = SAMPLING_RATE / NFFT. Values between 0 and NFFT/2
var IF_MIN = 0; // you can increase this to avoid having fingerprints for low frequencies
var IF_MAX = NFFT / 2; // you don't really want to decrease this, better reduce SAMPLING_RATE instead for faster computation.
var WINDOW_DF = 60; // we set this to avoid getting fingerprints linking very different frequencies.
// useful to reduce the amount of fingerprints. this can be maxed at NFFT/2 if you wish.
// time window to generate landmark pairs. time in units of dt (see definition above)
var WINDOW_DT = 96; // a little more than 1 sec.
var PRUNING_DT = 24; // about 250 ms, window to remove previous peaks that are superseded by later ones.
// tune the PRUNING_DT value to match the effects of MASK_DECAY_LOG.
// also, PRUNING_DT controls the latency of the pipeline. higher PRUNING_DT = higher latency
// prepare the values of exponential masks.
var MASK_DF = 3; // mask decay scale in DF units on the frequency axis.
var EWW = new Array(NFFT / 2);
for (var i_1 = 0; i_1 < NFFT / 2; i_1++) {
    EWW[i_1] = new Array(NFFT / 2);
    for (var j = 0; j < NFFT / 2; j++) {
        EWW[i_1][j] = -0.5 * Math.pow((j - i_1) / MASK_DF / Math.sqrt(i_1 + 3), 2); // gaussian mask is a polynom when working on the log-spectrum. log(exp()) = Id()
        // MASK_DF is multiplied by Math.sqrt(i+3) to have wider masks at higher frequencies
        // see the visualization out-thr.png for better insight of what is happening
    }
}
var VERBOSE = false;
var DO_PLOT = false; // limit the amount of audio processing to ~12s, generate plots and stop the routine.
if (DO_PLOT) {
    var fs = require('fs');
    var png = require('node-png').PNG;
}
var colormap = function (x, buffer, index, color) {
    var mask = [1, 1, 1];
    if (color == 'r') {
        mask = [0, 1, 1];
    }
    else if (color == 'b') {
        mask = [1, 1, 0];
    }
    else if (color == 'grey') {
        mask = [0.5, 0.5, 0.5];
    }
    var r = 255 * Math.sqrt(Math.min(Math.max(x, 0), 1));
    buffer[index] = Math.round(255 - r * mask[0]);
    buffer[index + 1] = Math.round(255 - r * mask[1]);
    buffer[index + 2] = Math.round(255 - r * mask[2]);
    buffer[index + 3] = 255; // alpha channel
};
var minmax = function (a, nDim) {
    var norm = [0, 0];
    for (var x = 0; x < a.length; x++) {
        if (nDim == 1) {
            norm[0] = Math.min(a[x], norm[0]);
            norm[1] = Math.max(a[x], norm[1]);
        }
        else if (nDim == 2) {
            for (var y = 0; y < a[0].length; y++) {
                norm[0] = Math.min(a[x][y], norm[0]);
                norm[1] = Math.max(a[x][y], norm[1]);
            }
        }
    }
    return norm;
};
var drawMarker = function (img, x, y, radius) {
    colormap(1, img.data, ((img.width * (img.height - 1 - y) + x) << 2), 'b');
    if (radius > 1) {
        drawMarker(img, x + 1, y, radius - 1);
        drawMarker(img, x, y + 1, radius - 1);
        drawMarker(img, x - 1, y, radius - 1);
        drawMarker(img, x, y - 1, radius - 1);
    }
    return;
};
var drawLine = function (img, x1, x2, y1, y2) {
    log("draw line x1=" + x1 + " y1=" + y1 + " x2=" + x2 + " y2=" + y2);
    var len = Math.round(Math.sqrt(Math.pow(y2 - y1, 2) + Math.pow(x2 - x1, 2)));
    for (var i_2 = 0; i_2 <= len; i_2++) {
        var x = x1 + Math.round((x2 - x1) * i_2 / len);
        var y = y1 + Math.round((y2 - y1) * i_2 / len);
        colormap(1, img.data, ((img.width * (img.height - 1 - y) + x) << 2), 'grey');
    }
};
var Codegen = /** @class */ (function (_super) {
    __extends(Codegen, _super);
    function Codegen(options) {
        if (options === void 0) { options = {}; }
        var _this = _super.call(this, __assign({ readableObjectMode: true, highWaterMark: 10 }, options)) || this;
        _this.buffer = new Buffer(0);
        _this.bufferDelta = 0;
        _this.stepIndex = 0;
        _this.marks = [];
        _this.threshold = new Array(NFFT / 2);
        for (var i_3 = 0; i_3 < NFFT / 2; i_3++) {
            _this.threshold[i_3] = -3;
        }
        if (DO_PLOT) {
            _this.fftData = [];
            _this.thrData = [];
            _this.peakData = [];
        }
        // Copy constants to be able to reference them in parent modules
        _this.DT = DT;
        _this.SAMPLING_RATE = SAMPLING_RATE;
        _this.BPS = BPS;
        return _this;
    }
    Codegen.prototype._write = function (chunk, _, next) {
        var _a, _b, _c;
        if (VERBOSE) {
            log("t=" + Math.round(this.stepIndex / STEP) + " received " + chunk.length + " bytes");
        }
        var tcodes = [];
        var hcodes = [];
        this.buffer = Buffer.concat([this.buffer, chunk]);
        while ((this.stepIndex + NFFT) * BPS < this.buffer.length + this.bufferDelta) {
            var data = new Array(NFFT); // window data
            // Fill the data, windowed (HWIN) and scaled
            for (var i_4 = 0, limit = NFFT; i_4 < limit; i_4++) {
                data[i_4] = HWIN[i_4] * this.buffer.readInt16LE((this.stepIndex + i_4) * BPS - this.bufferDelta) / Math.pow(2, 8 * BPS - 1);
            }
            this.stepIndex += STEP;
            FFT.forward(data); // compute FFT
            // log-normal surface
            for (var i_5 = IF_MIN; i_5 < IF_MAX; i_5++) {
                // the lower part of the spectrum is damped, the higher part is boosted, leading to a better peaks detection.
                FFT.spectrum[i_5] = Math.abs(FFT.spectrum[i_5]) * Math.sqrt(i_5 + 16);
            }
            if (DO_PLOT) {
                (_a = this.fftData) === null || _a === void 0 ? void 0 : _a.push(FFT.spectrum.slice());
            }
            // positive values of the difference between log spectrum and threshold
            var diff = new Array(NFFT / 2);
            for (var i_6 = IF_MIN; i_6 < IF_MAX; i_6++) {
                diff[i_6] = Math.max(Math.log(Math.max(1e-6, FFT.spectrum[i_6])) - this.threshold[i_6], 0);
            }
            // find at most MNLM local maxima in the spectrum at this timestamp.
            var iLocMax = new Array(MNLM);
            var vLocMax = new Array(MNLM);
            for (var i_7 = 0; i_7 < MNLM; i_7++) {
                iLocMax[i_7] = NaN;
                vLocMax[i_7] = Number.NEGATIVE_INFINITY;
            }
            for (var i_8 = IF_MIN + 1; i_8 < IF_MAX - 1; i_8++) {
                if (diff[i_8] > diff[i_8 - 1] && diff[i_8] > diff[i_8 + 1] && FFT.spectrum[i_8] > vLocMax[MNLM - 1]) { // if local maximum big enough
                    // insert the newly found local maximum in the ordered list of maxima
                    for (var j = MNLM - 1; j >= 0; j--) {
                        // navigate the table of previously saved maxima
                        if (j >= 1 && FFT.spectrum[i_8] > vLocMax[j - 1])
                            continue;
                        for (var k = MNLM - 1; k >= j + 1; k--) {
                            iLocMax[k] = iLocMax[k - 1]; // offset the bottom values
                            vLocMax[k] = vLocMax[k - 1];
                        }
                        iLocMax[j] = i_8;
                        vLocMax[j] = FFT.spectrum[i_8];
                        break;
                    }
                }
            }
            // now that we have the MNLM highest local maxima of the spectrum,
            // update the local maximum threshold so that only major peaks are taken into account.
            for (var i_9 = 0; i_9 < MNLM; i_9++) {
                if (vLocMax[i_9] > Number.NEGATIVE_INFINITY) {
                    for (var j = IF_MIN; j < IF_MAX; j++) {
                        this.threshold[j] = Math.max(this.threshold[j], Math.log(FFT.spectrum[iLocMax[i_9]]) + EWW[iLocMax[i_9]][j]);
                    }
                }
                else {
                    vLocMax.splice(i_9, MNLM - i_9); // remove the last elements.
                    iLocMax.splice(i_9, MNLM - i_9);
                    break;
                }
            }
            if (DO_PLOT) {
                var tmp = new Array(NFFT / 2);
                for (var i_10 = 0; i_10 < IF_MIN; i_10++) {
                    tmp[i_10] = 0;
                }
                for (var i_11 = IF_MIN; i_11 < IF_MAX; i_11++) {
                    tmp[i_11] = Math.exp(this.threshold[i_11]);
                }
                for (var i_12 = IF_MAX; i_12 < NFFT / 2; i_12++) {
                    tmp[i_12] = 0;
                }
                (_b = this.thrData) === null || _b === void 0 ? void 0 : _b.push(tmp);
            }
            // Array that stores local maxima for each time step
            this.marks.push({
                t: Math.round(this.stepIndex / STEP),
                i: iLocMax,
                v: vLocMax
            });
            // Remove previous (in time) maxima that would be too close and/or too low.
            var nm = this.marks.length;
            var t0 = nm - PRUNING_DT - 1;
            for (var i_13 = nm - 1; i_13 >= Math.max(t0 + 1, 0); i_13--) {
                for (var j = 0; j < this.marks[i_13].v.length; j++) {
                    if (this.marks[i_13].i[j] != 0 && Math.log(this.marks[i_13].v[j]) < this.threshold[this.marks[i_13].i[j]] + MASK_DECAY_LOG * (nm - 1 - i_13)) {
                        this.marks[i_13].v[j] = Number.NEGATIVE_INFINITY;
                        this.marks[i_13].i[j] = Number.NEGATIVE_INFINITY;
                    }
                }
            }
            // Generate hashes for peaks that can no longer be pruned. stepIndex:{f1:f2:deltaindex}
            var nFingersTotal = 0;
            if (t0 >= 0) {
                var m = this.marks[t0];
                loopCurrentPeaks: for (var i_14 = 0; i_14 < m.i.length; i_14++) {
                    var nFingers = 0;
                    loopPastTime: for (var j = t0; j >= Math.max(0, t0 - WINDOW_DT); j--) {
                        var m2 = this.marks[j];
                        loopPastPeaks: for (var k = 0; k < m2.i.length; k++) {
                            if (m2.i[k] != m.i[i_14] && Math.abs(m2.i[k] - m.i[i_14]) < WINDOW_DF) {
                                tcodes.push(m.t); //Math.round(this.stepIndex/STEP));
                                // in the hash: dt=(t0-j) has values between 0 and WINDOW_DT, so for <65 6 bits each
                                //				f1=m2.i[k] , f2=m.i[i] between 0 and NFFT/2-1, so for <255 8 bits each.
                                hcodes.push(m2.i[k] + NFFT / 2 * (m.i[i_14] + NFFT / 2 * (t0 - j)));
                                nFingers += 1;
                                nFingersTotal += 1;
                                if (DO_PLOT)
                                    (_c = this.peakData) === null || _c === void 0 ? void 0 : _c.push([m.t, j, m.i[i_14], m2.i[k]]); // t1, t2, f1, f2
                                if (nFingers >= MPPP)
                                    continue loopCurrentPeaks;
                            }
                        }
                    }
                }
            }
            if (nFingersTotal > 0 && VERBOSE) {
                log("t=" + Math.round(this.stepIndex / STEP) + " generated " + nFingersTotal + " fingerprints");
            }
            if (!DO_PLOT) {
                this.marks.splice(0, t0 + 1 - WINDOW_DT);
            }
            // Decrease the threshold for the next iteration
            for (var j = 0; j < this.threshold.length; j++) {
                this.threshold[j] += MASK_DECAY_LOG;
            }
        }
        if (this.buffer.length > 1000000) {
            var delta = this.buffer.length - 20000;
            this.bufferDelta += delta;
            this.buffer = this.buffer.slice(delta);
        }
        if (VERBOSE) {
            // log("fp processed " + (this.practicalDecodedBytes - this.decodedBytesSinceCallback) + " while threshold is " + (0.99*this.thresholdBytes));
        }
        if (this.stepIndex / STEP > 500 && DO_PLOT) { // approx 12 s of audio data
            this.plot();
            DO_PLOT = false;
            setTimeout(function () {
                process.exit(0);
            }, 3000);
        }
        if (tcodes.length > 0) {
            this.push({ tcodes: tcodes, hcodes: hcodes });
            // this will eventually trigger data events on the read interface
        }
        next();
    };
    Codegen.prototype.plot = function () {
        if (!this.fftData || !this.peakData || !this.thrData) {
            return;
        }
        // Fft plot
        {
            console.log("fftData len=" + this.fftData.length);
            var img = new png({ width: this.fftData.length, height: this.fftData[0].length });
            img.data = new Buffer(img.width * img.height * 4);
            var norm = minmax(this.fftData, 2);
            if (VERBOSE) {
                log("fft min=" + norm[0] + " max=" + norm[1]);
            }
            for (var x = 0; x < img.width; x++) {
                for (var y = 0; y < img.height; y++) {
                    colormap(Math.abs((this.fftData[x][y] - norm[0]) / (norm[1] - norm[0])), img.data, ((img.width * (img.height - 1 - y) + x) << 2), 'r');
                }
            }
            for (var i_15 = 0; i_15 < this.peakData.length; i_15++) {
                drawLine(img, this.peakData[i_15][0], this.peakData[i_15][1], this.peakData[i_15][2], this.peakData[i_15][3]);
            }
            for (var x = 0; x < img.width; x++) {
                for (var i_16 = 0; i_16 < this.marks[x].i.length; i_16++) {
                    if (this.marks[x].i[i_16] > Number.NEGATIVE_INFINITY) {
                        drawMarker(img, x, this.marks[x].i[i_16], 2);
                    }
                }
            }
            img.pack().pipe(fs.createWriteStream('out-fft.png'));
        }
        // Threshold plot
        {
            var img = new png({ width: this.thrData.length, height: this.thrData[0].length });
            img.data = new Buffer(img.width * img.height * 4);
            var norm = minmax(this.thrData, 2);
            if (VERBOSE) {
                log("thr min=" + norm[0] + " max=" + norm[1]);
            }
            for (var x = 0; x < img.width; x++) {
                for (var y = 0; y < img.height; y++) {
                    colormap(Math.abs((this.thrData[x][y] - norm[0]) / (norm[1] - norm[0])), img.data, ((img.width * (img.height - 1 - y) + x) << 2), 'r');
                }
                for (var i_17 = 0; i_17 < this.marks[x].i.length; i_17++) {
                    if (this.marks[x].i[i_17] > Number.NEGATIVE_INFINITY) {
                        drawMarker(img, x, this.marks[x].i[i_17], 2);
                    }
                }
            }
            img.pack().pipe(fs.createWriteStream('out-thr.png'));
        }
    };
    return Codegen;
}(stream_1.Transform));
exports.Codegen = Codegen;
