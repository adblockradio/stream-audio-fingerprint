use async_std::{task};
use async_std::sync::channel;
use futures::{select, FutureExt};

const DEBUG: bool = true;

/**
 * Demonstrates printing from a stream created by reading
 * a file line by line
 */

// cat ./rs_landmark/src/test-file.txt | cargo run --example stream-file-lines-async
fn main() {
    let (sender, receiver) = channel::<String>(16);
    task::block_on(async {
        let reader = task::spawn(async {
            if DEBUG {
                let mut stdin_receiver = receiver.fuse();
                loop {
                    select! {
                        msg = stdin_receiver.next().fuse() => match msg {
                            Some(msg) => println!("received from stdin : {:?}", msg),
                            None => break,
                        },
                    }
                }
            };
        });
        use async_std::prelude::*;
        //wait for stdin and reader to have finished
        stdin_stream(DEBUG, sender).join(reader).await;
    })
}

use async_std::{io, prelude::*};
use async_std::io::BufReader;

/**
 * Warning, mpsc::unbounded panics when trying to read
 * from empty buffer
 * 
 * async_std::sync::channel is mpmc by default and handles
 * back pressure by design
 */
type Sender<T> = async_std::sync::Sender<T>;

async fn stdin(tx: Sender<String>, debug: bool) -> () {
    let mut lines = BufReader::new(io::stdin()).lines();
    while let Some(Ok(s)) = lines.next().await {
        if debug {
            println!("from stdin : {:?}", s);
        }
        tx.send(s).await
    }
}

pub async fn stdin_stream(
    debug: bool, 
    sender: Sender<String>) -> () {
    let handle = task::spawn(stdin(sender, debug));
    handle.await
}