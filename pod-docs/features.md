# Features

_For agents: engineers and the reviewer drive these rows. You add or fix rows when a feature changes._

> How to prove each user-facing feature works on the running app (start it per the brief's `## Smoke recipe`). Agents drive these rows to check their work, and the reviewer drives every row at plan end, so a feature that quietly breaks later gets caught. Keep to the features a user would miss first.
>
> - **Drive:** an action on the running app — a request, a CLI call, or browser steps. Running a test file isn't a drive: the tests already run under the smoke recipe's `Verification:`.
> - **Proof:** what you can observe when it works — a response, a value read back from storage after a reload or restart, text on the page. "No errors" isn't proof.
> - A feature with notes in `feature-details/` links to them from its **Feature** cell.
> - A failing row is a bug, unless a plan changed that feature on purpose — then update the row. Never edit a row just to make it pass.

| Feature | User reaches it by | Drive | Proof |
|---|---|---|---|
| API health | `GET /api/health` on the API port | `curl -s http://127.0.0.1:<api>/api/health`, and the same path on the web port (proxy) | Both answer `{"ok":true}`; `/api/nope` answers 404; `netstat` shows both ports listening on `127.0.0.1` only |
| Web shell | Open the web URL | Browser: open `http://127.0.0.1:<web>/`, then stop the API and reload | Heading "Pod Board" and "API health: ok"; with the API stopped, "API health: down (HTTP 502)" |
