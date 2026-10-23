"""Rebuild the browser ONNX file from the trusted source checkpoint.

python scripts/prepare_model.py --weights /path/to/solar-best.pt
Requires ultralytics, onnx, numpy. Download source weights separately from
https://huggingface.co/finloop/yolov8s-seg-solar-panels/resolve/main/best.pt
The default checksum pins the checkpoint actually used in this project.
"""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
import onnx
from onnx import helper, numpy_helper, TensorProto
from ultralytics import YOLO

parser = argparse.ArgumentParser()
parser.add_argument('--weights', type=Path, required=True)
parser.add_argument('--expected-sha256', default='9379f467a6e97a72bbda1ff81096e56f8f87831660b29436fc5783a043e0b94b')
args = parser.parse_args()
if hashlib.sha256(args.weights.read_bytes()).hexdigest() != args.expected_sha256:
    raise SystemExit('Checkpoint checksum differs from the reviewed model. Verify its provenance first.')
export = YOLO(str(args.weights)).export(format='onnx', imgsz=640, opset=17, simplify=False, dynamic=False, device='cpu', nms=False)
model = onnx.load(export)
initializers, casts = [], []
for tensor in model.graph.initializer:
    values = numpy_helper.to_array(tensor)
    if values.dtype == np.float32 and values.size > 512:
        name = tensor.name + '__storage_fp16'
        initializers.append(numpy_helper.from_array(values.astype(np.float16), name))
        casts.append(helper.make_node('Cast', [name], [tensor.name], to=TensorProto.FLOAT, name=tensor.name+'__restore_fp32'))
    else:
        initializers.append(tensor)
nodes = list(model.graph.node)
del model.graph.node[:]
model.graph.node.extend(casts + nodes)
del model.graph.initializer[:]
model.graph.initializer.extend(initializers)
onnx.checker.check_model(model)
directory = Path(__file__).resolve().parents[1] / 'public/models'
directory.mkdir(parents=True, exist_ok=True)
destination = directory / 'solar.onnx'
onnx.save(model, destination)
manifest = {'model': 'finloop/yolov8s-seg-solar-panels', 'source': 'https://huggingface.co/finloop/yolov8s-seg-solar-panels', 'source_license': 'MIT (model card)', 'source_weights_sha256': args.expected_sha256, 'sha256': hashlib.sha256(destination.read_bytes()).hexdigest(), 'bytes': destination.stat().st_size, 'input_shape': [1, 3, 640, 640], 'normalization': 'RGB / 255; grey padding114', 'storage': 'Large weights stored as float16, Cast to float32 before inference; activation precision float32', 'opset': 17, 'class_unit': 'solar region / array; not a verified individual module', 'validation': 'requires review and target-domain validation'}
(directory / 'manifest.json').write_text(json.dumps(manifest, indent=2))
print(f'Created {destination.name}: {destination.stat().st_size} bytes')
