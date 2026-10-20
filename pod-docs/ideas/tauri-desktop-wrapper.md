# Idea: Tauri desktop wrapper

Status: parked

## The idea
Wrap the same local server and web UI in a Tauri app: a native window, a tray icon showing what needs you, and native notifications. No rewrite, since the server stays the same.

## Why it's on hold
Phase 1 is a local web app with a PWA manifest, which already gives an app window. Tauri adds Rust to the toolchain and per-OS builds and signing.

## What would make it worth building
A tray icon or native notifications become wanted (likely with phase 3's phone ping), or the PWA window falls short in daily use.
