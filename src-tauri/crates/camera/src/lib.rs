//! One connection to each network camera, shared by every window showing it.
//!
//! Phone camera apps such as `DroidCam` serve a single viewer at a time: a
//! second connection is refused or left hanging while the first is open.
//! Each Litdeck window (the control window, every output, the settings
//! preview) reads the camera on its own, so here every reader of the same
//! address gets a copy of one upstream byte stream instead of opening its
//! own. The upstream closes shortly after its last reader leaves, and ends
//! when the camera stops sending, so a reader's retry reconnects afresh.
//!
//! The bytes are passed on unchanged (the frontend splits the MJPEG into
//! frames); a reader that joins mid-stream starts at the next picture.
//!
//! A camera attached to this computer (a USB webcam, a capture card, a phone
//! over USB) has the address `device:<id>`: ffmpeg reads it and writes the
//! same MJPEG a phone sends (see [`set_device_source`]). [`health`] says how
//! every camera in use is doing.

mod device;
mod health;

pub use device::{set_device_source, DEVICE_SCHEME};
pub use health::{health, CameraHealth, CameraState};

use std::collections::HashMap;
use std::convert::Infallible;
use std::pin::Pin;
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;

use bytes::Bytes;
use futures_util::{Stream, StreamExt};
use tokio::sync::{broadcast, watch};
use tokio::time::{timeout, Instant};

/// How long a camera gets to answer with its headers.
const ANSWER_TIMEOUT: Duration = Duration::from_secs(5);
/// No bytes for this long and the camera has stalled: end the upstream.
/// Generous on purpose: a phone on weak Wi-Fi often goes quiet for several
/// seconds and then carries on. Hanging up sooner doesn't help: `DroidCam`
/// keeps the dropped connection as its one viewer for a while and answers a
/// new one "Busy", so the picture comes back later than if we'd waited.
/// Readers keep showing the last picture meanwhile, and a reader that
/// reconnects rejoins this same upstream.
const STALL_TIMEOUT: Duration = Duration::from_secs(20);
/// How long an upstream stays open with nobody reading, for a quick switch back.
const LINGER: Duration = Duration::from_secs(2);
/// Chunks buffered for a reader that falls behind; past this it skips ahead.
const BUFFERED_CHUNKS: usize = 256;

#[derive(Clone, Debug, PartialEq, Eq)]
enum Status {
    Connecting,
    Streaming,
    Failed(Problem),
}

/// Why a camera can't be shown.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Problem {
    /// Nothing answered at the address, as opposed to something answering
    /// with a page, an error or a login prompt.
    pub unreachable: bool,
    /// In words for the operator.
    pub message: String,
}

impl Problem {
    fn unreachable(message: impl Into<String>) -> Self {
        Self { unreachable: true, message: message.into() }
    }

    fn answered(message: impl Into<String>) -> Self {
        Self { unreachable: false, message: message.into() }
    }
}

struct Upstream {
    chunks: broadcast::Sender<Bytes>,
    status: watch::Receiver<Status>,
}

/// A camera's bytes as they arrive, from the network or from ffmpeg.
type ByteStream = Pin<Box<dyn Stream<Item = Result<Bytes, String>> + Send>>;

/// How many readers each camera in use has, by address.
fn readers() -> HashMap<String, usize> {
    let upstreams = UPSTREAMS.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    upstreams.iter().map(|(url, u)| (url.clone(), u.chunks.receiver_count())).collect()
}

static UPSTREAMS: LazyLock<Mutex<HashMap<String, Arc<Upstream>>>> = LazyLock::new(Mutex::default);

static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .connect_timeout(ANSWER_TIMEOUT)
        .build()
        .unwrap_or_default()
});

