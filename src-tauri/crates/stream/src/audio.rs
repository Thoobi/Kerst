//! Sound for the stream: an input device (usually the mixing desk's feed)
//! captured with cpal and handed to ffmpeg as stereo f32 over a local socket.

use std::io::Write;
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::SampleFormat;
use crossbeam_channel::{Receiver, RecvTimeoutError, Sender};

use crate::error::StreamError;

/// The rate silence is generated at when there is no device.
pub const SILENCE_RATE: u32 = 48_000;

/// A running capture. The cpal stream isn't `Send` on every platform, so it
/// lives on its own thread until `stop` is set.
pub struct AudioSource {
    pub rate: u32,
    pub samples: Receiver<Vec<f32>>,
    stop: Arc<AtomicBool>,
}

impl Drop for AudioSource {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
    }
}

pub fn start(device_name: &str) -> Result<AudioSource, StreamError> {
    let (tx, rx) = crossbeam_channel::bounded::<Vec<f32>>(256);
    let (ready_tx, ready_rx) = crossbeam_channel::bounded::<Result<u32, String>>(1);
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = stop.clone();
    let name = device_name.to_string();
    std::thread::Builder::new()
        .name("stream-audio".into())
        .spawn(move || {
            let stream = match open(&name, tx) {
                Ok((stream, rate)) => {
                    let _ = ready_tx.send(Ok(rate));
                    stream
                }
                Err(e) => {
                    let _ = ready_tx.send(Err(e));
                    return;
                }
            };
            while !thread_stop.load(Ordering::SeqCst) {
                std::thread::sleep(Duration::from_millis(100));
            }
            drop(stream);
        })
        .map_err(|e| StreamError::Audio(e.to_string()))?;

    let rate = ready_rx
        .recv_timeout(Duration::from_secs(5))
        .map_err(|_| StreamError::Audio(format!("{device_name} did not start")))?
        .map_err(StreamError::Audio)?;
    log::info!("[STREAM] audio from '{device_name}' at {rate} Hz");
    Ok(AudioSource { rate, samples: rx, stop })
}

fn open(name: &str, tx: Sender<Vec<f32>>) -> Result<(cpal::Stream, u32), String> {
    let host = cpal::default_host();
    let device = host
        .input_devices()
        .map_err(|e| e.to_string())?
        .find(|d| d.name().is_ok_and(|n| n == name))
        .ok_or_else(|| format!("input device '{name}' is not connected"))?;
    let config = device.default_input_config().map_err(|e| e.to_string())?;
    let rate = config.sample_rate().0;
    let channels = usize::from(config.channels());
    let format = config.sample_format();
    let err = |e: cpal::StreamError| log::error!("[STREAM] audio device error: {e}");
    let config = config.into();

    let stream = match format {
        SampleFormat::F32 => device.build_input_stream(
            &config,
            move |data: &[f32], _: &_| send_stereo(data, channels, |s| s, &tx),
            err,
            None,
        ),
        SampleFormat::I16 => device.build_input_stream(
            &config,
            move |data: &[i16], _: &_| send_stereo(data, channels, |s| f32::from(s) / 32768.0, &tx),
            err,
            None,
        ),
        SampleFormat::I32 => device.build_input_stream(
            &config,
            #[expect(clippy::cast_precision_loss, reason = "i32 samples scaled to f32 lose only inaudible bits")]
            move |data: &[i32], _: &_| send_stereo(data, channels, |s| s as f32 / 2_147_483_648.0, &tx),
            err,
            None,
        ),
        SampleFormat::U16 => device.build_input_stream(
            &config,
            move |data: &[u16], _: &_| {
                send_stereo(data, channels, |s| (f32::from(s) - 32768.0) / 32768.0, &tx);
            },
            err,
            None,
        ),
        other => return Err(format!("unsupported sample format {other:?}")),
    }
    .map_err(|e| e.to_string())?;
    stream.play().map_err(|e| e.to_string())?;
    Ok((stream, rate))
}

