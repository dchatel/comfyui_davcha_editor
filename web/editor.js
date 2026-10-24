import { app } from "/scripts/app.js"
import { api } from "/scripts/api.js"

const ROTATE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12a7 7 0 1 1-2.05-4.95M19 3v4.5h-4.5" stroke="#000" stroke-width="4"/><path d="M19 12a7 7 0 1 1-2.05-4.95M19 3v4.5h-4.5" stroke="#fff" stroke-width="2"/></svg>'
const CURSORS = {
    l: "ew-resize", r: "ew-resize", t: "ns-resize", b: "ns-resize",
    lt: "nwse-resize", rb: "nwse-resize", rt: "nesw-resize", lb: "nesw-resize",
    move: "move", rotate: `url("data:image/svg+xml,${encodeURIComponent(ROTATE_SVG)}") 12 12, crosshair`,
}
const MASK_VIEWS = ["Color", "White", "Black", "Negative"]
const SETTINGS = { view: "DavchaEditor.Mask.View", color: "DavchaEditor.Mask.Color", opacity: "DavchaEditor.Mask.Opacity" }
const LAYERS = ["paint", "mask"]

const HELP = {
    crop: "Frame edges: crop or pad (Shift: keep ratio, Alt: from center) · Inside: move · Outside: rotate (Shift: 15° steps)",
    brush: "Alt+wheel: size · Shift+wheel: opacity · Ctrl+wheel: hardness · M: mask/paint · Q: mask preview · Shift+Q: show/hide mask",
    eraser: "Alt+wheel: size · Shift+wheel: opacity · Ctrl+wheel: hardness · M: mask/paint · Q: mask preview · Shift+Q: show/hide mask",
    hand: "Drag: pan",
}

const STYLE = `
.davcha-editor { position: fixed; inset: 0; z-index: 10000; display: flex; flex-direction: column; background: #151515; color: #ddd; font: 13px sans-serif; }
.davcha-editor .de-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 10px; background: #222; border-bottom: 1px solid #333; white-space: nowrap; }
.davcha-editor .de-grow { flex: 1; }
.davcha-editor .de-sep { width: 1px; align-self: stretch; background: #3a3a3a; }
.davcha-editor .de-options { display: flex; align-items: center; gap: 8px; }
.davcha-editor input[type=number] { width: 56px; background: #111; color: #ddd; border: 1px solid #444; border-radius: 4px; padding: 2px 4px; }
.davcha-editor select { background: #111; color: #ddd; border: 1px solid #444; border-radius: 4px; padding: 2px 4px; }
.davcha-editor input[type=color] { width: 32px; height: 22px; padding: 0; border: 1px solid #444; background: none; }
.davcha-editor button { background: #333; color: #ddd; border: 1px solid #444; border-radius: 4px; padding: 3px 10px; cursor: pointer; }
.davcha-editor button:hover { background: #3c3c3c; }
.davcha-editor button.de-active { background: #4a4a4a; border-color: #888; }
.davcha-editor button.de-primary { background: #2b5fa8; border-color: #3a70bd; }
.davcha-editor button:disabled, .davcha-editor input:disabled { opacity: 0.5; cursor: default; }
.davcha-editor .de-stage { position: relative; flex: 1; min-height: 0; }
.davcha-editor .de-stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; outline: none; }
.davcha-editor .de-help { padding: 4px 10px; color: #888; font-size: 12px; background: #1b1b1b; border-top: 1px solid #333; }
.davcha-gallery { display: flex; flex-wrap: wrap; align-content: flex-start; gap: 6px; padding: 4px; overflow-y: auto; box-sizing: border-box; }
.davcha-gallery .dg-tile { position: relative; width: 84px; height: 84px; box-sizing: border-box; border: 1px solid #444; border-radius: 4px; overflow: hidden; background: #1b1b1b; cursor: pointer; }
.davcha-gallery .dg-tile img { width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
.davcha-gallery .dg-tile.dg-over { outline: 2px solid #3a70bd; }
.davcha-gallery .dg-badge { position: absolute; left: 2px; bottom: 2px; padding: 0 4px; border-radius: 3px; background: rgba(0, 0, 0, 0.7); color: #fff; font: 10px sans-serif; }
.davcha-gallery .dg-remove { display: none; position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; border-radius: 9px; background: rgba(0, 0, 0, 0.7); color: #fff; font: 13px/18px sans-serif; text-align: center; }
.davcha-gallery .dg-tile:hover .dg-remove { display: block; }
.davcha-gallery .dg-add { display: flex; align-items: center; justify-content: center; border-style: dashed; color: #888; font-size: 28px; }
`
document.head.append(Object.assign(document.createElement("style"), { textContent: STYLE }))

function viewUrl(value) {
    let type = "input"
    const m = value.match(/^(.*) \[(input|output|temp)\]$/)
    if (m) [, value, type] = m
    const i = value.lastIndexOf("/")
    return api.apiURL(`/view?filename=${encodeURIComponent(value.slice(i + 1))}&type=${type}&subfolder=${encodeURIComponent(value.slice(0, Math.max(i, 0)))}`)
}

async function loadImage(value) {
    const img = new Image()
    img.src = viewUrl(value)
    await img.decode()
    return img
}

function editLabel(edit) {
    if (!edit) return "Edit"
    const { rotate, frame } = JSON.parse(edit)
    return `Edit (${frame[2]}×${frame[3]}${rotate ? `, ${rotate}°` : ""})`
}

// Layers are stored as input files named after their content, so an unchanged layer keeps its file.
async function uploadLayer(canvas) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"))
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))
    const name = [...hash.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("") + ".png"
    const body = new FormData()
    body.append("image", new File([blob], name, { type: "image/png" }))
    body.append("subfolder", "davcha_editor")
    body.append("type", "input")
    body.append("overwrite", "true")
    const res = await api.fetchApi("/upload/image", { method: "POST", body })
    if (!res.ok) throw new Error(`Layer upload failed: ${res.status}`)
    const { name: saved, subfolder } = await res.json()
    return `${subfolder}/${saved}`
}

