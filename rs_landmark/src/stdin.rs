use std::error::Error;
use std::process::{Command, Stdio};
use async_std::{task};

/**
 * Warning, mpsc::unbounded panics when trying to read
 * from empty buffer
 * 
 * async_std::sync::channel is mpmc by default and handles
 * back pressure by design
 */
pub async fn stdin_result() -> Vec<u8> {
    let cmd = "ffmpeg";
    let decoder = match Command::new(cmd)
        .args(&[
            "-i",
            "pipe:0", 
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
        Err(why) => panic!("couldn't spawn ffmpeg: {}", why.description()),
        Ok(process) => process,
    };
        
    println!("Running {} with id {:?}", cmd, decoder.id());

    let reader = task::spawn_blocking(|| {
        use std::io::prelude::*;
        let mut stream = decoder.stdout.unwrap();
        let mut buffer = Vec::new();

        match stream.read_to_end(&mut buffer) {
            Err(why) => panic!("couldn't read decoder stdout: {}", why.description()),
            Ok(_) => {
                let output = String::from_utf8_lossy(&buffer);
                print!("decoder responded with:\n{:?}", output);
                buffer
            },
        }
    });

    reader.await
}