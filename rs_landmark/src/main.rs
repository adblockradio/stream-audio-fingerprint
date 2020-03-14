use async_std::task;
use log::debug;
use log::Level;
use md5::{Digest, Md5};
use rs_landmark::runner::Runner;
use std::process::{Command, Stdio};
const DEFAULT_BUF_SIZE: usize = 64 * 1024;
const VERBOSE: bool = false;

fn main() {
    simple_logger::init_with_level(Level::Debug).unwrap();
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

    // use std::thread;
    // let reader = thread::spawn(|| {
    let reader = task::spawn_blocking(|| {
        let mut stream = decoder_stdout;
        let mut runner = Runner::new();
        let mut buf = [0u8; DEFAULT_BUF_SIZE];

        use std::io::Read;

        loop {
            match stream.read(&mut buf) {
                Ok(n) => {
                    //println!("Read {} bytes", n);
                    if VERBOSE {
                        let mut hasher = Md5::new();
                        hasher.input(&buf[..]);
                        let result = hasher.result();
                        debug!("{:x}", &result);
                    }
                    let _prints = runner.write(&buf[..n]);
                    // if let Some(data) = _prints {
                    //     for i in 0..data.tcodes.len() {
                    //         debug!("time={} fingerprint={}", data.tcodes[i], data.hcodes[i]);
                    //     }
                    // }
                    if n == 0 {
                        // eof
                        break;
                    }
                }
                Err(why) => panic!("couldn't read decoder stdout: {}", why),
            };
        }
    });

    // reader.join().unwrap();
    task::block_on(async move {
        reader.await;
    })
}
