# Slice and wave branch names can differ only by case

_Found: 2026-10-19 · sprint board-engineer, wave 1_

**Symptom:** a slice coded `W1` gets the branch `<sprint>-W1`, and wave 1's head is `<sprint>-w1`. GitHub keeps both, but Windows (and the default macOS volume) treat ref names that differ only by case as one, so local refs can point at the wrong branch.

**What to do:** cut from and merge by SHA when a slice code starts with `W` and its number matches a wave (`git merge --ff-only <sha>`), and delete such remote branches by full ref (`git push origin --delete refs/heads/<name>`). A sprint planner can also avoid slice codes `W1`, `W2`, ….
