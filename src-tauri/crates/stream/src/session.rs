//! One live stream: an encoder process fed with paced frames and sound,
//! whose MPEG-TS output is fanned out to a relay process per destination.
//! Each process is supervised and restarted if it dies, so a dropped
//! connection to one platform never takes the others down.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crossbeam_channel::{Receiver, Sender, TrySendError};

use crate::args::{self, EncoderPipeline, Progress};
use crate::audio::{self, AudioSource};
use crate::error::StreamError;
use crate::ffmpeg::{self, Encoder};
use crate::types::{DestinationState, DestinationStatus, EncoderState, StreamStartRequest, StreamStatus};

const TS_PACKET: usize = 188;

struct Shared {
    stop: Arc<AtomicBool>,
    /// The latest frame from the output window; the pacer repeats it.
    frame: Mutex<Arc<Vec<u8>>>,
    /// The running encoder's stdin, if any.
    video_sink: Mutex<Option<ChildStdin>>,
    status: Mutex<StreamStatus>,
    /// The stream since its last video keyframe. A relay that (re)connects
    /// starts with this, so the platform gets a decodable picture at once.
    gop: Mutex<Vec<u8>>,
    /// Running children, so `stop` can kill whatever is left.
    children: Mutex<Vec<Arc<Mutex<Child>>>>,
}

impl Shared {
    fn stopped(&self) -> bool {
        self.stop.load(Ordering::SeqCst)
    }

    fn update(&self, f: impl FnOnce(&mut StreamStatus)) {
        if let Ok(mut status) = self.status.lock() {
            f(&mut status);
        }
    }

    fn update_destination(&self, index: usize, f: impl FnOnce(&mut DestinationStatus)) {
        self.update(|s| {
            if let Some(d) = s.destinations.get_mut(index) {
                f(d);
            }
        });
    }

    fn track(&self, child: Child) -> Arc<Mutex<Child>> {
        let child = Arc::new(Mutex::new(child));
        if let Ok(mut children) = self.children.lock() {
            children.retain(|c| c.lock().is_ok_and(|mut c| matches!(c.try_wait(), Ok(None))));
            children.push(child.clone());
        }
        child
    }

    /// Sleep in small steps, returning early (false) once stopped.
    fn wait(&self, duration: Duration) -> bool {
        let deadline = Instant::now() + duration;
        while Instant::now() < deadline {
            if self.stopped() {
                return false;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        !self.stopped()
    }
}

pub struct StreamSession {
    shared: Arc<Shared>,
    width: u32,
    height: u32,
    threads: Vec<JoinHandle<()>>,
}

struct Config {
    ffmpeg: PathBuf,
    encoder: Encoder,
    request: StreamStartRequest,
    camera_args: Option<Vec<String>>,
    keys: Vec<String>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| u64::try_from(d.as_millis()).unwrap_or(u64::MAX))
}

impl StreamSession {
    pub fn start(
        output_id: &str,
        ffmpeg: PathBuf,
        encoder: Encoder,
        request: StreamStartRequest,
    ) -> Result<Self, StreamError> {
        let (width, height, fps) = (request.width, request.height, request.fps);
        if width == 0 || height == 0 || width % 2 != 0 || height % 2 != 0 {
            return Err(StreamError::InvalidRequest(format!("{width}x{height} is not a streamable size")));
        }
        if !(1..=60).contains(&fps) {
            return Err(StreamError::InvalidRequest(format!("{fps} fps is out of range")));
        }
        if request.destinations.iter().all(|d| d.key.trim().is_empty() || d.url.trim().is_empty()) {
            return Err(StreamError::NoDestinations);
        }

        let camera_args = request
            .camera
            .as_deref()
            .map(|camera| ffmpeg::camera_input_args(&ffmpeg, camera, width, height, fps))
            .transpose()?;
        let audio = request.audio_device.as_deref().filter(|d| !d.is_empty()).map(audio::start).transpose()?;

        let destinations: Vec<_> = request
            .destinations
            .iter()
            .filter(|d| !d.key.trim().is_empty() && !d.url.trim().is_empty())
            .cloned()
            .collect();
        let keys = destinations.iter().map(|d| d.key.trim().to_string()).collect();

        let shared = Arc::new(Shared {
            stop: Arc::new(AtomicBool::new(false)),
            frame: Mutex::new(Arc::new(black_frame(width, height))),
            video_sink: Mutex::new(None),
            status: Mutex::new(StreamStatus {
                output_id: output_id.to_string(),
                encoder: encoder.name.clone(),
                encoder_state: EncoderState::Starting,
                width,
                height,
                fps,
                camera: request.camera.clone(),
                started_at_ms: now_ms(),
                error: None,
                destinations: destinations
                    .iter()
                    .map(|d| DestinationStatus {
                        id: d.id.clone(),
                        name: d.name.clone(),
                        state: DestinationState::Connecting,
                        bitrate_kbps: 0.0,
                        retries: 0,
                        error: None,
                    })
                    .collect(),
            }),
            gop: Mutex::new(Vec::new()),
            children: Mutex::new(Vec::new()),
        });

        let config = Arc::new(Config {
            ffmpeg,
            encoder,
            request: StreamStartRequest { destinations: destinations.clone(), ..request },
            camera_args,
            keys,
        });

        let mut threads = Vec::new();
        let mut relay_inputs = Vec::new();
        for (index, destination) in destinations.into_iter().enumerate() {
            // About two seconds of a 6 Mbps stream; a destination that falls
            // further behind than that drops data rather than holding up the
            // others.
            let (tx, rx) = crossbeam_channel::bounded::<Arc<Vec<u8>>>(256);
            relay_inputs.push(tx);
            let (shared, config) = (shared.clone(), config.clone());
            let url = destination.publish_url();
            threads.push(spawn("stream-relay", move || supervise_relay(&shared, &config, index, &url, &rx)));
        }

        let (s, c) = (shared.clone(), config.clone());
        threads.push(spawn("stream-encoder", move || supervise_encoder(&s, &c, audio.as_ref(), &relay_inputs)));
        let s = shared.clone();
        threads.push(spawn("stream-pacer", move || pace(&s, fps)));

        Ok(Self { shared, width, height, threads })
    }

