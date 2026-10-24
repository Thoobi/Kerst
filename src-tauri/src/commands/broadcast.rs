#![expect(clippy::needless_pass_by_value, reason = "Tauri command extractors require pass-by-value")]

use std::sync::Mutex;

use serde::Serialize;
use tauri::ipc::{InvokeBody, Request};
use tauri::State;
use tauri::utils::config::BackgroundThrottlingPolicy;
use tauri::{Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use litdeck_broadcast::ndi::{NdiRuntime, NdiSessionInfo, NdiStartRequest};
use litdeck_stream::StreamRuntime;

/// Map `output_id` to its Tauri window label (`broadcast-{id}`).
///
/// Output ids are caller-supplied and end up in the window label and URL, so
/// they are restricted to a safe charset. The capability files grant
/// permissions to `broadcast-*`, which covers every label produced here.
fn window_label(output_id: &str) -> Result<String, String> {
    let valid = !output_id.is_empty()
        && output_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !valid {
        return Err(format!("invalid broadcast output id: {output_id:?}"));
    }
    Ok(format!("broadcast-{output_id}"))
}

/// Map `output_id` to broadcast-output.html URL with query param.
fn window_url(output_id: &str) -> String {
    format!("broadcast-output.html?output={output_id}")
}

#[derive(Serialize)]
pub struct MonitorInfo {
    pub name: String,
    pub width: u32,
    pub height: u32,
}

#[tauri::command]
pub fn list_monitors(app: tauri::AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let monitors = app.available_monitors().map_err(|e| {
        log::error!("list_monitors: available_monitors failed: {e}");
        e.to_string()
    })?;
    log::info!("list_monitors: {} monitor(s) detected", monitors.len());
    Ok(monitors
        .iter()
        .map(|m| {
            let size = m.size();
            MonitorInfo {
                name: m.name().cloned().unwrap_or_else(|| "Unknown".to_string()),
                width: size.width,
                height: size.height,
            }
        })
        .collect())
}

/// Ensure the broadcast window for a given output exists (creates hidden if not).
///
/// Async on purpose: on Windows, building a webview window from a synchronous
/// command deadlocks — the command blocks the thread the window creation
/// needs to dispatch to, and `build()` never returns.
#[tauri::command]
pub async fn ensure_broadcast_window(
    app: tauri::AppHandle,
    output_id: String,
    title: Option<String>,
) -> Result<(), String> {
    let label = window_label(&output_id)?;
    if app.get_webview_window(&label).is_some() {
        return Ok(());
    }
    let window = WebviewWindowBuilder::new(
        &app,
        &label,
        WebviewUrl::App(window_url(&output_id).into()),
    )
    .title(title.unwrap_or_else(|| "Litdeck Output".to_string()))
    .inner_size(1920.0, 1080.0)
    .visible(false)
    .skip_taskbar(true)
    .focused(false)
    .background_throttling(BackgroundThrottlingPolicy::Disabled)
    .build()
    .map_err(|e| e.to_string())?;
    keep_running_when_hidden(&window);
    Ok(())
}

/// A hidden output window still feeds NDI and the stream, and a playing
/// video or GIF logo needs it to draw every frame. Browsers slow the timers
/// of hidden pages to a few a second; turn that off. macOS does it through
/// `background_throttling`; on Linux, a feature flag of the web view.
fn keep_running_when_hidden(window: &WebviewWindow) {
    #[cfg(target_os = "linux")]
    if let Err(e) = window.with_webview(|webview| webkit_features::disable_hidden_page_throttling(&webview.inner())) {
        log::warn!("keep_running_when_hidden: {e}");
    }
    #[cfg(not(target_os = "linux"))]
    let _ = window;
}

/// The Linux web view's feature flags (webkit2gtk 2.42+), looked up at run time:
/// the bindings predate them, and linking them directly would stop the app
/// starting on an older one.
#[cfg(target_os = "linux")]
mod webkit_features {
    use std::ffi::{c_char, c_void, CStr};

    use webkit2gtk::glib::translate::ToGlibPtr;
    use webkit2gtk::WebViewExt;

    const FLAGS: [&str; 3] = ["HiddenPageDOMTimerThrottling", "DOMTimersThrottling", "PageVisibilityBasedProcessSuppression"];

    type GetAllFeatures = unsafe extern "C" fn() -> *mut c_void;
    type ListLength = unsafe extern "C" fn(*mut c_void) -> usize;
    type ListGet = unsafe extern "C" fn(*mut c_void, usize) -> *mut c_void;
    type ListUnref = unsafe extern "C" fn(*mut c_void);
    type Identifier = unsafe extern "C" fn(*mut c_void) -> *const c_char;
    type SetEnabled = unsafe extern "C" fn(*mut c_void, *mut c_void, i32);

    fn symbol<T>(name: &CStr) -> Option<T> {
        // SAFETY: dlsym only looks the name up; RTLD_DEFAULT searches the
        // libraries already loaded, which include libwebkit2gtk.
        let ptr = unsafe { libc::dlsym(libc::RTLD_DEFAULT, name.as_ptr()) };
        // SAFETY: T is the function pointer type of the symbol's C signature.
        (!ptr.is_null()).then(|| unsafe { std::mem::transmute_copy::<*mut c_void, T>(&ptr) })
    }

    pub fn disable_hidden_page_throttling(webview: &webkit2gtk::WebView) {
        let (Some(get_all), Some(length), Some(get), Some(unref), Some(identifier), Some(set_enabled)) = (
            symbol::<GetAllFeatures>(c"webkit_settings_get_all_features"),
            symbol::<ListLength>(c"webkit_feature_list_get_length"),
            symbol::<ListGet>(c"webkit_feature_list_get"),
            symbol::<ListUnref>(c"webkit_feature_list_unref"),
            symbol::<Identifier>(c"webkit_feature_get_identifier"),
            symbol::<SetEnabled>(c"webkit_settings_set_feature_enabled"),
        ) else {
            log::warn!("WebKitGTK is older than 2.42: hidden output windows may drop frames");
            return;
        };
        let Some(settings) = webview.settings() else { return };
        let settings_ptr: *mut webkit2gtk::ffi::WebKitSettings = settings.to_glib_none().0;

        let mut disabled = 0;
        // SAFETY: the list is owned here and unref'd once; features borrowed
        // from it are used before that, and settings outlives the calls.
        unsafe {
            let list = get_all();
            for i in 0..length(list) {
                let feature = get(list, i);
                let id = CStr::from_ptr(identifier(feature)).to_string_lossy();
                if FLAGS.contains(&id.as_ref()) {
                    set_enabled(settings_ptr.cast(), feature, 0);
                    disabled += 1;
                }
            }
            unref(list);
        }
        webview.set_settings(&settings);
        log::info!("Hidden page timer throttling off ({disabled}/{} flags)", FLAGS.len());
    }
}

/// Async on purpose — see [`ensure_broadcast_window`]: sync window creation
/// deadlocks on Windows.
#[tauri::command]
pub async fn open_broadcast_window(
    app: tauri::AppHandle,
    output_id: String,
    monitor_index: usize,
    title: Option<String>,
) -> Result<(), String> {
    log::info!("open_broadcast_window: output={output_id}, monitor_index={monitor_index}");
    let label = window_label(&output_id)?;
    let monitors = app.available_monitors().map_err(|e| {
        log::error!("open_broadcast_window: available_monitors failed: {e}");
        e.to_string()
    })?;
    let monitor = monitors.get(monitor_index).ok_or_else(|| {
        let msg = format!(
            "Monitor index {monitor_index} out of range ({} available)",
            monitors.len()
        );
        log::error!("open_broadcast_window: {msg}");
        msg
    })?;

    let pos = monitor.position();
    let size = monitor.size();
    log::info!(
        "open_broadcast_window: target monitor pos=({},{}) size={}x{} scale={}",
        pos.x,
        pos.y,
        size.width,
        size.height,
        monitor.scale_factor()
    );

    // Reuse the window if it already exists (e.g. hidden for NDI), otherwise
    // create it hidden and without geometry: the builder's position/inner_size
    // take logical pixels, so passing the monitor's physical values gets
    // re-multiplied by the scale factor on scaled displays (Windows commonly
    // runs 125-150%), pushing the window off the target monitor. Physical
    // setters after the fact are unambiguous on both paths.
    let window = if let Some(window) = app.get_webview_window(&label) {
        log::info!("open_broadcast_window: reusing existing window '{label}'");
        window
    } else {
        log::info!("open_broadcast_window: creating window '{label}'");
        let window = WebviewWindowBuilder::new(
            &app,
            &label,
            WebviewUrl::App(window_url(&output_id).into()),
        )
        .title(title.unwrap_or_else(|| "Litdeck Output".to_string()))
        .visible(false)
        .decorations(true)
        .always_on_top(false)
        .skip_taskbar(false)
        .focused(false)
        .decorations(false)
        .fullscreen(true)
        .minimizable(false)
        .background_throttling(BackgroundThrottlingPolicy::Disabled)
        .build()
        .map_err(|e| {
            log::error!("open_broadcast_window: window build failed: {e}");
            e.to_string()
        })?;
        keep_running_when_hidden(&window);
        window
    };

    window
        .set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: pos.x,
            y: pos.y,
        }))
        .map_err(|e| {
            log::error!("open_broadcast_window: set_position failed: {e}");
            e.to_string()
        })?;
    window
        .set_size(tauri::Size::Physical(tauri::PhysicalSize {
            width: size.width,
            height: size.height,
        }))
        .map_err(|e| {
            log::error!("open_broadcast_window: set_size failed: {e}");
            e.to_string()
        })?;
    // A window created hidden for NDI has skip_taskbar(true); make sure the
    // visible projector is reachable from the taskbar either way.
    let _ = window.set_skip_taskbar(false);
    window.show().map_err(|e| {
        log::error!("open_broadcast_window: show failed: {e}");
        e.to_string()
    })?;
    let _ = window.set_focus();
    log::info!("open_broadcast_window: '{label}' shown at ({},{}) {}x{}", pos.x, pos.y, size.width, size.height);

    Ok(())
}

