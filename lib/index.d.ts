// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Copyright (c) 2021 Alexis Tyler

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
    threshold: any[];
    fftData?: any[];
    thrData?: any[];
    peakData?: any[];
    DT: number;
    SAMPLING_RATE: number;
    BPS: number;
    constructor(options?: Partial<Options>);
    _write(chunk: Buffer, _: any, next: Function): void;
    plot(): void;
}
export {};