/// The camera at `url`'s bytes, shared with everyone else reading it, or
/// why it can't be read (unreachable, busy, wants a login, not a camera).
pub async fn subscribe(url: &str) -> Result<impl Stream<Item = Result<Bytes, Infallible>>, Problem> {
    let (receiver, mut status) = {
        let upstream = upstream_for(url);
        (upstream.chunks.subscribe(), upstream.status.clone())
    };
    // The task may end (dropping its sender) right after settling the status:
    // the last value is still readable.
    let _ = status.wait_for(|s| *s != Status::Connecting).await;
    let settled = status.borrow().clone();
    match settled {
        Status::Failed(problem) => Err(problem),
        Status::Connecting | Status::Streaming => Ok(futures_util::stream::unfold(receiver, |mut receiver| async move {
            loop {
                match receiver.recv().await {
                    Ok(chunk) => return Some((Ok(chunk), receiver)),
                    // Fell behind: carry on from here; the frontend resyncs at the next picture.
                    Err(broadcast::error::RecvError::Lagged(_)) => {}
                    Err(broadcast::error::RecvError::Closed) => return None,
                }
            }
        })),
    }
}

fn upstream_for(url: &str) -> Arc<Upstream> {
    let mut upstreams = UPSTREAMS.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    if let Some(upstream) = upstreams.get(url) {
        return Arc::clone(upstream);
    }
    let (chunks, _) = broadcast::channel(BUFFERED_CHUNKS);
    let (status_tx, status) = watch::channel(Status::Connecting);
    let upstream = Arc::new(Upstream { chunks: chunks.clone(), status });
    upstreams.insert(url.to_owned(), Arc::clone(&upstream));
    let url = url.to_owned();
    let weak = Arc::downgrade(&upstream);
    tokio::spawn(async move {
        run(&url, &chunks, &status_tx).await;
        let mut upstreams = UPSTREAMS.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        // Only our own entry: a newer upstream may already have replaced it.
        if upstreams.get(&url).is_some_and(|u| std::ptr::eq(Arc::as_ptr(u), weak.as_ptr())) {
            upstreams.remove(&url);
        }
    });
    upstream
}

/// The camera's bytes: from ffmpeg for a `device:` camera, else over HTTP.
async fn open(url: &str) -> Result<ByteStream, Problem> {
    if let Some(id) = url.strip_prefix(DEVICE_SCHEME) {
        return device::open(id).await;
    }
    let response = connect(url).await?;
    Ok(Box::pin(response.bytes_stream().map(|chunk| chunk.map_err(|e| e.to_string()))))
}

/// Read the camera into `chunks` until it stops, stalls or nobody reads.
async fn run(url: &str, chunks: &broadcast::Sender<Bytes>, status: &watch::Sender<Status>) {
    health::connecting(url);
    let mut body = match open(url).await {
        Ok(body) => body,
        Err(problem) => {
            // Retried every few seconds while a camera is off: keep it out of the warnings.
            log::debug!("camera {url}: {}", problem.message);
            health::failed(url, &problem.message);
            let _ = status.send(Status::Failed(problem));
            return;
        }
    };
    let _ = status.send(Status::Streaming);
    health::streaming(url);
    let mut unread_since: Option<Instant> = None;
    loop {
        match timeout(STALL_TIMEOUT, body.next()).await {
            Ok(Some(Ok(chunk))) => {
                health::data(url, &chunk);
                let _ = chunks.send(chunk);
            }
            Err(_) => {
                log::debug!("camera {url}: stalled");
                health::ended(url, "The camera stopped sending pictures.");
                return;
            }
            Ok(Some(Err(e))) => {
                log::debug!("camera {url}: {e}");
                health::ended(url, "The camera's connection dropped.");
                return;
            }
            Ok(None) => {
                health::ended(url, "The camera stopped sending pictures.");
                return;
            }
        }
        if chunks.receiver_count() == 0 {
            if unread_since.get_or_insert_with(Instant::now).elapsed() >= LINGER {
                health::closed(url);
                return;
            }
        } else {
            unread_since = None;
        }
    }
}

