import { afterEach, describe, expect, it, vi } from "vitest";
import { openExternalAfter, preOpenTab } from "@/lib/open-external";

function fakeTab() {
  return { opener: {}, location: { href: "" }, closed: false, close: vi.fn() } as unknown as Window;
}

describe("open-external", () => {
  afterEach(() => vi.restoreAllMocks());

  it("navigates the pre-opened tab and reports success", async () => {
    const tab = fakeTab();
    vi.spyOn(window, "open").mockReturnValue(tab);

    const result = await openExternalAfter(async () => "https://zoom.us/j/1");

    // window.open must be called before the await resolves, with a blank URL.
    expect(window.open).toHaveBeenCalledWith("about:blank", "_blank");
    expect((tab.location as Location).href).toBe("https://zoom.us/j/1");
    expect(tab.opener).toBeNull();
    expect(result).toEqual({ blocked: false, url: "https://zoom.us/j/1" });
  });

  it("reports blocked + the url when the popup is refused", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);

    const result = await openExternalAfter(async () => "https://zoom.us/j/2");

    expect(result).toEqual({ blocked: true, url: "https://zoom.us/j/2" });
  });

  it("closes the tab and rethrows when producing the url fails", async () => {
    const tab = fakeTab();
    vi.spyOn(window, "open").mockReturnValue(tab);

    await expect(
      openExternalAfter(async () => {
        throw new Error("NOT_OPEN_YET");
      }),
    ).rejects.toThrow("NOT_OPEN_YET");
    expect(tab.close).toHaveBeenCalled();
  });

  it("preOpenTab survives a throwing window.open", () => {
    vi.spyOn(window, "open").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(preOpenTab()).toBeNull();
  });
});
