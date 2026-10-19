# Codebase structure

_For agents: scout writes it and engineers read it before coding. You check it and fix what's wrong._

> High-level overview only — what the system is and how its parts fit. No file lists or deep directory trees: those change every sprint, and agents read the code for detail. Name a path only for a part's top-level folder.

The **`## Smoke recipe`** below tells each engineer how to bring the app up for browser verification (per `pod:engineer`'s instructions). Fill it in — without it, engineers can't verify their slices and cap confidence at `medium`.

## What it is

<!-- one or two sentences: what the product does and who uses it -->

## Parts

<!-- one line per deployable or package: name, top-level folder, what it does. e.g. `web` (apps/web) — Next.js frontend -->

## How they connect

<!-- request/data flow between the parts: who calls whom, shared database, queues, external services -->

## Stack & conventions

<!-- languages, frameworks, package manager, test runner; conventions that hold across the codebase -->

## CI

<!-- what runs on pull requests (from .github/workflows or other CI config): each check and its command — or `none` -->

## Key docs

<!-- docs an agent should read before touching an area: path — what it answers -->

## Smoke recipe

- **Start commands:** <!-- web / api / worker — take the port from the engineer's assigned dev ports, e.g. `pnpm dev --port <web>` -->
- **DB setup:** <!-- migrate + seed commands -->
- **Login credentials:** <!-- seeded test accounts, per role -->
- **Key URLs:** <!-- per shell / route -->
- **Verification:** <!-- the headless build/test command -->
