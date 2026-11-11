import { describe, it, expect } from "vitest";
import { isOfficialYouTubeUpload, youTubeVideoId } from "./officialYouTube";

describe("isOfficialYouTubeUpload", () => {
  it("accepts the artist's Topic, VEVO and own channels", () => {
    expect(isOfficialYouTubeUpload({ title: "Twist And Shout (Remastered 2009)", channelTitle: "The Beatles - Topic" }, "Twist and Shout", "The Beatles")).toBe(true);
    expect(isOfficialYouTubeUpload({ title: "Rick Astley - Never Gonna Give You Up (Official Video)", channelTitle: "RickAstleyVEVO" }, "Never Gonna Give You Up", "Rick Astley")).toBe(true);
    expect(isOfficialYouTubeUpload({ title: "Simon & Garfunkel - The Boxer (Audio)", channelTitle: "Simon & Garfunkel" }, "The Boxer", "Simon & Garfunkel")).toBe(true);
  });

  it("tolerates a leading 'The' on either side", () => {
    expect(isOfficialYouTubeUpload({ title: "Paint It, Black", channelTitle: "Rolling Stones - Topic" }, "Paint It, Black", "The Rolling Stones")).toBe(true);
  });

  it("rejects other channels, even with the right title", () => {
    expect(isOfficialYouTubeUpload({ title: "The Beatles - Yesterday", channelTitle: "Classic Rock Hits" }, "Yesterday", "The Beatles")).toBe(false);
  });

  it("allows extra words around the song's own words", () => {
    expect(isOfficialYouTubeUpload({ title: "Brother (Buddy) Can You Spare a Dime", channelTitle: "Peter, Paul & Mary - Topic" }, "Brother Can You Spare a Dime", "Peter, Paul and Mary")).toBe(true);
  });

  it("rejects videos that don't name the song", () => {
    expect(isOfficialYouTubeUpload({ title: "Hey Jude", channelTitle: "The Beatles - Topic" }, "Yesterday", "The Beatles")).toBe(false);
    expect(isOfficialYouTubeUpload({ title: "Erie Canal", channelTitle: "Pete Seeger - Topic" }, ["Low Bridge", "Erie Canal"], "Pete Seeger")).toBe(true);
    expect(isOfficialYouTubeUpload({ title: "Erie Canal", channelTitle: "Pete Seeger - Topic" }, ["Low Bridge"], "Pete Seeger")).toBe(false);
  });

  it("rejects live, cover and karaoke versions unless the song itself is named that way", () => {
    expect(isOfficialYouTubeUpload({ title: "Ripple (Live at the Fillmore)", channelTitle: "Grateful Dead - Topic" }, "Ripple", "Grateful Dead")).toBe(false);
    expect(isOfficialYouTubeUpload({ title: "This Time Tomorrow (live)", channelTitle: "Annie Eve - Topic" }, "This Time Tomorrow (live)", "Annie Eve")).toBe(true);
  });
});

describe("youTubeVideoId", () => {
  it("pulls the id from the stored watch URL", () => {
    expect(youTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youTubeVideoId(null)).toBeNull();
  });
});