// The edited picture, as a temp file computed by the node's own Python.
async function fetchPreview(image, edit) {
    const res = await api.fetchApi("/davcha_editor/preview", { method: "POST", body: JSON.stringify({ image, edit }) })
    if (!res.ok) throw new Error(`Preview failed: ${res.status}`)
    return res.json()
}

async function updatePreview(node) {
    const edit = node.widgets.find((w) => w.name === "edit").value
    const image = node.widgets.find((w) => w.name === "image").value
    const preview = await fetchPreview(image, edit)
    node.imgs = undefined
    app.nodeOutputs[node.graph === app.graph ? String(node.id) : `${node.graph.id}:${node.id}`] = { images: [preview] }
    node.setDirtyCanvas(true, true)
}

// The view works in "world" coordinates: the rotated picture, relative to its center.
// The edit is a rotation (clockwise, in degrees, about the picture center) and a frame
// {l, t, r, b} in world coordinates; a frame larger than the picture pads it. The paint and
// mask layers have the picture's size and are drawn in its own (unrotated) pixels. The node's
// Python applies the same edit to the original file.
class Editor {
    constructor(img, edit, layers, onApply) {
        this.onApply = onApply
        this.img = img
        this.W = img.naturalWidth
        this.H = img.naturalHeight
        this.rotate = edit?.rotate ?? 0
        this.fill = edit?.fill ?? "#808080"
        if (edit) {
            const [cx, cy, w, h] = edit.frame
            this.frame = { l: cx - w / 2, t: cy - h / 2, r: cx + w / 2, b: cy + h / 2 }
        } else {
            this.frame = this.fullFrame()
        }
        this.layers = {}
        for (const name of LAYERS) {
            const canvas = this.newCanvas()
            if (layers[name]) canvas.getContext("2d").drawImage(layers[name], 0, 0)
            this.layers[name] = { canvas, ctx: canvas.getContext("2d"), used: !!layers[name] }
        }
        this.strokeCanvas = this.newCanvas()
        this.strokeCtx = this.strokeCanvas.getContext("2d")
        this.previewCanvas = this.newCanvas()
        this.previewCtx = this.previewCanvas.getContext("2d")
        this.tintCanvas = this.newCanvas()
        this.tintCtx = this.tintCanvas.getContext("2d")
        this.brush = { size: 40, opacity: 1, hardness: 0.8, color: "#ffffff" }
        this.target = "mask"
        this.showMask = true
        const setting = app.extensionManager.setting
        this.maskView = setting.get(SETTINGS.view)
        this.maskColor = "#" + setting.get(SETTINGS.color).replace("#", "")
        this.maskOpacity = setting.get(SETTINGS.opacity) / 100
        this.undoStack = []
        this.redoStack = []
        this.drag = null
        this.stroke = null
        this.space = false
        this.mouse = null
        this.hud = null
        this.build()
        this.setTool("crop")
        this.fit()
    }

    newCanvas() {
        const canvas = document.createElement("canvas")
        canvas.width = this.W
        canvas.height = this.H
        return canvas
    }

