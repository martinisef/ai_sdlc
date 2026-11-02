---
'@morsadev/sdlc': minor
---

Go, .NET and Ruby on Rails stacks: `sdlc init` detects `go.mod`, a `.sln` or `.csproj` at the root, and a `Gemfile` with `config/application.rb` (before `package.json`, since these apps often carry a frontend), and fills in commands, test globs and protected paths from the new `stacks/{go,dotnet,ruby}.md` guides (en and es), including the CI setup that `sdlc ci install` uses. New `append_only_paths` config: matching files can be created but not edited once they exist, so applied migrations (`db/migrate/**`, EF Core `Migrations/`) only grow. The agent hooks and the git pre-commit enforce it.
