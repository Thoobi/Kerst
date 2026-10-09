// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import {
  decodeSongFile,
  detectSongFormat,
  parseSongFile,
  songFileName,
  toOpenLyrics,
} from "./index"
import { parseOpenLyrics, sectionFromVerseName, verseNames } from "./openlyrics"
import { parseSongSelectText, parseSongSelectUsr } from "./songselect"
import { parseChordPro } from "./chordpro"
import type { Song } from "@/types"

const OPENLYRICS = `<?xml version="1.0" encoding="UTF-8"?>
<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.9" createdIn="OpenLP 3.0">
  <properties>
    <titles>
      <title>Amazing Grace</title>
      <title lang="es">Sublime Gracia</title>
    </titles>
    <authors>
      <author type="words">John Newton</author>
      <author type="music">Traditional</author>
      <author type="translation" lang="es">Someone</author>
    </authors>
    <copyright>Public Domain</copyright>
    <ccliNo>22025</ccliNo>
    <verseOrder>v1 c v2 c</verseOrder>
  </properties>
  <lyrics>
    <verse name="v1">
      <lines>
        <chord root="G"/>Amazing grace how <chord root="C"/>sweet the sound<br/>
        That saved a wretch like me
      </lines>
      <lines>I once was lost but now am found<br/><comment>slow</comment>Was blind but now I see</lines>
    </verse>
    <verse name="c">
      <lines>My chains are gone</lines>
    </verse>
    <verse name="v2">
      <lines>'Twas grace that taught</lines>
    </verse>
    <instrument name="i"><lines><beat><chord root="D"/></beat></lines></instrument>
  </lyrics>
</song>`

describe("OpenLyrics import", () => {
  it("reads title, credits and sections, dropping chords, comments and translators", () => {
    const song = parseOpenLyrics(OPENLYRICS)
    expect(song).toMatchObject({
      title: "Amazing Grace",
      author: "John Newton, Traditional",
      copyright: "Public Domain",
      ccli_number: "22025",
      source: "openlyrics",
    })
    expect(song.sections.map((s) => [s.kind, s.label])).toEqual([
      ["verse", "Verse 1"],
      ["chorus", "Chorus"],
      ["verse", "Verse 2"],
    ])
    // Each <lines> is a screen; <br/> breaks a line; pretty-printing whitespace is not a line.
    expect(song.sections[0].lyrics).toBe(
      "Amazing grace how sweet the sound\nThat saved a wretch like me\n\nI once was lost but now am found\nWas blind but now I see"
    )
  })

  it("takes the sung order from verseOrder", () => {
    expect(parseOpenLyrics(OPENLYRICS).arrangement).toEqual([0, 1, 2, 1])
  })

  it("keeps one language when verses come in several", () => {
    const xml = OPENLYRICS.replace(
      '<verse name="c">',
      '<verse name="c" lang="en"><lines>English chorus</lines></verse><verse name="c" lang="es"><lines>Coro</lines></verse><verse name="x">'
    )
    const song = parseOpenLyrics(xml)
    expect(song.sections.find((s) => s.label === "Chorus")?.lyrics).toBe(
      "English chorus"
    )
    expect(JSON.stringify(song)).not.toContain("Coro")
  })

  it("reads the older 0.8 <line> elements", () => {
    const xml = `<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.8"><properties><titles><title>Old</title></titles></properties>
      <lyrics><verse name="v1"><lines><line>One</line><line>Two</line></lines></verse></lyrics></song>`
    expect(parseOpenLyrics(xml).sections[0].lyrics).toBe("One\nTwo")
  })

  it("refuses files that aren't OpenLyrics songs", () => {
    expect(() => parseOpenLyrics("<html></html>")).toThrow(/not an OpenLyrics/)
    expect(() => parseOpenLyrics("<song><broken")).toThrow()
  })

  it("names sections from verse names", () => {
    expect(sectionFromVerseName("v1")).toEqual({
      kind: "verse",
      label: "Verse 1",
    })
    expect(sectionFromVerseName("v1a")).toEqual({
      kind: "verse",
      label: "Verse 1a",
    })
    expect(sectionFromVerseName("p")).toEqual({
      kind: "pre-chorus",
      label: "Pre-Chorus",
    })
    expect(sectionFromVerseName("e1")).toEqual({
      kind: "outro",
      label: "Ending 1",
    })
    expect(sectionFromVerseName("whatever")).toEqual({
      kind: "other",
      label: "whatever",
    })
  })
})

