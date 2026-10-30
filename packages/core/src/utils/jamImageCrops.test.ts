import { describe, it, expect } from "vitest";
import { cropZoom, defaultCrop, jamImageFor, panCrop, zoomCrop } from "./jamImageCrops";

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("defaultCrop", () => {
  it("takes the full height of a wide image in a square slot, centred", () => {
    const c = defaultCrop(2000, 1000, 1);
    close(c.w, 0.5);
    close(c.h, 1);
    close(c.x, 0.25);
    close(c.y, 0);
  });

  it("takes the full width of a portrait flyer in a 3:2 slot", () => {
    const c = defaultCrop(1000, 1500, 3 / 2);
    close(c.w, 1);
    close(c.h, (1000 / 1.5) / 1500);
  });

  it("places the crop where object-position would, from the focal point", () => {
    const top = defaultCrop(1000, 1500, 3 / 2, "50% 0%");
    close(top.y, 0);
    const bottom = defaultCrop(1000, 1500, 3 / 2, "50% 100%");
    close(bottom.y + bottom.h, 1);
  });

  it("treats a malformed focal point as centred", () => {
    const c = defaultCrop(2000, 1000, 1, "garbage");
    close(c.x, 0.25);
  });
});

describe("zoomCrop", () => {
  it("halves the crop at 2x, about its centre", () => {
    const c = zoomCrop(defaultCrop(1000, 1000, 1), 1000, 1000, 1, 2);
    close(c.w, 0.5);
    close(c.x, 0.25);
    close(cropZoom(c, 1000, 1000, 1), 2);
  });

  it("never zooms out past the full crop", () => {
    const c = zoomCrop({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, 1000, 1000, 1, 0.5);
    close(c.w, 1);
    close(c.x, 0);
  });

  it("keeps a zoomed-out crop inside the image", () => {
    const c = zoomCrop({ x: 0.75, y: 0.75, w: 0.25, h: 0.25 }, 1000, 1000, 1, 1.25);
    close(c.x + c.w, 1);
    close(c.y + c.h, 1);
  });
});

describe("panCrop", () => {
  it("stops at the image's edges", () => {
    const c = panCrop({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, -1, 1);
    close(c.x, 0);
    close(c.y, 0.5);
  });
});

describe("jamImageFor", () => {
  const jam = { image_url: "main.png", image_focal_point: "50% 0%" };

  it("falls back to the main image at the focal point", () => {
    expect(jamImageFor(jam, "mobile")).toEqual({ src: "main.png", position: "50% 0%" });
  });

  it("prefers the slot's baked crop, centred", () => {
    expect(jamImageFor({ ...jam, image_list_url: "list.jpg" }, "list")).toEqual({ src: "list.jpg", position: "50% 50%" });
  });

  it("is null with no image at all", () => {
    expect(jamImageFor({ image_url: null }, "desktop")).toBeNull();
  });
});
