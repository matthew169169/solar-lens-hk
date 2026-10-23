#!/usr/bin/env python3
"""Reproduce unreviewed demo segmentation from the locally supplied TIFF photographs.

Usage: .modelenv/bin/python solar-web/scripts/prepare_demo.py --weights /private/tmp/solar-best.pt
Never includes original high-resolution images in the publication directory. The previews
are navigation copies only; all output rings remain in original image pixel coordinates.
"""
import argparse
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import time
import warnings

import cv2
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.features import shapes
from affine import Affine
from shapely.geometry import shape
import torch
from ultralytics import YOLO

REPOSITORY = Path(__file__).resolve().parents[1]
ROOT = REPOSITORY.parent
OUT = REPOSITORY / 'public/demo'
TITLES = {'haeco': 'HAECO · Airport', 'fairviewpark': 'Fairview Park', 'saikung': 'Sai Kung', 'tmt': 'TMT', 'taipo': 'Tai Po', 'yl': 'Yuen Long', 'cheungchau': 'Cheung Chau', 'honglokyuen': 'Hong Lok Yuen', 'lamma': 'Lamma Island', 'ymt': 'Yau Ma Tei', 'sheko': 'Shek O'}
MODEL_ID = 'finloop/yolov8s-seg-solar-panels'


def read_rgb(path, width):
    with rasterio.open(path) as ds:
        h = round(ds.height * width / ds.width)
        return np.moveaxis(ds.read([1,2,3], out_shape=(3,h,width), resampling=Resampling.bilinear), 0, 2)


def register(old, new, originals):
    """Fit an affine using a deterministic train/held-out split of ORB matches.

    Reject estimates with poor match extent or held-out residual. This is image
    registration, not independently surveyed georeferencing.
    """
    w = 2400
    a = read_rgb(originals / old['file'], w)
    b = read_rgb(originals / new['file'], w)
    orb = cv2.ORB_create(nfeatures=20000, edgeThreshold=15, fastThreshold=12)
    ka, da = orb.detectAndCompute(cv2.cvtColor(a, cv2.COLOR_RGB2GRAY), None)
    kb, db = orb.detectAndCompute(cv2.cvtColor(b, cv2.COLOR_RGB2GRAY), None)
    if da is None or db is None:
        return None, {'accepted': False, 'reason': 'No reliable image features'}
    raw = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(da, db, k=2)
    matches = [m for m,n in raw if m.distance < .72*n.distance]
    src = np.array([ka[m.queryIdx].pt for m in matches], np.float32)
    dst = np.array([kb[m.trainIdx].pt for m in matches], np.float32)
    quality = {'method': 'ORB matching, affine RANSAC, deterministic held-out validation', 'matches': len(matches), 'accepted': False}
    if len(matches) < 30:
        quality['reason'] = 'Fewer than 30 reliable cross-date matches'
        return None, quality
    rng = np.random.default_rng(20261023)
    ids = rng.permutation(len(matches)); cut = int(len(ids)*.75)
    train, test = ids[:cut], ids[cut:]
    matrix, inliers = cv2.estimateAffine2D(src[train], dst[train], method=cv2.RANSAC, ransacReprojThreshold=3, maxIters=10000, confidence=.999)
    if matrix is None:
        quality['reason'] = 'Affine model did not converge'
        return None, quality
    projected = np.c_[src[test], np.ones(len(test))] @ matrix.T
    errors = np.linalg.norm(projected-dst[test], axis=1)
    good = errors < 6
    train_points = src[train][inliers.ravel().astype(bool)]
    extent = np.ptp(train_points, axis=0) / [a.shape[1], a.shape[0]]
    pixel_m = abs(new['transform'][0]) * new['width'] / w
    quality.update(inliers=int(inliers.sum()), matchExtent=extent.tolist(), heldoutMatches=int(len(test)), heldoutInliers=int(good.sum()), heldoutMedianErrorM=float(np.median(errors[good])*pixel_m) if good.any() else None, heldoutP90ErrorM=float(np.quantile(errors[good], .9)*pixel_m) if good.any() else None)
    accepted = inliers.sum() >= 25 and good.sum() >= 8 and good.mean() >= .45 and min(extent) > .3 and quality['heldoutP90ErrorM'] < 1.5
    if not accepted:
        quality['reason'] = 'Insufficient spatial coverage or held-out registration agreement'
        return None, quality
    # Convert original older pixel -> resized old -> resized new -> original new -> grid.
    t = Affine(*new['transform'][:6]) * Affine.scale(new['width']/w)
    m = Affine(*matrix.ravel()) * Affine.scale(w/old['width'])
    affine = t * m
    quality['accepted'] = True
    return list(affine)[:6], quality


