//! The ffmpeg command lines, kept free of I/O so they can be tested.

use crate::ffmpeg::{Encoder, TEST_CAMERA};

#[expect(clippy::needless_pass_by_value, reason = "takes literals and numbers alike")]
fn s(v: impl ToString) -> String {
    v.to_string()
}

/// Options that must come before the inputs.
pub fn hw_init_args(encoder: &Encoder) -> Vec<String> {
    match &encoder.vaapi_device {
        Some(device) => vec![s("-vaapi_device"), device.clone()],
        None => Vec::new(),
    }
}

/// The last filter before the encoder: the pixel format it wants, uploaded
/// to the GPU for VAAPI.
pub fn upload_filter(encoder: &Encoder) -> &'static str {
    match encoder.name.as_str() {
        "h264_vaapi" => "format=nv12,hwupload",
        "h264_qsv" => "format=nv12",
        _ => "format=yuv420p",
    }
}

/// Constant bitrate with a keyframe every two seconds — what `YouTube` and
/// Facebook both ask for.
pub fn encoder_args(encoder: &Encoder, kbps: u32, fps: u32) -> Vec<String> {
    let mut args = vec![
        s("-c:v"),
        encoder.name.clone(),
        s("-b:v"),
        format!("{kbps}k"),
        s("-maxrate"),
        format!("{kbps}k"),
        s("-bufsize"),
        format!("{}k", kbps * 2),
        s("-g"),
        s(fps * 2),
    ];
    let extra: &[&str] = match encoder.name.as_str() {
        "h264_nvenc" => &["-preset", "p4", "-rc", "cbr"],
        "h264_vaapi" => &["-rc_mode", "CBR"],
        "h264_amf" => &["-rc", "cbr", "-quality", "speed"],
        "h264_mf" => &["-rate_control", "cbr", "-scenario", "live_streaming"],
        "h264_videotoolbox" => &["-realtime", "1"],
        "libx264" | "h264_qsv" => &["-preset", "veryfast"],
        _ => &[],
    };
    args.extend(extra.iter().map(s));
    args
}

/// Input options to try for a camera, best first, each ending in `-i`.
pub fn camera_candidates(camera: &str, width: u32, height: u32, fps: u32) -> Vec<Vec<String>> {
    let size = format!("{width}x{height}");
    let rate = s(fps);
    let build = |head: &[&str], variants: Vec<Vec<String>>, input: String| -> Vec<Vec<String>> {
        variants
            .into_iter()
            .map(|v| {
                let mut args: Vec<String> = head.iter().map(s).collect();
                args.extend(v);
                args.push(s("-i"));
                args.push(input.clone());
                args
            })
            .collect()
    };

    if camera == TEST_CAMERA {
        return vec![vec![
            s("-re"),
            s("-f"),
            s("lavfi"),
            s("-i"),
            format!("testsrc2=s={size}:r={fps}"),
        ]];
    }
    if cfg!(target_os = "linux") {
        build(
            &["-f", "v4l2"],
            vec![
                vec![s("-input_format"), s("mjpeg"), s("-video_size"), size.clone(), s("-framerate"), rate.clone()],
                vec![s("-video_size"), size.clone(), s("-framerate"), rate],
                vec![s("-video_size"), size],
                vec![],
            ],
            camera.to_string(),
        )
    } else if cfg!(windows) {
        build(
            &["-f", "dshow", "-rtbufsize", "256M"],
            vec![
                vec![s("-video_size"), size.clone(), s("-framerate"), rate],
                vec![s("-video_size"), size],
                vec![],
            ],
            format!("video={camera}"),
        )
    } else {
        build(
            &["-f", "avfoundation"],
            vec![
                vec![s("-framerate"), rate, s("-video_size"), size.clone()],
                vec![s("-framerate"), s("30"), s("-video_size"), size],
                vec![s("-framerate"), s("30")],
                vec![s("-framerate"), s("29.97")],
            ],
            format!("{camera}:none"),
        )
    }
}

pub struct EncoderPipeline<'a> {
    pub encoder: &'a Encoder,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub video_kbps: u32,
    pub audio_kbps: u32,
    pub audio_port: u16,
    pub audio_rate: u32,
    pub audio_delay_ms: u32,
    /// From `ffmpeg::camera_input_args`.
    pub camera: Option<&'a [String]>,
    /// Unix time the inputs are measured from, in seconds.
    pub epoch_secs: f64,
}

