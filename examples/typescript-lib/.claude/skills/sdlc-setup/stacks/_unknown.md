# Stack without an org reference

There are no org decisions for this stack. Proceed as follows:

1. **Tell** the user there is no reference and that you will pick standard tools from the ecosystem.
2. For the detected or specified language, pick the most established option for: package manager, formatter, linter, test runner. Prefer the ones already in the repo.
3. Still generate the same pieces as a stack with a reference:
   - Makefile with `build`, `test`, `lint`, `format`, `run` (one command each, exit ≠ 0 on failure).
   - `sdlc.json`: `stack`, `format_on_edit` (only if the formatter is fast per file), `test_globs`, typical `protected_paths` (migrations, generated code).
   - `permissions.allow` for the Makefile commands and the ecosystem's test/lint/format commands. Never install dependencies.
   - Language setup for the provider's CI.
4. **Verify** as always: build/test/lint green.
5. In `SETUP.md`, section "Proposal for the plugin", leave a draft of `stacks/<language>.md` with the same format as `python.md` (tools, Makefile, sdlc.json, permissions, conventions, CI) so platform can review it and add it. That way the catalog grows with use.
