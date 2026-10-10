import { create } from "zustand"
import { libraryApi } from "@/lib/library-api"
import { bibleActions } from "@/hooks/use-bible"
import { useContentTabStore } from "./content-tab-store"
import { useSlidesStore } from "./slides-store"
import { useSongsStore } from "./songs-store"
import { useTextsStore } from "./texts-store"
import { useVideosStore } from "./videos-store"
import type { Schedule, ScheduleItem, ScheduleItemKind, ScheduleSummary } from "@/types"

/** What each kind of service item stores to find its content again. */
export type ServiceItemPayload =
  | { songId: string }
  | { textId: string }
  | { videoId: string }
  | { deckId: string }
  | { bookNumber: number; chapter: number; verse: number }

export interface NewServiceItem {
  kind: ScheduleItemKind
  title: string
  payload: ServiceItemPayload
}

/** The last service opened, so the app comes back to it. Per machine. */
const LAST_SERVICE_KEY = "light.lastServiceId"

function rememberService(id: string | null) {
  try {
    if (id) localStorage.setItem(LAST_SERVICE_KEY, id)
    else localStorage.removeItem(LAST_SERVICE_KEY)
  } catch {
    // Storage can be unavailable; the newest service opens instead.
  }
}

function lastServiceId(): string | null {
  try {
    return localStorage.getItem(LAST_SERVICE_KEY)
  } catch {
    return null
  }
}

/** Today as YYYY-MM-DD in local time, for a new service's date. */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Move one entry of `items` from `from` to `to`. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length) return items
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved)
  return next
}

interface ServiceState {
  services: ScheduleSummary[]
  /** The service being arranged and run. */
  active: Schedule | null
  /** The item last opened from the running order. */
  activeItemId: string | null
  loadError: string | null

  loadServices: () => Promise<void>
  openService: (id: string) => Promise<void>
  createService: (name: string, serviceDate?: string | null) => Promise<void>
  /** Rename and/or redate the open service. */
  updateService: (changes: { name?: string; serviceDate?: string | null }) => Promise<void>
  deleteService: (id: string) => Promise<void>
  addItem: (item: NewServiceItem) => Promise<void>
  removeItem: (itemId: string) => Promise<void>
  reorder: (from: number, to: number) => Promise<void>
  /** Open an item in its content tab, ready to present. */
  openItem: (itemId: string) => Promise<void>
}

// Saves run one after another so a quick reorder can't overwrite a newer one.
let saving: Promise<unknown> = Promise.resolve()

export const useServiceStore = create<ServiceState>((set, get) => {
  /** Show `schedule` at once, then save it. */
  const commit = async (schedule: Schedule) => {
    set({ active: schedule })
    const save = saving.then(() =>
      libraryApi.saveSchedule({
        id: schedule.id,
        name: schedule.name,
        service_date: schedule.service_date,
        items: schedule.items.map(({ id, kind, title, payload }) => ({ id, kind, title, payload })),
      })
    )
    saving = save.catch(() => {})
    await save
    set({ services: await libraryApi.listSchedules() })
  }

  return {
    services: [],
    active: null,
    activeItemId: null,
    loadError: null,

    loadServices: async () => {
      try {
        const services = await libraryApi.listSchedules()
        set({ services, loadError: null })
        if (get().active) return
        const remembered = lastServiceId()
        const id = services.find((s) => s.id === remembered)?.id ?? services[0]?.id
        if (id) await get().openService(id)
      } catch (error) {
        set({ loadError: String(error) })
      }
    },

    openService: async (id) => {
      const schedule = await libraryApi.getSchedule(id)
      set({ active: schedule, activeItemId: null })
      rememberService(id)
    },

    createService: async (name, serviceDate = todayIso()) => {
      const created = await libraryApi.saveSchedule({ name, service_date: serviceDate, items: [] })
      set({ active: created, activeItemId: null, services: await libraryApi.listSchedules() })
      rememberService(created.id)
    },

    updateService: async ({ name, serviceDate }) => {
      const active = get().active
      if (!active) return
      await commit({
        ...active,
        name: name?.trim() || active.name,
        service_date: serviceDate === undefined ? active.service_date : serviceDate,
      })
    },

    deleteService: async (id) => {
      await libraryApi.deleteSchedule(id)
      const services = await libraryApi.listSchedules()
      set({ services })
      if (get().active?.id === id) {
        set({ active: null, activeItemId: null })
        rememberService(null)
        if (services[0]) await get().openService(services[0].id)
      }
    },

    addItem: async (item) => {
      const active = get().active
      if (!active) return
      const added: ScheduleItem = { id: crypto.randomUUID(), ...item }
      await commit({ ...active, items: [...active.items, added] })
    },

    removeItem: async (itemId) => {
      const active = get().active
      if (!active) return
      await commit({ ...active, items: active.items.filter((i) => i.id !== itemId) })
      if (get().activeItemId === itemId) set({ activeItemId: null })
    },

    reorder: async (from, to) => {
      const active = get().active
      if (!active) return
      await commit({ ...active, items: moveItem(active.items, from, to) })
    },

    openItem: async (itemId) => {
      const item = get().active?.items.find((i) => i.id === itemId)
      if (!item) return
      set({ activeItemId: itemId })
      const payload = item.payload as Partial<Record<string, unknown>>
      const setTab = useContentTabStore.getState().setTab
      switch (item.kind) {
        case "song":
          await useSongsStore.getState().openSong(String(payload.songId))
          setTab("songs")
          break
        case "announcement": {
          const texts = useTextsStore.getState()
          if (!texts.texts.some((t) => t.id === payload.textId)) await texts.loadTexts()
          if (!useTextsStore.getState().texts.some((t) => t.id === payload.textId)) {
            throw new Error("This text is no longer in the library")
          }
          useTextsStore.getState().openText(String(payload.textId))
          setTab("texts")
          break
        }
        case "deck":
          await useSlidesStore.getState().openDeck(String(payload.deckId))
          setTab("slides")
          break
        case "media":
          useVideosStore.getState().focusVideo(String(payload.videoId))
          setTab("videos")
          break
        case "scripture":
          bibleActions.navigateToVerse(Number(payload.bookNumber), Number(payload.chapter), Number(payload.verse))
          setTab("bible")
          break
        case "sermon":
          break
      }
    },
  }
})
