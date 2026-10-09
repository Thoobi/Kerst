import { describe, expect, it } from "vitest"
import {
  classifyImportFile,
  fitScale,
  naturalCompare,
  planImport,
  stripExtension,
  titleForImages,
} from "./deck-import"

const file = (name: string) => new File([], name)

describe("classifyImportFile", () => {
  it("sorts files into what can be imported and what needs a PDF first", () => {
    expect(classifyImportFile("Welcome.PDF")).toBe("pdf")
    expect(classifyImportFile("slide.jpeg")).toBe("image")
    expect(classifyImportFile("slide.PNG")).toBe("image")
    expect(classifyImportFile("Sunday.pptx")).toBe("presentation")
    expect(classifyImportFile("Sunday.key")).toBe("presentation")
    expect(classifyImportFile("notes.txt")).toBe("unsupported")
    expect(classifyImportFile("no-extension")).toBe("unsupported")
  })
})

describe("naming", () => {
  it("strips only the last extension", () => {
    expect(stripExtension("Sunday.Welcome.pdf")).toBe("Sunday.Welcome")
    expect(stripExtension(".hidden")).toBe(".hidden")
  })

  it("orders page numbers numerically", () => {
    const names = ["Slide10.png", "Slide2.png", "slide1.png"]
    expect(names.sort(naturalCompare)).toEqual(["slide1.png", "Slide2.png", "Slide10.png"])
  })

  it("titles loose images by the name they share", () => {
    expect(titleForImages(["Welcome-01.png", "Welcome-02.png", "Welcome-10.png"])).toBe("Welcome")
    expect(titleForImages(["Easter Sunday.jpg"])).toBe("Easter Sunday")
  })

  it("falls back to a generic title when the shared name says nothing", () => {
    expect(titleForImages(["Slide1.PNG", "Slide2.PNG"])).toBe("Imported slides")
    expect(titleForImages(["a.png", "b.png"])).toBe("Imported slides")
  })
})

describe("fitScale", () => {
  it("fits a 16:9 page exactly to 1920x1080", () => {
    // PowerPoint's 13.333in x 7.5in page, in PDF points.
    expect(960 * fitScale(960, 540)).toBeCloseTo(1920)
    expect(540 * fitScale(960, 540)).toBeCloseTo(1080)
  })

  it("fits a 4:3 page by height, leaving room at the sides", () => {
    const scale = fitScale(720, 540)
    expect(540 * scale).toBeCloseTo(1080)
    expect(720 * scale).toBeCloseTo(1440)
  })
})

describe("planImport", () => {
  it("makes a deck per PDF and one deck of all images, in name order", () => {
    const plan = planImport([
      file("b.pdf"),
      file("Slide10.png"),
      file("a.pdf"),
      file("Slide2.jpg"),
      file("talk.pptx"),
      file("song.mp3"),
    ])
    expect(plan.pdfs.map((f) => f.name)).toEqual(["a.pdf", "b.pdf"])
    expect(plan.images.map((f) => f.name)).toEqual(["Slide2.jpg", "Slide10.png"])
    expect(plan.presentations.map((f) => f.name)).toEqual(["talk.pptx"])
    expect(plan.unsupported.map((f) => f.name)).toEqual(["song.mp3"])
  })
})
