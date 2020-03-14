use std::process::{Command, Stdio};

/**
 * Demonstrates reading from a process's stdout in sync way
 * (must use ffmpeg ubuntu version apparently to get real input)
 * It prints ffmpeg binary output as a string
 */

//cat mp3_sample/sample.mp3  | cargo run --example ffmpeg-pipe-1-sync
fn main() {
    // spawn the command
    let cmd = "ffmpeg";
    let decoder = match Command::new(cmd)
        .args(&[
            "-i",
            "pipe:0", // WARN ---> ffmpeg already gets input from stdin all by itself, no need to read it
            "-acodec",
            "pcm_s16le",
            "-ar",
            "22050",
            "-ac",
            "1",
            "-f",
            "wav",
            "-v",
            "fatal",
            "pipe:1"
        ])
        .stdin(Stdio::inherit())
        .stdout(Stdio::piped()) 
        .spawn()
    {
        Err(why) => panic!("couldn't spawn ffmpeg: {}", why),
        Ok(process) => process,
    };
    
    println!("Running {} with id {:?}", cmd, decoder.id());
    use std::io::{Read};

    let mut s = Vec::new();
    match decoder.stdout.unwrap().read_to_end(&mut s) {
        Err(why) => panic!("couldn't read decoder stdout: {}", why),
        Ok(_) => {
            let _output = String::from_utf8_lossy(&s);
            //print!("decoder responded with:\n{:?}", _output);
        },
    }

}