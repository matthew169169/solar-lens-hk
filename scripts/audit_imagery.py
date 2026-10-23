"""Inventory the supplied TIFFs and create small, paired review images.

Run: .venv/bin/python audit_imagery.py
The previews are for navigation, not measurements or panel counting.
"""
import argparse
import json
from pathlib import Path

import rasterio
from PIL import Image, ImageDraw
from rasterio.enums import Resampling


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, default=Path('HK Aerial Photo'))
    parser.add_argument('--output', type=Path, default=Path('analysis'))
    parser.add_argument('--previews', action='store_true')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    preview_dir = args.output / 'previews'
    if args.previews:
        preview_dir.mkdir(exist_ok=True)
    records = []
    for path in sorted(args.input.iterdir()):
        if path.suffix.lower() not in {'.tif', '.tiff'}:
            continue
        with rasterio.open(path) as ds:
            records.append({
                'file': path.name, 'year_from_filename': int(path.name[:4]),
                'site': path.stem[4:].lower(), 'width': ds.width,
                'height': ds.height, 'bands': ds.count,
                'crs': ds.crs.to_string() if ds.crs else None,
                'pixel_size_m': list(ds.res) if ds.crs and ds.crs.is_projected else None,
                'bounds': list(ds.bounds) if ds.crs else None,
                'transform': list(ds.transform), 'tags': ds.tags(),
                'acquisition_date_verified': False,
            })
            if args.previews:
                rgb = ds.read([1, 2, 3], out_shape=(3, 640, 800),
                              resampling=Resampling.bilinear)
                Image.fromarray(rgb.transpose(1, 2, 0)).save(
                    preview_dir / f'{path.stem}.jpg', quality=92)
    (args.output / 'image_inventory.json').write_text(json.dumps(records, indent=2))
    pairs = []
    for site in sorted({r['site'] for r in records}):
        items = sorted([r for r in records if r['site'] == site],
                       key=lambda r: r['year_from_filename'])
        if len(items) != 2:
            raise ValueError(f'Expected two images for {site}, found {len(items)}')
        old, new = items
        same_bounds = bool(old['bounds'] and new['bounds'] and all(
            abs(a - b) < 0.001 for a, b in zip(old['bounds'], new['bounds'])))
        pairs.append({'site': site, 'old_file': old['file'], 'new_file': new['file'],
                      'year_gap_from_filenames': new['year_from_filename'] - old['year_from_filename'],
                      'same_bounds_within_1mm': same_bounds,
                      'needs_georeferencing': not (old['crs'] and new['crs']),
                      'image_registration_verified': False})
    (args.output / 'pair_inventory.json').write_text(json.dumps(pairs, indent=2))
    if args.previews:
        sheet = Image.new('RGB', (1000, len(pairs) * 242), 'white')
        draw = ImageDraw.Draw(sheet)
        for row, pair in enumerate(pairs):
            for col, key in enumerate(['old_file', 'new_file']):
                name = pair[key]
                pic = Image.open(preview_dir / f'{Path(name).stem}.jpg')
                pic.thumbnail((490, 210))
                sheet.paste(pic, (col * 500, row * 242 + 26))
                draw.text((col * 500 + 5, row * 242 + 5), name, fill='black')
        sheet.save(args.output / 'contact_sheet.jpg', quality=92)
    print(f'{len(records)} images; {len(pairs)} pairs; '
          f'{sum(bool(r["crs"]) for r in records)} georeferenced images')


if __name__ == '__main__':
    main()
