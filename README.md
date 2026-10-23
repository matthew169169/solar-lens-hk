# Solar Lens HK

A working, browser-based solar-photo comparison tool. Upload an older and newer aerial photo, run local AI segmentation, review solar areas, compare panel-count estimates and net area, and export WGS84 locations.

## GitHub Pages

Run `npm run deploy:github` after committing and pushing source updates. This verifies the app, builds it, and publishes the `gh-pages` branch in the repository configured by `github-pages.json`, with `/docs` as the publishing directory. It uses GitHub's built-in branch deployment and does not require workflow-write scope. The GitHub CLI must already be authenticated with repository administration access.

The publishing branch contains application source and approved study assets, plus the compiled website under `docs/`. The website also offers `source.tar.gz` as corresponding application source. Uploads are processed in the visitor's browser; they are not sent to GitHub. The user explicitly approved publishing all supplied study previews and derived panel locations on the public Pages website on 23 October 2026. The original giant TIFF collection is excluded.

Pages from a private repository requires an eligible GitHub plan. If it is unavailable, deploy to a separate public web repository while keeping the original source/research repository private. To target another existing repository, use `node scripts/deploy-github-pages.mjs owner/repository` after `npm run build`.

## Run

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

`npm test` runs measurement/export tests. `npm run build` prepares a static `dist/` directory that can be hosted on any static HTTPS host. `npm run preview` tests that production build locally. No database server, secret, API key or inference subscription is required. The included ONNX model is loaded on demand.

## Features

- Upload local GeoTIFF, JPEG, PNG or WebP imagery. GeoTIFF reads use Blob windows instead of uploading the file or loading a complete large image into a single canvas.
- Tiled, real YOLOv8s solar segmentation in a Web Worker through ONNX Runtime Web (WASM, one thread, no cross-origin-isolation requirement).
- Non-overlapping tile-core ownership and polygon union avoid double-counting overlapping mask area. Interior holes are preserved.
- Separate older/newer images, editable dates, coverage checks, zoom/pan, native-detail decoding for original uploads, and clickable outlines.
- Manual count overrides, candidate exclusion/restoration, missed-area tracing and review status.
- Net plan-view area, tilt-adjusted panel-face area, and individually labelled area-based module-count estimates.
- Hong Kong 1980 Grid (EPSG:2326), EPSG:3857, EPSG:4326 and WGS84 UTM coordinates; location export to WGS84. Geographic degrees are never interpreted as square metres. Web Mercator area uses a local latitude scale correction.
- CSV, GeoJSON and whole-project JSON exports. Project previews/results autosave in local IndexedDB. Project files do not include original high-resolution photographs; reattach originals to rerun detection.
- Real, unreviewed demo results for all 11 supplied place pairs, with reduced previews. A “Try live detection” action runs the browser model on two actual HAECO roof crops.
- Responsive comparison, map and methodology views.

## Measurement meaning

**An AI region is not an individual panel.** The pretrained model segments solar-covered regions. Initial module counts are `round(net projected area / cos(tilt) / module face area)` per region. They are explicitly marked as estimates until a user enters a counted number. The default 0° tilt and 2.2 m² module face area are assumptions, not inferred installation properties. Clear the tilt to leave face area and unreviewed counts unknown. Enter actual module types/dimensions and tilt where known.

Plan area is the net segmentation polygon area in mapped metres, including subtraction of interior holes. It is not a bounding-box area, roof area or an independently surveyed panel measurement. Tilt correction assumes the orthophoto represents a horizontal projection of planar panels. Rooftop displacement, source orthorectification, mask boundaries, occlusion and shadows can affect measurement.

No Hong Kong accuracy guarantee is claimed. There are material false positives in some older imagery. Review candidates and inspect negative areas for missed arrays. Photo filenames provide provisional years, not independently verified flight dates. Different coverage blocks change totals and must be matched before interpreting a comparison. Supplying an arbitrary scale or origin produces invalid measurements.

## Supplied data

The original 22 TIFFs cover 11 places. The newer footprints each cover 750 × 600 m, with 4.95 km² combined non-overlapping coverage. This is not a whole-Hong-Kong inventory. Dates span 2016–2017 and 2025–2026, so pooled results mix photo years.

The old HAECO and Lamma files lack georeferencing. The demo-generation script attempts ORB/RANSAC registration to the newer reference, using held-out matches and spatial-coverage checks. Accepted transforms and residuals are documented in `meta.registration`. Registration residuals are image-agreement evidence, not independently surveyed accuracy. Failed registration remains unknown.