    build() {
        this.root = document.createElement("div")
        this.root.className = "davcha-editor"
        this.root.innerHTML = `
<div class="de-bar">
  <button data-tool="crop" title="Crop, pad and rotate (C)">Crop</button><button data-tool="brush" title="Brush (B)">Brush</button><button data-tool="eraser" title="Eraser (E)">Eraser</button><button data-tool="hand" title="Pan (H)">Hand</button>
  <span class="de-sep"></span>
  <span class="de-options" data-for="crop">
    <label>Rotate <input class="de-rotate" type="number" step="0.1"></label>
    <button data-action="ccw">⟲ 90°</button><button data-action="cw">⟳ 90°</button>
    <label>Fill <input class="de-fill" type="color"></label>
  </span>
  <span class="de-options" data-for="brush eraser">
    <button data-target="mask" title="Paint on the mask (M)">Mask</button><button data-target="paint" title="Paint on the picture (M)">Paint</button>
    <input class="de-color" type="color" title="Paint color">
    <label>Size <input class="de-size-input" type="number" min="1" max="2000"></label>
    <label>Opacity <input class="de-opacity" type="number" min="1" max="100"></label>
    <label>Hardness <input class="de-hardness" type="number" min="0" max="100"></label>
    <button data-action="clear" title="Clear the current layer">Clear</button>
    <span class="de-sep"></span>
    <label><input class="de-show-mask" type="checkbox"> Show mask</label>
    <select class="de-mask-view" title="Mask preview (Q)">${MASK_VIEWS.map((v) => `<option>${v}</option>`).join("")}</select>
    <input class="de-mask-color" type="color" title="Mask preview color">
    <label title="Preview only: the mask keeps its own values">Preview <input class="de-mask-opacity" type="number" min="0" max="100"></label>
  </span>
  <span class="de-size"></span>
  <span class="de-grow"></span>
  <button data-action="undo" title="Undo (Ctrl+Z)">↶</button><button data-action="redo" title="Redo (Ctrl+Y)">↷</button>
  <button data-action="reset">Reset</button><button data-action="cancel">Cancel</button><button data-action="apply" class="de-primary">Apply</button>
</div>
<div class="de-stage"><canvas class="de-main"></canvas><canvas class="de-overlay" tabindex="0"></canvas></div>
<div class="de-help"></div>`
        this.main = this.root.querySelector(".de-main")
        this.mainCtx = this.main.getContext("2d")
        this.canvas = this.root.querySelector(".de-overlay")
        this.ctx = this.canvas.getContext("2d")
        this.help = this.root.querySelector(".de-help")
        this.sizeLabel = this.root.querySelector(".de-size")
        this.inputs = {
            rotate: this.root.querySelector(".de-rotate"),
            fill: this.root.querySelector(".de-fill"),
            color: this.root.querySelector(".de-color"),
            size: this.root.querySelector(".de-size-input"),
            opacity: this.root.querySelector(".de-opacity"),
            hardness: this.root.querySelector(".de-hardness"),
            showMask: this.root.querySelector(".de-show-mask"),
            maskView: this.root.querySelector(".de-mask-view"),
            maskColor: this.root.querySelector(".de-mask-color"),
            maskOpacity: this.root.querySelector(".de-mask-opacity"),
        }
        this.inputs.rotate.value = this.rotate
        this.inputs.fill.value = this.fill
        this.inputs.showMask.checked = this.showMask
        this.inputs.maskColor.value = this.maskColor
        this.inputs.maskOpacity.value = Math.round(this.maskOpacity * 100)
        this.syncBrushInputs()
        this.setMaskView(this.maskView)

        this.root.querySelector(".de-bar").addEventListener("click", (e) => {
            const { action, tool, target } = e.target.dataset ?? {}
            if (tool) this.setTool(tool)
            else if (target) this.setTarget(target)
            else if (action === "cw" || action === "ccw") this.quarterTurn(action === "cw")
            else if (action === "clear") this.clearLayer()
            else if (action === "undo") this.undo()
            else if (action === "redo") this.redo()
            else if (action === "reset") this.reset()
            else if (action === "cancel") this.close()
            else if (action === "apply") this.apply()
        })
        this.inputs.rotate.addEventListener("change", () => {
            const before = this.cropState()
            this.setRotate(Number(this.inputs.rotate.value) || 0)
            this.pushCrop(before)
        })
        this.inputs.fill.addEventListener("input", () => {
            this.fill = this.inputs.fill.value
            this.redraw()
        })
        this.inputs.color.addEventListener("input", () => (this.brush.color = this.inputs.color.value))
        this.inputs.size.addEventListener("change", () => this.setBrush("size", Number(this.inputs.size.value)))
        this.inputs.opacity.addEventListener("change", () => this.setBrush("opacity", Number(this.inputs.opacity.value) / 100))
        this.inputs.hardness.addEventListener("change", () => this.setBrush("hardness", Number(this.inputs.hardness.value) / 100))
        this.inputs.showMask.addEventListener("change", () => this.setShowMask(this.inputs.showMask.checked))
        this.inputs.maskView.addEventListener("change", () => this.setMaskView(this.inputs.maskView.value))
        this.inputs.maskColor.addEventListener("input", () => {
            this.maskColor = this.inputs.maskColor.value
            app.extensionManager.setting.set(SETTINGS.color, this.maskColor.slice(1))
            this.redraw()
        })
        this.inputs.maskOpacity.addEventListener("change", () => {
            this.maskOpacity = Math.min(Math.max(Number(this.inputs.maskOpacity.value) || 0, 0), 100) / 100
            this.inputs.maskOpacity.value = Math.round(this.maskOpacity * 100)
            app.extensionManager.setting.set(SETTINGS.opacity, Math.round(this.maskOpacity * 100))
            this.redraw()
        })
        this.canvas.addEventListener("pointerdown", (e) => this.onDown(e))
        this.canvas.addEventListener("pointermove", (e) => this.onMove(e))
        this.canvas.addEventListener("pointerup", (e) => this.onUp(e))
        this.canvas.addEventListener("pointerleave", () => {
            this.mouse = null
            this.redrawOverlay()
        })
        this.canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false })
        this.canvas.addEventListener("contextmenu", (e) => e.preventDefault())
        this.onKeyDown = (e) => this.onKey(e, true)
        this.onKeyUp = (e) => this.onKey(e, false)
        window.addEventListener("keydown", this.onKeyDown, true)
        window.addEventListener("keyup", this.onKeyUp, true)

        document.body.append(this.root)
        this.resize = new ResizeObserver(() => {
            const dpr = window.devicePixelRatio
            for (const c of [this.main, this.canvas]) {
                c.width = c.clientWidth * dpr
                c.height = c.clientHeight * dpr
            }
            this.mainDirty = true
            this.draw()
        })
        this.resize.observe(this.canvas)
        this.canvas.focus()
    }

    setTool(tool) {
        this.tool = tool
        for (const b of this.root.querySelectorAll("[data-tool]")) b.classList.toggle("de-active", b.dataset.tool === tool)
        for (const o of this.root.querySelectorAll(".de-options")) o.style.display = o.dataset.for.split(" ").includes(tool) ? "" : "none"
        this.help.textContent = `${HELP[tool]} · Wheel: zoom · Space or middle drag: pan · C B E H: tools · Ctrl+Z / Ctrl+Y: undo / redo · Ctrl+0: fit · Enter: apply · Esc: cancel`
        this.setTarget(this.target)
        this.updateCursor()
        this.redraw()
    }

    setTarget(target) {
        this.target = target
        for (const b of this.root.querySelectorAll("[data-target]")) b.classList.toggle("de-active", b.dataset.target === target)
        this.inputs.color.style.display = target === "paint" ? "" : "none"
    }

    setMaskView(view) {
        this.maskView = view
        this.inputs.maskView.value = view
        this.inputs.maskColor.style.display = view === "Color" ? "" : "none"
        this.inputs.maskOpacity.disabled = view === "Negative"
        const setting = app.extensionManager.setting
        if (setting.get(SETTINGS.view) !== view) setting.set(SETTINGS.view, view)
        this.redraw()
    }

    setShowMask(show) {
        this.showMask = show
        this.inputs.showMask.checked = show
        this.redraw()
    }

    setBrush(key, value) {
        const limits = { size: [1, 2000], opacity: [0.01, 1], hardness: [0, 1] }[key]
        value = Math.min(Math.max(value, limits[0]), limits[1])
        this.brush[key] = key === "size" ? Math.round(value) : Math.round(value * 100) / 100
        this.syncBrushInputs()
        this.redrawOverlay()
    }

    syncBrushInputs() {
        this.inputs.size.value = this.brush.size
        this.inputs.opacity.value = Math.round(this.brush.opacity * 100)
        this.inputs.hardness.value = Math.round(this.brush.hardness * 100)
        this.inputs.color.value = this.brush.color
    }

    showHud(text) {
        clearTimeout(this.hudTimer)
        this.hud = text
        this.hudTimer = setTimeout(() => {
            this.hud = null
            this.redrawOverlay()
        }, 900)
        this.redrawOverlay()
    }

    updateCursor() {
        if (this.drag?.mode === "pan") this.canvas.style.cursor = "grabbing"
        else if (this.space || this.tool === "hand") this.canvas.style.cursor = "grab"
        else if (this.tool === "brush" || this.tool === "eraser") this.canvas.style.cursor = "none"
        else if (this.tool === "crop" && this.mouse) this.canvas.style.cursor = CURSORS[this.hit(...this.mouse)]
        else this.canvas.style.cursor = "default"
    }

    close() {
        window.removeEventListener("keydown", this.onKeyDown, true)
        window.removeEventListener("keyup", this.onKeyUp, true)
        this.resize.disconnect()
        clearTimeout(this.hudTimer)
        this.root.remove()
    }

    async apply() {
        for (const b of this.root.querySelectorAll("button")) b.disabled = true
        const f = this.frame
        const edit = { rotate: this.rotate, frame: [(f.l + f.r) / 2, (f.t + f.b) / 2, f.r - f.l, f.b - f.t], fill: this.fill }
        try {
            for (const name of LAYERS) {
                if (this.layers[name].used) edit[name] = await uploadLayer(this.layers[name].canvas)
            }
        } catch (error) {
            for (const b of this.root.querySelectorAll("button")) b.disabled = false
            const toast = app.extensionManager.toast
            if (toast.error) toast.error("Editor", { description: error.message, duration: 5000 })
            else toast.add({ severity: "error", summary: "Editor", detail: error.message, life: 5000 })
            return
        }
        const full = this.fullFrame()
        const identity = this.rotate === 0 && f.l === full.l && f.t === full.t && f.r === full.r && f.b === full.b && !edit.paint && !edit.mask
        this.onApply(identity ? "" : JSON.stringify(edit))
        this.close()
    }

    fullFrame() {
        return { l: -this.W / 2, t: -this.H / 2, r: this.W / 2, b: this.H / 2 }
    }

    reset() {
        const before = this.cropState()
        this.rotate = 0
        this.inputs.rotate.value = 0
        this.frame = this.fullFrame()
        this.pushCrop(before)
        this.fit()
    }

    // History entries restore the state before or after one change.

    push(entry) {
        this.undoStack.push(entry)
        this.redoStack = []
    }

    undo() {
        const entry = this.undoStack.pop()
        if (!entry) return
        entry.undo()
        this.redoStack.push(entry)
        this.redraw()
    }

    redo() {
        const entry = this.redoStack.pop()
        if (!entry) return
        entry.redo()
        this.undoStack.push(entry)
        this.redraw()
    }

    cropState() {
        return { rotate: this.rotate, frame: { ...this.frame } }
    }

    setCropState(state) {
        this.rotate = state.rotate
        this.inputs.rotate.value = state.rotate
        this.frame = { ...state.frame }
    }

    pushCrop(before) {
        const after = this.cropState()
        if (before.rotate === after.rotate && ["l", "t", "r", "b"].every((k) => before.frame[k] === after.frame[k])) return
        this.push({ undo: () => this.setCropState(before), redo: () => this.setCropState(after) })
    }

    // Saves the pixels of a layer area before a change, and returns a function that makes the
    // history entry once the change is done.
    recordLayer(name, x, y, w, h) {
        const layer = this.layers[name]
        x = Math.max(0, Math.floor(x))
        y = Math.max(0, Math.floor(y))
        w = Math.min(this.W, Math.ceil(x + w)) - x
        h = Math.min(this.H, Math.ceil(y + h)) - y
        if (w <= 0 || h <= 0) return () => {}
        const before = layer.ctx.getImageData(x, y, w, h)
        const usedBefore = layer.used
        return (usedAfter) => {
            const after = layer.ctx.getImageData(x, y, w, h)
            layer.used = usedAfter
            this.push({
                undo: () => {
                    layer.ctx.putImageData(before, x, y)
                    layer.used = usedBefore
                },
                redo: () => {
                    layer.ctx.putImageData(after, x, y)
                    layer.used = usedAfter
                },
            })
        }
    }

    clearLayer() {
        const layer = this.layers[this.target]
        const done = this.recordLayer(this.target, 0, 0, this.W, this.H)
        layer.ctx.clearRect(0, 0, this.W, this.H)
        done(false)
        this.redraw()
    }

    // Edges sit on the pixel grid of the picture as turned by the nearest quarter turn, so that
    // crops of a picture turned by a multiple of 90° are lossless.
    snap(f) {
        const quarter = Math.abs(Math.round(this.rotate / 90)) % 2 === 1
        const gx = (quarter ? this.H : this.W) / 2
        const gy = (quarter ? this.W : this.H) / 2
        const g = { l: Math.round(f.l + gx) - gx, r: Math.round(f.r + gx) - gx, t: Math.round(f.t + gy) - gy, b: Math.round(f.b + gy) - gy }
        if (g.r <= g.l) g.r = g.l + 1
        if (g.b <= g.t) g.b = g.t + 1
        return g
    }

    setRotate(a) {
        a = ((((a + 180) % 360) + 360) % 360) - 180
        this.rotate = Math.round(a * 100) / 100
        this.inputs.rotate.value = this.rotate
        this.frame = this.snap(this.frame)
        this.redraw()
    }

    // The frame turns with the picture.
    quarterTurn(clockwise) {
        const before = this.cropState()
        const f = this.frame
        this.frame = clockwise ? { l: -f.b, r: -f.t, t: f.l, b: f.r } : { l: f.t, r: f.b, t: -f.r, b: -f.l }
        this.setRotate(this.rotate + (clockwise ? 90 : -90))
        this.pushCrop(before)
        this.fit()
    }

    fit() {
        const r = (this.rotate * Math.PI) / 180
        const c = Math.abs(Math.cos(r))
        const s = Math.abs(Math.sin(r))
        const iw = (c * this.W + s * this.H) / 2
        const ih = (s * this.W + c * this.H) / 2
        const f = this.frame
        const l = Math.min(-iw, f.l), t = Math.min(-ih, f.t), rr = Math.max(iw, f.r), b = Math.max(ih, f.b)
        const cw = this.canvas.clientWidth || window.innerWidth
        const ch = this.canvas.clientHeight || window.innerHeight
        this.scale = Math.min(cw / (rr - l), ch / (b - t)) * 0.9
        this.ox = cw / 2 - ((l + rr) / 2) * this.scale
        this.oy = ch / 2 - ((t + b) / 2) * this.scale
        this.redraw()
    }

    toScreen(x, y) {
        return [x * this.scale + this.ox, y * this.scale + this.oy]
    }

    // Screen point to picture pixels.
    toPicture(sx, sy) {
        const x = (sx - this.ox) / this.scale
        const y = (sy - this.oy) / this.scale
        const r = (this.rotate * Math.PI) / 180
        const c = Math.cos(r)
        const s = Math.sin(r)
        return [c * x + s * y + this.W / 2, -s * x + c * y + this.H / 2]
    }

    pos(e) {
        const rect = this.canvas.getBoundingClientRect()
        return [e.clientX - rect.left, e.clientY - rect.top]
    }

    angleAt(sx, sy) {
        return (Math.atan2(sy - this.oy, sx - this.ox) * 180) / Math.PI
    }

    hit(sx, sy) {
        const [l, t] = this.toScreen(this.frame.l, this.frame.t)
        const [r, b] = this.toScreen(this.frame.r, this.frame.b)
        const d = 8
        const inX = sx > l - d && sx < r + d
        const inY = sy > t - d && sy < b + d
        let edges = ""
        if (inY && Math.abs(sx - l) < d) edges += "l"
        else if (inY && Math.abs(sx - r) < d) edges += "r"
        if (inX && Math.abs(sy - t) < d) edges += "t"
        else if (inX && Math.abs(sy - b) < d) edges += "b"
        if (edges) return edges
        return sx > l && sx < r && sy > t && sy < b ? "move" : "rotate"
    }

    onDown(e) {
        // Keys must reach the editor first, not the graph canvas behind it.
        this.canvas.focus()
        const [sx, sy] = this.pos(e)
        let mode = null
        if (e.button === 1 || (e.button === 0 && (this.space || this.tool === "hand"))) mode = "pan"
        else if (e.button === 0 && this.tool === "crop") mode = this.hit(sx, sy)
        else if (e.button === 0 && (this.tool === "brush" || this.tool === "eraser")) mode = "stroke"
        if (!mode) return
        e.preventDefault()
        this.canvas.setPointerCapture(e.pointerId)
        this.drag = { mode, sx, sy, crop: this.cropState(), ox: this.ox, oy: this.oy, angle: this.angleAt(sx, sy) }
        if (mode === "stroke") this.startStroke(this.toPicture(sx, sy))
        this.updateCursor()
    }

    onMove(e) {
        const [sx, sy] = this.pos(e)
        this.mouse = [sx, sy]
        const d = this.drag
        if (!d) {
            this.updateCursor()
            this.redrawOverlay()
            return
        }
        const dx = (sx - d.sx) / this.scale
        const dy = (sy - d.sy) / this.scale
        if (d.mode === "stroke") {
            for (const ev of e.getCoalescedEvents?.() ?? [e]) this.strokeTo(this.toPicture(...this.pos(ev)))
            this.redraw()
            return
        }
        if (d.mode === "pan") {
            this.ox = d.ox + sx - d.sx
            this.oy = d.oy + sy - d.sy
        } else if (d.mode === "rotate") {
            let a = d.crop.rotate + this.angleAt(sx, sy) - d.angle
            if (e.shiftKey) a = Math.round(a / 15) * 15
            this.setRotate(a)
            return
        } else if (d.mode === "move") {
            const f = d.crop.frame
            this.frame = this.snap({ l: f.l + dx, r: f.r + dx, t: f.t + dy, b: f.b + dy })
        } else {
            this.frame = this.snap(this.resizeFrame(d.crop.frame, d.mode, dx, dy, e.shiftKey, e.altKey))
        }
        this.redraw()
    }

    // As in Photoshop: Shift keeps the frame's proportions, Alt resizes about its center.
    resizeFrame(f, edges, dx, dy, keepRatio, fromCenter) {
        const sx = edges.includes("l") ? -1 : edges.includes("r") ? 1 : 0
        const sy = edges.includes("t") ? -1 : edges.includes("b") ? 1 : 0
        const k = fromCenter ? 2 : 1
        let w = f.r - f.l + sx * dx * k
        let h = f.b - f.t + sy * dy * k
        if (keepRatio) {
            const ratio = (f.r - f.l) / (f.b - f.t)
            if (sx && sy) {
                if (w / ratio > h) h = w / ratio
                else w = h * ratio
            } else if (sx) h = w / ratio
            else w = h * ratio
        }
        w = Math.max(w, 1)
        h = Math.max(h, 1)
        // A side stays put opposite the dragged one, and a dimension that only follows the ratio stays centered.
        const place = (lo, hi, side, size) => (fromCenter || !side ? [(lo + hi - size) / 2, (lo + hi + size) / 2] : side < 0 ? [hi - size, hi] : [lo, lo + size])
        const [l, r] = place(f.l, f.r, sx, w)
        const [t, b] = place(f.t, f.b, sy, h)
        return { l, t, r, b }
    }

    onUp(e) {
        const d = this.drag
        if (!d) return
        this.drag = null
        if (d.mode === "stroke") this.endStroke()
        else if (d.mode !== "pan") this.pushCrop(d.crop)
        this.onMove(e)
    }

    // Strokes are drawn opaque on a scratch canvas, then merged into the layer with the brush
    // opacity, so overlapping dabs of one stroke don't build up past it.
    startStroke(p) {
        const erase = this.tool === "eraser"
        this.stroke = {
            layer: this.target,
            erase,
            color: this.target === "paint" && !erase ? this.brush.color : "#ffffff",
            opacity: this.brush.opacity,
            radius: this.brush.size / 2,
            hardness: this.brush.hardness,
            last: p,
            box: [p[0], p[1], p[0], p[1]],
        }
        this.strokeCtx.clearRect(0, 0, this.W, this.H)
        this.dab(p)
    }

    strokeTo(p) {
        const s = this.stroke
        const [x0, y0] = s.last
        const dist = Math.hypot(p[0] - x0, p[1] - y0)
        const step = Math.max(1, s.radius * 0.15)
        if (dist < step) return
        const n = Math.floor(dist / step)
        for (let i = 1; i <= n; i++) this.dab([x0 + ((p[0] - x0) * i * step) / dist, y0 + ((p[1] - y0) * i * step) / dist])
        s.last = [x0 + ((p[0] - x0) * n * step) / dist, y0 + ((p[1] - y0) * n * step) / dist]
    }

    dab([x, y]) {
        const s = this.stroke
        const ctx = this.strokeCtx
        const inner = s.radius * Math.min(s.hardness, 0.99)
        const g = ctx.createRadialGradient(x, y, inner, x, y, s.radius)
        g.addColorStop(0, s.color)
        g.addColorStop(1, s.color + "00")
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, s.radius, 0, Math.PI * 2)
        ctx.fill()
        s.box = [Math.min(s.box[0], x), Math.min(s.box[1], y), Math.max(s.box[2], x), Math.max(s.box[3], y)]
    }

    composeStroke(ctx) {
        const s = this.stroke
        ctx.save()
        ctx.globalAlpha = s.opacity
        ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over"
        ctx.drawImage(this.strokeCanvas, 0, 0)
        ctx.restore()
    }

    endStroke() {
        const s = this.stroke
        const layer = this.layers[s.layer]
        const r = s.radius + 1
        const done = this.recordLayer(s.layer, s.box[0] - r, s.box[1] - r, s.box[2] - s.box[0] + 2 * r, s.box[3] - s.box[1] + 2 * r)
        this.composeStroke(layer.ctx)
        done(layer.used || !s.erase)
        this.stroke = null
        this.redraw()
    }

    onWheel(e) {
        e.preventDefault()
        const delta = (e.deltaY || e.deltaX) * (e.deltaMode === 1 ? 33 : 1)
        const notches = -delta / 100
        if (e.altKey) {
            this.setBrush("size", this.brush.size * Math.pow(1.1, notches))
            this.showHud(`${this.brush.size} px`)
        } else if (e.shiftKey) {
            this.setBrush("opacity", this.brush.opacity + 0.05 * notches)
            this.showHud(`Opacity ${Math.round(this.brush.opacity * 100)}%`)
        } else if (e.ctrlKey) {
            this.setBrush("hardness", this.brush.hardness + 0.05 * notches)
            this.showHud(`Hardness ${Math.round(this.brush.hardness * 100)}%`)
        } else {
            const [sx, sy] = this.pos(e)
            const scale = Math.min(Math.max(this.scale * Math.exp(-delta * 0.0015), 0.01), 64)
            this.ox = sx - ((sx - this.ox) * scale) / this.scale
            this.oy = sy - ((sy - this.oy) * scale) / this.scale
            this.scale = scale
            this.redraw()
        }
    }

    // Keys go nowhere else while the editor is open, so ComfyUI shortcuts don't act on the graph.
    // Letters are read as typed, so shortcuts follow the keyboard layout.
    onKey(e, down) {
        e.stopPropagation()
        if (e.target instanceof HTMLInputElement) {
            if (down && e.key === "Enter") e.target.blur()
            return
        }
        // Releasing Alt alone would focus the browser menu.
        if (e.key === "Alt") e.preventDefault()
        if (e.key === " ") {
            e.preventDefault()
            this.space = down
            this.updateCursor()
        }
        if (!down) return
        const key = e.key.toLowerCase()
        if (e.key === "Escape") this.close()
        else if (e.key === "Enter") this.apply()
        else if (e.ctrlKey && key === "0") {
            e.preventDefault()
            this.fit()
        } else if (e.ctrlKey && (key === "y" || (key === "z" && e.shiftKey))) {
            e.preventDefault()
            this.redo()
        } else if (e.ctrlKey && key === "z") {
            e.preventDefault()
            this.undo()
        } else if (!e.ctrlKey && !e.altKey && !e.metaKey) {
            const tool = { c: "crop", b: "brush", e: "eraser", h: "hand" }[key]
            if (tool) this.setTool(tool)
            else if (key === "m") this.setTarget(this.target === "mask" ? "paint" : "mask")
            else if (key === "q" && e.shiftKey) {
                this.setShowMask(!this.showMask)
                this.showHud(this.showMask ? "Mask shown" : "Mask hidden")
            } else if (key === "q") {
                this.setMaskView(MASK_VIEWS[(MASK_VIEWS.indexOf(this.maskView) + 1) % MASK_VIEWS.length])
                this.showHud(`Mask preview: ${this.maskView}`)
            }
        }
    }

    redraw() {
        this.mainDirty = true
        this.redrawOverlay()
    }

    redrawOverlay() {
        if (this.frameRequest) return
        this.frameRequest = requestAnimationFrame(() => {
            this.frameRequest = null
            this.draw()
        })
    }

    draw() {
        if (this.mainDirty !== false) this.drawMain()
        this.mainDirty = false
        this.drawOverlay()
    }

    drawMain() {
        const ctx = this.mainCtx
        const dpr = window.devicePixelRatio
        const f = this.frame
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.fillStyle = "#151515"
        ctx.fillRect(0, 0, this.main.clientWidth, this.main.clientHeight)

        ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, dpr * this.ox, dpr * this.oy)
        ctx.fillStyle = this.fill
        ctx.fillRect(f.l, f.t, f.r - f.l, f.b - f.t)
        ctx.imageSmoothingEnabled = this.scale < 1
        ctx.rotate((this.rotate * Math.PI) / 180)
        ctx.translate(-this.W / 2, -this.H / 2)
        ctx.drawImage(this.img, 0, 0)
        for (const name of LAYERS) {
            if (name === "mask" && !this.showMask) continue
            let canvas = this.layers[name].canvas
            if (this.stroke?.layer === name) {
                this.previewCtx.clearRect(0, 0, this.W, this.H)
                this.previewCtx.drawImage(canvas, 0, 0)
                this.composeStroke(this.previewCtx)
                canvas = this.previewCanvas
            }
            if (name === "mask") this.drawMask(ctx, canvas)
            else ctx.drawImage(canvas, 0, 0)
        }
    }

    // Each mask pixel shows as a color with its own value times the preview opacity. Negative
    // inverts the picture by the mask value alone: half an inversion is plain gray whatever the
    // color, so a preview opacity would only gray the picture out.
    drawMask(ctx, mask) {
        const tint = this.tintCtx
        tint.globalCompositeOperation = "copy"
        tint.drawImage(mask, 0, 0)
        tint.globalCompositeOperation = "source-in"
        tint.fillStyle = { Color: this.maskColor, White: "#ffffff", Black: "#000000", Negative: "#ffffff" }[this.maskView]
        tint.fillRect(0, 0, this.W, this.H)
        ctx.save()
        if (this.maskView === "Negative") ctx.globalCompositeOperation = "difference"
        else ctx.globalAlpha = this.maskOpacity
        ctx.drawImage(this.tintCanvas, 0, 0)
        ctx.restore()
    }

    drawOverlay() {
        const ctx = this.ctx
        const dpr = window.devicePixelRatio
        const cw = this.canvas.clientWidth
        const ch = this.canvas.clientHeight
        const f = this.frame
        const crop = this.tool === "crop"
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, cw, ch)

        // Outside the frame is what the node won't output: dimmed while cropping, almost hidden otherwise.
        const [l, t] = this.toScreen(f.l, f.t)
        const [r, b] = this.toScreen(f.r, f.b)
        ctx.fillStyle = crop ? "rgba(21, 21, 21, 0.6)" : "rgba(21, 21, 21, 0.9)"
        ctx.beginPath()
        ctx.rect(0, 0, cw, ch)
        ctx.rect(l, t, r - l, b - t)
        ctx.fill("evenodd")
        this.sizeLabel.textContent = `${f.r - f.l} × ${f.b - f.t}`

        if (crop) {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.25)"
            ctx.beginPath()
            for (const k of [1, 2]) {
                ctx.moveTo(l + ((r - l) * k) / 3, t)
                ctx.lineTo(l + ((r - l) * k) / 3, b)
                ctx.moveTo(l, t + ((b - t) * k) / 3)
                ctx.lineTo(r, t + ((b - t) * k) / 3)
            }
            ctx.stroke()
            ctx.strokeStyle = "#fff"
            ctx.strokeRect(l, t, r - l, b - t)
            ctx.fillStyle = "#fff"
            for (const [x, y] of [[l, t], [(l + r) / 2, t], [r, t], [r, (t + b) / 2], [r, b], [(l + r) / 2, b], [l, b], [l, (t + b) / 2]]) {
                ctx.fillRect(x - 4, y - 4, 8, 8)
            }
        }

        // The brush outline shows its size, and the inner circle where the soft edge starts.
        if (this.mouse && (this.tool === "brush" || this.tool === "eraser") && !this.space && this.drag?.mode !== "pan") {
            const [x, y] = this.mouse
            const radius = (this.brush.size / 2) * this.scale
            for (const [rr, dash] of [[radius, []], [radius * this.brush.hardness, [3, 3]]]) {
                if (rr < 1) continue
                ctx.setLineDash(dash)
                for (const [color, width] of [["rgba(0, 0, 0, 0.8)", 3], ["#fff", 1]]) {
                    ctx.strokeStyle = color
                    ctx.lineWidth = width
                    ctx.beginPath()
                    ctx.arc(x, y, rr, 0, Math.PI * 2)
                    ctx.stroke()
                }
            }
            ctx.setLineDash([])
            ctx.lineWidth = 1
        }

        if (this.hud && this.mouse) {
            const [x, y] = this.mouse
            ctx.font = "13px sans-serif"
            const w = ctx.measureText(this.hud).width + 12
            ctx.fillStyle = "rgba(0, 0, 0, 0.75)"
            ctx.beginPath()
            ctx.roundRect(x + 16, y + 16, w, 22, 4)
            ctx.fill()
            ctx.fillStyle = "#fff"
            ctx.textBaseline = "middle"
            ctx.fillText(this.hud, x + 22, y + 27)
        }
    }
}

