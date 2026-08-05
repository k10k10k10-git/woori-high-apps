import { describe, expect, it } from "vitest";
import { DEFAULT_ROOM_AUTO_ASSIGN_SETTINGS, normalizeRoomAutoAssignConfig } from "./roomAutoAssignConfig";

describe("room auto assignment config", () => {
  it("uses backward-compatible defaults for an empty document", () => {
    expect(normalizeRoomAutoAssignConfig(null)).toMatchObject(DEFAULT_ROOM_AUTO_ASSIGN_SETTINGS);
  });

  it("preserves shared-room pins and removes duplicate classes or malformed pins", () => {
    const result = normalizeRoomAutoAssignConfig({
      includeStaff: false,
      audioCount: 4.9,
      audioGender: "남",
      medicalCount: 2,
      medicalGender: "여",
      classPins: [
        { classKey: "1부-1-1", roomId: "room-1" },
        { classKey: "1부-1-1", roomId: "room-2" },
        { classKey: "1부-1-2", roomId: "room-1" },
        { classKey: "1부-1-3", roomId: "room-3" },
        { classKey: "", roomId: "room-4" },
      ],
    });

    expect(result).toMatchObject({
      includeStaff: false,
      audioCount: 4,
      audioGender: "남",
      medicalCount: 2,
      medicalGender: "여",
      classPins: [
        { classKey: "1부-1-1", roomId: "room-1" },
        { classKey: "1부-1-2", roomId: "room-1" },
        { classKey: "1부-1-3", roomId: "room-3" },
      ],
    });
  });
});
