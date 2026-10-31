# Research: Folder picker for a localhost web UI (absolute path back to the server)

_Generated: 2026-10-27 · Depth: standard · Researchers: 1 · Searches: 10 · Pages read: 13_

**Assumptions:** Focus is `building`. Node/Hono server on 127.0.0.1 with a per-launch token. Chrome or Edge only. Windows first. Not verified: how code-server, qBittorrent, Portainer or JupyterLab's UI pick folders (see Gaps).

## What exists
| Name | Link | What it does | Alive? | License | How close to the idea |
|------|------|--------------|--------|---------|-----------------------|
| `<input webkitdirectory>` | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory) | Gives `File` objects with `webkitRelativePath` (starts at the picked folder's name, e.g. `PhotoAlbums/Birthdays/...`). No absolute path. Nothing is sent unless your code sends it. | Standard web feature | n/a | Cannot work: no absolute path |
| `showDirectoryPicker()` | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker) | Returns a `FileSystemDirectoryHandle`, not a path string. Needs a secure context and a click. Limited availability. | Chromium only | n/a | Cannot work: no path. Spec also blocks home, `C:\Windows`, Downloads ([WICG spec](https://wicg.github.io/file-system-access/)) |
| Drag and drop of a folder | [web.dev](https://web.dev/articles/files/drag-and-drop-directories) | `webkitGetAsEntry()` gives a read-only entry; `getAsFileSystemHandle()` gives a handle. Neither is documented to expose an absolute path. Spec: drag and drop "does not block access to too sensitive or dangerous directories." | Updated 2026-10-08 | n/a | Cannot work: no path |
| Syncthing `GET /rest/system/browse` | [docs](https://docs.syncthing.net/rest/system-browse-get.html) | Optional `current` param; server appends `*`, so `/var/` lists subfolders and `/var/*o` filters. No param returns roots. Returns a JSON array of path strings. API key in `X-API-Key`. | Active project; page undated | not checked | Very close: path autocomplete over a server-side listing |
| Jellyfin `/Environment/DirectoryContents` | [TS SDK](https://typescript-sdk.jellyfin.org/interfaces/generated-client.EnvironmentApiGetDirectoryContentsRequest.html) | Params `path` (required), `includeFiles`, `includeDirectories`. Entries have name, path, type. The SDK page doesn't show the HTTP method. | SDK page undated | n/a | Close: folder browser in the page |
| Emby `POST /Environment/DirectoryContents` | [Emby ref](https://betadev.emby.media/reference/RestAPI/EnvironmentService/postEnvironmentDirectorycontents.html) | Same-named endpoint. "Requires authentication as administrator." Entry types File, Directory, NetworkComputer, NetworkShare. | Ref page undated | n/a | Close: folder browser in the page |
| Radarr/Readarr `GET /api/v1/filesystem` | [client docs](https://github.com/devopsarr/readarr-go/blob/v1.0.0/docs/FileSystemAPI.md) | Params `path`, `includeFiles` (default false), `allowFoldersWithoutTrailingSlashes`. Auth by `X-Api-Key`. How the UI uses it: no evidence found. | Docs for v1.0.0 | n/a | Close: same pattern |
| Jupyter Server Contents API | [REST docs](https://jupyter-server.readthedocs.io/en/latest/developers/rest-api.html) | `GET /api/contents/{path}` lists a directory with `type=directory`. Docs do not say whether paths are root-relative. | Active | not checked | Partial: lists inside a root only |
| `win-dialogs` (npm) | [pkgstats](https://www.pkgstats.com/pkg:win-dialogs) | Runs PowerShell + .NET WinForms for folder/file dialogs. Windows only. v1.4.0, published "a year ago." | Possibly stale | not stated | Close for the dialog route, Windows only |
| `open-linux-file-dialog` (npm) | [README](https://app.unpkg.com/open-linux-file-dialog@1.0.0/files/README.md) | Uses first found of zenity, kdialog, yad, qarma, matedialog, rofi, fzf, dmenu; macOS via `osascript`. README documents files, not folders. Empty array on cancel; `getAvailableDialogTools()` returns `[]` if none. | v1.0.0 | not stated | Partial: shows the fallback list and the "no tool installed" case |

## Gaps and angles
- No browser-only option returns an absolute path. webkitdirectory gives a relative path; the two File System Access routes give handles; the spec lists paths only as internal state — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory), [spec](https://wicg.github.io/file-system-access/).
- Handle-based pickers also refuse common repo parents: the spec says agents are "encouraged to restrict" home, system and Downloads folders (the user's whole home dir is restricted, subfolders allowed) — [spec](https://wicg.github.io/file-system-access/).
- FolderBrowserDialog can open behind the browser; the fix in the PowerShell write-up is to pass a temporary TopMost owner form: `ShowDialog((New-Object System.Windows.Forms.Form -Property @{TopMost = $true}))` — [dbremen, 2016, possibly stale](https://dbremen.github.io/powershell/2016/05/06/powershell-tricks-open-a-dialog-as-topmost-window.html).
- Linux has no single dialog tool; wrappers try many and may find none — [README](https://app.unpkg.com/open-linux-file-dialog@1.0.0/files/README.md).
- Existing Node wrappers I read are small and Windows-only or Linux-only; no maintained cross-platform Node folder picker with evidence of use was found.
- Not verified: code-server/VS Code web "Open Folder", qBittorrent, Portainer and JupyterLab UI behaviour. Searches returned nothing usable.
- Not checked: the classic FolderBrowserDialog compared with IFileOpenDialog (FOS_PICKFOLDERS).

## Best practices
- Local servers should check the Host header against `localhost`, `127.0.0.1` and `[::1]` to block DNS rebinding, and still require authentication — [NCC Group Singularity, 2018, wiki edited 2023](https://github.com/nccgroup/singularity/wiki/%5BAnnouncement-Blog-Post%5D--Singularity-of-Origin:-A-DNS-Rebinding-Attack-Framework). Do not rely on DNS filtering.
- Real tools put the folder listing behind the API key or admin auth (Syncthing `X-API-Key`; Radarr `X-Api-Key`; Emby's same-named endpoint requires admin auth) — [Emby ref](https://betadev.emby.media/reference/RestAPI/EnvironmentService/postEnvironmentDirectorycontents.html), — [Syncthing](https://docs.syncthing.net/rest/system-browse-get.html), [Readarr client](https://github.com/devopsarr/readarr-go/blob/v1.0.0/docs/FileSystemAPI.md).
- List folders only by default (`includeFiles` false) — [Readarr client](https://github.com/devopsarr/readarr-go/blob/v1.0.0/docs/FileSystemAPI.md), [Jellyfin](https://typescript-sdk.jellyfin.org/interfaces/generated-client.EnvironmentApiGetDirectoryContentsRequest.html).
- Show the dialog with a TopMost owner window (above).
- On cancel, return a clear "cancelled" result; handle "no dialog tool" as a distinct state — [README](https://app.unpkg.com/open-linux-file-dialog@1.0.0/files/README.md).

## Ideas to consider
- Minimal: keep the text box, add server-side path autocomplete (`GET /api/fs/list?path=`, folders only), Syncthing style — grows from [Syncthing browse](https://docs.syncthing.net/rest/system-browse-get.html).
- Add "pod-docs found here" marks on listed folders so the user sees which are valid repos — (own idea)
- Folder browser panel (breadcrumbs, drives list on Windows, up button) using the same endpoint — grows from Jellyfin/Radarr.
- "Browse..." button that calls `POST /api/fs/pick`, which runs a PowerShell dialog and returns the path; falls back to the browser panel on error or timeout — grows from `win-dialogs` and TopMost fix.
- Start the browser at likely places: parent of already-added repos, user home, drives — (own idea)
- Bold: scan a chosen parent folder for subfolders that contain `pod-docs` and offer "add all" — (own idea)
- Bold: Linux and macOS dialogs via zenity/kdialog/osascript, behind a capability check that hides the button when none exists — grows from `open-linux-file-dialog`.

## Questions for the plan
- Is a native dialog worth it, or is the in-page browser enough? — why it matters: the dialog adds spawn risk, an STA/TopMost quirk and per-OS code; the browser panel works on every OS and headless — options: browser panel only / panel plus Windows dialog / dialog on all OSes.
- Should listing be limited to a root (like Jupyter's root) or the whole disk? — why it matters: the user must reach any drive; a root would block repos elsewhere; Syncthing returns roots when no path is given — options: whole disk / roots from existing repos plus home / whole disk with a deny list.
- Should the endpoint list files too? — why it matters: tools default to folders only; files leak more — options: folders only / folders plus a `pod-docs` flag.
- How does the page handle a PWA window and the dialog opening behind it? — why it matters: TopMost owner is the only fix found; not tested with a PWA window — options: TopMost owner form / accept and show a "dialog opened" hint / skip the dialog.
- What timeout and single-flight rule for the dialog? — why it matters: a dialog blocks until closed; a second click could stack dialogs; no source covered this — options: one at a time, abort after 2-5 min / no timeout.
- Does the Host header check exist now? — why it matters: a token alone does not cover DNS rebinding per NCC — options: add check to all routes / only fs routes.

## Suspect pages
- none

## Sources
- MDN webkitdirectory — https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory — undated
- MDN showDirectoryPicker — https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker — undated
- File System Access spec — https://wicg.github.io/file-system-access/ — undated
- web.dev drag and drop directories — https://web.dev/articles/files/drag-and-drop-directories — updated 2026-10-08
- Syncthing system/browse — https://docs.syncthing.net/rest/system-browse-get.html — undated
- Jellyfin TS SDK request — https://typescript-sdk.jellyfin.org/interfaces/generated-client.EnvironmentApiGetDirectoryContentsRequest.html — undated
- Emby DirectoryContents ref — https://betadev.emby.media/reference/RestAPI/EnvironmentService/postEnvironmentDirectorycontents.html
- Readarr Go client FileSystemAPI — https://github.com/devopsarr/readarr-go/blob/v1.0.0/docs/FileSystemAPI.md — undated
- Jupyter Server REST API — https://jupyter-server.readthedocs.io/en/latest/developers/rest-api.html — undated
- win-dialogs on pkgstats — https://www.pkgstats.com/pkg:win-dialogs — undated
- open-linux-file-dialog README — https://app.unpkg.com/open-linux-file-dialog@1.0.0/files/README.md — undated
- PowerShell TopMost dialog — https://dbremen.github.io/powershell/2016/05/06/powershell-tricks-open-a-dialog-as-topmost-window.html — 2016-05-06
- NCC Singularity — https://github.com/nccgroup/singularity/wiki/%5BAnnouncement-Blog-Post%5D--Singularity-of-Origin:-A-DNS-Rebinding-Attack-Framework — 2018-08-17
