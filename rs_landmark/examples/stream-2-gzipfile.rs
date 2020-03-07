use async_compression::stream::GzipEncoder as Encoder;
use async_std::fs;
use async_std::task;
use bytes::Bytes;
use futures::{
    executor::block_on_stream,
    io::{self, Result},
    pin_mut,
    stream::{self, Stream},
};

fn stream_to_vec(stream: impl Stream<Item = io::Result<Bytes>>) -> Vec<u8> {
    pin_mut!(stream);
    block_on_stream(stream)
        .map(Result::unwrap)
        .flatten()
        .collect()
}

/**
 * Async-compression version (async wrapper of flate2-rs)
 */
fn gzip1(input: impl Stream<Item = io::Result<Bytes>>) -> Vec<u8> {
    pin_mut!(input);
    stream_to_vec(Encoder::with_quality(
        input,
        async_compression::Level::Fastest,
    ))
}

/**
 * flate2-rs version
 */
fn gzip2(input: Vec<u8>) -> io::Result<Vec<u8>> {
    use flate2::write::GzEncoder;
    use flate2::Compression;
    use std::io::prelude::*;

    let mut e = GzEncoder::new(Vec::new(), Compression::fast());
    e.write_all(&input[..]).unwrap();
    let e = e.finish();
    //println!("{:?}", e);
    e
}

/**
 * This version uses gzip1
 * with blocking operator block_on_stream (bad!)
 */
async fn t11(input: Vec<u8>) -> io::Result<Vec<u8>> {
    use async_std::stream::StreamExt;
    let input: Vec<u8> = input;
    //println!("{:?}", input);
    let input: io::Result<Bytes> = Ok(Bytes::from(input));
    let res = gzip1(stream::iter(input).map(|x| Ok(x)));
    Ok(res)
}

/**
 * This version uses gzip2 with spawn blocking
 * as task wrapper
 */
async fn t12(input: Vec<u8>) -> io::Result<Vec<u8>> {
    let input: Vec<u8> = input;
    //println!("{:?}", input);
    let res = task::spawn_blocking(|| gzip2(input).unwrap()).await;
    Ok(res)
}

async fn t2(s: Vec<u8>, file_name: &str) -> io::Result<Vec<u8>> {
    use async_std::fs::File;
    use async_std::prelude::*;

    let s: Vec<u8> = s;
    //println!("{:?}", s);

    let mut file = File::create(file_name).await?;
    file.write_all(&s[..]).await?;
    Ok(s)
}

fn file_path() -> std::path::PathBuf {
    use std::env;
    use std::path::Path;
    let current_dir = env::current_dir().unwrap();
    let full_path = current_dir.join(Path::new("rs_landmark/src/test-file.txt"));
    let full_path_str = full_path.to_str().unwrap();
    let p = format!("{}", full_path_str);
    println!("Full path {}", p);
    full_path
}

async fn test1() -> io::Result<Vec<u8>> {
    let full_path = file_path();
    match fs::read(full_path).await {
        Ok(value) => {
            let value: Vec<u8> = value;
            let t1 = t11(value).await?;
            let dest = "rs_landmark/test-output/gzipfile1.gz";
            let t2 = t2(t1, dest).await;
            println!("Written to dest file {}", dest);
            let a: io::Result<Vec<u8>> = t2;
            a
        }
        Err(e) => Err(e),
    }
}

async fn test2() -> io::Result<Vec<u8>> {
    let full_path = file_path();
    match fs::read(full_path).await {
        Ok(value) => {
            let value: Vec<u8> = value;
            let t1 = t12(value).await?;
            let dest = "rs_landmark/test-output/gzipfile2.gz";
            let t2 = t2(t1, dest).await;
            println!("Written to dest file {}", dest);
            let a: io::Result<Vec<u8>> = t2;
            a
        }
        Err(e) => Err(e),
    }
}

/**
 * Demonstrates chaining operations with async/await
 * by reading a file and writing a gzip version of it
 * 
 * It is a try to apply chaining from
 * https://blog.yoshuawuyts.com/rust-streams/
 */

// cat ./rs_landmark/src/test-file.txt | cargo run --example stream-gzipfile
fn main() {
    task::block_on(async { test1().await.expect("Could not run test 1") });
    task::block_on(async { test2().await.expect("Could not run test 1") });
}
