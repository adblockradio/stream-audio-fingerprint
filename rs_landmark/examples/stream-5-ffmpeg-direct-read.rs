use async_std::fs;
use async_std::task;
use clap::{App, Arg};
use futures::{
    pin_mut,
    select,
    FutureExt, // for `.fuse()`
};
use std::error::Error;
use std::process::{Command, Stdio};

const INPUT_ARG: &str = "file";

/**
 * Same as stream-3-ffmpeg-pipe-read,
 * but we read source mp3 directly
 * from code with rust APIs
 */

//cargo run --example stream-5-ffmpeg-direct-read mp3_sample/sample.mp3
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
        Err(why) => panic!("couldn't spawn ffmpeg: {}", why.description()),
        Ok(process) => process,
    };
    let decoder_id = decoder.id();
    let mut decoder_stdin = decoder.stdin.unwrap();
    let decoder_stdout = decoder.stdout.unwrap();
    println!("Running {} with id {:?}", cmd, decoder_id);

    // read input file
    let input_file = task::spawn(async move {
        use std::env;
        use std::path::Path;

        let path = filepath;
        let current_dir = env::current_dir().unwrap();
        let full_path = current_dir.join(Path::new(&path));
        let full_path_str = full_path.to_str().unwrap();
        let p = format!("{}", full_path_str);
        println!("Full path {}", p);

        fs::read(p).await
    });

    let write_output = input_file
        .map(|file_data| async move {
            use std::io::Write;
            let data: Vec<u8> = file_data.unwrap();
            task::spawn_blocking(move || decoder_stdin.write_all(&data[..]))
        })
        .flatten();

    let reader = task::spawn_blocking(|| {
        use std::io::Read;
        let mut stream = decoder_stdout;
        let mut buffer = Vec::new();

        match stream.read_to_end(&mut buffer) {
            Err(why) => panic!("couldn't read decoder stdout: {}", why.description()),
            Ok(_) => {
                let _output = String::from_utf8_lossy(&buffer);
                //print!("decoder responded with:\n{:?}", _output);
            }
        }
    });

    // run writer and reader concurrently
    task::block_on(async move {
        let t1 = write_output.fuse();
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
