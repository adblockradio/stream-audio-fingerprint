#!/bin/bash

# install tools for benchmark
brew install hyperfine
sudo apt-get update
sudo apt-get install python-pip
pip install psrecord
sudo apt-get install python-matplotlib python-tk
echo "backend: Agg" > ~/.config/matplotlib/matplotlibrc # configure matplotlib to not crash without x-server
echo "You might have to restart you computer to have psrecord in path"

# download files for tests
FILE_1MG=file_example_MP3_1MG.mp3
FILE_5MG=file_example_MP3_5MG.mp3
if [ ! -f "$FILE_1MG" ]; then
    curl -O -J https://file-examples.com/wp-content/uploads/2017/11/$FILE_1MG
fi
if [ ! -f "$FILE_5MG" ]; then
    curl -O -J https://file-examples.com/wp-content/uploads/2017/11/$FILE_5MG
fi