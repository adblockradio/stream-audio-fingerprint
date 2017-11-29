// Copyright (c) 2017 Alexandre Storelli
// This file is licensed under the Affero General Public License version 3 or later.
// See the LICENSE file.

// Online implementation of the landmark audio fingerprinting algorithm.
// inspired by D. Ellis (2009), "Robust Landmark-Based Audio Fingerprinting"
// http://labrosa.ee.columbia.edu/matlab/fingerprint/
// itself inspired by Wang 2003 paper

// This module exports Codegen, an instance of stream.Transform
// By default, the writable side must be fed with an input signal with the following properties:
// - single channel
// - 16bit PCM
// - 11025 Hz sampling rate
//
// The readable side outputs objects of the form
// { tcodes: [time stamps], hcodes: [fingerprints] }

'use strict';

var log = console.log;
var dsp = require('dsp.js');
const { Transform } = require('stream');

var SAMPLING_RATE = 11025;
// sampling rate in Hz. If you change this, you must adapt WINDOW_DT and PRUNING_DT below to match your needs
// set the Nyquist frequency, SAMPLING_RATE/2, so as to match the max frequencies you want to get landmark fingerprints.

var BPS = 2;
// bytes per sample, 2 for 16 bit PCM. If you change this, you must change readInt16LE methods in the code.

var MNLM = 5;
// maximum number of local maxima for each spectrum. useful to tune the amount of fingerprints at output

var MPPP = 3;
// maximum of hashes each peak can lead to. useful to tune the amount of fingerprints at output

var NFFT = 512;  // size of the FFT window. As we use real signals, the spectra will have nfft/2 points.
// Increasing it will give more spectral precision, less temporal precision.
// It may be good or bad depending on the sounds you want to match and on whether your input is deformed by EQ or noise.

var STEP = NFFT/2; // 50 % overlap. if supplied signal is 11025 Hz (according to skipBytes), this leads to a sampling frequency 43/s, or dt = 23,22 ms.
// It's not really useful to change that value.

var FFT = new dsp.FFT(NFFT, SAMPLING_RATE);

var HWIN = new Array(NFFT); // prepare the hann window
for (var i=0; i<NFFT; i++) {
	HWIN[i] = 0.5 * (1 - Math.cos(2*Math.PI*i/(NFFT-1)));
}

var MASK_DECAY_LOG = Math.log(0.99); // threshold decay factor between frames.

// frequency window to generate landmark pairs, in units of DF = SAMPLING_RATE / NFFT. Values between 0 and NFFT/2
var IF_MIN = 0; // you can increase this to avoid having fingerprints for low frequencies
var IF_MAX = NFFT/2; // you don't really want to decrease this, better reduce SAMPLING_RATE instead for faster computation.

var WINDOW_DF = 60; // we set this to avoid getting fingerprints linking very different frequencies.
// useful to reduce the amount of fingerprints. this can be maxed at NFFT/2 if you wish.

// time window to generate landmark pairs. time in units of dt = 1/SAMPLING_RATE*STEP = 23.22 ms for sampleRate = 11025 Hz and STEP = 256.
var WINDOW_DT = 48; // a little more than 2 sec.
var PRUNING_DT = 12; // about 500 ms, window to remove previous peaks that are superseded by later ones.
// tune the PRUNING_DT value to match the effects of MASK_DECAY_LOG.
// also, PRUNING_DT controls the latency of the pipeline. higher PRUNING_DT = higher latency