/// The encoder: graphics as raw RGBA on stdin, stereo f32 audio over a local
/// socket, optionally a camera under the graphics; MPEG-TS out on stdout for
/// the relays to fan out.
///
/// Every input is stamped with the wall clock and shifted by the same epoch,
/// so sound, camera and graphics stay where they were in real time
/// regardless of which input opened first.
pub fn encoder_pipeline(p: &EncoderPipeline<'_>) -> Vec<String> {
    let EncoderPipeline { encoder, width, height, fps, .. } = *p;
    let offset = format!("-{:.6}", p.epoch_secs);
    let stamp = |args: &mut Vec<String>| {
        args.extend([s("-use_wallclock_as_timestamps"), s("1"), s("-itsoffset"), offset.clone()]);
    };

    let mut args: Vec<String> = ["-hide_banner", "-loglevel", "warning", "-nostdin", "-copyts"].map(s).into();
    args.extend(hw_init_args(encoder));

    stamp(&mut args);
    args.extend([
        s("-thread_queue_size"), s("64"),
        s("-f"), s("rawvideo"), s("-pix_fmt"), s("rgba"),
        s("-video_size"), format!("{width}x{height}"),
        s("-framerate"), s(fps),
        s("-i"), s("pipe:0"),
    ]);

    stamp(&mut args);
    args.extend([
        s("-thread_queue_size"), s("1024"),
        s("-f"), s("f32le"), s("-ar"), s(p.audio_rate), s("-ac"), s("2"),
        s("-i"), format!("tcp://127.0.0.1:{}", p.audio_port),
    ]);

    let pixels = upload_filter(encoder);
    let video = if let Some(camera) = p.camera {
        stamp(&mut args);
        args.extend([s("-thread_queue_size"), s("512")]);
        args.extend(camera.iter().cloned());
        format!(
            "[2:v]scale={width}:{height}:force_original_aspect_ratio=decrease,\
             pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={fps}[cam];\
             [cam][0:v]overlay=eof_action=repeat:repeatlast=1,{pixels}[v]"
        )
    } else {
        format!("[0:v]fps={fps},{pixels}[v]")
    };
    let delay = if p.audio_delay_ms > 0 {
        format!("adelay=delays={}:all=1,", p.audio_delay_ms)
    } else {
        String::new()
    };
    let audio = format!("[1:a]{delay}aresample=48000:async=1000[a]");

    args.extend([s("-filter_complex"), format!("{video};{audio}"), s("-map"), s("[v]"), s("-map"), s("[a]")]);
    args.extend(encoder_args(encoder, p.video_kbps, fps));
    args.extend([
        s("-c:a"), s("aac"), s("-b:a"), format!("{}k", p.audio_kbps), s("-ar"), s("48000"), s("-ac"), s("2"),
        // Repeat SPS/PPS on every keyframe so a relay that reconnects
        // mid-stream can start from the next one.
        s("-bsf:v"), s("dump_extra=freq=keyframe"),
        s("-flush_packets"), s("1"),
        s("-f"), s("mpegts"), s("pipe:1"),
    ]);
    args
}

/// A relay copies the encoded MPEG-TS to one RTMP(S) destination, so each
/// destination connects, fails and reconnects on its own. `-progress` on
/// stdout reports how much has gone out.
pub fn relay(url: &str) -> Vec<String> {
    [
        "-hide_banner", "-loglevel", "error", "-nostdin",
        // Relays start at a keyframe carrying SPS/PPS, so probing ends as soon
        // as both streams are seen; the limits only matter if that is missing.
        "-probesize", "4000000", "-analyzeduration", "1000000",
        "-f", "mpegts", "-i", "pipe:0",
        "-map", "0", "-c", "copy", "-bsf:a", "aac_adtstoasc",
        "-progress", "pipe:1", "-stats_period", "1",
        // Give up on a connection that stops moving data, so it is redialled.
        "-rw_timeout", "15000000",
        "-f", "flv", "-flvflags", "no_duration_filesize",
    ]
    .into_iter()
    .map(s)
    .chain(std::iter::once(url.to_string()))
    .collect()
}

/// Accumulates `-progress` key=value lines; each block ends with
/// `progress=continue|end`.
#[derive(Debug, Default)]
pub struct Progress {
    pub total_size: u64,
    pub bitrate_kbps: f64,
}

impl Progress {
    /// Feed one line; returns true when a block is complete.
    pub fn feed(&mut self, line: &str) -> bool {
        let Some((key, value)) = line.trim().split_once('=') else { return false };
        match key {
            "total_size" => self.total_size = value.parse().unwrap_or(self.total_size),
            "bitrate" => {
                self.bitrate_kbps = value.trim_end_matches("kbits/s").trim().parse().unwrap_or(0.0);
            }
            "progress" => return true,
            _ => {}
        }
        false
    }
}

