use async_std::task;
pub const DEFAULT_BUF_SIZE: usize = 8 * 1024; // from std::io
use std::process::{Command, Stdio};

/**
 * Same as stream-3-ffmpeg-pipe-read,
 * but we read source file in multiple chunks
 * Probably slower than reading whole file at once,
 * but more efficient in making iso feature with 
 * nodejs streams
 * 
 * This solution seems as efficient as direct pipe
 * with whole reading
 */

//cat mp3_sample/sample.mp3 | cargo run --example stream-4-ffmpeg-pipe-read-buffered
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
        let mut buf = [0u8; DEFAULT_BUF_SIZE];

        loop {
            match stream.read(&mut buf) {
                Ok(n) => {
                    //println!("Read {} bytes", n);
                    //print!("{:?}", &buf[..]);
                    if n == 0 {
                        // eof
                        break;
                    }
                }
                Err(why) => panic!("couldn't read decoder stdout: {}", why),
            }
        }
    });

    task::block_on(async move {
        reader.await;
    })
}

