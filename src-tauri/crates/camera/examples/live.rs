//! Read a real camera the way three Litdeck windows would, through one
//! shared connection, and count the pictures each gets.
//!
//!     cargo run -p litdeck-camera --example live -- http://192.168.1.214:4747/video

use std::time::Duration;

use futures_util::StreamExt;

#[tokio::main]
async fn main() {
    let url = std::env::args().nth(1).expect("camera address");
    let readers = (1..=3).map(|n| {
        let url = url.clone();
        tokio::spawn(async move {
            // Windows open a moment apart.
            tokio::time::sleep(Duration::from_millis(300 * (n - 1))).await;
            let stream = match litdeck_camera::subscribe(&url).await {
                Ok(stream) => stream,
                Err(problem) => return println!("window {n}: {} (unreachable: {})", problem.message, problem.unreachable),
            };
            let mut stream = Box::pin(stream);
            let (mut bytes, mut pictures) = (0usize, 0usize);
            let until = tokio::time::Instant::now() + Duration::from_secs(5);
            while let Ok(Some(Ok(chunk))) = tokio::time::timeout_at(until, stream.next()).await {
                bytes += chunk.len();
                pictures += chunk.windows(2).filter(|w| w == &[0xff, 0xd8]).count();
            }
            println!("window {n}: {pictures} pictures, {} KB in ~5s", bytes / 1024);
        })
    });
    for reader in readers.collect::<Vec<_>>() {
        let _ = reader.await;
    }
}
