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