describe("OpenLyrics export", () => {
  const song: Song = {
    id: "s1",
    title: "Grace & Truth <live>",
    author: "A & B",
    copyright: "2020 Example",
    ccli_number: "123",
    sections: [
      {
        id: "a",
        kind: "verse",
        label: "Verse 1",
        lyrics: "Line one\nLine two\n\nScreen two",
      },
      { id: "b", kind: "chorus", label: "Chorus", lyrics: "Sing it" },
      { id: "c", kind: "chorus", label: "Chorus", lyrics: "Another chorus" },
    ],
    arrangement: ["a", "b", "a", "c"],
    source: "manual",
    created_at: 0,
    updated_at: 0,
  }

  it("gives sections unique verse names", () => {
    expect(verseNames(song.sections)).toEqual(["v1", "c", "ca"])
  })

  it("round-trips through import, escaping XML", () => {
    const xml = toOpenLyrics(song, new Date("2026-10-09T00:00:00Z"))
    expect(xml).toContain("Grace &amp; Truth &lt;live&gt;")
    expect(xml).toContain("<verseOrder>v1 c v1 ca</verseOrder>")
    const back = parseOpenLyrics(xml)
    expect(back.title).toBe(song.title)
    expect(back.author).toBe("A & B")
    expect(back.sections.map((s) => s.lyrics)).toEqual(
      song.sections.map((s) => s.lyrics)
    )
    expect(back.arrangement).toEqual([0, 1, 0, 2])
  })
})

const SONGSELECT_TXT_2023 = `Amazing Grace (My Chains Are Gone)

Verse 1
Amazing grace how sweet the sound
That saved a wretch like me

Chorus 1
My chains are gone
I've been set free

Verse 2
'Twas grace that taught my heart to fear

John Newton | Chris Tomlin | Louie Giglio
CCLI Song # 4768151
© 2006 sixsteps Music (Admin. by Capitol CMG Publishing)
For use solely with the SongSelect® Terms of Use. All rights reserved. www.ccli.com
CCLI License # 1234567`

describe("SongSelect .txt", () => {
  it("reads the 2023 layout, authors above the CCLI line", () => {
    const song = parseSongSelectText(SONGSELECT_TXT_2023)
    expect(song).toMatchObject({
      title: "Amazing Grace (My Chains Are Gone)",
      author: "John Newton, Chris Tomlin, Louie Giglio",
      copyright: "2006 sixsteps Music (Admin. by Capitol CMG Publishing)",
      ccli_number: "4768151",
      source: "songselect",
    })
    expect(song.sections.map((s) => s.label)).toEqual([
      "Verse 1",
      "Chorus 1",
      "Verse 2",
    ])
    expect(song.sections[2].lyrics).toBe(
      "'Twas grace that taught my heart to fear"
    )
  })

  it("reads the older layout, authors after the copyright", () => {
    const older = `Amazing Grace

Verse 1
Amazing grace

CCLI Song # 22025
© Public Domain
John Newton
For use solely with the SongSelect Terms of Use. All rights reserved. www.ccli.com
CCLI License # 1234567`
    expect(parseSongSelectText(older)).toMatchObject({
      title: "Amazing Grace",
      author: "John Newton",
      copyright: "Public Domain",
      ccli_number: "22025",
    })
    expect(parseSongSelectText(older).sections[0].lyrics).toBe("Amazing grace")
  })
})

describe("SongSelect .usr", () => {
  const usr = `[File]
Type=SongSelect Import File
Version=3.0
[S A4768151]
Title=Amazing Grace (My Chains Are Gone)
Author=Chris Tomlin | John Newton
Copyright=2006 sixsteps Music | worshiptogether.com songs
Admin=Capitol CMG Publishing
Themes=Grace/tFreedom
Keys=G
Fields=Verse 1/tChorus 1/tVers 2/tMisc 1 (BRIDGE
Words=Amazing grace how sweet the sound/nThat saved a wretch like me/tMy chains are gone/nI've been set free/t'Twas grace/tThe earth shall soon dissolve`

  it("reads fields and words into sections", () => {
    const song = parseSongSelectUsr(usr)
    expect(song).toMatchObject({
      title: "Amazing Grace (My Chains Are Gone)",
      author: "Chris Tomlin, John Newton",
      copyright: "2006 sixsteps Music, worshiptogether.com songs",
      ccli_number: "4768151",
    })
    expect(song.sections.map((s) => [s.kind, s.label])).toEqual([
      ["verse", "Verse 1"],
      ["chorus", "Chorus 1"],
      ["verse", "Vers 2"],
      ["bridge", "Bridge"],
    ])
    expect(song.sections[0].lyrics).toBe(
      "Amazing grace how sweet the sound\nThat saved a wretch like me"
    )
  })
})

