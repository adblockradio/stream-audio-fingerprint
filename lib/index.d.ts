/// <reference types="node" />
import { Transform } from 'stream';
interface Options {
    readableObjectMode: true;
    highWaterMark: number;
}
interface Mark {
    t: number;
    i: number[];
    v: number[];
}
export declare class Codegen extends Transform {
    buffer: Buffer;
    bufferDelta: number;
    stepIndex: number;
    marks: Mark[];
    threshold: number[];
    fftData?: number[][];
    thrData?: number[][];
    peakData?: number[][];
    DT: number;
    SAMPLING_RATE: number;
    BPS: number;
    constructor(options?: Partial<Options>);
    _write(chunk: Buffer, _: string, next: () => void): void;
}
export {};