/// Async on purpose — `Window::hide`/`close` also round-trip through the
/// main thread and can deadlock in a sync command on Windows.
#[tauri::command]
pub async fn close_broadcast_window(
    app: tauri::AppHandle,
    output_id: String,
    runtime: State<'_, Mutex<NdiRuntime>>,
    streams: State<'_, Mutex<StreamRuntime>>,
) -> Result<(), String> {
    let label = window_label(&output_id)?;
    if let Some(window) = app.get_webview_window(&label) {
        let ndi_active = runtime
            .lock()
            .map_err(|e| e.to_string())?
            .is_active(&output_id);
        let stream_active = streams.lock().map_err(|e| e.to_string())?.is_active(&output_id);
        if ndi_active || stream_active {
            log::info!("close_broadcast_window: '{output_id}' is feeding NDI or a stream, hiding window instead of closing");
            window.hide().map_err(|e| {
                log::error!("close_broadcast_window: hide failed: {e}");
                e.to_string()
            })?;
        } else {
            log::info!("close_broadcast_window: closing '{output_id}' window");
            window.close().map_err(|e| {
                log::error!("close_broadcast_window: close failed: {e}");
                e.to_string()
            })?;
        }
    } else {
        log::info!("close_broadcast_window: no '{output_id}' window to close");
    }
    Ok(())
}

