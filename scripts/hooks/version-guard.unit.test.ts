import { describe, expect, it } from "vitest";
import { isVersionChangeAllowed } from "./version-guard.js";

describe("no-version-hand-edits: which version changes are allowed", () => {
  it("allows a new package and an unchanged version", () => {
    expect(
      isVersionChangeAllowed({
        head: null,
        staged: "0.1.0",
        latestTagged: undefined,
        headTagged: false,
      })
    ).toBe(true);
    expect(
      isVersionChangeAllowed({
        head: "0.1.5",
        staged: "0.1.5",
        latestTagged: "0.1.5",
        headTagged: true,
      })
    ).toBe(true);
  });

  it("rejects a hand bump", () => {
    expect(
      isVersionChangeAllowed({
        head: "0.1.5",
        staged: "0.1.6",
        latestTagged: "0.1.5",
        headTagged: true,
      })
    ).toBe(false);
  });

  it("allows reverting a refused (untagged) release back to the latest tag", () => {
    // main carries 0.2.0 from a release Release Tags refused; the revert restores 0.1.5
    expect(
      isVersionChangeAllowed({
        head: "0.2.0",
        staged: "0.1.5",
        latestTagged: "0.1.5",
        headTagged: false,
      })
    ).toBe(true);
  });

  it("rejects 'reverting' a release that was tagged (it shipped)", () => {
    expect(
      isVersionChangeAllowed({
        head: "0.2.0",
        staged: "0.1.5",
        latestTagged: "0.2.0",
        headTagged: true,
      })
    ).toBe(false);
  });

  it("rejects moving an untagged version anywhere but the latest tag", () => {
    expect(
      isVersionChangeAllowed({
        head: "0.2.0",
        staged: "0.1.4",
        latestTagged: "0.1.5",
        headTagged: false,
      })
    ).toBe(false);
    expect(
      isVersionChangeAllowed({
        head: "0.2.0",
        staged: "0.3.0",
        latestTagged: "0.1.5",
        headTagged: false,
      })
    ).toBe(false);
  });
});
