#!/usr/bin/env bash
# Put an LGPL ffmpeg where the release build bundles it as a sidecar:
#   sdk/ffmpeg/ffmpeg-<target-triple>[.exe]
#
# Linux and Windows use BtbN's LGPL builds (hardware encoders, OpenH264 and
# RTMPS included). There is no equivalent for macOS, so it is built from
# source against the system frameworks only: VideoToolbox for encoding,
# Secure Transport for RTMPS, AVFoundation for cameras.
#
#   scripts/fetch-ffmpeg.sh x86_64-unknown-linux-gnu
set -euo pipefail

TARGET="${1:?usage: fetch-ffmpeg.sh <target-triple>}"
FFMPEG_VERSION="8.1"
BTBN="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/sdk/ffmpeg"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT_DIR"

case "$TARGET" in
  x86_64-unknown-linux-gnu)
    name="ffmpeg-n${FFMPEG_VERSION}-latest-linux64-lgpl-${FFMPEG_VERSION}"
    curl -fsSL --retry 3 -o "$WORK/f.tar.xz" "$BTBN/$name.tar.xz"
    tar -xJf "$WORK/f.tar.xz" -C "$WORK"
    install -m 755 "$WORK/$name/bin/ffmpeg" "$OUT_DIR/ffmpeg-$TARGET"
    ;;
  x86_64-pc-windows-msvc)
    name="ffmpeg-n${FFMPEG_VERSION}-latest-win64-lgpl-${FFMPEG_VERSION}"
    curl -fsSL --retry 3 -o "$WORK/f.zip" "$BTBN/$name.zip"
    unzip -q "$WORK/f.zip" -d "$WORK"
    cp "$WORK/$name/bin/ffmpeg.exe" "$OUT_DIR/ffmpeg-$TARGET.exe"
    ;;
  aarch64-apple-darwin | x86_64-apple-darwin)
    curl -fsSL --retry 3 -o "$WORK/src.tar.xz" "https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz"
    tar -xJf "$WORK/src.tar.xz" -C "$WORK"
    cd "$WORK/ffmpeg-${FFMPEG_VERSION}"
    # --disable-autodetect keeps Homebrew libraries on the runner out of the
    # binary; everything enabled below is a system framework.
    ./configure \
      --disable-autodetect \
      --disable-doc --disable-debug --disable-ffplay --disable-ffprobe \
      --enable-videotoolbox --enable-audiotoolbox \
      --enable-securetransport --enable-avfoundation --enable-zlib \
      --extra-cflags="-mmacosx-version-min=11.0" \
      --extra-ldflags="-mmacosx-version-min=11.0"
    make -j"$(sysctl -n hw.ncpu)"
    install -m 755 ffmpeg "$OUT_DIR/ffmpeg-$TARGET"
    ;;
  *)
    echo "fetch-ffmpeg: no ffmpeg recipe for $TARGET" >&2
    exit 1
    ;;
esac

bin="$(ls "$OUT_DIR"/ffmpeg-"$TARGET"*)"
"$bin" -hide_banner -version | head -1
# Streaming to YouTube and Facebook needs RTMPS.
"$bin" -hide_banner -protocols 2>/dev/null | grep -qx '  rtmps' || {
  echo "fetch-ffmpeg: $bin lacks RTMPS" >&2
  exit 1
}
