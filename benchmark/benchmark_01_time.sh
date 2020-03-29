#!/bin/bash

cd ..
cargo build --release
export PATH=$PATH:$PWD/target/release

# time based benchs, warmup to get file in OS memoryc consistently
hyperfine --warmup 1 --export-markdown "benchmark/report-small-file.md" \
    'cat benchmark/file_example_MP3_1MG.mp3 | rs_landmark' 'cat benchmark/file_example_MP3_1MG.mp3 | node codegen_demo.js'
hyperfine --warmup 1 --export-markdown "benchmark/report-medium-file.md" \
    'cat benchmark/file_example_MP3_5MG.mp3 | rs_landmark' 'cat benchmark/file_example_MP3_5MG.mp3 | node codegen_demo.js'