    pub fn push_frame(&self, width: u32, height: u32, rgba: &[u8]) -> Result<(), StreamError> {
        if width != self.width || height != self.height || rgba.len() != (width * height * 4) as usize {
            return Err(StreamError::FrameSize { width: self.width, height: self.height, got_width: width, got_height: height });
        }
        if let Ok(mut frame) = self.shared.frame.lock() {
            *frame = Arc::new(rgba.to_vec());
        }
        Ok(())
    }

    pub fn status(&self) -> StreamStatus {
        self.shared.status.lock().map_or_else(|e| e.into_inner().clone(), |s| s.clone())
    }

    pub fn dimensions(&self) -> (u32, u32) {
        (self.width, self.height)
    }

    /// End the stream: close the encoder's inputs so it flushes and the
    /// relays end their broadcasts cleanly, then kill anything that lingers.
    pub fn stop(mut self) {
        self.shared.stop.store(true, Ordering::SeqCst);
        // try_lock: if a hung encoder has the pacer blocked mid-write, the
        // kill below is what frees it.
        if let Ok(mut sink) = self.shared.video_sink.try_lock() {
            sink.take();
        }
        let deadline = Instant::now() + Duration::from_secs(4);
        while Instant::now() < deadline && self.threads.iter().any(|t| !t.is_finished()) {
            std::thread::sleep(Duration::from_millis(50));
        }
        if let Ok(children) = self.shared.children.lock() {
            for child in children.iter() {
                if let Ok(mut child) = child.lock() {
                    let _ = child.kill();
                }
            }
        }
        for thread in self.threads.drain(..) {
            let _ = thread.join();
        }
        log::info!("[STREAM] stopped");
    }
}

fn spawn(name: &str, f: impl FnOnce() + Send + 'static) -> JoinHandle<()> {
    std::thread::Builder::new()
        .name(name.into())
        .spawn(f)
        .expect("failed to spawn stream thread")
}

fn black_frame(width: u32, height: u32) -> Vec<u8> {
    let mut frame = vec![0; (width * height * 4) as usize];
    for alpha in frame.iter_mut().skip(3).step_by(4) {
        *alpha = 255;
    }
    frame
}

/// Write the latest frame at a steady rate. The output window only sends a
/// frame when the picture changes, but the stream needs one every tick.
fn pace(shared: &Shared, fps: u32) {
    let period = Duration::from_secs_f64(1.0 / f64::from(fps));
    let mut next = Instant::now();
    while !shared.stopped() {
        let frame = shared.frame.lock().map(|f| f.clone()).ok();
        if let (Some(frame), Ok(mut sink)) = (frame, shared.video_sink.lock()) {
            if let Some(stdin) = sink.as_mut() {
                if stdin.write_all(&frame).is_err() {
                    // The encoder died; its supervisor will bring up another.
                    sink.take();
                }
            }
        }
        next += period;
        let now = Instant::now();
        if next > now {
            std::thread::sleep(next - now);
        } else if now - next > period * 10 {
            // Far behind (the machine stalled): skip ahead rather than burst.
            next = now;
        }
    }
}

fn backoff(attempt: u32) -> Duration {
    Duration::from_secs(u64::from(2_u32.saturating_pow(attempt.min(4))).min(15))
}

fn supervise_encoder(shared: &Shared, config: &Config, audio: Option<&AudioSource>, relays: &[Sender<Arc<Vec<u8>>>]) {
    let mut attempt = 0;
    while !shared.stopped() {
        let started = Instant::now();
        match run_encoder(shared, config, audio, relays) {
            Ok(()) if shared.stopped() => break,
            Ok(()) => log::warn!("[STREAM] encoder exited; restarting"),
            Err(e) => {
                let message = args::redact(&e, &config.keys.iter().map(String::as_str).collect::<Vec<_>>());
                log::error!("[STREAM] encoder failed: {message}");
                shared.update(|s| s.error = Some(message));
            }
        }
        if started.elapsed() > Duration::from_secs(30) {
            attempt = 0;
        }
        shared.update(|s| s.encoder_state = EncoderState::Restarting);
        if !shared.wait(backoff(attempt)) {
            break;
        }
        attempt += 1;
    }
}

fn run_encoder(
    shared: &Shared,
    config: &Config,
    audio: Option<&AudioSource>,
    relays: &[Sender<Arc<Vec<u8>>>],
) -> Result<(), String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("audio socket: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let request = &config.request;
    let epoch_secs = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0.0, |d| d.as_secs_f64());
    let args = args::encoder_pipeline(&EncoderPipeline {
        encoder: &config.encoder,
        width: request.width,
        height: request.height,
        fps: request.fps,
        video_kbps: request.video_bitrate_kbps,
        audio_kbps: request.audio_bitrate_kbps,
        audio_port: port,
        audio_rate: audio.map_or(audio::SILENCE_RATE, |a| a.rate),
        audio_delay_ms: request.audio_delay_ms,
        camera: config.camera_args.as_deref(),
        epoch_secs,
    });
    log::info!("[STREAM] encoder: ffmpeg {}", args.join(" "));

