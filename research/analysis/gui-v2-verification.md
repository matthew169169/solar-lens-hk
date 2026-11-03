# Solar Lens HK 2.0 verification — 3 November 2026

This release redesigns the interface and connects uploads, browser detection, review, the full study library, mapping and exports.

## Automated checks

- `npm test`: 20 passing checks, including all 11 study pairs, model integrity, bounded TIFF reads, segmentation decoding, area/tilt/count semantics, scale-only calibration, WGS84 anchor serialization, restored UTM codes and library export provenance.
- `npm run build`: Vite production build passed.
- `git diff --check`: no whitespace errors.

## Browser checks

Tested through the user-facing interface in the in-app browser, including the compiled production site:

- Library search and source filtering; all 11 supplied studies and 22 photographs present. Saved personal comparisons appear alongside supplied data.
- Review dialog close-up, verified count, per-area tilt/module dimensions and note. Reopening the edited study retained all values. A 62.63 m² footprint with a 25° override displayed 69.1 m² panel-face area and the entered count of 17.
- Real HAECO TIFF sample completed browser inference: older crop zero candidates, newer crop 38 regions, approximately 1,893.9 m² footprint and an area-based estimate of 861 modules at 0°/2.2 m². These are test outputs, not independently verified inventory measurements.
- Active inference cancellation and subsequent restart succeeded; cancelling a repeat run preserved the previous 38 regions and measurements.
- JPEG upload through the native file picker; known pixel spacing enabled area measurements with locations left unknown. Adding a latitude/longitude anchor enabled map locations. Exporting and importing the project retained outlines and the UTM georeference.
- Clickable photo outlines, manual tracing with Enter to finish, exclusion, and inventory pagination (51–100 of 369).
- Current and all-library map scopes rendered. Library GeoJSON downloaded through the UI contained 2,963 polygons with all 11 study names and both periods. Summary CSV contained 22 rows for 11 studies.
- Mobile workspace and library at 390 × 844 px: document width matched the viewport (390 px), with no page-level horizontal overflow. Viewport override reset afterward.
- Browser console showed no application errors or warnings during these checks.

Screenshots: `gui-v2-library.png` and `gui-v2-mobile.png`. QA edits were browser-local and were not written into supplied study files.

## Interpretation and storage

The detector segments solar regions; module counts remain area-based estimates unless manually counted. Footprint depends on image scale and masks; panel-face area also depends on tilt. Manual anchors require a north-up orthophoto. Supplied old HAECO and Lamma registration remains approximate, and all unreviewed results require inspection.

Uploads and saved personal projects remain in the visitor's browser. Export JSON for backup/transfer. Original giant TIFFs are neither published nor embedded in project files. The approved reduced study previews, derived outlines and small live TIFF samples remain included in the public app.
