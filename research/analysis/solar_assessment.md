# Solar-panel survey: feasibility and proposed measurement method

Assessment date: 22 October 2026.

**Finding:** These images support a practical, assisted survey of visible solar installations in the supplied areas. Use solar-array segmentation followed by individual-module counting and human review. Map coordinates and plan-view area can be obtained directly for 20 of the 22 files. Actual panel-face surface area additionally needs panel tilt or known module dimensions. No complete panel counts or area totals have been produced in this assessment.

## What was checked

All 22 TIFF files were successfully opened with Rasterio/GDAL. RGB navigation previews and a paired contact sheet were generated. Some four-band, separate-plane TIFFs cannot be opened by Pillow directly; they are readable with the geospatial reader. Preserve the original TIFFs and their metadata.

There are **11 older/newer pairs**, rather than 10. Years below come from filenames; the original acquisition dates have not been independently verified. TIFF creation/modification dates are not reliable substitutes for flight dates. The comparisons span **8–10 years**.

| Place label in files | Older file year | Older pixel spacing | Newer file year | Newer pixel spacing | Geographic status |
|---|---:|---:|---:|---:|---|
| Cheung Chau | 2016 | 4 cm | 2025 | 5 cm | Same bounds |
| Fairview Park | 2016 | 5 cm | 2025 | 4 cm | Same bounds |
| HAECO | 2017 | Unknown | 2025 | 6 cm | Older file lacks georeferencing |
| Hong Lok Yuen | 2017 | 6 cm | 2026 | 10 cm | Same bounds |
| Lamma | 2017 | Unknown | 2025 | 5 cm | Older file lacks georeferencing |
| Sai Kung | 2016 | 15 cm | 2025 | 5 cm | Same bounds |
| Sheko | 2017 | 12 cm | 2025 | 5 cm | Same bounds |
| Taipo | 2016 | 15 cm | 2026 | 10 cm | Same bounds |
| TMT | 2016 | 15 cm | 2026 | 10 cm | Same bounds |
| YL | 2016 | 6 cm | 2026 | 10 cm | Same bounds |
| YMT | 2017 | 5 cm | 2025 | 6 cm | Same bounds |

Place abbreviations are retained as supplied, without guessing their full names. Pixel spacing is the stored raster sampling interval; it does not prove equivalent optical detail or positional accuracy.

All 11 newer images cover **750 × 600 m**, or **0.45 km² each**. Their rectangles do not overlap, giving 4.95 km² of newer-image coverage. This is a survey of these image footprints, not whole districts or all Hong Kong. Nine older/newer pairs have matching geographic bounds to within 1 mm numerically. This is a metadata check, not proof of subpixel image registration or real-world accuracy.

## Recommended workflow

1. **Fix the survey boundary and dates.** Verify flight/acquisition dates from the original provider records. Use the same ground boundary in each pair. Recover original georeferencing for 2017 HAECO and Lamma if available; otherwise register them to a reference orthophoto using well-distributed stable ground features and independent check points. Check roof displacement, shadows, relief and local alignment in every pair. Do not assign the newer transform to an older file solely because the pictures look similar.
2. **Detect solar arrays.** Read RGB bands in overlapping tiles at native detail, with correct image offsets and map transforms. Use a solar-specific segmentation model to propose panel-covered regions. For this small study, QGIS tracing plus assisted detection is a practical route; a fully automatic detector still needs local validation. Do not assume every band is RGB or use the unlabelled fourth band as near-infrared without documentation.
3. **Count individual modules within each array.** Use a locally trained or adapted instance-segmentation model, or trace/count visible module grids under human review. Save both array count and module count. A connected solar mask counts an array, not the individual panels inside it. Internal cell lines, half-cut cell divisions, mounting rails and gaps can all cause count errors. Where boundaries cannot be resolved, record a count range or an explicitly estimated count; do not report an exact count from area divided by one assumed panel size.
4. **Review detections and missed panels.** Check skylights, blue roofs, water tanks, solar-thermal equipment, shadows and small installations. Review systematic samples of areas labelled as having no panels, including the older images. Lack of a detection is not proof of zero panels. Use separate validation examples from both periods and different sites. Evaluate module-count error, array precision/recall and area error separately; detection confidence alone is not an accuracy estimate.
5. **Measure and export.** Keep panel polygons in Hong Kong 1980 Grid (EPSG:2326) for square-metre calculations. Export their outlines and centres to WGS84 longitude/latitude for a map. Remove duplicate detections from tile overlaps. Keep gaps, roof surfaces and walkways out of net panel area. Mark partially visible or boundary-crossing installations and use a consistent inclusion rule.
6. **Compare periods.** Produce separate per-site totals for the older and newer image dates, then differences. Spatially match arrays to identify appearances, disappearances and footprint changes. The images bracket change dates; they do not establish exact installation dates. Do not count a matched installation as newly installed just because its segmentation outline changed slightly.