    let mut child = ffmpeg::command(&config.ffmpeg)
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let stdin = child.stdin.take();
    let mut stdout = child.stdout.take().ok_or("no encoder stdout")?;
    let stderr = child.stderr.take().ok_or("no encoder stderr")?;
    let child = shared.track(child);

    let errors = Arc::new(Mutex::new(Vec::<String>::new()));
    let log_errors = errors.clone();
    let stderr_thread = spawn("stream-encoder-log", move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            log::warn!("[STREAM] ffmpeg: {line}");
            if let Ok(mut lines) = log_errors.lock() {
                lines.push(line);
                if lines.len() > 5 {
                    lines.remove(0);
                }
            }
        }
    });

    let audio_stop = Arc::new(AtomicBool::new(false));
    let audio_thread = {
        let (pipeline_done, session_done) = (audio_stop.clone(), shared.stop.clone());
        let stopped = move || pipeline_done.load(Ordering::SeqCst) || session_done.load(Ordering::SeqCst);
        let (samples, rate) = (audio.map(|a| a.samples.clone()), audio.map_or(audio::SILENCE_RATE, |a| a.rate));
        // Ending the session closes the audio input as well as the video one,
        // so ffmpeg sees both end and flushes instead of waiting to be killed.
        spawn("stream-audio-pump", move || audio::pump(&listener, samples.as_ref(), rate, &stopped))
    };

    if let Ok(mut sink) = shared.video_sink.lock() {
        *sink = stdin;
    }

    // Fan the encoded stream out in whole TS packets, so a relay that joins
    // later starts on a packet boundary.
    let mut buffer = vec![0_u8; TS_PACKET * 348];
    let mut pending = Vec::<u8>::new();
    let mut first = true;
    loop {
        let n = match stdout.read(&mut buffer) {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        if first {
            first = false;
            shared.update(|s| {
                s.encoder_state = EncoderState::Running;
                s.error = None;
            });
        }
        pending.extend_from_slice(&buffer[..n]);
        let whole = pending.len() / TS_PACKET * TS_PACKET;
        if whole == 0 {
            continue;
        }
        let chunk = Arc::new(pending.drain(..whole).collect::<Vec<u8>>());
        // Hold the GOP lock while sending so a relay snapshotting it sees
        // exactly the data before what reaches its channel.
        let Ok(mut gop) = shared.gop.lock() else { break };
        remember_gop(&mut gop, &chunk);
        for relay in relays {
            if let Err(TrySendError::Full(_)) = relay.try_send(chunk.clone()) {
                log::debug!("[STREAM] a destination is behind; dropping data for it");
            }
        }
    }

    if let Ok(mut sink) = shared.video_sink.lock() {
        sink.take();
    }
    audio_stop.store(true, Ordering::SeqCst);
    let status = child.lock().ok().and_then(|mut c| c.wait().ok());
    let _ = audio_thread.join();
    let _ = stderr_thread.join();
    match status {
        Some(s) if s.success() || shared.stopped() => Ok(()),
        _ => {
            let lines = errors.lock().map(|l| l.join(" · ")).unwrap_or_default();
            Err(if lines.is_empty() { "the encoder stopped".into() } else { lines })
        }
    }
}

