//! Finding ffmpeg and asking it what this machine can do: which H.264
//! encoder works, whether it speaks RTMPS, and which cameras are attached.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use crate::error::StreamError;
use crate::types::CameraInfo;

const EXE: &str = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };

/// Where to look for ffmpeg, most specific first: an explicit override, the
/// copy bundled beside the app, the caller's extra dirs, the source checkout,
/// then the system.
pub fn locate(extra_dirs: &[PathBuf]) -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("LITDECK_FFMPEG").map(PathBuf::from) {
        if path.is_file() {
            return Some(path);
        }
        log::warn!("LITDECK_FFMPEG={} is not a file; looking elsewhere", path.display());
    }

    let mut dirs = Vec::new();
    if let Some(dir) = std::env::current_exe().ok().and_then(|p| p.parent().map(Path::to_path_buf)) {
        dirs.push(dir);
    }
    dirs.extend(extra_dirs.iter().cloned());
    dirs.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../sdk/ffmpeg").join(std::env::consts::OS));
    if let Some(path) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&path));
    }
    // Apps started from Finder don't inherit the shell's PATH.
    if cfg!(target_os = "macos") {
        dirs.push("/opt/homebrew/bin".into());
        dirs.push("/usr/local/bin".into());
    }

    dirs.into_iter().map(|d| d.join(EXE)).find(|p| p.is_file())
}

/// A `Command` for ffmpeg that won't flash a console window on Windows or
/// pick up the `AppImage`'s bundled libraries on Linux.
pub fn command(ffmpeg: &Path) -> Command {
    let mut cmd = Command::new(ffmpeg);
    cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    if std::env::var_os("APPIMAGE").is_some() {
        cmd.env_remove("LD_LIBRARY_PATH").env_remove("LD_PRELOAD");
    }
    cmd
}

/// Run ffmpeg to completion, killing it after `timeout`. Returns whether it
/// exited cleanly and what it wrote to stdout and stderr.
fn run(ffmpeg: &Path, args: &[String], timeout: Duration) -> Result<(bool, String), StreamError> {
    let mut child = command(ffmpeg)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| StreamError::Spawn(e.to_string()))?;
    // Read both pipes on their own threads so a chatty ffmpeg can't fill one
    // and block forever.
    let read = |pipe: Option<Box<dyn std::io::Read + Send>>| {
        std::thread::spawn(move || {
            let mut out = String::new();
            if let Some(mut pipe) = pipe {
                let _ = pipe.read_to_string(&mut out);
            }
            out
        })
    };
    let stdout = read(child.stdout.take().map(|p| Box::new(p) as _));
    let stderr = read(child.stderr.take().map(|p| Box::new(p) as _));
    let deadline = Instant::now() + timeout;
    let ok = loop {
        if let Some(status) = child.try_wait().map_err(|e| StreamError::Spawn(e.to_string()))? {
            break status.success();
        }
        if Instant::now() > deadline {
            let _ = child.kill();
            let _ = child.wait();
            break false;
        }
        std::thread::sleep(Duration::from_millis(20));
    };
    let mut output = stdout.join().unwrap_or_default();
    output.push_str(&stderr.join().unwrap_or_default());
    Ok((ok, output))
}

fn strings(args: &[&str]) -> Vec<String> {
    args.iter().map(ToString::to_string).collect()
}

pub fn version(ffmpeg: &Path) -> Result<String, StreamError> {
    let (_, out) = run(ffmpeg, &strings(&["-hide_banner", "-version"]), Duration::from_secs(5))?;
    out.lines()
        .next()
        .filter(|l| l.starts_with("ffmpeg version"))
        .map(|l| l.split_whitespace().nth(2).unwrap_or("unknown").to_string())
        .ok_or_else(|| StreamError::Ffmpeg(format!("{} is not ffmpeg", ffmpeg.display())))
}

pub fn supports_rtmps(ffmpeg: &Path) -> bool {
    run(ffmpeg, &strings(&["-hide_banner", "-protocols"]), Duration::from_secs(5))
        .is_ok_and(|(_, out)| out.lines().any(|l| l.trim() == "rtmps"))
}

/// An H.264 encoder that was shown to work on this machine.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Encoder {
    pub name: String,
    /// VAAPI render node, for `h264_vaapi` only.
    pub vaapi_device: Option<String>,
}