## How the three requested quantities are obtained

**1. Total installed panels:** sum reviewed individual-module counts for each period within the survey boundary. Also retain array/installation counts so the two quantities cannot be confused. The imagery establishes visible panels present at the photo dates, not whether they were connected, functioning, or subsequently removed. Occluded or unresolved panels remain an explicit uncertainty.

**2. Total area:** report two different quantities where supported:

- **Plan-view panel area:** area of the net panel polygons in EPSG:2326. For these north-up, square-pixel images, `area = panel-mask pixel count × pixel spacing²`. At 5 cm spacing, one pixel represents 0.0025 m². Use pixel masks or panel outlines, not array bounding rectangles containing gaps.
- **Actual panel-face surface area:** for a planar panel whose tilt from horizontal is known, `surface area = horizontal projected area / cos(tilt)`. Sum after correcting each panel or tilt group. Alternatively sum manufacturer module length × width when the module types and counts are known. A 30° tilt gives about 15.5% more surface than horizontal projection. Tilt cannot generally be recovered reliably from one RGB overhead image alone; use installation specifications, surveyed roof/panel planes, or suitable stereo/LiDAR/3D information, and state any assumptions. First check whether the source orthorectification and roof displacement make a horizontal projection interpretation appropriate.

**3. Locations:** use each raster's pixel-to-map transform to obtain EPSG:2326 coordinates, then transform to EPSG:4326 for longitude/latitude. Store panel/array outlines as well as centre points. Coordinate precision is not survey accuracy; roof displacement and georeferencing errors must be assessed separately.

## Demonstration from the supplied photos

The HAECO comparison shows clear solar-array patterns on several roofs in the newer file. The full-resolution detail shows enough structure to attempt module-level interpretation, but cell divisions must be distinguished from module edges. No exhaustive old-image absence check or complete module count was performed.

One manually identified small array in `2025HAECO.tif` was converted from image pixels to **approximately 22.305136° N, 113.900013° E**. This demonstrates that mapping is technically possible with the supplied metadata; the location is not independently surveyed. It is exported in `example_array_location.geojson`, with count and area deliberately left null pending measurement.

- `haeco_comparison.jpg`: older/newer navigation comparison, not a registered change map.
- `haeco_detail.jpg`: native-resolution crop of one newer roof, starting at source column 2450, row 1500; size 1900 × 1500 pixels.
- `haeco_sample_zoom.png`: enlarged detail for inspecting module/cell boundaries; enlargement adds no information.
- `contact_sheet.jpg`: overview of all 11 pairs.
- `image_inventory.json` and `pair_inventory.json`: reproducible metadata audit.

## Tools and evidence

**Recommended starting point:** Rasterio/GDAL for imagery, QGIS for geographic alignment and review, and a solar-specific segmentation model for candidate arrays. Start with a small annotated pilot spanning a dense residential site, HAECO's large roofs, and a coarser older image; measure performance before processing all files. Module counting is a separate stage from array segmentation.

[DeepPVMapper](https://github.com/gabrielkasmi/deeppvmapper) is an existing open-source example of classification, segmentation and geolocated array outputs. Its current pipeline is France-specific, requires a CUDA GPU, and applies building and residential-size filters; it is not a drop-in Hong Kong module counter. Reuse candidate model components only after adaptation, without filters that would discard large hangar or non-rooftop arrays.

[Jiang et al., 2021](https://essd.copernicus.org/articles/13/5389/2021/) provide multi-resolution PV segmentation data at 0.1, 0.3 and 0.8 m, and report that cross-resolution model transfer needs target-data fine-tuning. This supports testing on these Hong Kong images and both periods rather than importing another study's accuracy claim.

The [Hong Kong Lands Department](https://www.landsd.gov.hk/en/spatial-data/open-data.html/1000) describes georeferenced orthophotos and aerial-photo flight indices with dates and coverage; these are useful for recovering source metadata. The present assessment does not establish the original provider or processing history of the supplied TIFFs.

## Proposed final deliverables after detection and review

A table for each place with both photo dates, individual-panel counts, array counts, net plan-view panel area (m²), panel-face area where supported, changes and uncertainty; a GeoPackage/GeoJSON of panel/array locations; and annotated old/new images. Missing or unresolved quantities should be null/unknown rather than zero. Pooled totals must be labelled as totals for the supplied image footprints and mixed image years.

To rerun the audit: `.venv/bin/python audit_imagery.py`. Add `--previews` to regenerate navigation images. This audit does not run a detector or create survey totals.