fn supervise_relay(shared: &Shared, config: &Config, index: usize, url: &str, input: &Receiver<Arc<Vec<u8>>>) {
    let keys: Vec<&str> = config.keys.iter().map(String::as_str).collect();
    let mut attempt = 0;
    while !shared.stopped() {
        let started = Instant::now();
        let result = run_relay(shared, config, index, url, input);
        if shared.stopped() {
            break;
        }
        let message = args::redact(&result.err().unwrap_or_else(|| "connection closed".into()), &keys);
        log::warn!("[STREAM] destination {index} dropped: {message}");
        if started.elapsed() > Duration::from_secs(30) {
            attempt = 0;
        }
        attempt += 1;
        shared.update_destination(index, |d| {
            d.state = DestinationState::Reconnecting;
            d.bitrate_kbps = 0.0;
            d.retries += 1;
            d.error = Some(message);
        });
        if !shared.wait(backoff(attempt)) {
            break;
        }
    }
}

fn run_relay(shared: &Shared, config: &Config, index: usize, url: &str, input: &Receiver<Arc<Vec<u8>>>) -> Result<(), String> {
    let mut child = ffmpeg::command(&config.ffmpeg)
        .args(args::relay(url))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let stdin = child.stdin.take().ok_or("no relay stdin")?;
    let stdout = child.stdout.take().ok_or("no relay stdout")?;
    let stderr = child.stderr.take().ok_or("no relay stderr")?;
    let child = shared.track(child);

    let (fed, last_error) = std::thread::scope(|scope| {
        let errors = scope.spawn(|| {
            BufReader::new(stderr).lines().map_while(Result::ok).last().unwrap_or_default()
        });
        // Progress reports tell us when bytes are actually leaving.
        scope.spawn(|| {
            let mut progress = Progress::default();
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if progress.feed(&line) {
                    let live = progress.total_size > 0;
                    let kbps = progress.bitrate_kbps;
                    shared.update_destination(index, |d| {
                        if live {
                            d.state = DestinationState::Live;
                            d.error = None;
                        }
                        d.bitrate_kbps = kbps;
                    });
                }
            }
        });
        let fed = feed_relay(shared, &child, stdin, input, &start_of_gop(shared, input));
        (fed, errors.join().unwrap_or_default())
    });
    match fed {
        Some(status) if status.success() => Ok(()),
        _ if !last_error.is_empty() => Err(last_error),
        _ => Err("the connection closed".into()),
    }
}

