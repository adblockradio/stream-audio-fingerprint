use std::io::prelude::*;
use std::process::{Command, Stdio};
use std::io::{Read, BufReader};

/**
 * Demonstrates reading from file in sync way
 * (basically rust doc example)
 */

//cat ./rs_landmark/src/test-file.txt | cargo run --example wc-pipe-sync-1
fn main() {
    let decoder = match Command::new("wc")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
    {
        Err(why) => panic!("couldn't spawn wc: {}", why),
        Ok(process) => process,
    };
    println!("Running wc with id {:?}", decoder.id());

    let mut stdio_in = String::new();
    match BufReader::new(std::io::stdin()).read_to_string(&mut stdio_in) {
        Err(why) => panic!("couldn't read wc stdout: {}", why),
        Ok(_) => {} //print!("io::stdin piped with:\n{}", stdio_in),
    }

    match decoder.stdin.unwrap().write_all(stdio_in.as_bytes()) {
        Err(why) => panic!("couldn't write to wc stdin: {}", why),
        Ok(_) => println!("sent to decoder \n{}", stdio_in),
    }

    let mut s = String::new();
    match decoder.stdout.unwrap().read_to_string(&mut s) {
        Err(why) => panic!("couldn't read wc stdout: {}", why),
        Ok(_) => print!("decoder responded with:\n{}", s),
    }
}