/// Hardware encoders first: they leave the CPU for the rest of the app.
/// Software x264/openh264 are the fallbacks.
fn candidates() -> &'static [&'static str] {
    if cfg!(target_os = "macos") {
        &["h264_videotoolbox", "libx264", "libopenh264"]
    } else if cfg!(windows) {
        &["h264_nvenc", "h264_qsv", "h264_amf", "h264_mf", "libx264", "libopenh264"]
    } else {
        &["h264_nvenc", "h264_vaapi", "h264_qsv", "libx264", "libopenh264"]
    }
}

fn vaapi_devices() -> Vec<String> {
    let mut nodes: Vec<String> = std::fs::read_dir("/dev/dri")
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path().to_string_lossy().into_owned())
        .filter(|p| p.contains("renderD"))
        .collect();
    nodes.sort();
    nodes
}

/// Try each candidate on a few frames of black and keep the first that works:
/// ffmpeg lists NVENC whether or not there is an NVIDIA card in the machine.
pub fn pick_encoder(ffmpeg: &Path) -> Option<Encoder> {
    let listed = run(ffmpeg, &strings(&["-hide_banner", "-encoders"]), Duration::from_secs(5))
        .map(|(_, out)| out)
        .unwrap_or_default();
    for &name in candidates() {
        if !listed.contains(name) {
            continue;
        }
        let tries: Vec<Encoder> = if name == "h264_vaapi" {
            vaapi_devices()
                .into_iter()
                .map(|d| Encoder { name: name.into(), vaapi_device: Some(d) })
                .collect()
        } else {
            vec![Encoder { name: name.into(), vaapi_device: None }]
        };
        for encoder in tries {
            let mut args = strings(&["-hide_banner", "-loglevel", "error"]);
            args.extend(crate::args::hw_init_args(&encoder));
            args.extend(strings(&["-f", "lavfi", "-i", "color=black:s=640x360:r=30", "-frames:v", "5"]));
            args.push("-vf".into());
            args.push(crate::args::upload_filter(&encoder).into());
            args.extend(crate::args::encoder_args(&encoder, 2500, 30));
            args.extend(strings(&["-f", "null", "-"]));
            match run(ffmpeg, &args, Duration::from_secs(10)) {
                Ok((true, _)) => {
                    log::info!("[STREAM] using encoder {} {:?}", encoder.name, encoder.vaapi_device);
                    return Some(encoder);
                }
                Ok((false, out)) => {
                    log::info!("[STREAM] encoder {name} unavailable: {}", last_line(&out));
                }
                Err(e) => log::warn!("[STREAM] encoder probe for {name} failed: {e}"),
            }
        }
    }
    None
}

pub fn last_line(out: &str) -> &str {
    out.lines().rev().map(str::trim).find(|l| !l.is_empty()).unwrap_or("")
}

/// The test pattern stands in for a camera in development builds.
pub const TEST_CAMERA: &str = "test:pattern";

