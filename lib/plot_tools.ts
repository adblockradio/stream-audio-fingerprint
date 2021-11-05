const fs = require('fs');
const { PNG } = require('node-png');

const VERBOSE = true;

const colormap = (x: number, buffer: number[], index: number, color: string) => {
	let mask = [1, 1, 1];
	if (color === 'r') {
		mask = [0, 1, 1];
	} else if (color === 'b') {
		mask = [1, 1, 0];
	} else if (color === 'grey') {
		mask = [0.5, 0.5, 0.5];
	}
	const r = 255 * Math.sqrt(Math.min(Math.max(x, 0), 1));
	buffer[index] = Math.round(255 - r * mask[0]);
	buffer[index + 1] = Math.round(255 - r * mask[1]);
	buffer[index + 2] = Math.round(255 - r * mask[2]);
	buffer[index + 3] = 255; // alpha channel
};

const minmax = (data: number[][]) => {
	const norm = [0, 0];
	for (let x = 0; x < data.length; x++) {
		for (let y = 0; y < data[0].length; y++) {
            norm[0] = Math.min(data[x][y], norm[0]);
            norm[1] = Math.max(data[x][y], norm[1]);
        }
	}
	return norm;
};


const drawMarker = (img: Image, x: number, y: number, radius: number) => {
	colormap(1, img.data, ((img.width * (img.height - 1 - y) + x) << 2), 'b');

	if (radius > 1) {
		drawMarker(img, x + 1, y, radius - 1);
		drawMarker(img, x, y + 1, radius - 1);
		drawMarker(img, x - 1, y, radius - 1);
		drawMarker(img, x, y - 1, radius - 1);
	}

	return;
};

const drawLine = (img: Image, x1: number, x2: number, y1: number, y2: number) => {
	console.log(`draw line x1=${x1} y1=${y1} x2=${x2} y2=${y2}`);
	const len = Math.round(Math.sqrt(Math.pow(y2 - y1, 2) + Math.pow(x2 - x1, 2)));
	for (let i = 0; i <= len; i++) {
		const x = x1 + Math.round((x2 - x1) * i / len);
		const y = y1 + Math.round((y2 - y1) * i / len);
		colormap(1, img.data, ((img.width * (img.height - 1 - y) + x) << 2), 'grey');
	}
};

const plot = (fftData: number[][], peakData: number[][], thrData: number[][], marks: Mark[]) => {
    if (!fftData || !peakData || !thrData) {
        return;
    }

    // Fft plot
    {
        console.log(`fftData len=${fftData.length}`);
        const img = new PNG({ width: fftData.length, height: fftData[0].length });
        img.data = Buffer.alloc(img.width * img.height * 4);
        const norm = minmax(fftData);
        if (VERBOSE) {
            console.log("fft min=" + norm[0] + " max=" + norm[1]);
        }
        for (let x = 0; x < img.width; x++) {
            for (let y = 0; y < img.height; y++) {
                colormap(Math.abs((fftData[x][y] - norm[0]) / (norm[1] - norm[0])), img.data, ((img.width * (img.height - 1 - y) + x) << 2), 'r');
            }
        }
        for (let i = 0; i < peakData.length; i++) {
            drawLine(img, peakData[i][0], peakData[i][1], peakData[i][2], peakData[i][3]);
        }

        for (let x = 0; x < img.width; x++) {
            for (let i = 0; i < marks[x].i.length; i++) {
                if (marks[x].i[i] > Number.NEGATIVE_INFINITY) {
                    drawMarker(img, x, marks[x].i[i], 2);
                }
            }
        }
        img.pack().pipe(fs.createWriteStream('out-fft.png'));
    }

    // Threshold plot
    {
        const img = new PNG({ width: thrData.length, height: thrData[0].length });
        img.data = Buffer.alloc(img.width * img.height * 4);
        const norm = minmax(thrData);
        if (VERBOSE) {
            console.log("thr min=" + norm[0] + " max=" + norm[1]);
        }
        for (let x = 0; x < img.width; x++) {
            for (let y = 0; y < img.height; y++) {
                colormap(Math.abs((thrData[x][y] - norm[0]) / (norm[1] - norm[0])), img.data, ((img.width * (img.height - 1 - y) + x) << 2), 'r');
            }

            for (let i = 0; i < marks[x].i.length; i++) {
                if (marks[x].i[i] > Number.NEGATIVE_INFINITY) {
                    drawMarker(img, x, marks[x].i[i], 2);
                }
            }
        }
        img.pack().pipe(fs.createWriteStream('out-thr.png'));
    }
}

exports.plot = plot;


interface Image {
	data: number[]
	width: number
	height: number
}

interface Mark {
	t: number
	i: number[]
	v: number[]
}