# Audio landmark fingerprinting as a Node Stream module

This module is a duplex stream (instance of stream.Transform) that converts a PCM audio signal into a series of audio fingerprints. It works with audio tracks as well as with unlimited audio streams, e.g. broadcast radio.

It is one of the foundations of the [Adblock Radio project](https://github.com/adblockradio/adblockradio).

## Credits

The [acoustic fingerprinting](https://en.wikipedia.org/wiki/Acoustic_fingerprint) technique used here is the landmark algorithm, as described in the [Shazam 2003 paper](http://www.ee.columbia.edu/~dpwe/papers/Wang03-shazam.pdf).
The implementation in ```codegen_landmark.js``` has been inspired by the MATLAB routine of D. Ellis ["Robust Landmark-Based Audio Fingerprinting" (2009)](http://labrosa.ee.columbia.edu/matlab/fingerprint/). One significant difference with Ellis' implementation is that this module can handle unlimited audio streams, e.g. radio, and not only finished audio tracks.

Note the existence of another good landmark fingerprinter in Python, [dejavu](https://github.com/worldveil/dejavu).

## Description

In a nutshell,
- a spectrogram is computed from the audio signal
- significant peaks are chosen in this time-frequency map. a latency of 250ms is used to determine if a peak is not followed by a bigger peak.
- fingerprints are computed by linking peaks with ```dt```, ```f1``` and ```f2```, ready to be inserted in a database or to be compared with other fingerprints.

![Spectrogram, peaks and pairs](.github/assets/out-fft.png)

In the background, about 12s of musical content is represented as a spectrogram (top frequency is about 10kHz). The blue marks are the chosen spectrogram peaks. Grey lines are peaks pairs that each lead to a fingerprint.

![Threshold and peaks](.github/assets/out-thr.png)

Given the same audio, this figure shows the same peaks and the internal *forward* threshold that prevent peaks from being too close in time and frequency. The *backward* threshold selection is not represented here.

## Usage

```shell
npm install stream-audio-fingerprint
```

The algorithm is in `lib/index.ts`.

A demo usage is proposed in `demo.js`. It requires the executable [ffmpeg](https://ffmpeg.org/download.html) to run.

```js
const childProcess = require('child_process');
const { Codegen } = require('stream-audio-fingerprint');

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
	console.log('Fingerprints stream ended.');
});
```

and then we pipe audio data, either a stream or a file

```shell
curl -L http://radiofg.impek.com/fg | node demo.js
cat awesome_music.mp3 | node demo.js
```
on Windows:
```
type awesome_music.mp3 | node demo.js
```

## Integration in your project

Matching fingerprints in a database is not a trivial topic, I should write a technical note about it some day.

For a reference implementation you can have a look at the code of the Adblock Radio algorithm to catch ads https://github.com/adblockradio/adblockradio/blob/master/predictor-db/hotlist.js#L150.

## License

See LICENSE file.
