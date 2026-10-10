<!--
PR title: a Conventional Commit with a package scope (or `repo`), e.g. `feat(iac-aws): …`.
See CONTRIBUTING.md#conventional-commits.
-->

## Consumer impact

**Does any consumer need to act?** That means changing its arguments, config or code, or
accepting a preview it didn't ask for (new or changed resources on a live stack).

- [ ] No.
- [ ] Yes. Every commit that causes it carries `!` (or a `BREAKING CHANGE:` footer), whatever
      its type. Below 1.0 an unmarked `feat` ships as a **patch** that `^0.y.z` ranges accept
      (CONTRIBUTING.md#types-we-use).

**Release version** (`pnpm release:dry`): `@adaptiveworx/<package>` x.y.z → x.y.z

## Depends on

## Followed by

## Apply steps

## Expected preview (consumers)
