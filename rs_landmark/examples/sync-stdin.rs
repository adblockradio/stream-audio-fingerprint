use std::error::Error;
use std::io::prelude::*;
use std::process::{Command, Stdio};
use std::io::{Read, BufReader};

fn main() {
    let decoder = match Command::new("wc")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
    {
        Err(why) => panic!("couldn't spawn wc: {}", why.description()),
        Ok(process) => process,
    };
    println!("Running wc with id {:?}", decoder.id());

    let mut stdio_in = String::new();
    match BufReader::new(std::io::stdin()).read_to_string(&mut stdio_in) {
        Err(why) => panic!("couldn't read wc stdout: {}", why.description()),
        Ok(_) => {} //print!("io::stdin piped with:\n{}", stdio_in),
    }

    match decoder.stdin.unwrap().write_all(stdio_in.as_bytes()) {
        Err(why) => panic!("couldn't write to wc stdin: {}", why.description()),
        Ok(_) => println!("sent to decoder \n{}", stdio_in),
    }

    // Because `stdin` does not live after the above calls, it is `drop`ed,
    // and the pipe is closed.
    //
    // This is very important, otherwise `wc` wouldn't start processing the
    // input we just sent.

    // The `stdout` field also has type `Option<ChildStdout>` so must be unwrapped.
    let mut s = String::new();
    match decoder.stdout.unwrap().read_to_string(&mut s) {
        Err(why) => panic!("couldn't read wc stdout: {}", why.description()),
        Ok(_) => print!("decoder responded with:\n{}", s),
    }
}
