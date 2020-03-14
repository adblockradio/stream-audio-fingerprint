use async_std::task;
use std::process::{Command, Stdio};

/**
 * This is an attempt to read file directly in async way,
 * rather than piping the output of `cat` output.
 * We also try to read output of ffmpeg process by parts in async way
 */

//cat mp3_sample/sample.mp3 | cargo run --example stream-3-ffmpeg-pipe-read
fn main() {
    // spawn the command
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
            "pipe:1",
        ])
        .stdin(Stdio::inherit())
        .stdout(Stdio::piped())
        .spawn()
    {
        Err(why) => panic!("couldn't spawn ffmpeg: {}", why),
        Ok(process) => process,
    };
    let decoder_id = decoder.id();
    let decoder_stdout = decoder.stdout.unwrap();
    println!("Running {} with id {:?}", cmd, decoder_id);

    let reader = task::spawn_blocking(|| {
        use std::io::Read;
        let mut stream = decoder_stdout;
        let mut buffer = Vec::new();

        match stream.read_to_end(&mut buffer) {
            Err(why) => panic!("couldn't read decoder stdout: {}", why),
            Ok(_) => {
                let _output = String::from_utf8_lossy(&buffer);
                //print!("decoder responded with:\n{:?}", _output);
            }
        }
    });

    task::block_on(async move {
        reader.await;
    })
}

