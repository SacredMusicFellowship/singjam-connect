import { describe, it, expect, vi } from "vitest";
import { DEFAULT_REMINDER_MESSAGE, loadReminderMessage, renderReminderMessage } from "./reminderMessage";

const values = {
  name: "Gina",
  day: "Sunday",
  date: "November 1",
  time: "2:30 PM",
  location: "The Starry Plough Pub, 3101 Shattuck Ave., Berkeley, CA 94705",
  songMenuUrl: "https://singjam.org/set/set-1",
};

const text = (html: string) => html.split(/<[^>]*>/).join("").replace(/&#39;/g, "'");

describe("renderReminderMessage", () => {
  it("renders Sherri's wording with the event's details", () => {
    expect(text(renderReminderMessage(DEFAULT_REMINDER_MESSAGE, values))).toBe(
      "Hi Gina,\n" +
        "We'll see you at SingJam this Sunday, November 1 at 2:30 PM at The Starry Plough Pub, " +
        "3101 Shattuck Ave., Berkeley, CA 94705. You can add songs to our song menu here. " +
        "Look forward to making music with you!"
    );
  });

  it("links 'here' to the song menu", () => {
    expect(renderReminderMessage(DEFAULT_REMINDER_MESSAGE, values)).toContain(
      '<a href="https://singjam.org/set/set-1" style="color:#d97706;text-decoration:underline">here</a>'
    );
  });

  it("makes one paragraph per blank line and keeps single line breaks", () => {
    const html = renderReminderMessage("One\nline two\n\nTwo", values);
    expect(html.match(/<p /g)).toHaveLength(2);
    expect(html).toContain("One<br>line two");
  });

  it("greets someone without a name as 'there'", () => {
    expect(text(renderReminderMessage("Hi {name},", { ...values, name: null }))).toBe("Hi there,");
  });

  it("escapes the template and the values", () => {
    const html = renderReminderMessage("<b>{name}</b>", { ...values, name: "<script>" });
    expect(html).toContain("&lt;b&gt;&lt;script&gt;&lt;/b&gt;");
    expect(html).not.toContain("<script>");
  });

  it("leaves an unknown placeholder as typed", () => {
    expect(text(renderReminderMessage("See you {when}", values))).toBe("See you {when}");
  });
});

describe("loadReminderMessage", () => {
  const admin = (result: any) =>
    ({ from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) })) }) as any;

  it("returns the saved message", async () => {
    expect(await loadReminderMessage(admin({ data: { value: " Custom {name} " } }))).toBe("Custom {name}");
  });

  it("falls back to the default when nothing is saved", async () => {
    expect(await loadReminderMessage(admin({ data: null }))).toBe(DEFAULT_REMINDER_MESSAGE);
  });

  it("falls back to the default when the setting can't be read", async () => {
    expect(await loadReminderMessage(admin({ data: null, error: { message: "relation does not exist" } }))).toBe(
      DEFAULT_REMINDER_MESSAGE
    );
  });
});
