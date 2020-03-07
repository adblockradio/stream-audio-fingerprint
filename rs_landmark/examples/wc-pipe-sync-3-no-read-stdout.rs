use std::error::Error;
use std::process::{Command, Stdio};
use std::io::Write;
use std::io::Read;

/**
 * Same as pipe-sync-1, but does not pipe stdout
 * from spawned process, so it outputs naturally
 */

//cat ./rs_landmark/src/test-file.txt | cargo run --example wc-pipe-sync-3-no-read-stdout
fn main() {
    //spawn the command
    let cmd = "wc";
    let decoder = match Command::new(cmd)
        .stdin(Stdio::piped())
        //.stdout(Stdio::piped()) // comment this if we want natural stdout, be not read possible !!
        .spawn()
    {
        Err(why) => panic!("couldn't spawn wc: {}", why.description()),
        Ok(process) => process,
    };
    
    println!("Running {} with id {:?}", cmd, decoder.id());

    let mut stdio_in = Vec::new();
    let mut a = std::io::stdin();
    match a.read_to_end(&mut stdio_in) {
        Err(why) => panic!("couldn't read decoder stdout: {}", why.description()),
        Ok(_) => { println!("end reading sdtio") }
    }

    println!("size to send {}", stdio_in.len());
    match decoder.stdin.unwrap().write_all(&stdio_in) {
        Err(why) => panic!("couldn't write to wc stdin: {}", why.description()),
        Ok(_) => println!("sent to decoder")
    }
}