#[tauri::command]
pub fn start_ndi(
    output_id: String,
    runtime: State<'_, Mutex<NdiRuntime>>,
    request: NdiStartRequest,
) -> Result<NdiSessionInfo, String> {
    let mut runtime = runtime.lock().map_err(|e| e.to_string())?;
    runtime.start(output_id, request).map_err(|e| {
        log::error!("start_ndi failed: {e}");
        e.to_string()
    })
}

#[tauri::command]
pub fn stop_ndi(output_id: String, runtime: State<'_, Mutex<NdiRuntime>>) -> Result<(), String> {
    let mut runtime = runtime.lock().map_err(|e| e.to_string())?;
    runtime.stop(&output_id);
    Ok(())
}

#[derive(Serialize)]
pub struct NdiStatusResponse {
    pub active: bool,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
}

#[tauri::command]
pub fn get_ndi_status(
    output_id: String,
    runtime: State<'_, Mutex<NdiRuntime>>,
) -> Result<Option<NdiStatusResponse>, String> {
    let runtime = runtime.lock().map_err(|e| e.to_string())?;
    match runtime.current_info(&output_id) {
        Some(info) => Ok(Some(NdiStatusResponse {
            active: true,
            width: info.width,
            height: info.height,
            fps: info.fps,
        })),
        None => Ok(None),
    }
}

