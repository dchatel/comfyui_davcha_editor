# comfyui_davcha_editor

A Load Image node with a built-in picture editor for ComfyUI: crop, rotate and pad the
picture, paint a mask or over the picture, and add layers made by ControlNet preprocessors
or by your own workflows, including an editable OpenPose layer.

The edit is stored in the workflow, not in the picture: the original file stays untouched,
and the node applies the edit each time it runs.

## Installation

Clone this repository into `ComfyUI/custom_nodes` and restart ComfyUI:

```
cd ComfyUI/custom_nodes
git clone https://github.com/dchatel/comfyui_davcha_editor
```

There are no extra dependencies. The preprocessor recipes need
[comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux); without it,
they show as unavailable in the menu.

## Nodes

### Load Image (Editor)

Works like the core Load Image: pick, upload or paste (Ctrl+V) a picture, and it outputs
`IMAGE` and `MASK`. Pasting a new picture starts a new edit.
The **Edit** button, or **Open in editor** in the node menu, opens the editor. Once edited,
the button shows the output size, and the node preview shows the edited picture.

The `MASK` output follows the core convention: 1 where the picture is masked out, either by
its own transparency, by the painted mask, or by the padding around it.

### Load Images (Editor)

A list of pictures, each with its own edit. It outputs lists of `IMAGE` and `MASK`, so the
pictures can have different sizes.

- Drop files on the node, or click **+**, to add pictures.
- Click a picture to edit it. The ✎ badge marks edited pictures.
- Drag a picture to move it: the others slide aside to show where it will land.
- Hover a picture and click **×** to remove it, or click **Clear** to remove them all.
- Select the node and press Ctrl+V to add the picture in the clipboard.

### Pasting into pinned nodes

ComfyUI adds a new Load Image instead of pasting into the selected one when that node is
pinned ([ComfyUI_frontend#9899](https://github.com/Comfy-Org/ComfyUI_frontend/issues/9899)).
This extension sends the pasted picture to the selected node instead, for these nodes and for
the core Load Image as well.

## The editor

The top bar holds the mask preview settings on the left, and undo, redo, **Reset**,
**Cancel** and **Apply** on the right. The panel on the right holds the tools, the options of
the current tool, the layers, and the properties of the selected layer.

Numeric fields can be set by dragging their label left or right (Shift for finer steps), or
by typing a value.

### Navigation

- Wheel: zoom.
- Space + drag, or middle drag: pan. The Hand tool (H) pans with the left button.
- Ctrl+0: fit the picture in the view.

### Crop, pad and rotate (C)

- Drag the frame edges or corners to crop. Drag them beyond the picture to pad it; the
  padding is filled with the **Fill** color and is masked out in the `MASK` output.
- Shift keeps the frame ratio, Alt resizes from the center.
- Drag inside the frame to move it.
- Drag outside the frame to rotate the picture, by 15° steps with Shift. **Rotate** sets the
  angle, and the ⟲ 90° / ⟳ 90° buttons turn it by quarter turns, which are lossless.

### Brush (B) and eraser (E)

The brush and the eraser work on the **mask** or on the **paint** layer (M switches between
them), or on the layer selected in the layers list. Pose layers only change with the Pose
tool: use ⧉ to paint over a pose (see below).

- Alt+wheel: size. Shift+wheel: opacity. Ctrl+wheel: hardness.
- The paint color is set next to the mask / paint buttons.
- **Clear** empties the current layer. **Invert mask** (Ctrl+I) inverts the mask.
- Strokes keep their opacity: going over the same place within one stroke doesn't darken it.

### Mask preview

The mask is shown over the picture in one of four ways: as a **Color** overlay, in
**White**, in **Black**, or as a **Negative**. Q cycles through them, Shift+Q shows or hides the mask. The
preview opacity only changes the display, not the mask itself. These settings are also in
the ComfyUI settings, under *DavchaEditor*.

### Layers

From top to bottom: the paint layer, the added layers, and the picture. Each added layer has
a visibility box, an opacity, ↻ to run its recipe again and × to delete it. Hidden layers are
left out of the output, and hiding the picture puts the layers over black.

**Add from recipe…** runs a recipe on the picture and adds its result as a new layer. The
recipe runs through the ComfyUI queue, like any prompt, so it uses the usual cache and memory
management. The menu has three groups:

- **Recipes**: Canny, depth, lineart, soft edges, scribble, DWPose, normal map, and your own
  saved recipes.
- **All AIO preprocessors**: every preprocessor of comfyui_controlnet_aux.
- **Workflows**: your workflow recipes (see below).

### Layer properties

Selecting a layer made by a recipe shows the inputs of its node, such as thresholds,
resolution or model choice. Changing a value doesn't run anything: ↻ turns orange to show the
layer no longer matches its values, and **↻ Run** runs it again. Value changes and runs can be
undone.

**Save as recipe** adds the current values to the **Recipes** menu under the given name, and
replaces a recipe of the same name. Saved recipes are in
`user/default/davcha_editor/recipes.json`, a list of `{"name", "node", "inputs"}` entries, which
you can also edit by hand.

### Workflow recipes

Any workflow can be a recipe:

1. Add a **Load Image** titled `editor:in`: it receives the picture from the editor.
2. Add a **Preview Image** titled `editor:out`: its picture becomes the layer.
3. Optionally, title other nodes `editor:<name>`, for example `editor:Strength`: their widget
   values show in the layer properties, labeled with that name.
4. Save the workflow in the `editor` folder of your workflows (`user/default/workflows/editor`).
   Workflows exported in the API format work too.

Only the nodes needed by `editor:out` run, so other outputs of the workflow, such as a Save
Image, are left out. The layer keeps a copy of the workflow: it still works if the file is
changed, renamed or deleted, and travels with the workflow it belongs to.

### Pose layers

**Pose (DWPose, editable)** detects the people in the picture and makes a pose layer, drawn
like DWPose draws it, whose body points can be edited with the Pose tool (P):

- Click a point to select it, or a limb to select the whole person.
- Ctrl+click adds or removes points, Ctrl+drag selects the points in a box (Shift adds to the
  selection), Ctrl+A selects everything.
- Drag to move the selected points. R switches to rotation: dragging, from anywhere, then
  turns the selected points around their nearest unselected parent joint, by 15° steps with
  Shift.
- Hands follow the wrists and the face follows the nose.
- **Add person** adds a standing person, in a new pose layer if there is none.
  **Delete person** (Del) deletes the people with selected points.

The ⧉ button of a pose layer adds a copy of it as a plain image layer above, to paint on. The
pose layer stays editable underneath.

### Other shortcuts

- Ctrl+Z: undo. Ctrl+Y or Ctrl+Shift+Z: redo.
- Enter: apply. Esc: cancel.

## Files

Painted layers and recipe results are saved as PNG files in `input/davcha_editor` when the
edit is applied, named by their content.

## License

MIT
