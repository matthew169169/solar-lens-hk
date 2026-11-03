# Solar Lens HK: project and function guide

[Download the PowerPoint](Solar-Lens-HK-Project-and-Functions.pptx)

Twenty editable slides explain the problem, all 11 study pairs, single-photo and paired scanning, calibration, detection, measurements, the dashboard, review tools, data library, maps, exports, browser architecture, preliminary results, testing, limitations and a demonstration flow. Speaker notes provide context and source references. Tables and the results chart remain editable.

The guide describes application version 2.1, including explicit current-photo targeting, automatic detection of newly imported images, and the separate HAECO example loader. Results from supplied studies are unreviewed estimates at 0° tilt and 2.2 m²/module. Preview-based scans can differ from full-resolution results.

`study-data.json` records the source measurements used for the tables/chart. The builder reads the published pair JSON files and the application's measurement function. `assets/` contains real UI captures; other photographs come from the supplied study previews and research archive. `cover.png` previews the deck.

## Rebuild the editable deck

The source builder uses the first-party `@oai/artifact-tool` presentation runtime and the matching installed presentations skill. Those authoring dependencies are separate from the web app's npm dependencies.

Set these environment variables before running `build-deck.mjs` from the repository root:

- `RUNTIME_NODE_MODULES`: absolute bundled Node package directory containing `@oai/artifact-tool`.
- `RUNTIME_PYTHON`: absolute bundled Python executable.
- `PRESENTATIONS_SKILL_DIR`: installed presentations skill directory with the finalizer and validators.
- `SOLAR_DECK_OUTPUT`: a new absolute PPTX filename inside the task workspace; the finalizer does not overwrite an existing file.

Optional: `SOLAR_REPO`, `SOLAR_WORKSPACE`, and `SOLAR_DECK_BUILD` select the repository, common workspace root and private build directory. Defaults use the current working directory as the repository and a `presentation-work/build` directory beside it. Drafts, rendered slides and validation receipts stay in that private build directory.

Run the installed skill's operation-start marker for a new authoring operation, then run the source with its bundled Node executable:

```sh
node docs/presentations/build-deck.mjs
```

The builder renders slides, exports a draft and finalizes the file. Review every rendered slide before delivering a new revision.