describe("ChordPro", () => {
  it("drops chords and reads sections from start_of blocks and heading comments", () => {
    const song = parseChordPro(`{title: Amazing Grace}
{artist: John Newton}
{copyright: © Public Domain}
{ccli: 22025}
{key: G}
# a comment line
{start_of_verse: Verse 1}
A[G]mazing [C]grace how [G]sweet the sound
That [G]saved a [D]wretch like me
{end_of_verse}

{comment: Chorus}
My [C]chains are [G]gone

{start_of_tab}
e|---3---|
{end_of_tab}

{start_of_verse}
Second verse line
{end_of_verse}`)
    expect(song).toMatchObject({
      title: "Amazing Grace",
      author: "John Newton",
      copyright: "Public Domain",
      ccli_number: "22025",
      source: "chordpro",
    })
    // The bare {start_of_verse} after "Verse 1" is the second verse.
    expect(song.sections.map((s) => s.label)).toEqual([
      "Verse 1",
      "Chorus",
      "Verse 2",
    ])
    expect(song.sections[0].lyrics).toBe(
      "Amazing grace how sweet the sound\nThat saved a wretch like me"
    )
    expect(JSON.stringify(song)).not.toContain("e|")
  })

  it("uses the file name when there is no title", () => {
    expect(parseChordPro("[G]Hallelujah", "Hallelujah").title).toBe(
      "Hallelujah"
    )
  })
})

describe("detectSongFormat and parseSongFile", () => {
  it("recognises each format by content first, then name", () => {
    expect(detectSongFormat("a.xml", OPENLYRICS)).toBe("openlyrics")
    expect(detectSongFormat("a.txt", SONGSELECT_TXT_2023)).toBe(
      "songselect-txt"
    )
    expect(detectSongFormat("a.usr", "[File]\nType=SongSelect")).toBe(
      "songselect-usr"
    )
    expect(detectSongFormat("a.txt", "{title: X}\nline")).toBe("chordpro")
    expect(detectSongFormat("a.cho", "line")).toBe("chordpro")
    expect(detectSongFormat("Way Maker.txt", "Verse 1\nYou are here")).toBe(
      "text"
    )
    expect(detectSongFormat("a.xml", "<html/>")).toBeNull()
    expect(detectSongFormat("a.pdf", "%PDF")).toBeNull()
  })

  it("titles a plain lyrics file by its name", () => {
    const song = parseSongFile(
      "Way Maker.txt",
      "Verse 1\nYou are here\n\nChorus\nWay maker"
    )
    expect(song.title).toBe("Way Maker")
    expect(song.sections.map((s) => s.label)).toEqual(["Verse 1", "Chorus"])
  })

  it("explains what it can't read", () => {
    expect(() => parseSongFile("a.pdf", "%PDF")).toThrow(/not a song file/)
  })

  it("makes safe export file names", () => {
    expect(songFileName('What a "Friend": we/have?')).toBe(
      "What a Friend we have.xml"
    )
    expect(songFileName("   ")).toBe("Song.xml")
  })
})

describe("decodeSongFile", () => {
  it("reads UTF-8, and Windows-1252 when the bytes aren't valid UTF-8", () => {
    expect(decodeSongFile(new TextEncoder().encode("© Grâce"))).toBe("© Grâce")
    // "© 2006" as Windows-1252: 0xA9 is not valid UTF-8 on its own.
    expect(
      decodeSongFile(new Uint8Array([0xa9, 0x20, 0x32, 0x30, 0x30, 0x36]))
    ).toBe("© 2006")
  })

  it("strips a UTF-8 byte-order mark and reads UTF-16 by its mark", () => {
    expect(decodeSongFile(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toBe("A")
    expect(decodeSongFile(new Uint8Array([0xff, 0xfe, 0x41, 0x00]))).toBe("A")
  })
})
