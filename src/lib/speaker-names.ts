import type { SpeakerName } from "@/stores/settings-store"
import type { VerseRenderData } from "@/types"

/** What a name looks like on screen: the name big, the title under it. */
export function nameRenderData(speaker: Pick<SpeakerName, "name" | "title">): VerseRenderData {
  return { style: "name", reference: speaker.title.trim(), segments: [{ text: speaker.name.trim() }] }
}