/// The first two channels, as left and right. Desks and USB interfaces put
/// their main mix there; a mono device is copied to both sides.
fn send_stereo<T: Copy>(data: &[T], channels: usize, to_f32: impl Fn(T) -> f32, tx: &Sender<Vec<f32>>) {
    if channels == 0 {
        return;
    }
    let mut out = Vec::with_capacity(data.len() / channels * 2);
    for frame in data.chunks_exact(channels) {
        let left = to_f32(frame[0]);
        let right = if channels > 1 { to_f32(frame[1]) } else { left };
        out.push(left);
        out.push(right);
    }
    let _ = tx.try_send(out);
}

/// Accept ffmpeg's connection and feed it until `stop` or the socket closes.
///
/// Silence fills in when there is no device or it goes quiet for longer than
/// a dropout: ffmpeg interleaves sound with picture, and a starved audio
/// input would stall the whole stream.
pub fn pump(listener: &TcpListener, samples: Option<&Receiver<Vec<f32>>>, rate: u32, stopped: &dyn Fn() -> bool) {
    let Some(mut socket) = accept(listener, stopped) else { return };
    if let Some(rx) = samples {
        // Whatever queued while ffmpeg started is stale.
        while rx.try_recv().is_ok() {}
    }

    let frames_per_ms = f64::from(rate) / 1000.0;
    let mut last_write = Instant::now();
    let mut last_data = Instant::now();
    while !stopped() {
        let received = if let Some(rx) = samples {
            rx.recv_timeout(Duration::from_millis(50))
        } else {
            std::thread::sleep(Duration::from_millis(20));
            Err(RecvTimeoutError::Timeout)
        };
        let chunk = match received {
            Ok(chunk) => {
                last_data = Instant::now();
                chunk
            }
            Err(RecvTimeoutError::Disconnected) => break,
            Err(RecvTimeoutError::Timeout) => {
                if samples.is_some() && last_data.elapsed() < Duration::from_millis(250) {
                    continue;
                }
                #[expect(clippy::cast_possible_truncation, clippy::cast_sign_loss, reason = "a few ms of frames")]
                let frames = (last_write.elapsed().as_secs_f64() * 1000.0 * frames_per_ms) as usize;
                vec![0.0; frames * 2]
            }
        };
        if write_samples(&mut socket, &chunk).is_err() {
            break;
        }
        last_write = Instant::now();
    }
}

fn accept(listener: &TcpListener, stopped: &dyn Fn() -> bool) -> Option<TcpStream> {
    listener.set_nonblocking(true).ok()?;
    let deadline = Instant::now() + Duration::from_secs(20);
    while !stopped() && Instant::now() < deadline {
        match listener.accept() {
            Ok((socket, _)) => {
                socket.set_nonblocking(false).ok()?;
                let _ = socket.set_nodelay(true);
                return Some(socket);
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(20));
            }
            Err(e) => {
                log::warn!("[STREAM] audio socket accept failed: {e}");
                return None;
            }
        }
    }
    None
}

fn write_samples(socket: &mut TcpStream, samples: &[f32]) -> std::io::Result<()> {
    let bytes: Vec<u8> = samples.iter().flat_map(|s| s.to_le_bytes()).collect();
    socket.write_all(&bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn takes_first_two_channels() {
        let (tx, rx) = crossbeam_channel::bounded(1);
        send_stereo(&[0.1_f32, 0.2, 0.9, 0.3, 0.4, 0.9], 3, |s| s, &tx);
        assert_eq!(rx.recv().unwrap(), [0.1, 0.2, 0.3, 0.4]);
    }

    #[test]
    fn mono_is_doubled() {
        let (tx, rx) = crossbeam_channel::bounded(1);
        send_stereo(&[16384_i16, -16384], 1, |s| f32::from(s) / 32768.0, &tx);
        assert_eq!(rx.recv().unwrap(), [0.5, 0.5, -0.5, -0.5]);
    }
}
