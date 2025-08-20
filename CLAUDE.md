# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

ghatree is a CLI tool that visualizes GitHub Actions workflow dependencies as a tree structure. It analyzes workflow files, jobs, and actions to display their relationships, including reusable workflows and composite actions.

## Development Commands

### Build and Run
- **Build the project**: `bun run build` - Creates dist/index.js with the compiled CLI tool
- **Run locally**: `bun run ./src/index.ts` or after building: `./dist/index.js`
- **Install dependencies**: `bun install`

### Code Quality
- **Lint**: `bun run lint` - Runs biome linter
- **Format**: `bun run fmt` - Auto-fixes formatting issues using biome
- **Type checking**: `bun run typecheck` - Runs TypeScript type checking
- **Run tests**: `bun test` - Executes all test files (*.spec.ts)
- **Run specific test**: `bun test src/gha.spec.ts`

### Git Hooks
- Pre-commit hook runs lint-staged which applies biome formatting/linting to staged files

## Architecture

### Core Flow
1. **Entry point** (src/index.ts): CLI interface using Commander.js, handles `--repo` and `--json` flags
2. **Runner** (src/run.ts): Orchestrates the workflow analysis, builds the node tree structure
3. **GitHub API** (src/github.ts): Fetches workflow files and content from GitHub or local filesystem
4. **GHA Parser** (src/gha.ts): Parses workflow/action YAML files and extracts dependencies
5. **Output** (src/print.ts): Renders the tree structure with colored output

### Key Data Structures

**Node Types**: The tree is composed of four node types:
- `RepositoryNode`: Root node representing a repository
- `WorkflowNode`: GitHub Actions workflow file
- `JobNode`: Job within a workflow  
- `ActionNode`: GitHub Action (can be composite with nested steps)

**Repository Resolution**: The tool can work with:
- Remote repositories via GitHub API (requires GITHUB_TOKEN)
- Local repository files when no `--repo` flag is provided

### Dependency Resolution

The tool recursively analyzes:
- Reusable workflows (`uses:` in jobs)
- Action references (`uses:` in steps)
- Composite actions (actions with `runs.using: composite`)
- Supports various formats: `owner/repo@ref`, `./local/path`, `owner/repo/path@ref`

### Caching
Workflow and action definitions are cached in memory during execution to avoid redundant API calls.

## Testing Approach

Tests use Bun's built-in test framework. Test files are colocated with source files using `.spec.ts` extension.

## Important Implementation Details

### Checkout State Tracking
The tool tracks multiple repository checkouts within workflow steps to correctly resolve local action paths. When `actions/checkout` is used with different repositories or paths, the resolver maintains a state map to determine which repository context applies to relative action references.

### Action Definition Resolution
When fetching action definitions, the tool tries both `action.yml` and `action.yaml` filenames. Errors are collected and only thrown if both attempts fail.

### Tree Visualization
The print module uses chalk for colored output and special tree characters (├─, └─, │) to create the visual tree structure. Repository-relative paths are displayed differently from external dependencies for better clarity.