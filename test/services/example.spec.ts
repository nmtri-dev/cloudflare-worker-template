import { describe, it, expect, vi } from "vitest";

// Example unit test pattern.
// Unit tests mock ports with lightweight test doubles (vi.fn, vi.mocked).
// They live under test/ mirroring the source structure they test.

describe("Example Service", () => {
  it("should demonstrate a unit test pattern", () => {
    // Arrange
    const mockLogger = { info: vi.fn(), error: vi.fn() };
    const input = { name: "test" };

    // Act
    mockLogger.info("processing", input);

    // Assert
    expect(mockLogger.info).toHaveBeenCalledWith("processing", input);
  });
});