let opening = false

async function editPicture(image, value, onApply) {
    if (!image || opening || document.querySelector(".davcha-editor")) return
    opening = true
    try {
        const edit = value ? JSON.parse(value) : null
        const layers = {}
        for (const name of LAYERS) {
            if (edit?.[name]) layers[name] = await loadImage(edit[name])
        }
        new Editor(await loadImage(image), edit, layers, onApply)
    } finally {
        opening = false
    }
}

function openEditor(node) {
    const image = node.widgets.find((w) => w.name === "image").value
    const edit = node.widgets.find((w) => w.name === "edit").value
    editPicture(image, edit, (value) => node.setEdit(value))
}

async function uploadImage(file) {
    const body = new FormData()
    body.append("image", file)
    body.append("type", "input")
    const res = await api.fetchApi("/upload/image", { method: "POST", body })
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
    const { name, subfolder } = await res.json()
    return subfolder ? `${subfolder}/${name}` : name
}

async function thumbnailUrl({ image, edit }) {
    if (!edit) return viewUrl(image)
    const { filename, subfolder } = await fetchPreview(image, edit)
    return viewUrl(`${subfolder}/${filename} [temp]`)
}

// Load Images (Editor): the hidden "images" widget holds [{image, edit}], shown as a gallery.
// Click a picture to edit it, drag it to reorder, drop or add files to append them.
function setupGallery(node) {
    const widget = node.widgets.find((w) => w.name === "images")
    widget.hidden = true
    const gallery = document.createElement("div")
    gallery.className = "davcha-gallery"
    const fileInput = Object.assign(document.createElement("input"), { type: "file", accept: "image/*", multiple: true })
    const entries = () => JSON.parse(widget.value || "[]")
    let dragged = null

    const save = (list) => {
        widget.value = JSON.stringify(list)
        render()
        node.setDirtyCanvas(true, true)
    }

    const addFiles = async (files) => {
        const list = entries()
        for (const file of files) {
            if (file.type.startsWith("image/")) list.push({ image: await uploadImage(file), edit: "" })
        }
        save(list)
    }

    const render = () => {
        gallery.replaceChildren()
        entries().forEach((entry, i) => {
            const tile = document.createElement("div")
            tile.className = "dg-tile"
            tile.draggable = true
            tile.title = entry.image
            tile.innerHTML = `<img><span class="dg-badge">${i + 1}${entry.edit ? " ✎" : ""}</span><span class="dg-remove" title="Remove">×</span>`
            thumbnailUrl(entry).then((url) => (tile.querySelector("img").src = url))
            tile.addEventListener("click", () =>
                editPicture(entry.image, entry.edit, (edit) => {
                    const list = entries()
                    list[i].edit = edit
                    save(list)
                }),
            )
            tile.querySelector(".dg-remove").addEventListener("click", (e) => {
                e.stopPropagation()
                const list = entries()
                list.splice(i, 1)
                save(list)
            })
            tile.addEventListener("dragstart", (e) => {
                dragged = i
                e.dataTransfer.effectAllowed = "move"
            })
            tile.addEventListener("dragend", () => (dragged = null))
            tile.addEventListener("dragover", (e) => {
                if (dragged === null) return
                e.preventDefault()
                tile.classList.add("dg-over")
            })
            tile.addEventListener("dragleave", () => tile.classList.remove("dg-over"))
            tile.addEventListener("drop", (e) => {
                if (dragged === null) return
                e.preventDefault()
                e.stopPropagation()
                const list = entries()
                list.splice(i, 0, ...list.splice(dragged, 1))
                dragged = null
                save(list)
            })
            gallery.append(tile)
        })
        const add = document.createElement("div")
        add.className = "dg-tile dg-add"
        add.title = "Add pictures"
        add.textContent = "+"
        add.addEventListener("click", () => fileInput.click())
        gallery.append(add)
    }

    fileInput.addEventListener("change", () => {
        addFiles([...fileInput.files])
        fileInput.value = ""
    })
    gallery.addEventListener("dragover", (e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault()
    })
    gallery.addEventListener("drop", (e) => {
        if (!e.dataTransfer.files.length) return
        e.preventDefault()
        e.stopPropagation()
        addFiles([...e.dataTransfer.files])
    })
    node.addDOMWidget("gallery", "custom", gallery, { serialize: false, getMinHeight: () => 100 })
    node.onDragOver = (e) => !!e.dataTransfer?.types?.includes("Files")
    node.onDragDrop = (e) => {
        addFiles([...e.dataTransfer.files])
        return true
    }
    node.renderGallery = render
    render()
}

