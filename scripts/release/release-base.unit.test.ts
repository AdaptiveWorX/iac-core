import { describe, expect, it } from "vitest";
import { checkReleaseCommitParent, checkReleasePrIsCurrent } from "./release-base.js";

const A = "a".repeat(40);
const B = "b".repeat(40);
const manifest = (baseSha?: string) => ({
  ...(baseSha === undefined ? {} : { baseSha }),
  releases: [{ package: "@adaptiveworx/iac-schemas", version: "0.2.0" }],
});

describe("stale-release guard", () => {
  describe("(a) a release PR is current only while main hasn't moved", () => {
    it("passes when main's tip is the recorded base", () => {
      expect(checkReleasePrIsCurrent(manifest(A), A)).toBeUndefined();
    });

    it("fails when main moved past the base (the #58 / #57 case)", () => {
      expect(checkReleasePrIsCurrent(manifest(A), B)).toMatch(
        /prepared from main at aaaaaaa, but main is now at bbbbbbb.*re-run the Scheduled Release workflow/
      );
    });

    it("fails when the manifest has no recorded base", () => {
      expect(checkReleasePrIsCurrent(manifest(), A)).toMatch(/no baseSha/);
    });

    it("fails when the recorded base isn't a full SHA", () => {
      expect(checkReleasePrIsCurrent(manifest("abc1234"), A)).toMatch(/not a full commit SHA/);
    });
  });

  describe("(b) Release Tags tags only a release commit that sits on its base", () => {
    it("passes when the release commit's parent is the recorded base", () => {
      expect(checkReleaseCommitParent(manifest(A), A)).toBeUndefined();
    });

    it("refuses to tag when it merged onto a later main", () => {
      expect(checkReleaseCommitParent(manifest(A), B)).toMatch(
        /prepared from main at aaaaaaa, but it merged onto bbbbbbb.*Refusing to tag/
      );
    });

    it("refuses to tag a manifest without a recorded base", () => {
      expect(checkReleaseCommitParent(manifest(), A)).toMatch(/no baseSha/);
    });
  });
});
