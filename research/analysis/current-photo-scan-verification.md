# Current-photo scan correction — 3 November 2026

The former prominent sample button loaded HAECO photos into the active workspace. This was easy to confuse with detecting the user's current photograph.

Version 2.1 separates the actions. **Detect current photo** uses the explicit filename in **Scan target**. **Both loaded photos** is optional. The HAECO loader is now an explicitly named worked example under **How it works**, and clears the study selector when opened.

New uploads can automatically run actual inference. Results and progress identify the filename. Summary metrics follow the selected photo, including a single photo in the first slot. Results commit only against the captured image objects, preventing a stale run from overwriting a replacement photo. Cancel also covers asynchronous preparation of a saved preview.

Original attachments use their uploaded pixels. Reopened projects and supplied studies can scan their own saved preview, without changing the photograph, at no finer resolution than that preview. The UI and run metadata disclose reduced-preview inference. It is less detailed than the original and can produce different results.

Verification:

- All 24 automated checks passed, including four regression checks for scan targeting, single-photo operation, identity-safe commits and preview-coordinate mapping.
- Production build passed.
- A single original `sample-2025.tif` uploaded into the first slot automatically yielded 38 regions, approximately 1,893.9 m² and 861 estimated modules. The second slot remained empty and the selected filename remained unchanged.
- After adding `sample-2017.tif` to the second slot, scanning the first photo retained both filenames and applied its results to the first image only.
- A separate newly uploaded `2025sheko.jpg` automatically detected its own regions and retained its filename; no HAECO files were loaded. Without scale, count and area remained unknown. Known preview spacing and the source grid origin enabled measurements and coordinates.
- Reloaded current-photo selection and explicit reduced-preview scanning were checked through the browser UI.

These are functional checks, not a detection accuracy benchmark. Region counts and estimated module counts remain subject to review.