pub fn list_cameras(ffmpeg: &Path) -> Vec<CameraInfo> {
    let mut cameras = if cfg!(target_os = "linux") {
        list_v4l2()
    } else if cfg!(windows) {
        let args = strings(&["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"]);
        run(ffmpeg, &args, Duration::from_secs(10))
            .map(|(_, out)| parse_dshow(&out))
            .unwrap_or_default()
    } else {
        let args = strings(&["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""]);
        run(ffmpeg, &args, Duration::from_secs(10))
            .map(|(_, out)| parse_avfoundation(&out))
            .unwrap_or_default()
    };
    if cfg!(debug_assertions) {
        cameras.push(CameraInfo { id: TEST_CAMERA.into(), name: "Test pattern (dev)".into() });
    }
    cameras
}

/// Each V4L2 device can expose several nodes (metadata, a second stream);
/// index 0 is the one that captures.
fn list_v4l2() -> Vec<CameraInfo> {
    let mut cameras: Vec<CameraInfo> = std::fs::read_dir("/sys/class/video4linux")
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| {
            std::fs::read_to_string(e.path().join("index")).map_or(true, |i| i.trim() == "0")
        })
        .map(|e| {
            let node = e.file_name().to_string_lossy().into_owned();
            let name = std::fs::read_to_string(e.path().join("name"))
                .map_or_else(|_| node.clone(), |n| n.trim().to_string());
            CameraInfo { id: format!("/dev/{node}"), name }
        })
        .collect();
    cameras.sort_by(|a, b| a.id.cmp(&b.id));
    cameras
}

/// `[dshow @ 0x..] "HD Pro Webcam C920" (video)`
fn parse_dshow(out: &str) -> Vec<CameraInfo> {
    out.lines()
        .filter(|l| l.contains("(video)"))
        .filter_map(|l| {
            let start = l.find('"')? + 1;
            let end = start + l[start..].find('"')?;
            let name = &l[start..end];
            Some(CameraInfo { id: name.to_string(), name: name.to_string() })
        })
        .collect()
}

/// Video devices come first, as `[AVFoundation indev @ 0x..] [0] FaceTime HD
/// Camera`, until the audio section begins.
fn parse_avfoundation(out: &str) -> Vec<CameraInfo> {
    let mut cameras = Vec::new();
    let mut in_video = false;
    for line in out.lines() {
        if line.contains("AVFoundation video devices") {
            in_video = true;
        } else if line.contains("AVFoundation audio devices") {
            in_video = false;
        } else if in_video {
            let Some(rest) = line.split("] [").nth(1) else { continue };
            let Some((index, name)) = rest.split_once("] ") else { continue };
            // Screen capture shows up as a "camera"; it is not one.
            if index.parse::<u32>().is_ok() && !name.starts_with("Capture screen") {
                cameras.push(CameraInfo { id: index.to_string(), name: name.trim().to_string() });
            }
        }
    }
    cameras
}

/// Find input options this camera accepts, asking for the stream's size and
/// rate first and backing off: webcams often only reach 1080p as MJPEG, and
/// avfoundation refuses a rate the device doesn't list.
pub fn camera_input_args(ffmpeg: &Path, camera: &str, width: u32, height: u32, fps: u32) -> Result<Vec<String>, StreamError> {
    let candidates = crate::args::camera_candidates(camera, width, height, fps);
    let mut last_error = String::new();
    for args in &candidates {
        let mut probe = strings(&["-hide_banner", "-loglevel", "error"]);
        probe.extend(args.iter().cloned());
        probe.extend(strings(&["-frames:v", "1", "-f", "null", "-"]));
        let (ok, out) = run(ffmpeg, &probe, Duration::from_secs(8))?;
        if ok {
            log::info!("[STREAM] camera {camera} opened with {args:?}");
            return Ok(args.clone());
        }
        last_error = last_line(&out).to_string();
        log::info!("[STREAM] camera {camera} refused {args:?}: {last_error}");
    }
    Err(StreamError::Camera(if last_error.is_empty() {
        format!("could not open {camera}")
    } else {
        last_error
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_dshow_video_devices() {
        let out = r#"[dshow @ 000001] "HD Pro Webcam C920" (video)
[dshow @ 000001]   Alternative name "@device_pnp_\\?\usb"
[dshow @ 000001] "Microphone (C920)" (audio)
[dshow @ 000001] "OBS Virtual Camera" (video)"#;
        let names: Vec<_> = parse_dshow(out).into_iter().map(|c| c.name).collect();
        assert_eq!(names, ["HD Pro Webcam C920", "OBS Virtual Camera"]);
    }

    #[test]
    fn parses_avfoundation_video_devices() {
        let out = "[AVFoundation indev @ 0x1] AVFoundation video devices:
[AVFoundation indev @ 0x1] [0] FaceTime HD Camera
[AVFoundation indev @ 0x1] [1] Capture screen 0
[AVFoundation indev @ 0x1] [2] Blackmagic UltraStudio
[AVFoundation indev @ 0x1] AVFoundation audio devices:
[AVFoundation indev @ 0x1] [0] MacBook Pro Microphone";
        let cameras = parse_avfoundation(out);
        assert_eq!(cameras.len(), 2);
        assert_eq!((cameras[0].id.as_str(), cameras[0].name.as_str()), ("0", "FaceTime HD Camera"));
        assert_eq!((cameras[1].id.as_str(), cameras[1].name.as_str()), ("2", "Blackmagic UltraStudio"));
    }
}
