declare const fs: any;
declare const PNG: any;
declare const VERBOSE = true;
declare const colormap: (x: number, buffer: number[], index: number, color: string) => void;
declare const minmax: (data: number[][]) => number[];
declare const drawMarker: (img: Image, x: number, y: number, radius: number) => void;
declare const drawLine: (img: Image, x1: number, x2: number, y1: number, y2: number) => void;
declare const plot: (fftData: number[][], peakData: number[][], thrData: number[][], marks: Mark[]) => void;
interface Image {
    data: number[];
    width: number;
    height: number;
}
interface Mark {
    t: number;
    i: number[];
    v: number[];
}
