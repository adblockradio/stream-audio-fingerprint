#!/bin/bash

cd ..
cargo build --release
export PATH=$PATH:$PWD/target/release

# memory based benchs, run hyperfile to get representative difference with multiple runs
cat benchmark/file_example_MP3_5MG.mp3 | rs_landmark &
psrecord $! --interval 0.01 --include-children --plot benchmark/plot_rs.png &
P1=$!

cat benchmark/file_example_MP3_5MG.mp3 | node codegen_demo.js &
psrecord $! --interval 0.01 --include-children --plot benchmark/plot_node.png &
P2=$!

wait $P1 $P2