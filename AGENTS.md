# Project delivery instructions

The user requires all completed project changes and updates to be on GitHub.

- After implementing a requested change, run appropriate verification, commit the completed changes, and push `main` to `origin` (`https://github.com/matthew169169/solar-lens-hk.git`). Do not leave finished work only in the local checkout.
- Include updated source, documentation, tests, research reports and approved derived imagery/results when relevant.
- Keep dependencies, Python environments, credentials and the original giant aerial TIFF collection out of normal source commits. Reproduce dependencies and builds from the tracked setup files. Compiled assets belong on the GitHub Pages publishing branch. The user explicitly approved public study previews, inference results and sample crops.
- Never commit secrets or broaden account permissions to make a push succeed. The available GitHub OAuth connection lacks workflow-write scope; the optional CI configuration is tracked as `docs/ci.yml.example`.
- Website changes also need deployment through the Sites workflow. Preserve the private audience. The `sites-source` branch preserves the hosting provider's source history; `main` tracks GitHub.
- GitHub Pages is the requested public web destination. After committing/pushing website updates, run `npm run deploy:github` using `github-pages.json`, and verify the Pages deployment. The user explicitly approved public publication of supplied previews and derived panel locations on 23 October 2026. Preserve the separate private Sites audience.