app.registerExtension({
    name: "comfyui_davcha_editor",
    settings: [
        { id: SETTINGS.view, name: "Mask preview", type: "combo", options: MASK_VIEWS, defaultValue: "Color" },
        { id: SETTINGS.color, name: "Mask preview color", type: "color", defaultValue: "ff2060" },
        { id: SETTINGS.opacity, name: "Mask preview opacity (%)", type: "number", defaultValue: 50, attrs: { min: 0, max: 100 } },
    ],
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === "DavchaLoadImagesEditor") {
            const onNodeCreated = nodeType.prototype.onNodeCreated
            nodeType.prototype.onNodeCreated = function () {
                const result = onNodeCreated?.apply(this, arguments)
                setupGallery(this)
                if (this.size[1] < 220) this.setSize([Math.max(this.size[0], 300), 220])
                return result
            }
            const onConfigure = nodeType.prototype.onConfigure
            nodeType.prototype.onConfigure = function () {
                const result = onConfigure?.apply(this, arguments)
                this.renderGallery()
                return result
            }
            return
        }
        if (nodeData.name !== "DavchaLoadImageEditor") return

        const onNodeCreated = nodeType.prototype.onNodeCreated
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments)
            const node = this
            const edit = this.widgets.find((w) => w.name === "edit")
            const image = this.widgets.find((w) => w.name === "image")
            edit.hidden = true
            const button = this.addWidget("button", "Edit", null, () => openEditor(this))
            // The frontend's callback shows the picked file as the preview.
            const showFile = image.callback
            this.setEdit = (value) => {
                edit.value = value
                button.label = editLabel(value)
                if (value) updatePreview(node)
                else showFile.call(image, image.value)
                node.setDirtyCanvas(true, true)
            }
            // A new picture starts unedited.
            image.callback = function () {
                edit.value = ""
                button.label = editLabel("")
                return showFile.apply(this, arguments)
            }
            return result
        }

        // The frontend shows the file as the preview one frame after the node is created,
        // so the edited preview comes after that.
        const onConfigure = nodeType.prototype.onConfigure
        nodeType.prototype.onConfigure = function () {
            const result = onConfigure?.apply(this, arguments)
            const edit = this.widgets.find((w) => w.name === "edit").value
            this.widgets.find((w) => w.name === "Edit").label = editLabel(edit)
            if (edit) requestAnimationFrame(() => updatePreview(this))
            return result
        }
    },
    getNodeMenuItems(node) {
        if (node.comfyClass !== "DavchaLoadImageEditor") return []
        return [{ content: "Open in editor", callback: () => openEditor(node) }]
    },
})

