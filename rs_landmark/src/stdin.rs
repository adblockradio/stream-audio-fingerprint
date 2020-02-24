use async_std::{io, prelude::*, task};
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