async fn connect(url: &str) -> Result<reqwest::Response, Problem> {
    let parsed = reqwest::Url::parse(url).map_err(|_| Problem::answered("That isn't a camera address."))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(Problem::answered("Only http:// camera addresses work."));
    }
    let response = match timeout(ANSWER_TIMEOUT, CLIENT.get(parsed).send()).await {
        Err(_) => {
            return Err(Problem::unreachable("The camera didn't answer. If it's DroidCam, close it on any other computer or browser using it, then try again."))
        }
        Ok(Err(e)) if e.is_connect() || e.is_timeout() => {
            return Err(Problem::unreachable("Can't reach the camera. Check the phone is on the same Wi-Fi with its camera app open, and the address."))
        }
        Ok(Err(e)) => return Err(Problem::unreachable(format!("Can't reach the camera ({e})."))),
        Ok(Ok(response)) => response,
    };
    let code = response.status();
    if code == reqwest::StatusCode::UNAUTHORIZED || code == reqwest::StatusCode::FORBIDDEN {
        return Err(Problem::answered(
            "The camera wants a username and password: enter it as http://user:password@address.",
        ));
    }
    if !code.is_success() {
        return Err(Problem::answered(format!("The camera answered with an error ({code}). Check the address.")));
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if content_type.starts_with("text/") {
        // A page, not pictures: a camera app saying it's busy, or the wrong path.
        let text = timeout(ANSWER_TIMEOUT, response.text()).await.ok().and_then(Result::ok).unwrap_or_default();
        let said = page_text(&text);
        return Err(Problem::answered(if said.is_empty() {
            "That address is a web page, not a camera stream. Check the path (e.g. /video).".to_owned()
        } else {
            format!("The camera says: \u{201c}{said}\u{201d}")
        }));
    }
    Ok(response)
}

