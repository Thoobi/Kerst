import { useEffect, useState } from "react"
import {
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  RotateCcwIcon,
  SquareIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { formatTime, hasEnded, positionAt } from "@/lib/video-playback"
import { useVideosStore } from "@/stores/videos-store"
import type { VideoPlayback } from "@/types"

/**
 * `Date.now()`, refreshed every `ms` while `ms` is set. A stale value while
 * paused is harmless: a paused clock doesn't depend on the time.
 */
function useNow(ms: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (ms === null) return
    const timer = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(timer)
  }, [ms])
  return now
}

export interface VideoTransportProps {
  playback: VideoPlayback
  title: string
  muted: boolean
  /** 0–1. */
  volume: number
  onTogglePlay: () => void
  onRestart: () => void
  onSeek: (seconds: number) => void
  onLoopChange: (loop: boolean) => void
  onMutedChange: (muted: boolean) => void
  onVolumeChange: (volume: number) => void
  onStop: () => void
  /** What Stop does, for its tooltip. */
  stopTitle: string
  /** Extra hint on Play/Pause, e.g. its keyboard shortcut. */
  playHint?: string
}

/**
 * Play/pause, scrub, loop, volume and stop for one video clock. The Live
 * and Preview panels both use it, so the controls look and behave the same.
 */
export function VideoTransport({
  playback,
  title,
  muted,
  volume,
  onTogglePlay,
  onRestart,
  onSeek,
  onLoopChange,
  onMutedChange,
  onVolumeChange,
  onStop,
  stopTitle,
  playHint,
}: VideoTransportProps) {
  const now = useNow(playback.playing ? 250 : null)
  // While dragging, the thumb follows the pointer; the video only seeks on release.
  const [scrub, setScrub] = useState<number | null>(null)

  const position = scrub ?? positionAt(playback, now)
  const playing = playback.playing && !hasEnded(playback, now)
  const playTitle = playing ? "Pause" : "Play"

  return (
    <div data-slot="video-transport" className="flex flex-col gap-1 px-2 pb-2">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onTogglePlay}
          title={playHint ? `${playTitle} (${playHint})` : playTitle}
          aria-label={playTitle}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={onRestart} title="Back to the start" aria-label="Back to the start">
          <RotateCcwIcon />
        </Button>
        <span className="w-12 shrink-0 text-right font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
          {formatTime(position)}
        </span>
        <Slider
          className="mx-1.5 flex-1"
          min={0}
          max={Math.max(playback.duration, 0.1)}
          step={0.1}
          value={[position]}
          onValueChange={([value]) => setScrub(value)}
          onValueCommit={([value]) => {
            onSeek(value)
            setScrub(null)
          }}
          aria-label="Position"
        />
        <span className="w-12 shrink-0 font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
          -{formatTime(playback.duration - position)}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate pl-1 text-[0.6875rem] text-muted-foreground">{title}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onLoopChange(!playback.loop)}
          aria-pressed={playback.loop}
          title={playback.loop ? "Looping: plays again from the top when it ends" : "Loop"}
          className={cn(playback.loop && "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary")}
        >
          <RepeatIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onMutedChange(!muted)}
          aria-pressed={muted}
          title={muted ? "Unmute" : "Mute"}
        >
          {muted || volume === 0 ? <VolumeXIcon /> : <Volume2Icon />}
        </Button>
        <Slider
          className="w-16"
          min={0}
          max={1}
          step={0.05}
          value={[muted ? 0 : volume]}
          onValueChange={([value]) => onVolumeChange(value)}
          aria-label="Volume"
        />
        <Button variant="ghost" size="xs" onClick={onStop} title={stopTitle} className="ml-1">
          <SquareIcon />
          Stop
        </Button>
      </div>
    </div>
  )
}

/** The transport for the video on the live output. Lives under the Live panel. */
export function LiveVideoTransport({ playback, title }: { playback: VideoPlayback; title: string }) {
  const volume = useVideosStore((s) => s.volume)
  const muted = useVideosStore((s) => s.muted)
  const { togglePlay, restart, seekTo, stop, setLoop, setVolume, setMuted } = useVideosStore.getState()
  return (
    <VideoTransport
      playback={playback}
      title={title}
      muted={muted}
      volume={volume}
      onTogglePlay={togglePlay}
      onRestart={restart}
      onSeek={seekTo}
      onLoopChange={(loop) => void setLoop(playback.id, loop)}
      onMutedChange={setMuted}
      onVolumeChange={setVolume}
      onStop={stop}
      stopTitle="Take the video off the live output"
      playHint="Space in the Videos tab"
    />
  )
}