def segment(entry, meta, model, args):
    path = args.originals / entry['file']
    af = meta['affine']
    native = math.sqrt(abs(af[0]*af[4]-af[1]*af[3])) if af else None
    # Missing scale remains unknown. Use native pixels for these cases.
    scale = max(1, args.gsd/native) if native else 1
    ww, hh = round(entry['width']/scale), round(entry['height']/scale)
    sx, sy = entry['width']/ww, entry['height']/hh
    with rasterio.open(path) as ds:
        rgb = np.moveaxis(ds.read([1,2,3], out_shape=(3,hh,ww), resampling=Resampling.bilinear), 0, 2)
    binary = np.zeros((hh,ww), np.uint8)
    tile_specs = [(x,y) for y in range(0,hh,512) for x in range(0,ww,512)]
    started = time.monotonic()
    for offset in range(0,len(tile_specs),args.batch):
        batch = []
        specs = []
        for x,y in tile_specs[offset:offset+args.batch]:
            x0, y0 = max(0,x-64), max(0,y-64)
            x1, y1 = min(ww,x0+640), min(hh,y0+640)
            # Ultralytics accepts BGR ndarray; TIFF was read in RGB order.
            padded = np.full((640,640,3),114,np.uint8)
            padded[:y1-y0,:x1-x0] = rgb[y0:y1,x0:x1,::-1]
            batch.append(padded)
            specs.append((x,y,x0,y0,x1,y1))
        predictions = model.predict(batch, imgsz=640, conf=args.confidence, iou=.45, device='cpu', retina_masks=True, verbose=False, max_det=300)
        for pred,(x,y,x0,y0,x1,y1) in zip(predictions,specs):
            if pred.masks is None:
                continue
            mask = pred.masks.data.cpu().numpy().max(axis=0)
            if mask.shape != (640,640):
                mask = cv2.resize(mask,(640,640),interpolation=cv2.INTER_NEAREST)
            xe,ye = min(ww,x+512),min(hh,y+512)
            binary[y:ye,x:xe] = (mask[y-y0:ye-y0,x-x0:xe-x0] > .5).astype(np.uint8)
        if offset % (args.batch*8) == 0 or offset+args.batch >= len(tile_specs):
            print(f"{entry['file']}: {min(offset+args.batch,len(tile_specs))}/{len(tile_specs)} tiles, {time.monotonic()-started:.0f}s",flush=True)
    features=[]
    min_pixels = .3/(native*native) if native else 12
    # A global binary mask unions instances and all core boundaries without double counting.
    for geom,val in shapes(binary, mask=binary.astype(bool), transform=Affine.scale(sx,sy), connectivity=4):
        poly = shape(geom)
        if poly.area < min_pixels:
            continue
        # Simplification bounded below one working pixel reduces web payload.
        poly = poly.simplify(min(sx,sy)*.3, preserve_topology=True)
        if poly.is_empty or poly.geom_type != 'Polygon':
            continue
        rings = [list(poly.exterior.coords)] + [list(i.coords) for i in poly.interiors]
        features.append({'id': f'A{len(features)+1:03d}', 'rings': [[[round(x,2),round(y,2)] for x,y in ring] for ring in rings], 'score': None, 'count': None, 'reviewed': False, 'excluded': False, 'method': 'YOLOv8s solar segmentation, tiled mask union'})
    return features, {'model': MODEL_ID, 'weightsSha256': args.weights_sha, 'workingGsdM': native*scale if native else None, 'confidenceThreshold': args.confidence, 'maskThreshold': .5, 'tiles': len(tile_specs), 'timestamp': datetime.now(timezone.utc).isoformat(), 'reviewRequired': True, 'inferenceEngine': 'Ultralytics CPU', 'imageColorOrder': 'RGB TIFF converted to BGR for Ultralytics', 'tileSize': 640, 'coreSize': 512, 'margin': 64, 'areaMethod': 'Union segmentation masks across disjoint cores; polygon interiors subtracted', 'elapsedSeconds': round(time.monotonic()-started,2), 'dateSource': 'filename year, acquisition date unverified'}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--weights', type=Path, required=True)
    parser.add_argument('--originals', type=Path, default=ROOT/'HK Aerial Photo')
    parser.add_argument('--inventory', type=Path, default=REPOSITORY/'data/image_inventory.json')
    parser.add_argument('--gsd', type=float, default=.12)
    parser.add_argument('--confidence', type=float, default=.35)
    parser.add_argument('--batch', type=int, default=4)
    parser.add_argument('--sites', nargs='*')
    parser.add_argument('--force', action='store_true')
    args=parser.parse_args()
    args.weights_sha=hashlib.sha256(args.weights.read_bytes()).hexdigest()
    torch.set_num_threads(4)
    warnings.filterwarnings('ignore', category=rasterio.errors.NotGeoreferencedWarning)
    inventory=json.loads(args.inventory.read_text())
    groups=defaultdict(list)
    for entry in inventory: groups[entry['site']].append(entry)
    OUT.mkdir(parents=True,exist_ok=True)
    model=YOLO(str(args.weights))
    manifest={'pairs':[], 'model':MODEL_ID, 'modelWeightsSha256':args.weights_sha, 'notice':'AI candidate arrays are unreviewed and can contain missed panels or false positives. Counts require manual review or explicit module-area estimates. Years come from filenames. Previews are reduced copies; originals are not published.'}
    order=['haeco','fairviewpark','honglokyuen','lamma','saikung','taipo','tmt','yl','cheungchau','ymt','sheko']
    for site in order:
        entries=sorted(groups[site], key=lambda e:e['year_from_filename'])
        manifest['pairs'].append({'id':site,'title':TITLES[site],'path':f'demo/{site}.json','olderYear':entries[0]['year_from_filename'],'newerYear':entries[1]['year_from_filename']})
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
    for site in order:
        if args.sites and site not in args.sites: continue
        entries=sorted(groups[site], key=lambda e:e['year_from_filename'])
        target=OUT/f'{site}.json'
        if target.exists() and not args.force:
            print(f'{site}: existing completed pair, skipped',flush=True)
            continue
        images=[]
        for i,e in enumerate(entries):
            affine=e['transform'][:6] if e['crs'] else None
            registration=None
            if affine is None:
                affine,registration=register(e,entries[1],args.originals)
                print(e['file'],'registration:',registration,flush=True)
            stem=Path(e['file']).stem.lower()
            preview=OUT/f'{stem}.jpg'
            rgb=read_rgb(args.originals/e['file'],1400)
            cv2.imwrite(str(preview),cv2.cvtColor(rgb,cv2.COLOR_RGB2BGR),[cv2.IMWRITE_JPEG_QUALITY,86])
            meta={'width':e['width'],'height':e['height'],'affine':affine,'crs':'EPSG:2326' if affine else None,'metric':bool(affine),'georefSource':('embedded GeoTIFF' if e['crs'] else 'Image registration to newer GeoTIFF; approximate' if affine else 'Missing georeference'),'original':False,'pixelSizeM':e['pixel_size_m'],'acquisitionDateVerified':False}
            if registration: meta['registration']=registration
            features,run=segment(e,meta,model,args)
            images.append({'name':e['file'],'date':str(e['year_from_filename']),'meta':meta,'preview':f'demo/{stem}.jpg','features':features,'analyzed':True,'run':run})
            print(e['file'],f'{len(features)} candidate array polygons',flush=True)
        target.write_text(json.dumps({'title':TITLES[site],'images':images},separators=(',',':')))
        print(f'COMPLETED {site}',flush=True)

if __name__=='__main__': main()
