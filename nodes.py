import asyncio
import hashlib
import json
import math
import os

import numpy as np
import torch
from aiohttp import web
from PIL import Image, ImageChops, ImageColor, ImageOps
from typing_extensions import override

import comfy.model_management
from comfy_api.latest import ComfyExtension, io
import folder_paths
import node_helpers
from server import PromptServer


def transform(rgb, alpha, edit):
    """Rotates the picture clockwise by edit["rotate"] degrees about its center, then takes the
    frame [cx, cy, w, h] of the rotated picture, with (cx, cy) relative to the picture center.
    The parts of the frame outside the picture are filled with edit["fill"], with alpha 0."""
    cx, cy, w, h = edit["frame"]
    r = math.radians(edit["rotate"])
    # Exact for multiples of 90 degrees, so those rotations and plain crops stay lossless.
    c, s = round(math.cos(r), 12), round(math.sin(r), 12)
    W, H = rgb.size
    # Output point (x, y) is at q = (x - w/2 + cx, y - h/2 + cy) in the rotated frame, and comes
    # from p = R(-r) q in the picture, around its center.
    coeffs = (c, s, c * (cx - w / 2) + s * (cy - h / 2) + W / 2,
              -s, c, -s * (cx - w / 2) + c * (cy - h / 2) + H / 2)
    rgb = rgb.transform((w, h), Image.Transform.AFFINE, coeffs, Image.Resampling.BICUBIC, fillcolor=ImageColor.getrgb(edit["fill"]))
    alpha = alpha.transform((w, h), Image.Transform.AFFINE, coeffs, Image.Resampling.BICUBIC, fillcolor=0)
    return rgb, alpha


def load_image(path):
    img = node_helpers.pillow(Image.open, path)
    return node_helpers.pillow(ImageOps.exif_transpose, img)


def edit_image(img, edit):
    """Returns the RGB picture and its alpha, None for a picture without alpha and no edit.
    Before the rotation and the frame, the visible edit["layers"] (such as preprocessor results)
    and then the paint layer are drawn over the picture, or over black when edit["image_visible"]
    is false, and the mask layer is cut out of the alpha. Layers are input files of the picture's size."""
    rgb = img.convert("RGB")
    alpha = img.getchannel("A") if "A" in img.getbands() else None
    if not edit:
        return rgb, alpha
    if alpha is None:
        alpha = Image.new("L", img.size, 255)
    layers = [(layer["file"], layer["opacity"]) for layer in edit.get("layers", []) if layer["visible"]]
    if "paint" in edit:
        layers.append((edit["paint"], 1.0))
    if layers or not edit.get("image_visible", True):
        rgb = rgb.convert("RGBA") if edit.get("image_visible", True) else Image.new("RGBA", img.size, (0, 0, 0, 255))
        for file, opacity in layers:
            layer = load_image(folder_paths.get_annotated_filepath(file)).convert("RGBA")
            if opacity < 1:
                layer.putalpha(layer.getchannel("A").point(lambda a: round(a * opacity)))
            rgb.alpha_composite(layer)
        rgb = rgb.convert("RGB")
    if "mask" in edit:
        mask = load_image(folder_paths.get_annotated_filepath(edit["mask"])).getchannel("A")
        alpha = ImageChops.multiply(alpha, ImageChops.invert(mask))
    return transform(rgb, alpha, edit)


def save_preview(path, edit, target):
    rgb, _ = edit_image(load_image(path), json.loads(edit))
    os.makedirs(os.path.dirname(target), exist_ok=True)
    rgb.save(target, quality=90)


# The node shows the edited picture as its preview, computed by the same code as the node.
@PromptServer.instance.routes.post("/davcha_editor/preview")
async def preview(request):
    data = await request.json()
    try:
        path = folder_paths.get_annotated_filepath(data["image"])
    except ValueError:
        return web.Response(status=400)
    edit = data["edit"]
    name = hashlib.sha256(f"{path}|{os.path.getmtime(path)}|{edit}".encode()).hexdigest()[:32] + ".jpg"
    target = os.path.join(folder_paths.get_temp_directory(), "davcha_editor", name)
    if not os.path.exists(target):
        await asyncio.to_thread(save_preview, path, edit, target)
    return web.json_response({"filename": name, "subfolder": "davcha_editor", "type": "temp"})


