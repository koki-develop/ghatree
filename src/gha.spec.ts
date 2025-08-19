import { describe, expect, test } from "bun:test";
import { parseUses } from "./gha";

describe("parseUses", () => {
  test("parses standard GitHub action (owner/name@ref)", () => {
    const result = parseUses({
      str: "actions/checkout@v4",
      workingRepository: undefined,
    });

    expect(result).toEqual({
      repository: { owner: "actions", name: "checkout" },
      path: undefined,
      ref: "v4",
    });
  });

  test("parses action with subdirectory (owner/name/path@ref)", () => {
    const result = parseUses({
      str: "octokit/request-action/dist@v2.0.0",
      workingRepository: undefined,
    });

    expect(result).toEqual({
      repository: { owner: "octokit", name: "request-action" },
      path: "dist",
      ref: "v2.0.0",
    });
  });

  test("parses action with multiple subdirectories", () => {
    const result = parseUses({
      str: "my-org/my-repo/path/to/action@main",
      workingRepository: undefined,
    });

    expect(result).toEqual({
      repository: { owner: "my-org", name: "my-repo" },
      path: "path/to/action",
      ref: "main",
    });
  });

  test("parses local action (./path)", () => {
    const workingRepository = { owner: "test-owner", name: "test-repo" };
    const result = parseUses({
      str: "./.github/actions/my-action@v1",
      workingRepository,
    });

    expect(result).toEqual({
      repository: workingRepository,
      path: ".github/actions/my-action",
      ref: "v1",
    });
  });

  test("handles missing ref", () => {
    const result = parseUses({
      str: "actions/checkout",
      workingRepository: undefined,
    });

    expect(result).toEqual({
      repository: { owner: "actions", name: "checkout" },
      path: undefined,
      ref: undefined,
    });
  });

  test("parses SHA format ref correctly", () => {
    const result = parseUses({
      str: "actions/checkout@8e5e7e5ab8b370d6c329ec480221332ada57f0ab",
      workingRepository: undefined,
    });

    expect(result).toEqual({
      repository: { owner: "actions", name: "checkout" },
      path: undefined,
      ref: "8e5e7e5ab8b370d6c329ec480221332ada57f0ab",
    });
  });

  test("handles @ character within ref", () => {
    const result = parseUses({
      str: "actions/checkout@release@v2",
      workingRepository: undefined,
    });

    expect(result).toEqual({
      repository: { owner: "actions", name: "checkout" },
      path: undefined,
      ref: "release@v2",
    });
  });

  test("throws error for empty string", () => {
    expect(() => {
      parseUses({ str: "", workingRepository: undefined });
    }).toThrow(`Invalid uses format: ""`);
  });

  test("throws error for owner only", () => {
    expect(() => {
      parseUses({ str: "actions", workingRepository: undefined });
    }).toThrow(`Invalid uses format: "actions"`);
  });

  test("throws error for owner only with ref", () => {
    expect(() => {
      parseUses({ str: "actions@v1", workingRepository: undefined });
    }).toThrow(`Invalid uses format: "actions@v1"`);
  });

  test("throws error for @ only", () => {
    expect(() => {
      parseUses({ str: "@v1", workingRepository: undefined });
    }).toThrow(`Invalid uses format: "@v1"`);
  });
});