`public/demo/manifest.json` records the original model-weights hash and study list. Pair JSON contains original-pixel polygons, image metadata, inference settings and review status. Reduced JPEGs are navigation previews. Original giant TIFFs are excluded from GitHub and the site. The live older HAECO crop uses the documented approximate registration.

To regenerate demo assets, install the Python dependencies listed below and run from the repository directory:

```sh
python scripts/prepare_demo.py --weights /path/to/solar-best.pt --originals '/path/to/HK Aerial Photo'
```

Python asset tools require `ultralytics`, `torch`, `opencv-python`, `rasterio`, `shapely`, `numpy`, `onnx`, and `pyproj`. These are build/research tools; the published application does not need Python.

## Model provenance

Model: [finloop/yolov8s-seg-solar-panels](https://huggingface.co/finloop/yolov8s-seg-solar-panels), whose model card declares MIT. The card links its solar segmentation training dataset. The YOLO software used to export/prepare assets is [Ultralytics](https://github.com/ultralytics/ultralytics), under AGPL-3.0; the application source is distributed under AGPL-3.0-or-later. Third-party components and imagery retain their own terms. No ownership of the supplied aerial photographs is asserted.

The bundled model uses fixed RGB `[1,3,640,640]` input, `/255` normalization, 114-grey padding, ONNX opset 17 and no embedded NMS. Large weights use half-precision storage followed by Cast to float32; inference activations remain float32. This keeps the file under the hosting asset limit. Its hash and byte size are in `public/models/manifest.json`. The offline demo was generated from the original checkpoint, so small numerical differences from browser outputs are expected; working resolution can also differ.

The browser decodes YOLO segmentation outputs, performs NMS, unions thresholded masks, clips them to tile cores and merges polygons. Confidence is a model score, not a calibrated probability of correctness. Merged polygon confidence is intentionally null.

## Hosting and privacy

The application builds as static files and works on GitHub Pages, Cloudflare Pages, Netlify, or other static HTTPS hosts. Relative build URLs support subpath hosting. Keep all `dist/` files, including `ort/`, `models/` and `demo/`.

Uploaded photo pixels and reviewed project records remain in the browser; no upload or analytics endpoint exists. Fonts load from Google Fonts, and the map requests OpenStreetMap basemap tiles. The host sees ordinary asset requests. Basemap requests disclose the approximate map view to the tile provider. No private photo content is sent with those requests.

The `.openai/hosting.json` file belongs to this project's private Sites deployment. For a separately cloned deployment, use your own host configuration rather than reusing that project identifier. New GitHub repository and Sites publication are private unless explicitly changed by the owner.

## Operational limits

- Full-resolution aerial imagery can take several minutes to analyze, depending on file layout and computer speed. Keep the tab open, use a desktop browser, and cancel if needed. Processing is single-threaded WASM in a worker; preview decoding still uses browser resources.
- Before exporting final scientific or planning results, validate precision, recall, count error and area error against independent local examples in both periods.
- “Reviewed” is a workflow flag; it does not certify correctness. Manual counts do not alter the segmented area.
- Project imports validate structure but are intended for files from this application. Unknown coordinates and areas are exported as null/blank, not fabricated values.

## Repository structure

`src/imagery.js`: image/window loading and georeferencing. `src/inference.worker.js`: model execution. `src/postprocess.js`: masks/NMS. `src/detector.js`: tiling and union. `src/geometry.js`: measurements and geographic exports. `src/main.js`: review, comparison, maps and persistence. `scripts/`: reproducible asset preparation. `tests/`: measurement and inference-decoder tests.

An optional GitHub Actions test/build workflow is provided at `docs/ci.yml.example`. To enable it, an owner with workflow-write permission can copy it to `.github/workflows/ci.yml`. The publishing connection used for the initial release lacks that scope, so automated Actions are not enabled; tests and the production build were run locally.

The initial imagery audit, methodology assessment, CSV study summary and verification images are archived under `research/analysis/`. They document the investigation and initial unreviewed outputs; the app's current model results and review controls are the operational source. The older feasibility report predates implementation and describes the state at that time. Python audit dependencies are recorded in `research/requirements.txt`; the reusable audit script is `scripts/audit_imagery.py`.

Completed future project updates should be tested, committed and pushed to this GitHub repository, as recorded in `AGENTS.md`.
