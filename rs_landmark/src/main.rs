use async_std::task;
use rs_landmark::runner::Runner;
use rs_landmark::stdin::stdin_result;

//cat mp3_sample/sample.mp3  | cargo run
fn main() {
    let runner = Runner::new();
    runner.write();
    // task::block_on(async {
    //     let buffer = stdin_result().await;
    //     println!("{:?}", buffer);
    // });
}
