// commitlint config — Conventional Commits with scope allowlist.
// See AGENTS.md "Conventional commits — scope rules" and
// CONTRIBUTING.md "Releases" for the full rationale.
//
// .cjs is intentional: package.json sets "type": "module" but
// commitlint's loader expects CommonJS for config files.

module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "perf",
        "refactor",
        "chore",
        "ci",
        "build",
        "docs",
        "test",
        "style",
        "revert",
      ],
    ],
    "scope-enum": [
      2,
      "always",
      [
        "iac-core",
        "iac-schemas",
        "iac-policies",
        "iac-aws",
        "iac-azure",
        "repo",
      ],
    ],
    "scope-empty": [2, "never"],
    // Allow longer subjects — IaC commits often need to name the
    // resource shape they're touching.
    "header-max-length": [2, "always", 100],
    // Don't constrain subject case — proper nouns and class names
    // (SharedVpc, FabricCapacity) appear in subjects legitimately.
    "subject-case": [0],
  },
};
