import { BookOpenIcon, FilmIcon, MegaphoneIcon, MusicIcon, PresentationIcon } from "lucide-react"

/** The kinds of item the service order can hold, as the Add menu offers them. */
export type AddableKind = "song" | "scripture" | "deck" | "media" | "announcement"

export const ADDABLE: { kind: AddableKind; label: string; icon: typeof MusicIcon }[] = [
  { kind: "song", label: "Song", icon: MusicIcon },
  { kind: "scripture", label: "Bible verse", icon: BookOpenIcon },
  { kind: "deck", label: "Slides", icon: PresentationIcon },
  { kind: "media", label: "Video", icon: FilmIcon },
  { kind: "announcement", label: "Text", icon: MegaphoneIcon },
]