// prepare the values of exponential masks.
var MASK_DF = 3; // mask decay scale in DF units on the frequency axis.
var EWW = new Array(NFFT/2);
for (var i=0; i<NFFT/2; i++) {
	EWW[i] = new Array(NFFT/2);
	for (var j=0; j<NFFT/2; j++) {
		EWW[i][j] = -0.5*Math.pow((j-i)/MASK_DF/Math.sqrt(i+3),2); // gaussian mask is a polynom when working on the log-spectrum. log(exp()) = Id()
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

class Codegen extends Transform {

	constructor(options) {
		if (!options) options = {};
		options.readableObjectMode = true;
		options.highWaterMark = 10;
		super(options);
		this.buffer = new Buffer(0);
		this.bufferDelta = 0;

		this.stepIndex = 0;
		this.marks = [];
		this.threshold = new Array(NFFT/2);
		for (var i=0; i<NFFT/2; i++) {
			this.threshold[i] = -3;
		}

		if (DO_PLOT) {
			this.fftData = [];
			this.thrData = [];
			this.peakData = [];
		}
	}

	_write(chunk, enc, next) {

		if (VERBOSE) log("t=" + Math.round(this.stepIndex/STEP) + " received " + chunk.length + " bytes");

		var tcodes = [];
		var hcodes = [];

		this.buffer = Buffer.concat([this.buffer,chunk]);

		while ((this.stepIndex + NFFT) * BPS < this.buffer.length + this.bufferDelta) {
			var data = new Array(NFFT); // window data


			// check range. for debugging only
			//var loLimit = (this.stepIndex + 0) * BPS - this.bufferDelta;
			//if (loLimit < 0) log("fp: loLimit too low: " + loLimit + " sI=" + this.stepIndex + " bPS=" + BPS + " sB=" + this.skipBytes + " bD=" + this.bufferDelta + " bL=" + buf.length + " pDB=" + this.practicalDecodedBytes);

			//var hiLimit = (this.stepIndex + NFFT-1) * BPS - this.bufferDelta
			//if (hiLimit >= this.buffer.length) log("fp: hiLimit too high: " + hiLimit + " vs " + this.buffer.length + " sI=" + this.stepIndex + " nF=" + NFFT + " bPS=" + BPS + " sB=" + this.skipBytes + " bD=" + this.bufferDelta + " bL=" + buf.length + " pDB=" + this.practicalDecodedBytes);

			// fill the data, windowed (HWIN) and scaled
			for (var i=0,limit = NFFT; i<limit; i++) {
				data[i] = HWIN[i] * this.buffer.readInt16LE((this.stepIndex + i) * BPS - this.bufferDelta) / Math.pow(2, 8*BPS-1);
			}
			this.stepIndex += STEP;
			//console.log("params stepIndex=" + this.stepIndex + " bufD=" + this.bufferDelta);

			FFT.forward(data); 	// compute FFT

			// log-normal surface
			for (var i=IF_MIN; i<IF_MAX; i++) {
				// the lower part of the spectrum is damped, the higher part is boosted, leading to a better peaks detection.
				FFT.spectrum[i] = Math.abs(FFT.spectrum[i])*Math.sqrt(i+16);
			}

			if (DO_PLOT) this.fftData.push(FFT.spectrum.slice());

			// positive values of the difference between log spectrum and threshold
			var diff = new Array(NFFT/2);
			for (var i=IF_MIN; i<IF_MAX; i++) {
				diff[i] = Math.max(	Math.log(Math.max(1e-6,FFT.spectrum[i])) - this.threshold[i] , 0);
			}

			// find at most MNLM local maxima in the spectrum at this timestamp.
			var iLocMax = new Array(MNLM);
			var vLocMax = new Array(MNLM);
			for (var i=0; i<MNLM; i++) {
				iLocMax[i] = NaN;
				vLocMax[i] = Number.NEGATIVE_INFINITY;
			}
			for (var i=IF_MIN+1; i<IF_MAX-1; i++) {
				//console.log("checking local maximum at i=" + i + " data[i]=" + data[i] + " vLoc[last]=" + vLocMax[MNLM-1] );
				if (diff[i] > diff[i-1] && diff[i] > diff[i+1] && FFT.spectrum[i] > vLocMax[MNLM-1]) { // if local maximum big enough
					// insert the newly found local maximum in the ordered list of maxima
					for (var j=MNLM-1; j>=0; j--) {
						// navigate the table of previously saved maxima
						if (j >= 1 && FFT.spectrum[i] > vLocMax[j-1]) continue;
						for (var k=MNLM-1; k>=j+1; k--) {
							iLocMax[k] = iLocMax[k-1];	// offset the bottom values
							vLocMax[k] = vLocMax[k-1];
						}
						iLocMax[j] = i;
						vLocMax[j] = FFT.spectrum[i];
						break;
					}
				}
			}

			// now that we have the MNLM highest local maxima of the spectrum,
			// update the local maximum threshold so that only major peaks are taken into account.
			for (var i=0; i<MNLM; i++) {
				if (vLocMax[i] > Number.NEGATIVE_INFINITY) {
					for (var j=IF_MIN; j<IF_MAX; j++) {
						this.threshold[j] = Math.max(this.threshold[j], Math.log(FFT.spectrum[iLocMax[i]]) + EWW[iLocMax[i]][j]);
					}
				} else {
					vLocMax.splice(i,MNLM-i); // remove the last elements.
					iLocMax.splice(i,MNLM-i);
					break;
				}
			}

			if (DO_PLOT) {
				var tmp = new Array(NFFT/2);
				for (var i=0; i<IF_MIN; i++) {
					tmp[i] = 0;
				}
				for (var i=IF_MIN; i<IF_MAX; i++) {
					tmp[i] = Math.exp(this.threshold[i]);
				}
				for (var i=IF_MAX; i<NFFT/2; i++) {
					tmp[i] = 0;
				}
				this.thrData.push(tmp);
			}

			/*if (iLocMax.length > 0 && VERBOSE) {
				log("t=" + Math.round(this.stepIndex/STEP) + " f=" + iLocMax + " peak=" + vLocMax);
			}*/

			// array that stores local maxima for each time step
			this.marks.push({"t": Math.round(this.stepIndex/STEP), "i":iLocMax, "v":vLocMax});

			// remove previous (in time) maxima that would be too close and/or too low.
			var nm = this.marks.length;
			var t0 = nm-PRUNING_DT-1;
			for (var i=nm-1; i>=Math.max(t0+1,0); i--) {
				//console.log("pruning ntests=" + this.marks[i].v.length);
				for (var j=0; j<this.marks[i].v.length; j++) {
					//console.log("pruning " + this.marks[i].v[j] + " <? " + this.threshold[this.marks[i].i[j]] + " * " + Math.pow(this.mask_decay, lenMarks-1-i));
					if (this.marks[i].i[j] != 0 && Math.log(this.marks[i].v[j]) < this.threshold[this.marks[i].i[j]] + MASK_DECAY_LOG * (nm-1-i)) {
						/*if (VERBOSE) {
							log("t=" + Math.round(this.stepIndex/STEP) + " pruning " + i + " t=" + this.marks[i].t + " locmax=" + j);
						}*/
						this.marks[i].v[j] = Number.NEGATIVE_INFINITY;
						this.marks[i].i[j] = Number.NEGATIVE_INFINITY;
					}
				}
			}

			// generate hashes for peaks that can no longer be pruned. stepIndex:{f1:f2:deltaindex}
			var nFingersTotal = 0;
			if (t0 >= 0) {
				var m = this.marks[t0];

				loopCurrentPeaks:
				for (var i=0; i < m.i.length; i++) {
					var nFingers = 0;

					loopPastTime:
					for (var j=t0; j>=Math.max(0,t0-WINDOW_DT); j--) {

						var m2 = this.marks[j];

						loopPastPeaks:
						for (var k=0; k<m2.i.length; k++) {
							if (m2.i[k] != m.i[i] && Math.abs(m2.i[k] - m.i[i]) < WINDOW_DF) {
								tcodes.push(m.t); //Math.round(this.stepIndex/STEP));
								// in the hash: dt=(t0-j) has values between 0 and WINDOW_DT, so for <65 6 bits each
								//				f1=m2.i[k] , f2=m.i[i] between 0 and NFFT/2-1, so for <255 8 bits each.
								hcodes.push(m2.i[k] + NFFT/2 * (m.i[i] + NFFT/2 * (t0-j)));
								nFingers += 1;
								nFingersTotal += 1;
								if (DO_PLOT) this.peakData.push([m.t, j, m.i[i], m2.i[k]]); // t1, t2, f1, f2
								if (nFingers >= MPPP) continue loopCurrentPeaks;
							}
						}
					}
				}
			}
			if (nFingersTotal > 0 && VERBOSE) {
				log("t=" + Math.round(this.stepIndex/STEP) + " generated " + nFingersTotal + " fingerprints");
			}
			if (!DO_PLOT) {
				this.marks.splice(0,t0+1-WINDOW_DT);
			}

			// decrease the threshold for the next iteration
			for (var j=0; j<this.threshold.length; j++) {
				this.threshold[j] += MASK_DECAY_LOG;
			}
		}

		if (this.buffer.length > 1000000) {
			var delta = this.buffer.length - 20000;
			//console.log("buffer drop " + delta + " bytes");
			this.bufferDelta += delta;
			this.buffer = this.buffer.slice(delta);
		}

		if (VERBOSE) {
			log("fp processed " + (this.practicalDecodedBytes - this.decodedBytesSinceCallback) + " while threshold is " + (0.99*this.thresholdBytes));
		}

		if (this.stepIndex/STEP > 500 && DO_PLOT) { // approx 12 s of audio data
			this.plot()
			DO_PLOT = false;
			setTimeout(function() {
				process.exit(0);
			}, 3000);
		}

		if (tcodes.length > 0) {
			this.push({ tcodes: tcodes, hcodes: hcodes });
			// this will eventually trigger data events on the read interface
		}

		next();
	}

	plot() { // plot section

		if (false) { // raw signal plot
			var buf = new Array(this.buffer.length / BPS);
			for (var i=0; i<buf.length; i++) {
				buf[i] = this.buffer.readInt16LE(i);
			}
			var img = new png({width:buf.length,height:64});
			img.data = new Buffer(img.width * img.height * 4);
			var norm = minmax(buf, 1);

			for (var x = 0; x < img.width; x++) {
				for (var y = 0; y < img.height; y++) {
	                colormap(0, img.data, (img.width * y + x) << 2, null);
	            }
	            var yPoint = Math.round(((buf[x]-norm[0]) / (norm[1]-norm[0])) * 64);
				colormap(1, img.data, (img.width * yPoint + x) << 2, null);
	        }
	        img.pack().pipe(fs.createWriteStream('out-raw.png'));
		}

		// fft plot
		console.log("fftData len=" + this.fftData.length);
		var img = new png({width:this.fftData.length,height:this.fftData[0].length});
		img.data = new Buffer(img.width * img.height * 4);
		var norm = minmax(this.fftData, 2);
		if (VERBOSE) {
			log("fft min=" + norm[0] + " max=" + norm[1]);
		}
		for (var x = 0; x < img.width; x++) {
			for (var y = 0; y < img.height; y++) {
                colormap(Math.abs((this.fftData[x][y]-norm[0]) / (norm[1]-norm[0])), img.data, ((img.width * (img.height-1-y) + x) << 2),'r');
            }
        }
        for (var i = 0; i < this.peakData.length; i++) {
			drawLine(img,this.peakData[i][0],this.peakData[i][1],this.peakData[i][2],this.peakData[i][3]);
		}

		for (var x = 0; x < img.width; x++) {
            for (var i = 0; i < this.marks[x].i.length; i++) {
            	if (this.marks[x].i[i] > Number.NEGATIVE_INFINITY) {
	            	drawMarker(img, x, this.marks[x].i[i], 2);
	            }
            }
		}
        img.pack().pipe(fs.createWriteStream('out-fft.png'));


		// threshold plot
		var img = new png({width:this.thrData.length,height:this.thrData[0].length});
		img.data = new Buffer(img.width * img.height * 4);
		var norm = minmax(this.thrData, 2);
		if (VERBOSE) {
			log("thr min=" + norm[0] + " max=" + norm[1]);
		}
		for (var x = 0; x < img.width; x++) {
			for (var y = 0; y < img.height; y++) {
                colormap(Math.abs((this.thrData[x][y]-norm[0]) / (norm[1]-norm[0])), img.data, ((img.width * (img.height-1-y) + x) << 2),'r');
            }

            for (var i = 0; i < this.marks[x].i.length; i++) {
            	if (this.marks[x].i[i] > Number.NEGATIVE_INFINITY) {
	            	drawMarker(img, x, this.marks[x].i[i], 2);
	            }
            }
        }
        img.pack().pipe(fs.createWriteStream('out-thr.png'));
	}
}


var colormap = function(x, buffer, index, color) {
	var mask = [1,1,1];
	if (color == 'r') {
		mask = [0,1,1];
	} else if (color == 'b') {
		mask = [1,1,0];
	} else if (color == 'grey') {
		mask = [0.5,0.5,0.5];
	}
	var r = 255*Math.sqrt(Math.min(Math.max(x,0),1));
	buffer[index] = Math.round(255-r*mask[0]);
	buffer[index+1] = Math.round(255-r*mask[1]);
	buffer[index+2] = Math.round(255-r*mask[2]);
	buffer[index+3] = 255; // alpha channel
}

var minmax = function(a,nDim) {
	var norm = [0, 0];
	for (var x = 0; x < a.length; x++) {
		if (nDim == 1) {
			norm[0] = Math.min(a[x], norm[0]);
			norm[1] = Math.max(a[x], norm[1]);
		} else if (nDim == 2) {
			for (var y = 0; y < a[0].length; y++) {
				norm[0] = Math.min(a[x][y], norm[0]);
				norm[1] = Math.max(a[x][y], norm[1]);
			}
		}
	}
	return norm;
}

var drawMarker = function(img, x, y, radius) {
	//console.log("draw marker x=" + x + " y=" + y);
	colormap(1, img.data, ((img.width * (img.height-1-y) + x) << 2), 'b');
	if (radius > 1) {
		drawMarker(img, x+1, y, radius-1);
		drawMarker(img, x, y+1, radius-1);
		drawMarker(img, x-1, y, radius-1);
		drawMarker(img, x, y-1, radius-1);
	}
	return;
}

var drawLine = function(img, x1, x2, y1, y2) {
	log("draw line x1=" + x1 + " y1=" + y1 + " x2=" + x2 + " y2=" + y2);
	var len = Math.round(Math.sqrt(Math.pow(y2-y1,2)+Math.pow(x2-x1,2)));
	for (var i=0; i<=len; i++) {
		var x = x1+Math.round((x2-x1)*i/len);
		var y = y1+Math.round((y2-y1)*i/len);
		colormap(1, img.data, ((img.width * (img.height-1-y) + x) << 2), 'grey');
	}

}

module.exports = Codegen;