def load_edited(image, edit):
    rgb, alpha = edit_image(load_image(folder_paths.get_annotated_filepath(image)), json.loads(edit) if edit else None)
    dtype = comfy.model_management.intermediate_dtype()
    device = comfy.model_management.intermediate_device()
    rgb = torch.from_numpy(np.array(rgb).astype(np.float32) / 255.0)[None,]
    if alpha is None:
        mask = torch.zeros(rgb.shape[:3])
    else:
        mask = 1.0 - torch.from_numpy(np.array(alpha).astype(np.float32) / 255.0)[None,]
    return rgb.to(device=device, dtype=dtype), mask.to(device=device, dtype=dtype)


def hash_entry(m, image, edit):
    with open(folder_paths.get_annotated_filepath(image), 'rb') as f:
        m.update(f.read())
    m.update(edit.encode())


def check_entry(image, edit):
    if not folder_paths.exists_annotated_filepath(image):
        return "Invalid image file: {}".format(image)
    edit = json.loads(edit) if edit else {}
    files = [edit[layer] for layer in ("paint", "mask") if layer in edit] + [layer["file"] for layer in edit.get("layers", [])]
    for file in files:
        if not folder_paths.exists_annotated_filepath(file):
            return "Missing layer file: {}".format(file)
    return None


class DavchaLoadImageEditor(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        input_dir = folder_paths.get_input_directory()
        files = [f for f in os.listdir(input_dir) if os.path.isfile(os.path.join(input_dir, f))]
        files = folder_paths.filter_files_content_types(files, ["image"])
        return io.Schema(
            node_id="DavchaLoadImageEditor",
            display_name="Load Image (Editor)",
            category="image",
            inputs=[
                io.Combo.Input("image", options=sorted(files), upload=io.UploadType.image),
                io.String.Input("edit", default="", socketless=True),
            ],
            outputs=[
                io.Image.Output(),
                io.Mask.Output(),
            ],
        )

    @classmethod
    def execute(cls, image, edit) -> io.NodeOutput:
        return io.NodeOutput(*load_edited(image, edit))

    @classmethod
    def fingerprint_inputs(cls, image, edit):
        m = hashlib.sha256()
        hash_entry(m, image, edit)
        return m.digest().hex()

    @classmethod
    def validate_inputs(cls, image, edit):
        return check_entry(image, edit) or True


class DavchaLoadImagesEditor(io.ComfyNode):
    """Several pictures, each with its own edit, as lists: the pictures can have different sizes."""

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="DavchaLoadImagesEditor",
            display_name="Load Images (Editor)",
            category="image",
            inputs=[
                io.String.Input("images", default="[]", socketless=True),
            ],
            outputs=[
                io.Image.Output(is_output_list=True),
                io.Mask.Output(is_output_list=True),
            ],
        )

    @classmethod
    def execute(cls, images) -> io.NodeOutput:
        loaded = [load_edited(entry["image"], entry["edit"]) for entry in json.loads(images)]
        return io.NodeOutput([image for image, _ in loaded], [mask for _, mask in loaded])

    @classmethod
    def fingerprint_inputs(cls, images):
        m = hashlib.sha256()
        for entry in json.loads(images):
            hash_entry(m, entry["image"], entry["edit"])
        return m.digest().hex()

    @classmethod
    def validate_inputs(cls, images):
        entries = json.loads(images)
        if not entries:
            return "No images to load"
        for entry in entries:
            error = check_entry(entry["image"], entry["edit"])
            if error:
                return error
        return True


class DavchaEditorExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [DavchaLoadImageEditor, DavchaLoadImagesEditor]
