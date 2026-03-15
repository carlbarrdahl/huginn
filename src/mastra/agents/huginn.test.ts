import { describe, it, expect } from "vitest";
import { huginn } from "./huginn";

describe("huginn agent", () => {
  it("is defined with correct name", () => {
    expect(huginn).toBeDefined();
    expect(huginn.name).toBe("Huginn");
  });
});