/// Copy the encoded stream into a relay until it exits or the stream stops,
/// then close its stdin so ffmpeg finishes the FLV and the platform sees
/// the broadcast end cleanly. Returns the relay's exit status, `None` if a
/// write failed.
fn feed_relay(
    shared: &Shared,
    child: &Mutex<Child>,
    mut stdin: ChildStdin,
    input: &Receiver<Arc<Vec<u8>>>,
    preroll: &[u8],
) -> Option<std::process::ExitStatus> {
    let exited = || child.lock().is_ok_and(|mut c| !matches!(c.try_wait(), Ok(None)));
    let mut write_failed = stdin.write_all(preroll).is_err();
    while !shared.stopped() && !write_failed {
        match input.recv_timeout(Duration::from_millis(200)) {
            Ok(chunk) => {
                if stdin.write_all(&chunk).is_err() {
                    write_failed = true;
                    break;
                }
            }
            Err(crossbeam_channel::RecvTimeoutError::Timeout) if exited() => break,
            Err(crossbeam_channel::RecvTimeoutError::Timeout) => {}
            Err(crossbeam_channel::RecvTimeoutError::Disconnected) => break,
        }
    }
    drop(stdin);
    let deadline = Instant::now() + Duration::from_secs(3);
    let status = loop {
        if let Ok(mut c) = child.lock() {
            if let Ok(Some(status)) = c.try_wait() {
                break Some(status);
            }
            if Instant::now() > deadline {
                let _ = c.kill();
                break c.wait().ok();
            }
        }
        std::thread::sleep(Duration::from_millis(50));
    };
    status.filter(|_| !write_failed)
}

/// The encoder maps video first, and ffmpeg's MPEG-TS muxer gives the first
/// stream PID 0x100.
const VIDEO_PID: u16 = 0x100;
/// Past this the encoder isn't producing keyframes; stop growing the cache.
const MAX_GOP_BYTES: usize = 16 * 1024 * 1024;

/// A video packet with the random-access flag starts a keyframe.
fn is_keyframe(packet: &[u8]) -> bool {
    let pid = (u16::from(packet[1] & 0x1f) << 8) | u16::from(packet[2]);
    let has_adaptation = packet[3] & 0x20 != 0;
    pid == VIDEO_PID && has_adaptation && packet[4] > 0 && packet[5] & 0x40 != 0
}

fn remember_gop(gop: &mut Vec<u8>, chunk: &[u8]) {
    for packet in chunk.as_chunks::<TS_PACKET>().0 {
        if packet[0] == 0x47 && is_keyframe(packet) {
            gop.clear();
        }
        if gop.len() < MAX_GOP_BYTES {
            gop.extend_from_slice(packet);
        }
    }
}

/// What a newly connected relay should be sent first: the current GOP. Data
/// already queued for it is dropped — it was meant for the connection that
/// failed, and the GOP covers it.
fn start_of_gop(shared: &Shared, input: &Receiver<Arc<Vec<u8>>>) -> Vec<u8> {
    let Ok(gop) = shared.gop.lock() else { return Vec::new() };
    while input.try_recv().is_ok() {}
    gop.clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn packet(pid: u16, random_access: bool) -> Vec<u8> {
        let mut p = vec![0xff; TS_PACKET];
        p[0] = 0x47;
        p[1] = u8::try_from(pid >> 8).unwrap() | 0x40;
        p[2] = u8::try_from(pid & 0xff).unwrap();
        p[3] = 0x30;
        p[4] = 7;
        p[5] = if random_access { 0x50 } else { 0x10 };
        p
    }

    #[test]
    fn gop_restarts_at_video_keyframes_only() {
        let mut gop = Vec::new();
        let mut stream = packet(VIDEO_PID, true);
        stream.extend(packet(VIDEO_PID, false));
        remember_gop(&mut gop, &stream);
        assert_eq!(gop.len(), 2 * TS_PACKET);
        // Audio packets are all flagged random-access; they don't start a GOP.
        remember_gop(&mut gop, &packet(0x101, true));
        assert_eq!(gop.len(), 3 * TS_PACKET);
        remember_gop(&mut gop, &packet(VIDEO_PID, true));
        assert_eq!(gop.len(), TS_PACKET);
    }
}
