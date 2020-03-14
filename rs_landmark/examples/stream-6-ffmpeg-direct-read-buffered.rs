use async_std::task;
use clap::{App, Arg};
use futures::{
    pin_mut,
    select,
    FutureExt, // for `.fuse()`
};
pub const DEFAULT_BUF_SIZE: usize = 8 * 1024; // from std::io
use std::process::{Command, Stdio};

const INPUT_ARG: &str = "file";

/**
 * Same as stream-5-ffmpeg-direct-read,
 * but we read source file in multiple chunks
 * Probably slower than reading whole file at once,
 * but more efficient in making iso feature with 
 * nodejs streams
 */

//cargo run --example stream-6-ffmpeg-direct-read-buffered mp3_sample/sample.mp3
fn main() {
    // get filepath from command, sync and mandatory
    let filepath = get_filepath();

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
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
    {
        Err(why) => panic!("couldn't spawn ffmpeg: {}", why),
        Ok(process) => process,
    };
    let decoder_id = decoder.id();
    let decoder_stdin = decoder.stdin.unwrap();
    let decoder_stdout = decoder.stdout.unwrap();
    println!("Running {} with id {:?}", cmd, decoder_id);

    // read input file
    use async_std::task::JoinHandle;
    use futures::io::{self};
    let input_file: JoinHandle<io::Result<usize>> = task::spawn(async move {
        use async_std::fs::File;
        use std::env;
        use std::path::Path;
        use async_std::io::ReadExt;

        let path = filepath;
        let current_dir = env::current_dir()?;
        let full_path = current_dir.join(Path::new(&path));

        let full_path_str = full_path.to_str().unwrap();
        let p = format!("{}", full_path_str);
        println!("Full path {}", p);

        let mut file = File::open(p).await?;
        let mut buf = [0u8; DEFAULT_BUF_SIZE];
        let mut sum = 0;
        let mut d = decoder_stdin;

        loop {
            match file.read(&mut buf).await {
                Ok(n) => {
                    sum += n;
                    use std::io::Write;
                    d = task::spawn_blocking(move || {
                        d.write_all(&buf[..]).unwrap();
                        // return d for use at next iter loop
                        d
                    })
                    .await;
                    if n == 0 {
                        // eof
                        break;
                    }
                }
                Err(_) => panic!("Error while reading file"),
            }
        }
        Ok(sum)
    });

    let reader = task::spawn_blocking(|| {
        use std::io::Read;

        let mut stream = decoder_stdout;
        let mut buf = [0u8; DEFAULT_BUF_SIZE];

        loop {
            match stream.read(&mut buf) {
                Ok(n) => {
                    // println!("Read {} bytes", n);
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

    // run writer and reader concurrently
    task::block_on(async move {
        let t1 = input_file.fuse();
        let t2 = reader.fuse();

        pin_mut!(t1, t2);
        loop {
            select! {
                a = t1 => {},
                b = t2 => {},
                complete => break,
            }
        }
    })
}

fn get_filepath() -> String {
    let matches = App::new("ffmpeg decoder async")
        .arg(
            Arg::with_name(INPUT_ARG)
                .help("Sets the input file to use")
                .required(true)
                .index(1),
        )
        .get_matches();

    // Calling .unwrap() is safe here because "INPUT" is required (if "INPUT" wasn't
    // required we could have used an 'if let' to conditionally get the value)
    let file_path = matches.value_of(INPUT_ARG).unwrap().to_owned();
    println!("Using input file: {}", file_path);
    file_path
}