/// What the output window should capture frames at: its NDI sender's
/// settings, else its stream's, else nothing (`None`).
#[tauri::command]
pub fn get_capture_status(
    output_id: String,
    runtime: State<'_, Mutex<NdiRuntime>>,
    streams: State<'_, Mutex<StreamRuntime>>,
) -> Result<Option<NdiStatusResponse>, String> {
    if let Some(ndi) = get_ndi_status(output_id.clone(), runtime)? {
        return Ok(Some(ndi));
    }
    let streams = streams.lock().map_err(|e| e.to_string())?;
    Ok(streams.status(&output_id).map(|s| NdiStatusResponse {
        active: true,
        width: s.width,
        height: s.height,
        fps: s.fps,
    }))
}

/// Send one frame from an output window to its NDI sender and/or stream.
/// The body is the raw RGBA pixels (sent as an `ArrayBuffer`, not JSON: a
/// playing video pushes a full frame many times a second), described by the
/// `x-output-id`, `x-frame-width` and `x-frame-height` headers.
#[tauri::command]
pub fn push_output_frame(
    runtime: State<'_, Mutex<NdiRuntime>>,
    streams: State<'_, Mutex<StreamRuntime>>,
    request: Request<'_>,
) -> Result<(), String> {
    let InvokeBody::Raw(rgba_data) = request.body() else {
        return Err("push_output_frame expects the pixels as raw bytes".into());
    };
    let header = |name: &str| {
        request
            .headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| format!("push_output_frame needs an {name} header"))
    };
    let dimension = |name: &str| -> Result<u32, String> {
        header(name)?.parse().map_err(|_| format!("push_output_frame: {name} is not a number"))
    };
    let output_id = header("x-output-id")?;
    let (width, height) = (dimension("x-frame-width")?, dimension("x-frame-height")?);
    let streamed = streams
        .lock()
        .map_err(|e| e.to_string())?
        .push_frame(output_id, width, height, rgba_data)
        .map_err(|e| e.to_string())?;
    let mut runtime = runtime.lock().map_err(|e| e.to_string())?;
    if streamed && !runtime.is_active(output_id) {
        return Ok(());
    }
    runtime
        .send_frame_rgba(output_id, width, height, rgba_data)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::window_label;

    #[test]
    fn window_label_formats_valid_ids() {
        assert_eq!(window_label("main").unwrap(), "broadcast-main");
        assert_eq!(
            window_label("3f2a9c10-4b7e-4d2a-9c51-8e6f0a1b2c3d").unwrap(),
            "broadcast-3f2a9c10-4b7e-4d2a-9c51-8e6f0a1b2c3d"
        );
        assert_eq!(window_label("out_2").unwrap(), "broadcast-out_2");
    }

    #[test]
    fn window_label_rejects_unsafe_ids() {
        assert!(window_label("").is_err());
        assert!(window_label("has space").is_err());
        assert!(window_label("dot.dot").is_err());
        assert!(window_label("query?x=1").is_err());
        assert!(window_label("slash/id").is_err());
    }
}
