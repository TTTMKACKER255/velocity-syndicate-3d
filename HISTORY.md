# Original development history

The `main` branch contains the playable game. This branch also carries a Git bundle with the 33 original development commits through `c0148d61b0f111128e61a0b77c93e31eea17dada`. The bundle reuses the game files already present in a full clone of this repository.

From a full clone, run the following commands to restore and inspect the original branch.

```sh
git fetch origin original-history
git show FETCH_HEAD:velocity-syndicate-original-history.bundle > velocity-original.bundle
git bundle verify velocity-original.bundle
git fetch velocity-original.bundle refs/heads/original-main:refs/heads/original-main
git log --oneline original-main
```

Both the GitHub release snapshot and `original-main` have the root tree `189543b4da24dd37fe63eb9a7117a1f5209b29e2`.