/// The words of an HTML page, tags dropped and spaces squeezed, cut short.
fn page_text(html: &str) -> String {
    let mut text = String::new();
    let mut in_tag = false;
    let mut skipping = false;
    let lower = html.to_ascii_lowercase();
    for (at, c) in html.char_indices() {
        if c == '<' {
            in_tag = true;
            let rest = &lower[at..];
            if rest.starts_with("<script") || rest.starts_with("<style") {
                skipping = true;
            } else if rest.starts_with("</script") || rest.starts_with("</style") {
                skipping = false;
            }
            continue;
        }
        if c == '>' {
            in_tag = false;
            text.push(' ');
            continue;
        }
        if !in_tag && !skipping {
            text.push(c);
        }
    }
    let squeezed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if squeezed.chars().count() > 160 {
        format!("{}\u{2026}", squeezed.chars().take(160).collect::<String>())
    } else {
        squeezed
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    /// A camera that, like `DroidCam`, serves one viewer at a time: it reads
    /// the next request only once the current one has ended.
    async fn single_viewer_camera(head: &'static str, frames: bool) -> (String, Arc<AtomicUsize>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let served = Arc::new(AtomicUsize::new(0));
        let count = Arc::clone(&served);
        tokio::spawn(async move {
            loop {
                let (mut socket, _) = listener.accept().await.unwrap();
                count.fetch_add(1, Ordering::SeqCst);
                let mut request = [0u8; 1024];
                let _ = socket.read(&mut request).await;
                if socket.write_all(head.as_bytes()).await.is_err() {
                    continue;
                }
                if !frames {
                    continue;
                }
                loop {
                    let jpeg_part = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n\xff\xd8 picture \xff\xd9\r\n";
                    if socket.write_all(jpeg_part).await.is_err() {
                        break;
                    }
                    tokio::time::sleep(Duration::from_millis(20)).await;
                }
            }
        });
        (format!("http://127.0.0.1:{port}/video"), served)
    }

    const MJPEG_HEAD: &str =
        "HTTP/1.1 200 OK\r\nContent-Type: multipart/x-mixed-replace; boundary=frame\r\nConnection: close\r\n\r\n";

    #[tokio::test]
    async fn two_readers_share_one_connection_to_a_single_viewer_camera() {
        let (url, served) = single_viewer_camera(MJPEG_HEAD, true).await;
        let a = subscribe(&url).await.expect("first reader");
        let b = timeout(Duration::from_secs(2), subscribe(&url)).await.expect("second reader waited").expect("second reader");
        let (mut a, mut b) = (Box::pin(a), Box::pin(b));
        for stream in [&mut a, &mut b] {
            let chunk = timeout(Duration::from_secs(2), stream.next()).await.unwrap().unwrap().unwrap();
            assert!(!chunk.is_empty());
        }
        assert_eq!(served.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn a_busy_page_is_reported_in_the_cameras_words() {
        // What DroidCam 6 sends while another viewer has it.
        let page = include_str!("../tests-data/droidcam-busy.html");
        let head = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=UTF-8\r\nContent-length: {}\r\nConnection: Keep-Alive\r\n\r\n{page}",
            page.len()
        );
        let (url, _) = single_viewer_camera(Box::leak(head.into_boxed_str()), false).await;
        let Err(problem) = subscribe(&url).await else { panic!("a page isn't a stream") };
        assert!(problem.message.contains("DroidCam is Busy"), "{problem:?}");
        assert!(!problem.unreachable);
    }

    #[tokio::test]
    async fn a_login_prompt_says_how_to_log_in() {
        let (url, _) = single_viewer_camera(
            "HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm=\"cam\"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
            false,
        )
        .await;
        let Err(problem) = subscribe(&url).await else { panic!("needs a login") };
        assert!(problem.message.contains("user:password@"), "{problem:?}");
    }

    #[tokio::test]
    async fn nothing_listening_is_unreachable() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let Err(problem) = subscribe(&format!("http://127.0.0.1:{port}/video")).await else { panic!() };
        assert!(problem.unreachable, "{problem:?}");
    }

    /// A stand-in for ffmpeg: a shell loop writing MJPEG parts with a 320x240 frame header.
    #[cfg(unix)]
    fn fake_device(script: &'static str) -> std::process::Command {
        let mut cmd = std::process::Command::new("sh");
        cmd.arg("-c").arg(script);
        cmd
    }

    #[cfg(unix)]
    static NOBUFS_TRIES: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

    #[cfg(unix)]
    fn use_fake_devices() {
        set_device_source(|id| match id {
            "fake-nobufs" => {
                NOBUFS_TRIES.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                Err("Error opening input files: No buffer space available".into())
            }
            "fake-ok" => Ok(fake_device(
                r"while true; do printf -- '--ffmpeg\r\nContent-Type: image/jpeg\r\n\r\n\377\330\377\300\000\021\010\000\360\001\100 picture \377\331\r\n'; sleep 0.05; done",
            )),
            "fake-busy" => Ok(fake_device("echo '/dev/video9: Device or resource busy' >&2; exit 1")),
            other => Err(format!("no such camera {other}")),
        });
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_device_camera_streams_through_ffmpeg_and_reports_its_size() {
        use_fake_devices();
        let url = format!("{DEVICE_SCHEME}fake-ok");
        let mut stream = Box::pin(subscribe(&url).await.expect("device opens"));
        let chunk = timeout(Duration::from_secs(3), stream.next()).await.unwrap().unwrap().unwrap();
        assert!(chunk.windows(2).any(|w| w == [0xFF, 0xD8]), "MJPEG passes through");
        let shown = health().into_iter().find(|h| h.url == url).expect("in use");
        assert_eq!(shown.state, CameraState::Live);
        assert_eq!((shown.width, shown.height), (Some(320), Some(240)));
        assert_eq!(shown.readers, 1);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_device_that_wont_open_says_why() {
        use_fake_devices();
        let url = format!("{DEVICE_SCHEME}fake-busy");
        let Err(problem) = subscribe(&url).await else { panic!("busy device") };
        assert!(problem.message.contains("in use by another app"), "{problem:?}");
        let shown = health().into_iter().find(|h| h.url == url).expect("tried");
        assert_eq!(shown.state, CameraState::Down);
        assert!(shown.problem.unwrap().contains("in use"));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_device_that_failed_isnt_probed_again_straight_away() {
        use std::sync::atomic::Ordering;
        use_fake_devices();
        let url = format!("{DEVICE_SCHEME}fake-nobufs");
        let Err(first) = subscribe(&url).await else { panic!("fails") };
        assert!(first.message.contains("driver couldn't start it"), "{first:?}");
        let Err(_) = subscribe(&url).await else { panic!("still failing") };
        // The second ask got the standing answer, without running ffmpeg again.
        assert_eq!(NOBUFS_TRIES.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn page_text_keeps_the_words() {
        assert_eq!(
            page_text("<html><head><style>b{}</style></head><body><b>Busy</b>  now</body></html>"),
            "Busy now"
        );
    }
}