/// Hides stream keys in anything headed for the log.
pub fn redact(text: &str, keys: &[&str]) -> String {
    keys.iter()
        .filter(|k| k.len() >= 4)
        .fold(text.to_string(), |acc, key| acc.replace(key, "••••"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn x264() -> Encoder {
        Encoder { name: "libx264".into(), vaapi_device: None }
    }

    fn pipeline(camera: Option<&[String]>) -> Vec<String> {
        encoder_pipeline(&EncoderPipeline {
            encoder: &x264(),
            width: 1920,
            height: 1080,
            fps: 30,
            video_kbps: 4500,
            audio_kbps: 128,
            audio_port: 5000,
            audio_rate: 48000,
            audio_delay_ms: 0,
            camera,
            epoch_secs: 1_700_000_000.5,
        })
    }

    fn after<'a>(args: &'a [String], flag: &str) -> &'a str {
        let i = args.iter().position(|a| a == flag).unwrap();
        &args[i + 1]
    }

    #[test]
    fn graphics_only_pipeline() {
        let args = pipeline(None);
        assert_eq!(after(&args, "-filter_complex"), "[0:v]fps=30,format=yuv420p[v];[1:a]aresample=48000:async=1000[a]");
        assert_eq!(after(&args, "-g"), "60");
        assert_eq!(after(&args, "-bufsize"), "9000k");
        assert!(args.iter().any(|a| a == "tcp://127.0.0.1:5000"));
        assert_eq!(args.last().unwrap(), "pipe:1");
        // Graphics and audio share the epoch.
        assert_eq!(args.iter().filter(|a| *a == "-1700000000.500000").count(), 2);
    }

    #[test]
    fn camera_pipeline_overlays_graphics_on_camera() {
        let camera = vec![s("-f"), s("v4l2"), s("-i"), s("/dev/video0")];
        let args = pipeline(Some(&camera));
        let graph = after(&args, "-filter_complex");
        assert!(graph.starts_with("[2:v]scale=1920:1080:force_original_aspect_ratio=decrease"));
        assert!(graph.contains("[cam][0:v]overlay=eof_action=repeat:repeatlast=1,format=yuv420p[v]"));
        assert_eq!(args.iter().filter(|a| *a == "-itsoffset").count(), 3);
    }

    #[test]
    fn audio_delay_goes_before_resampling() {
        let args = encoder_pipeline(&EncoderPipeline {
            encoder: &x264(),
            width: 1280,
            height: 720,
            fps: 30,
            video_kbps: 3000,
            audio_kbps: 160,
            audio_port: 1,
            audio_rate: 44100,
            audio_delay_ms: 120,
            camera: None,
            epoch_secs: 0.0,
        });
        assert!(after(&args, "-filter_complex").ends_with("[1:a]adelay=delays=120:all=1,aresample=48000:async=1000[a]"));
    }

    #[test]
    fn vaapi_uploads_to_gpu() {
        let encoder = Encoder { name: "h264_vaapi".into(), vaapi_device: Some("/dev/dri/renderD128".into()) };
        assert_eq!(hw_init_args(&encoder), ["-vaapi_device", "/dev/dri/renderD128"]);
        assert_eq!(upload_filter(&encoder), "format=nv12,hwupload");
    }

    #[test]
    fn relay_ends_with_url() {
        let args = relay("rtmps://example/live/key");
        assert_eq!(args.last().unwrap(), "rtmps://example/live/key");
        assert_eq!(after(&args, "-c"), "copy");
    }

    #[test]
    fn progress_blocks() {
        let mut p = Progress::default();
        assert!(!p.feed("total_size=1024"));
        assert!(!p.feed("bitrate=4512.3kbits/s"));
        assert!(p.feed("progress=continue"));
        assert_eq!(p.total_size, 1024);
        assert!((p.bitrate_kbps - 4512.3).abs() < 0.01);
        p.feed("bitrate=N/A");
        assert!(p.bitrate_kbps.abs() < f64::EPSILON);
    }

    #[test]
    fn redacts_keys() {
        assert_eq!(redact("rtmps://x/live2/abcd-1234 failed", &["abcd-1234", ""]), "rtmps://x/live2/•••• failed");
    }

    #[test]
    fn camera_candidates_end_with_input() {
        for args in camera_candidates("cam", 1920, 1080, 30) {
            assert_eq!(args[args.len() - 2], "-i");
        }
    }
}
