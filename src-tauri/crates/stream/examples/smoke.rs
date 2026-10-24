//! Stream to a local RTMP listener for a few seconds:
//!
//! ```sh
//! ffmpeg -listen 1 -i rtmp://127.0.0.1:19350/live/test -c copy out.flv &
//! cargo run -p litdeck-stream --example smoke [camera-id]
//! ```

use std::time::{Duration, Instant};

use litdeck_stream::session::StreamSession;
use litdeck_stream::{StreamDestination, StreamRuntime, StreamStartRequest};

fn main() {
    let mut runtime = StreamRuntime::default();
    println!("{:?}", runtime.info());
    println!("{:?}", runtime.list_cameras());
    let (ffmpeg, encoder) = runtime.prepare(false).expect("prepare");
    let (width, height) = (1280, 720);
    let session = StreamSession::start(
        "smoke",
        ffmpeg,
        encoder,
        StreamStartRequest {
            width,
            height,
            fps: 30,
            video_bitrate_kbps: 3000,
            audio_bitrate_kbps: 128,
            audio_device: std::env::var("SMOKE_AUDIO").ok(),
            audio_delay_ms: 0,
            camera: std::env::args().nth(1),
            destinations: vec![StreamDestination {
                id: "local".into(),
                name: "Local".into(),
                url: "rtmp://127.0.0.1:19350/live".into(),
                key: "test".into(),
            }],
        },
    )
    .expect("start");

    let started = Instant::now();
    let mut last_print = Instant::now();
    let secs = std::env::var("SMOKE_SECS").ok().and_then(|s| s.parse().ok()).unwrap_or(8);
    while started.elapsed() < Duration::from_secs(secs) {
        // A lime bar that moves once a second over transparency.
        let step = u32::try_from(started.elapsed().as_secs()).unwrap_or(0);
        let mut frame = vec![0_u8; (width * height * 4) as usize];
        for y in (height / 2)..(height / 2 + 120) {
            for x in (step * 100)..(step * 100 + 300).min(width) {
                let i = ((y * width + x) * 4) as usize;
                frame[i..i + 4].copy_from_slice(&[163, 230, 53, 255]);
            }
        }
        session.push_frame(width, height, &frame).expect("push");
        if last_print.elapsed() > Duration::from_secs(1) {
            println!("{:?}", session.status());
            last_print = Instant::now();
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    session.stop();
}
