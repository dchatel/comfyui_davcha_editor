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

// Number fields that also change by dragging on their label, like Photoshop's scrubby sliders,
// with a gauge behind the value. `span` is the drag in pixels across the whole range, ten times
// longer with Shift.
const FIELDS = {
    rotate: { min: -180, max: 180, span: 720, decimals: 2 },
    size: { min: 1, max: 2000, span: 300, log: true },
    opacity: { min: 1, max: 100, span: 200 },
    hardness: { min: 0, max: 100, span: 200 },
    maskOpacity: { min: 0, max: 100, span: 200 },
}

function fieldPosition(f, value) {
    const t = f.log ? Math.log(value / f.min) / Math.log(f.max / f.min) : (value - f.min) / (f.max - f.min)
    return Math.min(Math.max(t, 0), 1)
}

function fieldValue(f, t) {
    const value = f.log ? f.min * Math.pow(f.max / f.min, t) : f.min + t * (f.max - f.min)
    return Number(value.toFixed(f.decimals ?? 0))
}

// Calls apply(value, done) while the label is dragged, with done set on release.
function scrub(input, f, apply) {
    const label = input.closest("label")
    label.classList.add("de-scrub")
    // Clicking a label would focus its field, and the editor shortcuts would type into it.
    label.addEventListener("click", (e) => {
        if (e.target !== input) e.preventDefault()
    })
    label.addEventListener("pointerdown", (e) => {
        if (e.target === input || e.button !== 0 || input.disabled) return
        e.preventDefault()
        label.setPointerCapture(e.pointerId)
        let x = e.clientX
        let t = fieldPosition(f, Number(input.value))
        let value = Number(input.value)
        const move = (ev) => {
            t = Math.min(Math.max(t + (ev.clientX - x) / (f.span * (ev.shiftKey ? 10 : 1)), 0), 1)
            x = ev.clientX
            value = fieldValue(f, t)
            apply(value, false)
        }
        const up = () => {
            label.removeEventListener("pointermove", move)
            label.removeEventListener("pointerup", up)
            apply(value, true)
        }
        label.addEventListener("pointermove", move)
        label.addEventListener("pointerup", up)
    })
}
const LAYERS = ["paint", "mask"]

const HELP = {
    crop: "Frame edges: crop or pad (Shift: keep ratio, Alt: from center) · Inside: move · Outside: rotate (Shift: 15° steps)",
    brush: "Alt+wheel: size · Shift+wheel: opacity · Ctrl+wheel: hardness · M: mask/paint · Q: mask preview · Shift+Q: show/hide mask · Ctrl+I: invert mask",
    eraser: "Alt+wheel: size · Shift+wheel: opacity · Ctrl+wheel: hardness · M: mask/paint · Q: mask preview · Shift+Q: show/hide mask · Ctrl+I: invert mask",
    pose: "Click a point, a limb for the whole person · Ctrl+click: add or remove · Ctrl+drag: select in a box (Shift: add) · Ctrl+A: all · R: move/rotate (Shift: 15° steps) · Del: delete person",
    hand: "Drag: pan",
}

const ICONS = Object.fromEntries(Object.entries({
    crop: '<path d="M6 2v16h16M2 6h16v16"/>',
    brush: '<path d="M21 3 11.5 12.5"/><path d="M11.5 12.5c-2.5-1.5-5.5 0-5.5 3 0 1.5-1 3-3 4.5 4.5 1 9.5-.5 8.5-7.5z"/>',
    eraser: '<path d="M3 15 13 5l6 6-10 10H8z"/><path d="m8 10 6 6M10 21h11"/>',
    pose: '<circle cx="12" cy="4" r="2"/><path d="M5 10l7-2 7 2M12 8v6l-4 7M12 14l4 7"/>',
    hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V12M17 12V8.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-2.7l-3-4.8a1.5 1.5 0 0 1 2.5-1.7L8 13"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-4"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h4"/>',
    mask: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="5" fill="currentColor"/>',
    paint: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
}).map(([name, paths]) => [name, `<svg viewBox="0 0 24 24">${paths}</svg>`]))

const STYLE = `
.davcha-editor { position: fixed; inset: 0; z-index: 9998; display: flex; flex-direction: column; background: #151515; color: #ddd; font: 13px sans-serif; }
.davcha-editor .de-bar { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #222; border-bottom: 1px solid #333; white-space: nowrap; }
.davcha-editor .de-grow { flex: 1; }
.davcha-editor .de-sep { width: 1px; align-self: stretch; background: #3a3a3a; }
.davcha-editor .de-body { display: flex; flex: 1; min-height: 0; }
.davcha-editor .de-panel { width: 290px; display: flex; flex-direction: column; gap: 8px; padding: 8px; overflow-y: auto; background: #1a1a1a; border-left: 1px solid #333; }
.davcha-editor .de-section { display: flex; flex-direction: column; gap: 6px; padding: 8px; background: #222; border: 1px solid #333; border-radius: 6px; }
.davcha-editor .de-panel-title { font-weight: bold; color: #aaa; }
.davcha-editor .de-tools { flex-direction: row; gap: 4px; }
.davcha-editor .de-tools button { flex: 1; padding: 6px 0; }
.davcha-editor .de-tools svg { width: 20px; height: 20px; }
.davcha-editor button.de-icon { display: inline-flex; align-items: center; justify-content: center; padding: 3px 6px; }
.davcha-editor button svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
.davcha-editor .de-options { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.davcha-editor .de-options label, .davcha-editor .de-fields label { flex-basis: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.davcha-editor .de-fields { display: flex; flex-direction: column; gap: 6px; }
.davcha-editor .de-fields select, .davcha-editor .de-fields input[type=text] { width: 150px; }
.davcha-editor .de-section[hidden] { display: none; }
.davcha-editor .dp-save-row { display: flex; gap: 6px; }
.davcha-editor .dp-name { flex: 1; min-width: 0; }
.davcha-editor button.de-stale { border-color: #d08a2a; color: #f0b060; }
.davcha-editor .de-size { color: #888; }
.davcha-editor input[type=number] { width: 56px; background: linear-gradient(to right, #2c4466 var(--fill, 0%), #111 var(--fill, 0%)); color: #ddd; border: 1px solid #444; border-radius: 4px; padding: 2px 4px; }
.davcha-editor label.de-scrub { cursor: ew-resize; user-select: none; }
.davcha-editor select, .davcha-editor input[type=text] { background: #111; color: #ddd; border: 1px solid #444; border-radius: 4px; padding: 2px 4px; }
.davcha-editor input[type=color] { width: 32px; height: 22px; padding: 0; border: 1px solid #444; background: none; }
.davcha-editor button { background: #333; color: #ddd; border: 1px solid #444; border-radius: 4px; padding: 3px 10px; cursor: pointer; }
.davcha-editor button:hover { background: #3c3c3c; }
.davcha-editor button.de-active { background: #4a4a4a; border-color: #888; }
.davcha-editor button.de-primary { background: #2b5fa8; border-color: #3a70bd; }
.davcha-editor button:disabled, .davcha-editor input:disabled { opacity: 0.5; cursor: default; }
.davcha-editor .de-stage { position: relative; flex: 1; min-height: 0; }
.davcha-editor .de-stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; outline: none; }
.davcha-editor .de-help { padding: 4px 10px; color: #888; font-size: 12px; background: #1b1b1b; border-top: 1px solid #333; }
.davcha-editor .dl-status { color: #8ab4f8; font-size: 12px; }
.davcha-editor .dl-status:empty { display: none; }
.davcha-editor .dl-row { display: flex; align-items: center; gap: 4px; padding: 2px 4px; border-radius: 4px; }
.davcha-editor .dl-row.dl-active { background: #2c4466; }
.davcha-editor .dl-name { flex: 1; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
.davcha-editor .dl-eye-space { width: 13px; }
.davcha-editor .dl-row input[type=number] { width: 50px; }
.davcha-editor .dl-row button { padding: 0 6px; }
.davcha-gallery { display: flex; flex-wrap: wrap; align-content: flex-start; gap: 6px; padding: 4px; overflow-y: auto; box-sizing: border-box; }
.davcha-gallery .dg-tile { position: relative; width: 84px; height: 84px; box-sizing: border-box; border: 1px solid #444; border-radius: 4px; overflow: hidden; background: #1b1b1b; cursor: pointer; touch-action: none; }
.davcha-gallery .dg-tile img { width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
.davcha-gallery .dg-tile.dg-over { outline: 2px solid #3a70bd; }
.davcha-gallery .dg-tile.dg-dragging { opacity: 0.4; }
.davcha-gallery .dg-badge { position: absolute; left: 2px; bottom: 2px; padding: 0 4px; border-radius: 3px; background: rgba(0, 0, 0, 0.7); color: #fff; font: 10px sans-serif; }
.davcha-gallery .dg-remove { display: none; position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; border-radius: 9px; background: rgba(0, 0, 0, 0.7); color: #fff; font: 13px/18px sans-serif; text-align: center; }
.davcha-gallery .dg-tile:hover .dg-remove { display: block; }
.davcha-gallery .dg-add { display: flex; align-items: center; justify-content: center; border-style: dashed; color: #888; font-size: 28px; }
`
document.head.append(Object.assign(document.createElement("style"), { textContent: STYLE }))
// The open editor takes every key, and stops it there for the page's other listeners. ComfyUI's
// change tracker listens ahead of it; the editor turns that one off while open (see build).
let activeEditor = null
window.addEventListener("keydown", (e) => activeEditor?.onKey(e, true), true)
window.addEventListener("keyup", (e) => activeEditor?.onKey(e, false), true)

// ComfyUI pastes a picture into the selected node only when it is also the canvas' current node,
// which a pinned node doesn't become when clicked: it adds a new Load Image instead (frontend
// issue #9899). This sends the picture to the one selected node that takes files, as ComfyUI
// does otherwise. Nothing pastes while the editor is open, as the graph is behind it.
document.addEventListener("paste", (e) => {
    if (e.target.closest?.("input, textarea, [contenteditable]")) return
    if (activeEditor) return e.preventDefault()
    const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"))
    const selected = [...(app.canvas?.selectedItems ?? [])]
    if (!files.length || selected.length !== 1 || typeof selected[0].pasteFiles !== "function") return
    e.preventDefault()
    selected[0].pasteFiles(files)
}, true)

// Strokes use it to turn their gray coverage map into alpha. sRGB keeps the gray values as they are.
document.body.insertAdjacentHTML("beforeend", '<svg width="0" height="0" style="position: absolute"><filter id="davcha-luminance-to-alpha" color-interpolation-filters="sRGB"><feColorMatrix type="luminanceToAlpha"/></filter></svg>')

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

// A recipe runs one node on the picture: {name, node, inputs}, with the picture as its "image"
// input and the node's defaults for the inputs it leaves out. user/default/davcha_editor/recipes.json
// can add recipes or replace these by name.
// A workflow recipe is a workflow saved in workflows/editor, with the picture in a Load Image
// titled editor:in and the layer from a Preview Image titled editor:out. Once added, the layer keeps
// its prompt, {name, prompt, inputs}, whose inputs are the widgets of the nodes titled editor:<name>.
const RECIPES_FILE = `/userdata/${encodeURIComponent("davcha_editor/recipes.json")}`
const WORKFLOWS_DIR = "workflows/editor"
const DEFAULT_RECIPES = [
    { name: "Edges (Canny)", node: "Canny", inputs: { low_threshold: 0.4, high_threshold: 0.8 } },
    { name: "Depth (Depth Anything V2)", node: "DepthAnythingV2Preprocessor", inputs: { resolution: 1024 } },
    { name: "Lineart (realistic)", node: "LineArtPreprocessor", inputs: { resolution: 1024 } },
    { name: "Lineart (anime)", node: "AnimeLineArtPreprocessor", inputs: { resolution: 1024 } },
    { name: "Lineart (standard)", node: "LineartStandardPreprocessor", inputs: { resolution: 1024 } },
    { name: "Soft edges (HED)", node: "HEDPreprocessor", inputs: { resolution: 1024 } },
    { name: "Scribble", node: "ScribblePreprocessor", inputs: { resolution: 1024 } },
    { name: "Pose (DWPose)", node: "DWPreprocessor", inputs: { resolution: 1024 } },
    // `pose` is the node output holding the OpenPose keypoints: the layer keeps them, editable.
    {
        name: "Pose (DWPose, editable)", node: "DWPreprocessor", pose: 1,
        inputs: { detect_hand: "enable", detect_body: "enable", detect_face: "enable", resolution: 1024, bbox_detector: "yolox_l.onnx", pose_estimator: "dw-ll_ucoco_384_bs5.torchscript.pt", scale_stick_for_xinsr_cn: "disable" },
    },
    { name: "Normal map (BAE)", node: "BAE-NormalMapPreprocessor", inputs: { resolution: 1024 } },
]

// Returns [label, recipes] groups: the recipes above, then every preprocessor AIO_Preprocessor
// offers, read from the node itself so the list follows the installed controlnet_aux. Its options
// are the names of the preprocessor nodes, which recipes run directly to reach all their inputs.
async function loadRecipes() {
    const recipes = new Map(DEFAULT_RECIPES.map((r) => [r.name, r]))
    const res = await api.fetchApi(RECIPES_FILE)
    if (res.ok) for (const r of await res.json()) recipes.set(r.name, r)
    const groups = [["Recipes", [...recipes.values()]]]
    if (LiteGraph.registered_node_types.AIO_Preprocessor) {
        const preprocessor = (await nodeInputs("AIO_Preprocessor")).find(([name]) => name === "preprocessor")
        const options = preprocessor[2].options.filter((p) => p !== "none")
        groups.push(["All AIO preprocessors", options.map((p) => ({ name: LiteGraph.registered_node_types[p]?.title ?? p, node: p, inputs: { resolution: 1024 } }))])
    }
    const workflows = await api.fetchApi(`/userdata?dir=${encodeURIComponent(WORKFLOWS_DIR)}&recurse=true`)
    if (workflows.ok) {
        const files = (await workflows.json()).filter((f) => f.endsWith(".json")).sort()
        if (files.length) groups.push(["Workflows", files.map((f) => ({ name: f.slice(0, -5), workflow: f }))])
    }
    return groups
}

// A workflow file as a prompt, converted the way the Run button does. Files exported in the API
// format are prompts already.
async function workflowPrompt(file) {
    const res = await api.fetchApi(`/userdata/${encodeURIComponent(`${WORKFLOWS_DIR}/${file}`)}`)
    if (!res.ok) throw new Error(`Cannot read ${WORKFLOWS_DIR}/${file}: ${res.status}`)
    const workflow = await res.json()
    let prompt = workflow
    if (workflow.nodes) {
        const graph = new LiteGraph.LGraph()
        graph.configure(workflow)
        prompt = (await app.graphToPrompt(graph)).output
    }
    if (!editorNode(prompt, "editor:in") || !editorNode(prompt, "editor:out")) throw new Error(`${file} needs a Load Image titled editor:in and a Preview Image titled editor:out`)
    return prompt
}

function editorNode(prompt, title) {
    return Object.keys(prompt).find((id) => prompt[id]._meta?.title === title)
}

// Workflow recipe inputs are keyed "<node id>:<input>". Node ids inside subgraphs have colons too.
function splitKey(key) {
    const i = key.lastIndexOf(":")
    return [key.slice(0, i), key.slice(i + 1)]
}

// The recipe's editable inputs as [key, label, type, options].
async function recipeFields(recipe) {
    if (!recipe.prompt) return (await nodeInputs(recipe.node)).map(([name, type, options]) => [name, name, type, options])
    const fields = []
    for (const [id, node] of Object.entries(recipe.prompt)) {
        const title = node._meta?.title ?? ""
        if (!title.startsWith("editor:") || title === "editor:in" || title === "editor:out") continue
        for (const [name, type, options] of await nodeInputs(node.class_type)) {
            if (name in node.inputs && !Array.isArray(node.inputs[name])) fields.push([`${id}:${name}`, `${title.slice(7)} · ${name}`, type, options])
        }
    }
    return fields
}

const nodeSpecs = new Map()

// A node's widget inputs as [name, type, options], read once from /object_info. Combos have their
// choices in options.options, as in the newer format.
function nodeInputs(node) {
    if (!nodeSpecs.has(node)) {
        nodeSpecs.set(node, api.fetchApi(`/object_info/${encodeURIComponent(node)}`).then(async (res) => {
            const { required = {}, optional = {} } = (await res.json())[node].input
            return Object.entries({ ...required, ...optional }).flatMap(([name, [type, options = {}]]) => {
                if (Array.isArray(type)) return [[name, "COMBO", { ...options, options: type }]]
                return ["INT", "FLOAT", "BOOLEAN", "STRING", "COMBO"].includes(type) && !options.forceInput ? [[name, type, options]] : []
            })
        }))
    }
    return nodeSpecs.get(node)
}

function defaultInput(type, options) {
    if (options.default !== undefined) return options.default
    return { COMBO: options.options?.[0], BOOLEAN: false, STRING: "" }[type] ?? options.min ?? 0
}

// The recipe with all its inputs, so a layer keeps all the values it ran with. A workflow recipe
// gets its prompt, and the values its editor:<name> nodes were saved with.
async function fullRecipe(recipe) {
    if (recipe.workflow) recipe = { name: recipe.name, prompt: await workflowPrompt(recipe.workflow) }
    const value = (key, type, options) => {
        if (!recipe.prompt) return defaultInput(type, options)
        const [id, name] = splitKey(key)
        return recipe.prompt[id].inputs[name]
    }
    const inputs = Object.fromEntries((await recipeFields(recipe)).map(([key, , type, options]) => [key, value(key, type, options)]))
    return { ...recipe, inputs: { ...inputs, ...recipe.inputs } }
}

// Queues a three-node prompt (load the picture, run the recipe, preview the result) like the Run
// button does, so the run shares ComfyUI's queue, cache and memory management. The prompt's node
// ids match nothing on the graph, and the run is removed from the history once its result is read.
// Returns the result picture, or for a pose recipe the OpenPose dict PreviewAny shows as JSON.
async function runRecipe(image, recipe) {
    const finished = new Map()
    let promptId = null
    let settle = null
    const onEvent = ({ type, detail }) => {
        finished.set(detail?.prompt_id, type === "execution_success" ? null : detail?.exception_message ?? "The run was interrupted")
        if (detail?.prompt_id === promptId) settle?.()
    }
    const events = ["execution_success", "execution_error", "execution_interrupted"]
    for (const type of events) api.addEventListener(type, onEvent)
    try {
        let prompt
        let out = "dpp_out"
        if (recipe.prompt) {
            prompt = structuredClone(recipe.prompt)
            for (const [key, value] of Object.entries(recipe.inputs)) {
                const [id, name] = splitKey(key)
                prompt[id].inputs[name] = value
            }
            prompt[editorNode(prompt, "editor:in")].inputs.image = image
            out = editorNode(prompt, "editor:out")
        } else {
            prompt = {
                dpp_load: { class_type: "LoadImage", inputs: { image } },
                dpp_run: { class_type: recipe.node, inputs: { ...recipe.inputs, image: ["dpp_load", 0] } },
                dpp_out: recipe.pose === undefined
                    ? { class_type: "PreviewImage", inputs: { images: ["dpp_run", 0] } }
                    : { class_type: "PreviewAny", inputs: { source: ["dpp_run", recipe.pose] } },
            }
        }
        // Only what the result needs runs: a workflow's other outputs, such as Save Image, don't.
        const body = { prompt, client_id: api.clientId, front: true, partial_execution_targets: [out] }
        const res = await api.fetchApi("/prompt", { method: "POST", body: JSON.stringify(body) })
        const queued = await res.json()
        if (!res.ok) {
            const details = Object.values(queued.node_errors ?? {}).flatMap((n) => n.errors.map((e) => e.details || e.message))
            throw new Error([queued.error?.message ?? `Queue failed: ${res.status}`, ...details].join(": "))
        }
        promptId = queued.prompt_id
        if (!finished.has(promptId)) await new Promise((resolve) => (settle = resolve))
        if (finished.get(promptId)) throw new Error(finished.get(promptId))
        const history = await (await api.fetchApi(`/history/${promptId}`)).json()
        const output = history[promptId].outputs[out]
        await api.fetchApi("/history", { method: "POST", body: JSON.stringify({ delete: [promptId] }) })
        if (recipe.pose !== undefined) return JSON.parse(output.text[0])[0]
        const { filename, subfolder, type } = output.images[0]
        return loadImage(`${subfolder ? `${subfolder}/` : ""}${filename} [${type}]`)
    } finally {
        for (const type of events) api.removeEventListener(type, onEvent)
    }
}

// OpenPose body points: nose, neck, right shoulder, elbow, wrist, left shoulder, elbow, wrist,
// right hip, knee, ankle, left hip, knee, ankle, right eye, left eye, right ear, left ear.
// Limbs, colors and sizes follow controlnet_aux's drawing, so ControlNets read the layer the same way.
const POSE_LIMBS = [[1, 2], [1, 5], [2, 3], [3, 4], [5, 6], [6, 7], [1, 8], [8, 9], [9, 10], [1, 11], [11, 12], [12, 13], [1, 0], [0, 14], [14, 16], [0, 15], [15, 17]]
const POSE_COLORS = [[255, 0, 0], [255, 85, 0], [255, 170, 0], [255, 255, 0], [170, 255, 0], [85, 255, 0], [0, 255, 0], [0, 255, 85], [0, 255, 170], [0, 255, 255], [0, 170, 255], [0, 85, 255], [0, 0, 255], [85, 0, 255], [170, 0, 255], [255, 0, 255], [255, 0, 170], [255, 0, 85]]
const HAND_EDGES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [0, 9], [9, 10], [10, 11], [11, 12], [0, 13], [13, 14], [14, 15], [15, 16], [0, 17], [17, 18], [18, 19], [19, 20]]
// Each body point's parent, from the neck out; the eyes hang from the nose and the ears from the eyes.
const POSE_PARENT = [1, null, 1, 2, 3, 1, 5, 6, 1, 8, 9, 1, 11, 12, 0, 0, 14, 15]
// The part that moves along with a body point: hands with their wrist, the face with the nose.
const POSE_ATTACHED = { 4: "rightHand", 7: "leftHand", 0: "face" }
// A standing person facing the viewer, in a 1×1 box.
const DEFAULT_BODY = [[0.5, 0.12], [0.5, 0.22], [0.38, 0.22], [0.33, 0.38], [0.3, 0.52], [0.62, 0.22], [0.67, 0.38], [0.7, 0.52], [0.43, 0.52], [0.42, 0.74], [0.41, 0.95], [0.57, 0.52], [0.58, 0.74], [0.59, 0.95], [0.47, 0.1], [0.53, 0.1], [0.44, 0.11], [0.56, 0.11]]

const rgb = ([r, g, b], k = 1) => `rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`

function hue(h) {
    const f = (n) => {
        const k = (n + h * 6) % 6
        return 255 * (1 - Math.max(0, Math.min(k, 4 - k, 1)))
    }
    return [f(5), f(3), f(1)]
}

// People from an OpenPose dict, in picture pixels: {body, leftHand, rightHand, face}, each a
// list of [x, y] or null for a point that wasn't found. The dict's points are either normalized
// or in canvas pixels, as controlnet_aux allows both.
function readPoses({ people, canvas_width, canvas_height }, W, H) {
    const lists = people.flatMap((p) => [p.pose_keypoints_2d, p.hand_left_keypoints_2d, p.hand_right_keypoints_2d, p.face_keypoints_2d]).filter(Boolean)
    const normalized = lists.every((k) => k.every((v, i) => i % 3 === 2 || Math.abs(v) <= 1))
    const sx = normalized ? W : W / canvas_width
    const sy = normalized ? H : H / canvas_height
    const points = (k) => k && Array.from({ length: k.length / 3 }, (_, i) => (k[i * 3 + 2] > 0 && k[i * 3] > 0 && k[i * 3 + 1] > 0 ? [k[i * 3] * sx, k[i * 3 + 1] * sy] : null))
    return people.map((p) => ({ body: points(p.pose_keypoints_2d) ?? Array(18).fill(null), leftHand: points(p.hand_left_keypoints_2d), rightHand: points(p.hand_right_keypoints_2d), face: points(p.face_keypoints_2d) }))
}

function defaultPerson(W, H) {
    const h = 0.8 * Math.min(H, W * 1.5)
    const top = (H - h) / 2
    return { body: DEFAULT_BODY.map(([x, y]) => [W / 2 + (x - 0.5) * h, top + y * h]), leftHand: null, rightHand: null, face: null }
}

// Sizes are in picture pixels whatever the picture's size, as DWPose draws at the picture's size.
function drawPoses(ctx, people, W, H) {
    const dot = (x, y, r, color) => {
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
    }
    ctx.fillStyle = "#000000"
    ctx.fillRect(0, 0, W, H)
    for (const { body } of people) {
        POSE_LIMBS.forEach(([a, b], i) => {
            const [p, q] = [body[a], body[b]]
            if (!p || !q) return
            ctx.fillStyle = rgb(POSE_COLORS[i], 0.6)
            ctx.beginPath()
            ctx.ellipse((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, Math.hypot(q[0] - p[0], q[1] - p[1]) / 2, 4, Math.atan2(q[1] - p[1], q[0] - p[0]), 0, Math.PI * 2)
            ctx.fill()
        })
        body.forEach((p, i) => p && dot(p[0], p[1], 4, rgb(POSE_COLORS[i])))
    }
    ctx.lineWidth = 2
    for (const person of people) {
        for (const hand of [person.leftHand, person.rightHand]) {
            if (!hand) continue
            HAND_EDGES.forEach(([a, b], i) => {
                if (!hand[a] || !hand[b]) return
                ctx.strokeStyle = rgb(hue(i / HAND_EDGES.length))
                ctx.beginPath()
                ctx.moveTo(...hand[a])
                ctx.lineTo(...hand[b])
                ctx.stroke()
            })
            for (const p of hand) p && dot(p[0], p[1], 4, "rgb(0, 0, 255)")
        }
        for (const p of person.face ?? []) p && dot(p[0], p[1], 3, "#ffffff")
    }
}

function showError(error) {
    const toast = app.extensionManager.toast
    if (toast.error) toast.error("Editor", { description: error.message, duration: 5000 })
    else toast.add({ severity: "error", summary: "Editor", detail: error.message, life: 5000 })
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
    constructor(image, img, edit, layers, onApply) {
        this.image = image
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
        // Recipe layers, bottom to top, between the picture and the paint layer.
        this.stack = []
        this.nextLayer = 1
        this.imageVisible = edit?.image_visible ?? true
        for (const [i, info] of (edit?.layers ?? []).entries()) this.insertLayer(this.newLayer(info, layers.recipes[i]), this.stack.length)
        this.busy = null
        this.strokeCanvas = this.newCanvas()
        this.strokeCtx = this.strokeCanvas.getContext("2d")
        this.strokeAlphaCanvas = this.newCanvas()
        this.strokeAlphaCtx = this.strokeAlphaCanvas.getContext("2d")
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
        this.sizeNotches = 0
        // Selected body points of the pose layer, as "person:joint".
        this.poseSel = new Set()
        this.poseHover = null
        this.build()
        this.setPoseMode("move")
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
  <label title="Show the mask (Shift+Q)"><input class="de-show-mask" type="checkbox"> Mask preview</label>
  <select class="de-mask-view" title="Mask preview (Q)">${MASK_VIEWS.map((v) => `<option>${v}</option>`).join("")}</select>
  <input class="de-mask-color" type="color" title="Mask preview color">
  <label title="Preview only: the mask keeps its own values">Opacity <input class="de-mask-opacity" type="number" min="0" max="100"></label>
  <span class="de-grow"></span>
  <button class="de-icon" data-action="undo" title="Undo (Ctrl+Z)">${ICONS.undo}</button><button class="de-icon" data-action="redo" title="Redo (Ctrl+Y)">${ICONS.redo}</button>
  <span class="de-sep"></span>
  <button data-action="reset" title="Undo every edit">Reset</button><button data-action="cancel" title="Close without applying (Esc)">Cancel</button><button data-action="apply" class="de-primary" title="Enter">Apply</button>
</div>
<div class="de-body">
  <div class="de-stage"><canvas class="de-main"></canvas><canvas class="de-overlay" tabindex="0"></canvas></div>
  <div class="de-panel">
    <div class="de-section de-tools">
      <button class="de-icon" data-tool="crop" title="Crop, pad and rotate (C)">${ICONS.crop}</button><button class="de-icon" data-tool="brush" title="Brush (B)">${ICONS.brush}</button><button class="de-icon" data-tool="eraser" title="Eraser (E)">${ICONS.eraser}</button><button class="de-icon" data-tool="pose" title="Edit pose layers (P)">${ICONS.pose}</button><button class="de-icon" data-tool="hand" title="Pan (H)">${ICONS.hand}</button>
    </div>
    <div class="de-section">
      <div class="de-panel-title de-tool-name"></div>
      <div class="de-options" data-for="crop">
        <label>Rotate <input class="de-rotate" type="number" step="0.1"></label>
        <button data-action="ccw">⟲ 90°</button><button data-action="cw">⟳ 90°</button>
        <label>Fill <input class="de-fill" type="color"></label>
        <span class="de-size"></span>
      </div>
      <div class="de-options" data-for="pose">
        <button data-pose-mode="move" title="Drag moves the selected points (R)">Move</button><button data-pose-mode="rotate" title="Drag turns the selected points about their nearest unselected common parent (R)">Rotate</button>
        <button data-action="add-person" title="Add a standing person, in a new pose layer if there is none">Add person</button><button data-action="delete-person" title="Delete the people with selected points (Del)">Delete person</button>
      </div>
      <div class="de-options" data-for="brush eraser">
        <button class="de-icon" data-target="mask" title="Paint on the mask (M)">${ICONS.mask}</button><button class="de-icon" data-target="paint" title="Paint on the picture (M)">${ICONS.paint}</button>
        <input class="de-color" type="color" title="Paint color">
        <label>Size <input class="de-size-input" type="number" min="1" max="2000"></label>
        <label>Opacity <input class="de-opacity" type="number" min="1" max="100"></label>
        <label>Hardness <input class="de-hardness" type="number" min="0" max="100"></label>
        <button data-action="clear" title="Clear the current layer">Clear</button><button data-action="invert" title="Invert the mask (Ctrl+I)">Invert mask</button>
      </div>
    </div>
    <div class="de-section">
      <div class="de-panel-title">Layers</div>
      <select class="dl-add"><option value="">Add from recipe…</option></select><div class="dl-status"></div><div class="dl-list"></div>
    </div>
    <div class="de-section de-props" hidden>
      <div class="de-panel-title dp-node"></div>
      <div class="de-fields"></div>
      <div><button class="dp-run" title="Run the recipe again with these values">↻ Run</button></div>
      <div class="dp-save-row"><input class="dp-name" type="text" placeholder="Recipe name"><button class="dp-save" title="Add these values to the recipes menu, replacing the recipe of the same name">Save as recipe</button></div>
    </div>
  </div>
</div>
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
        const add = this.root.querySelector(".dl-add")
        this.fillRecipes()
        add.addEventListener("change", () => {
            const recipe = this.recipes[Number(add.value)]
            add.value = ""
            this.addFromRecipe(recipe)
        })
        this.root.querySelector(".dp-run").addEventListener("click", () => this.regenerate(this.target))
        this.root.querySelector(".dp-save").addEventListener("click", () => {
            const name = this.root.querySelector(".dp-name").value.trim()
            if (name) this.saveRecipe({ ...this.layers[this.target].recipe, name }).catch(showError)
        })

        this.root.addEventListener("click", (e) => {
            const { action, tool, target, poseMode } = e.target.dataset ?? {}
            if (tool) this.setTool(tool)
            else if (poseMode) this.setPoseMode(poseMode)
            else if (target) this.setTarget(target)
            else if (action === "cw" || action === "ccw") this.quarterTurn(action === "cw")
            else if (action === "clear") this.clearLayer()
            else if (action === "invert") this.invertMask()
            else if (action === "add-person") this.addPerson()
            else if (action === "delete-person") this.deletePerson()
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
        // A dragged rotation is one undo step.
        let rotateBefore = null
        scrub(this.inputs.rotate, FIELDS.rotate, (value, done) => {
            rotateBefore ??= this.cropState()
            this.setRotate(value)
            if (!done) return
            this.pushCrop(rotateBefore)
            rotateBefore = null
        })
        for (const name of ["size", "opacity", "hardness"]) {
            scrub(this.inputs[name], FIELDS[name], (value) => {
                this.inputs[name].value = value
                this.inputs[name].dispatchEvent(new Event("change"))
            })
        }
        // The setting is saved once, on release.
        scrub(this.inputs.maskOpacity, FIELDS.maskOpacity, (value, done) => {
            this.inputs.maskOpacity.value = value
            this.maskOpacity = value / 100
            if (done) app.extensionManager.setting.set(SETTINGS.opacity, value)
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
        activeEditor = this
        // ComfyUI's change tracker sees keys before the editor and would act on the graph, Ctrl+Z
        // undoing it. It stands aside while a mask editor says it is open, which this editor is.
        this.maskEditorOpened = app.constructor.maskeditor_is_opended
        app.constructor.maskeditor_is_opended = () => true

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
        this.root.querySelector(".de-tool-name").textContent = this.root.querySelector(`[data-tool=${tool}]`).title.replace(/ \(.\)$/, "")
        for (const o of this.root.querySelectorAll(".de-options")) o.style.display = o.dataset.for.split(" ").includes(tool) ? "" : "none"
        this.help.textContent = `${HELP[tool]} · Wheel: zoom · Space or middle drag: pan · C B E P H: tools · Ctrl+Z / Ctrl+Y: undo / redo · Ctrl+0: fit · Enter: apply · Esc: cancel`
        this.setTarget(this.target)
        this.updateCursor()
        this.redraw()
    }

    setTarget(target) {
        this.target = target
        for (const b of this.root.querySelectorAll("[data-target]")) b.classList.toggle("de-active", b.dataset.target === target)
        this.inputs.color.style.display = target === "mask" ? "none" : ""
        this.renderLayers()
    }

    setPoseMode(mode) {
        this.poseMode = mode
        for (const b of this.root.querySelectorAll("[data-pose-mode]")) b.classList.toggle("de-active", b.dataset.poseMode === mode)
        this.updateCursor()
        this.redrawOverlay()
    }

    // A recipe layer: its result stretched over the picture, which is where the recipe ran. A pose
    // layer keeps its people instead, and is drawn from them. `ran` holds the inputs the result
    // comes from, which differ from the recipe's once its values are changed and not run again.
    newLayer({ name, recipe, visible = true, opacity = 1, pose, stale }, result) {
        const canvas = this.newCanvas()
        const ctx = canvas.getContext("2d")
        const ran = recipe && !stale ? JSON.stringify(recipe.inputs) : null
        const layer = { id: `layer${this.nextLayer++}`, canvas, ctx, used: true, name, recipe, ran, visible, opacity, pose }
        if (pose) drawPoses(ctx, pose, this.W, this.H)
        else ctx.drawImage(result, 0, 0, this.W, this.H)
        return layer
    }

    applyPose(layer, people) {
        layer.pose = people
        drawPoses(layer.ctx, people, this.W, this.H)
    }

    // People lists in the history are never changed afterwards: an edit works on a copy.
    pushPose(layer, before) {
        const after = layer.pose
        this.push({ undo: () => this.applyPose(layer, before), redo: () => this.applyPose(layer, after) })
    }

    setPose(layer, people) {
        const before = layer.pose
        this.applyPose(layer, people)
        this.pushPose(layer, before)
        this.renderLayers()
        this.redraw()
    }

    insertLayer(layer, index) {
        this.layers[layer.id] = layer
        this.stack.splice(index, 0, layer.id)
    }

    removeLayer(id) {
        const index = this.stack.indexOf(id)
        this.stack.splice(index, 1)
        delete this.layers[id]
        if (this.target === id) this.setTarget("paint")
        return index
    }

    async addFromRecipe(recipe) {
        try {
            recipe = await fullRecipe(recipe)
        } catch (error) {
            return showError(error)
        }
        const result = await this.run(recipe)
        if (!result) return
        const pose = recipe.pose === undefined ? undefined : readPoses(result, this.W, this.H)
        const layer = this.newLayer({ name: recipe.name, recipe, pose }, result)
        const index = this.stack.length
        this.insertLayer(layer, index)
        this.push({ undo: () => this.removeLayer(layer.id), redo: () => this.insertLayer(layer, index) })
        this.renderLayers()
        this.redraw()
    }

    // Runs the layer's recipe with its current values. Values changed during the run stay pending.
    async regenerate(id) {
        const layer = this.layers[id]
        const recipe = layer.recipe
        const result = await this.run(recipe)
        if (!result || !this.layers[id]) return
        const before = this.layerState(layer)
        if (layer.pose) {
            this.applyPose(layer, readPoses(result, this.W, this.H))
        } else {
            layer.ctx.clearRect(0, 0, this.W, this.H)
            layer.ctx.drawImage(result, 0, 0, this.W, this.H)
        }
        layer.ran = JSON.stringify(recipe.inputs)
        const after = this.layerState(layer)
        this.push({ undo: () => this.setLayerState(layer, before), redo: () => this.setLayerState(layer, after) })
        this.renderLayers()
        this.redraw()
    }

    layerState(layer) {
        return { pixels: layer.ctx.getImageData(0, 0, this.W, this.H), pose: layer.pose, ran: layer.ran }
    }

    setLayerState(layer, state) {
        layer.ctx.putImageData(state.pixels, 0, 0)
        layer.pose = state.pose
        layer.ran = state.ran
    }

    isStale(layer) {
        return !!layer.recipe && layer.ran !== JSON.stringify(layer.recipe.inputs)
    }

    // Recipes are never changed afterwards: a new value makes a new recipe, so the history can
    // keep them. The properties panel is told, as it already shows the value.
    setInput(layer, name, value) {
        layer.recipe = { ...layer.recipe, inputs: { ...layer.recipe.inputs, [name]: value } }
        this.propsRecipe = layer.recipe
        this.renderLayers()
    }

    pushRecipe(layer, before) {
        const after = layer.recipe
        if (before !== after) this.push({ undo: () => (layer.recipe = before), redo: () => (layer.recipe = after) })
    }

    // Adds the recipe to user recipes, replacing the one with the same name.
    async saveRecipe(recipe) {
        const res = await api.fetchApi(RECIPES_FILE)
        const recipes = res.ok ? (await res.json()).filter((r) => r.name !== recipe.name) : []
        recipes.push(recipe)
        const saved = await api.fetchApi(`${RECIPES_FILE}?overwrite=true`, { method: "POST", body: JSON.stringify(recipes, null, 4) })
        if (!saved.ok) throw new Error(`Saving the recipe failed: ${saved.status}`)
        this.fillRecipes()
        this.showHud(`Saved recipe ${recipe.name}`)
    }

    fillRecipes() {
        const add = this.root.querySelector(".dl-add")
        add.replaceChildren(new Option("Add from recipe…", ""))
        this.recipes = []
        loadRecipes()
            .then((groups) => {
                for (const [label, recipes] of groups) {
                    const group = Object.assign(document.createElement("optgroup"), { label })
                    // A recipe whose node isn't installed, or failed to load, shows which one it needs.
                    for (const recipe of recipes) {
                        const option = new Option(recipe.name, this.recipes.length)
                        this.recipes.push(recipe)
                        if (recipe.node && !LiteGraph.registered_node_types[recipe.node]) {
                            option.disabled = true
                            option.textContent += ` (needs ${recipe.node})`
                        }
                        group.append(option)
                    }
                    add.append(group)
                }
            })
            .catch(showError)
    }

    // A plain layer above a pose layer, with the pose as pixels, to paint on. The pose layer stays editable.
    copyAsImage(id) {
        const source = this.layers[id]
        const layer = this.newLayer({ name: `${source.name} (image)`, recipe: null, opacity: source.opacity }, source.canvas)
        const index = this.stack.indexOf(id) + 1
        this.insertLayer(layer, index)
        this.push({ undo: () => this.removeLayer(layer.id), redo: () => this.insertLayer(layer, index) })
        this.setTarget(layer.id)
        this.redraw()
    }

    deleteLayer(id) {
        const layer = this.layers[id]
        const index = this.removeLayer(id)
        this.push({ undo: () => this.insertLayer(layer, index), redo: () => this.removeLayer(id) })
        this.renderLayers()
        this.redraw()
    }

    // Runs a recipe on the picture, one at a time. Returns nothing once the editor is closed.
    async run(recipe) {
        this.busy = recipe.name
        this.renderLayers()
        try {
            const result = await runRecipe(this.image, recipe)
            return this.root.isConnected ? result : null
        } catch (error) {
            showError(error)
            return null
        } finally {
            this.busy = null
            if (this.root.isConnected) this.renderLayers()
        }
    }

    // Top to bottom: paint, recipe layers, picture. Clicking a name picks the layer to paint on;
    // the mask has its own button in the bar.
    renderLayers() {
        const list = this.root.querySelector(".dl-list")
        list.replaceChildren()
        const row = (id, name) => {
            const el = document.createElement("div")
            el.className = "dl-row" + (id === this.target ? " dl-active" : "")
            el.innerHTML = `<span class="dl-name"></span>`
            el.querySelector(".dl-name").textContent = name
            if (id) el.querySelector(".dl-name").addEventListener("click", () => this.setTarget(id))
            list.append(el)
            return el
        }
        const eye = (el, visible, onChange) => {
            const box = Object.assign(document.createElement("input"), { type: "checkbox", checked: visible, title: "Visible, and in the output" })
            box.addEventListener("change", () => {
                onChange(box.checked)
                this.redraw()
            })
            el.prepend(box)
        }
        row("paint", "Paint").prepend(Object.assign(document.createElement("span"), { className: "dl-eye-space" }))
        for (const id of [...this.stack].reverse()) {
            const layer = this.layers[id]
            const el = row(id, layer.name)
            eye(el, layer.visible, (v) => (layer.visible = v))
            el.insertAdjacentHTML("beforeend", `<label title="Opacity">◐ <input type="number" min="0" max="100"></label>${layer.pose ? `<button data-copy title="Copy as an image layer above, to paint on">⧉</button>` : ""}<button title="Run again">↻</button><button title="Delete">×</button>`)
            el.querySelector("[data-copy]")?.addEventListener("click", () => this.copyAsImage(id))
            const opacity = el.querySelector("input[type=number]")
            opacity.value = Math.round(layer.opacity * 100)
            opacity.style.setProperty("--fill", `${opacity.value}%`)
            const setOpacity = (value) => {
                layer.opacity = Math.min(Math.max(value, 0), 100) / 100
                opacity.value = Math.round(layer.opacity * 100)
                opacity.style.setProperty("--fill", `${opacity.value}%`)
                this.redraw()
            }
            opacity.addEventListener("change", () => setOpacity(Number(opacity.value) || 0))
            scrub(opacity, { min: 0, max: 100, span: 200 }, setOpacity)
            const [again, remove] = el.querySelectorAll("button:not([data-copy])")
            again.disabled = !!this.busy
            again.hidden = !layer.recipe
            again.classList.toggle("de-stale", this.isStale(layer))
            if (this.isStale(layer)) again.title = "Run again: the values changed since the last run"
            again.addEventListener("click", () => this.regenerate(id))
            remove.addEventListener("click", () => this.deleteLayer(id))
        }
        eye(row(null, "Image"), this.imageVisible, (v) => (this.imageVisible = v))
        this.root.querySelector(".dl-add").disabled = !!this.busy
        this.root.querySelector(".dl-status").textContent = this.busy ? `Running ${this.busy}…` : ""
        const run = this.root.querySelector(".dp-run")
        run.disabled = !!this.busy
        run.classList.toggle("de-stale", !!this.layers[this.target] && this.isStale(this.layers[this.target]))
        this.renderProperties()
    }

    // The inputs of the target layer's recipe node, rebuilt only when the layer or its recipe
    // changes otherwise than through these fields.
    async renderProperties() {
        const id = this.target
        const recipe = this.layers[id]?.recipe
        if (id === this.propsTarget && recipe === this.propsRecipe) return
        this.propsTarget = id
        this.propsRecipe = recipe
        const section = this.root.querySelector(".de-props")
        const fields = section.querySelector(".de-fields")
        fields.replaceChildren()
        section.hidden = !recipe
        if (!recipe) return
        section.querySelector(".dp-node").textContent = recipe.prompt ? recipe.name : LiteGraph.registered_node_types[recipe.node]?.title ?? recipe.node
        section.querySelector(".dp-name").value = recipe.name
        let specs
        try {
            specs = await recipeFields(recipe)
        } catch {
            fields.textContent = recipe.prompt ? "A node of the workflow is missing" : `Needs the ${recipe.node} node`
            return
        }
        if (id !== this.propsTarget || recipe !== this.propsRecipe) return
        const layer = this.layers[id]
        if (!specs.length && recipe.prompt) fields.textContent = "Title nodes editor:<name> in the workflow to set their values here"
        for (const [key, name, type, options] of specs) {
            const label = document.createElement("label")
            label.append(name)
            label.title = options.tooltip ?? name
            const value = recipe.inputs[key] ?? defaultInput(type, options)
            let input
            let read
            let field = null
            if (type === "COMBO") {
                input = document.createElement("select")
                input.append(...options.options.map((o) => new Option(o, o)))
                input.value = value
                read = () => input.value
            } else if (type === "BOOLEAN") {
                input = Object.assign(document.createElement("input"), { type: "checkbox", checked: value })
                read = () => input.checked
            } else if (type === "STRING") {
                input = Object.assign(document.createElement("input"), { type: "text", value })
                read = () => input.value
            } else {
                const step = options.step ?? (type === "INT" ? 1 : 0.01)
                const decimals = type === "INT" ? 0 : Math.max(0, -Math.floor(Math.log10(step)))
                const snap = (v) => {
                    v = Math.min(Math.max(v, options.min ?? -Infinity), options.max ?? Infinity)
                    return Number(((options.min ?? 0) + Math.round((v - (options.min ?? 0)) / step) * step).toFixed(decimals))
                }
                input = Object.assign(document.createElement("input"), { type: "number", value, step })
                // About one pixel per step, within a reasonable drag.
                if (options.min !== undefined && options.max !== undefined) field = { min: options.min, max: options.max, span: Math.min(Math.max((options.max - options.min) / step, 100), 400), decimals }
                read = () => {
                    input.value = snap(Number(input.value) || 0)
                    if (field) input.style.setProperty("--fill", `${fieldPosition(field, Number(input.value)) * 100}%`)
                    return Number(input.value)
                }
                read()
            }
            label.append(input)
            input.addEventListener("change", () => {
                const before = layer.recipe
                this.setInput(layer, key, read())
                this.pushRecipe(layer, before)
            })
            if (field) {
                let before = null
                scrub(input, field, (v, done) => {
                    before ??= layer.recipe
                    input.value = v
                    this.setInput(layer, key, read())
                    if (!done) return
                    this.pushRecipe(layer, before)
                    before = null
                })
            }
            fields.append(label)
        }
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
        else if (this.tool === "pose") {
            this.poseHover = this.mouse && !this.drag ? this.hitPose(...this.mouse) : null
            const turning = this.poseMode === "rotate" && (this.poseHover || this.poseSel.size)
            if (turning) this.canvas.style.cursor = CURSORS.rotate
            else if (this.drag) this.canvas.style.cursor = this.drag.mode === "marquee" ? "crosshair" : "grabbing"
            else this.canvas.style.cursor = !this.poseHover ? "default" : this.poseHover.joint === null ? "move" : "grab"
        }
        else this.canvas.style.cursor = "default"
    }

    close() {
        activeEditor = null
        app.constructor.maskeditor_is_opended = this.maskEditorOpened
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
            if (this.stack.length) {
                edit.layers = []
                for (const id of this.stack) {
                    const { canvas, name, recipe, visible, opacity, pose } = this.layers[id]
                    edit.layers.push({ file: await uploadLayer(canvas), name, recipe, visible, opacity, ...(pose && { pose }), ...(this.isStale(this.layers[id]) && { stale: true }) })
                }
            }
        } catch (error) {
            for (const b of this.root.querySelectorAll("button")) b.disabled = false
            showError(error)
            return
        }
        if (!this.imageVisible) edit.image_visible = false
        const full = this.fullFrame()
        const identity = this.rotate === 0 && f.l === full.l && f.t === full.t && f.r === full.r && f.b === full.b && !edit.paint && !edit.mask && !edit.layers && this.imageVisible
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
        this.renderLayers()
        this.redraw()
    }

    redo() {
        const entry = this.redoStack.pop()
        if (!entry) return
        entry.redo()
        this.undoStack.push(entry)
        this.renderLayers()
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

    // XOR with opaque white turns every alpha a into 1 - a, soft edges included.
    invertMask() {
        const mask = this.layers.mask
        const done = this.recordLayer("mask", 0, 0, this.W, this.H)
        mask.ctx.globalCompositeOperation = "xor"
        mask.ctx.fillStyle = "#ffffff"
        mask.ctx.fillRect(0, 0, this.W, this.H)
        mask.ctx.globalCompositeOperation = "source-over"
        done(true)
        this.redraw()
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
        let hit = null
        if (e.button === 1 || (e.button === 0 && (this.space || this.tool === "hand"))) mode = "pan"
        else if (e.button === 0 && this.tool === "crop") mode = this.hit(sx, sy)
        else if (e.button === 0 && (this.tool === "brush" || this.tool === "eraser")) {
            if (this.layers[this.target].pose) return this.showHud("Pose layers change with the Pose tool (P)")
            mode = "stroke"
        } else if (e.button === 0 && this.tool === "pose") {
            hit = this.hitPose(sx, sy)
            const key = hit && hit.joint !== null && `${hit.person}:${hit.joint}`
            this.redrawOverlay()
            if (e.ctrlKey && key) {
                if (this.poseSel.has(key)) this.poseSel.delete(key)
                else this.poseSel.add(key)
                return
            }
            if (e.ctrlKey) mode = "marquee"
            else {
                // A click on a point keeps a selection it belongs to, so the selection drags as one.
                if (hit && !(key && this.poseSel.has(key))) this.selectPose(hit)
                // In Rotate mode, a drag from anywhere turns the selection.
                if (hit || (this.poseMode === "rotate" && this.poseSel.size)) mode = "pose"
                else this.poseSel.clear()
            }
        }
        if (!mode) return
        e.preventDefault()
        this.canvas.setPointerCapture(e.pointerId)
        this.drag = { mode, sx, sy, crop: this.cropState(), ox: this.ox, oy: this.oy, angle: this.angleAt(sx, sy) }
        if (mode === "stroke") this.startStroke(this.toPicture(sx, sy))
        if (mode === "pose") {
            const layer = this.poseLayer()
            this.drag.pose = { layer, before: layer.pose, start: this.toPicture(sx, sy), moved: false }
            layer.pose = structuredClone(layer.pose)
        }
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
        if (d.mode === "pose") {
            // Each move starts again from the pose before the drag, so a rotation doesn't drift.
            const [x, y] = this.toPicture(sx, sy)
            const { layer, before, start } = d.pose
            layer.pose = structuredClone(before)
            for (const [person, joints] of this.poseSelection()) {
                let move
                if (this.poseMode === "rotate") {
                    const [px, py] = this.posePivot(before[person], joints)
                    let a = Math.atan2(y - py, x - px) - Math.atan2(start[1] - py, start[0] - px)
                    if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12)
                    const c = Math.cos(a)
                    const s = Math.sin(a)
                    move = ([u, v]) => [px + c * (u - px) - s * (v - py), py + s * (u - px) + c * (v - py)]
                } else {
                    move = ([u, v]) => [u + x - start[0], v + y - start[1]]
                }
                this.transformJoints(layer.pose[person], joints, move)
            }
            d.pose.moved = true
            drawPoses(layer.ctx, layer.pose, this.W, this.H)
            this.redraw()
            return
        }
        if (d.mode === "marquee") {
            this.redrawOverlay()
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
        else if (d.mode === "pose") {
            if (d.pose.moved) this.pushPose(d.pose.layer, d.pose.before)
            else {
                // A click without a drag picks what's under it alone, or nothing away from the pose.
                const hit = this.hitPose(d.sx, d.sy)
                if (hit) this.selectPose(hit)
                else this.poseSel.clear()
            }
        } else if (d.mode === "marquee") this.selectInBox(d.sx, d.sy, ...this.pos(e), e.shiftKey)
        else if (d.mode !== "pan") this.pushCrop(d.crop)
        this.onMove(e)
    }

    selectInBox(x0, y0, x1, y1, add) {
        if (!add) this.poseSel.clear()
        const [l, r, t, b] = [Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1)]
        for (const [i, person] of (this.poseLayer()?.pose ?? []).entries()) {
            person.body.forEach((p, j) => {
                if (!p) return
                const [x, y] = this.fromPicture(...p)
                if (x >= l && x <= r && y >= t && y <= b) this.poseSel.add(`${i}:${j}`)
            })
        }
    }

    // A point alone, or for a limb (joint null) every point of its person.
    selectPose({ person, joint }) {
        this.poseSel.clear()
        const body = this.poseLayer().pose[person].body
        for (const [j, p] of body.entries()) if (p && (joint === null || j === joint)) this.poseSel.add(`${person}:${j}`)
    }

    // The selection as [person, joints] pairs, without points that no longer exist.
    poseSelection() {
        const people = this.poseLayer()?.pose ?? []
        const byPerson = new Map()
        for (const key of this.poseSel) {
            const [person, joint] = key.split(":").map(Number)
            if (!people[person]?.body[joint]) continue
            if (!byPerson.has(person)) byPerson.set(person, [])
            byPerson.get(person).push(joint)
        }
        return byPerson
    }

    // The nearest common parent of the points that isn't selected itself, skipping parents the
    // detection missed. Without one, such as for a whole person, the selection's center.
    posePivot(person, joints) {
        const chain = (j) => {
            const up = []
            for (; j !== null; j = POSE_PARENT[j]) up.push(j)
            return up
        }
        let common = chain(joints[0])
        for (const j of joints.slice(1)) {
            const up = new Set(chain(j))
            common = common.filter((a) => up.has(a))
        }
        let pivot = joints.includes(common[0]) ? POSE_PARENT[common[0]] : common[0]
        while (pivot !== null && !person.body[pivot]) pivot = POSE_PARENT[pivot]
        if (pivot !== null) return person.body[pivot]
        const points = joints.map((j) => person.body[j])
        return [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length]
    }

    // Applies move to the selected body points and to the hand or face attached to each.
    transformJoints(person, joints, move) {
        for (const j of joints) {
            person.body[j] = move(person.body[j])
            const part = person[POSE_ATTACHED[j]]
            if (part) person[POSE_ATTACHED[j]] = part.map((p) => p && move(p))
        }
    }

    // The pose layer the Pose tool edits: the selected layer, or else the top pose layer.
    poseLayer() {
        if (this.layers[this.target]?.pose) return this.layers[this.target]
        const id = [...this.stack].reverse().find((id) => this.layers[id].pose)
        return id ? this.layers[id] : null
    }

    // Picture pixels to screen.
    fromPicture(x, y) {
        const r = (this.rotate * Math.PI) / 180
        const c = Math.cos(r)
        const s = Math.sin(r)
        const u = x - this.W / 2
        const v = y - this.H / 2
        return this.toScreen(c * u - s * v, s * u + c * v)
    }

    // The body point under the pointer, or else the limb, as {person, joint}; joint is null on a limb.
    hitPose(sx, sy) {
        const people = this.poseLayer()?.pose ?? []
        for (let i = people.length - 1; i >= 0; i--) {
            const j = people[i].body.findIndex((p) => p && Math.hypot(sx - this.fromPicture(...p)[0], sy - this.fromPicture(...p)[1]) <= 8)
            if (j >= 0) return { person: i, joint: j }
        }
        for (let i = people.length - 1; i >= 0; i--) {
            const body = people[i].body
            for (const [a, b] of POSE_LIMBS) {
                if (!body[a] || !body[b]) continue
                const [x1, y1] = this.fromPicture(...body[a])
                const [x2, y2] = this.fromPicture(...body[b])
                const t = Math.min(Math.max(((sx - x1) * (x2 - x1) + (sy - y1) * (y2 - y1)) / ((x2 - x1) ** 2 + (y2 - y1) ** 2 || 1), 0), 1)
                if (Math.hypot(sx - x1 - t * (x2 - x1), sy - y1 - t * (y2 - y1)) <= 6) return { person: i, joint: null }
            }
        }
        return null
    }

    // Without a pose layer, makes one: a pose can be posed from scratch.
    addPerson() {
        let layer = this.poseLayer()
        if (!layer) {
            layer = this.newLayer({ name: "Pose", recipe: null, pose: [] })
            const index = this.stack.length
            this.insertLayer(layer, index)
            this.push({ undo: () => this.removeLayer(layer.id), redo: () => this.insertLayer(layer, index) })
        }
        this.setPose(layer, [...layer.pose, defaultPerson(this.W, this.H)])
        this.selectPose({ person: layer.pose.length - 1, joint: null })
    }

    // Deletes every person with a selected point.
    deletePerson() {
        const people = this.poseSelection()
        if (!people.size) return
        const layer = this.poseLayer()
        this.setPose(layer, layer.pose.filter((_, i) => !people.has(i)))
        this.poseSel.clear()
    }

    // A stroke is drawn as a coverage map: opaque gray dabs on black, merged with "lighten" so
    // that each pixel keeps the most coverage any dab gave it. Adding overlapping dabs instead
    // would fill in the soft edge and make a soft brush look harder. The map becomes the
    // stroke's alpha through a luminance-to-alpha filter, then goes into the layer with the
    // brush opacity.
    startStroke(p) {
        const erase = this.tool === "eraser"
        this.stroke = {
            layer: this.target,
            erase,
            color: this.target !== "mask" && !erase ? this.brush.color : "#ffffff",
            opacity: this.brush.opacity,
            radius: this.brush.size / 2,
            hardness: this.brush.hardness,
            last: p,
            box: [p[0], p[1], p[0], p[1]],
        }
        this.strokeCtx.globalCompositeOperation = "source-over"
        this.strokeCtx.fillStyle = "#000000"
        this.strokeCtx.fillRect(0, 0, this.W, this.H)
        this.strokeCtx.globalCompositeOperation = "lighten"
        this.dab(p)
    }

    strokeTo(p) {
        const s = this.stroke
        const [x0, y0] = s.last
        const dist = Math.hypot(p[0] - x0, p[1] - y0)
        // Close dabs: with the most coverage kept, wider gaps would ripple along a soft stroke.
        const step = Math.max(1, s.radius * 0.05)
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
        g.addColorStop(0, "#ffffff")
        g.addColorStop(1, "#000000")
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, s.radius, 0, Math.PI * 2)
        ctx.fill()
        s.box = [Math.min(s.box[0], x), Math.min(s.box[1], y), Math.max(s.box[2], x), Math.max(s.box[3], y)]
    }

    // The stroke's area in picture pixels, as integers inside the picture.
    strokeArea() {
        const s = this.stroke
        const r = s.radius + 1
        const x = Math.max(0, Math.floor(s.box[0] - r))
        const y = Math.max(0, Math.floor(s.box[1] - r))
        return [x, y, Math.min(this.W, Math.ceil(s.box[2] + r)) - x, Math.min(this.H, Math.ceil(s.box[3] + r)) - y]
    }

    composeStroke(ctx) {
        const s = this.stroke
        const [x, y, w, h] = this.strokeArea()
        if (w <= 0 || h <= 0) return
        const alpha = this.strokeAlphaCtx
        alpha.clearRect(x, y, w, h)
        alpha.filter = "url(#davcha-luminance-to-alpha)"
        alpha.drawImage(this.strokeCanvas, x, y, w, h, x, y, w, h)
        alpha.filter = "none"
        alpha.globalCompositeOperation = "source-in"
        alpha.fillStyle = s.color
        alpha.fillRect(x, y, w, h)
        alpha.globalCompositeOperation = "source-over"
        ctx.save()
        ctx.globalAlpha = s.opacity
        ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over"
        ctx.drawImage(this.strokeAlphaCanvas, x, y, w, h, x, y, w, h)
        ctx.restore()
    }

    endStroke() {
        const s = this.stroke
        const layer = this.layers[s.layer]
        const done = this.recordLayer(s.layer, ...this.strokeArea())
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
            // A step of 10% per notch, but at least a pixel so small brushes change too. Touchpads
            // send fractions of a notch, which add up to whole steps.
            this.sizeNotches += notches
            while (Math.abs(this.sizeNotches) >= 1) {
                const dir = Math.sign(this.sizeNotches)
                this.sizeNotches -= dir
                this.setBrush("size", this.brush.size + dir * Math.max(1, Math.round(this.brush.size * 0.1)))
            }
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
        e.stopImmediatePropagation()
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
        } else if (e.ctrlKey && key === "a" && this.tool === "pose") {
            e.preventDefault()
            this.selectInBox(-Infinity, -Infinity, Infinity, Infinity, false)
            this.redrawOverlay()
        } else if (e.ctrlKey && key === "i") {
            e.preventDefault()
            this.invertMask()
            this.showHud("Mask inverted")
        } else if (!e.ctrlKey && !e.altKey && !e.metaKey) {
            const tool = { c: "crop", b: "brush", e: "eraser", p: "pose", h: "hand" }[key]
            if (tool) this.setTool(tool)
            else if (this.tool === "pose" && (e.key === "Delete" || e.key === "Backspace")) this.deletePerson()
            else if (this.tool === "pose" && key === "r") {
                this.setPoseMode(this.poseMode === "move" ? "rotate" : "move")
                this.showHud(this.poseMode === "move" ? "Move" : "Rotate")
            }
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
        if (this.imageVisible) ctx.drawImage(this.img, 0, 0)
        else {
            ctx.fillStyle = "#000000"
            ctx.fillRect(0, 0, this.W, this.H)
        }
        for (const name of [...this.stack, "paint", "mask"]) {
            const layer = this.layers[name]
            if (name === "mask" ? !this.showMask : layer.visible === false) continue
            let canvas = layer.canvas
            if (this.stroke?.layer === name) {
                this.previewCtx.clearRect(0, 0, this.W, this.H)
                this.previewCtx.drawImage(canvas, 0, 0)
                this.composeStroke(this.previewCtx)
                canvas = this.previewCanvas
            }
            if (name === "mask") this.drawMask(ctx, canvas)
            else {
                ctx.globalAlpha = layer.opacity ?? 1
                ctx.drawImage(canvas, 0, 0)
                ctx.globalAlpha = 1
            }
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
        for (const [name, field] of Object.entries(FIELDS)) {
            this.inputs[name].style.setProperty("--fill", `${fieldPosition(field, Number(this.inputs[name].value)) * 100}%`)
        }

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

        // Pose handles: one dot per body point, ringed in white when selected. In Rotate mode, a
        // cross marks the point each selection turns about.
        if (this.tool === "pose") {
            const people = this.poseLayer()?.pose ?? []
            for (const [i, person] of people.entries()) {
                person.body.forEach((p, j) => {
                    if (!p) return
                    const [x, y] = this.fromPicture(...p)
                    const hovered = this.poseHover?.person === i && this.poseHover.joint === j
                    const selected = this.poseSel.has(`${i}:${j}`)
                    ctx.fillStyle = rgb(POSE_COLORS[j])
                    ctx.strokeStyle = selected ? "#ffffff" : "rgba(0, 0, 0, 0.8)"
                    ctx.lineWidth = selected ? 2.5 : 1
                    ctx.beginPath()
                    ctx.arc(x, y, hovered || selected ? 7 : 5, 0, Math.PI * 2)
                    ctx.fill()
                    ctx.stroke()
                })
            }
            if (this.poseMode === "rotate") {
                const before = this.drag?.pose?.before ?? people
                for (const [person, joints] of this.poseSelection()) {
                    const [x, y] = this.fromPicture(...this.posePivot(before[person], joints))
                    ctx.strokeStyle = "#ffffff"
                    ctx.lineWidth = 2
                    ctx.beginPath()
                    ctx.arc(x, y, 9, 0, Math.PI * 2)
                    ctx.moveTo(x - 14, y)
                    ctx.lineTo(x + 14, y)
                    ctx.moveTo(x, y - 14)
                    ctx.lineTo(x, y + 14)
                    ctx.stroke()
                }
            }
            if (this.drag?.mode === "marquee" && this.mouse) {
                ctx.strokeStyle = "#ffffff"
                ctx.lineWidth = 1
                ctx.setLineDash([4, 4])
                ctx.strokeRect(this.drag.sx, this.drag.sy, this.mouse[0] - this.drag.sx, this.mouse[1] - this.drag.sy)
                ctx.setLineDash([])
            }
            ctx.lineWidth = 1
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
        const layers = { recipes: await Promise.all((edit?.layers ?? []).map((layer) => loadImage(layer.file))) }
        for (const name of LAYERS) {
            if (edit?.[name]) layers[name] = await loadImage(edit[name])
        }
        new Editor(image, await loadImage(image), edit, layers, onApply)
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
            tile.title = entry.image
            tile.innerHTML = `<img><span class="dg-badge">${i + 1}${entry.edit ? " ✎" : ""}</span><span class="dg-remove" title="Remove">×</span>`
            thumbnailUrl(entry).then((url) => (tile.querySelector("img").src = url))
            tile.querySelector(".dg-remove").addEventListener("click", (e) => {
                e.stopPropagation()
                const list = entries()
                list.splice(i, 1)
                save(list)
            })
            // A click edits the picture; a drag moves it to the place of the tile it is dropped on.
            // Pointer events, as the canvas keeps native drag and drop from starting in node widgets.
            tile.addEventListener("pointerdown", (e) => {
                if (e.button !== 0 || e.target.closest(".dg-remove")) return
                e.stopPropagation()
                tile.setPointerCapture(e.pointerId)
                let moved = false
                let target = null
                const move = (ev) => {
                    if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 5) return
                    moved = true
                    tile.classList.add("dg-dragging")
                    const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".dg-tile:not(.dg-add)")
                    const next = over?.parentElement === gallery && over !== tile ? over : null
                    if (next === target) return
                    target?.classList.remove("dg-over")
                    target = next
                    target?.classList.add("dg-over")
                }
                const up = () => {
                    tile.removeEventListener("pointermove", move)
                    tile.removeEventListener("pointerup", up)
                    tile.removeEventListener("pointercancel", up)
                    tile.classList.remove("dg-dragging")
                    target?.classList.remove("dg-over")
                    if (!moved) {
                        editPicture(entry.image, entry.edit, (edit) => {
                            const list = entries()
                            list[i].edit = edit
                            save(list)
                        })
                    } else if (target) {
                        const list = entries()
                        list.splice([...gallery.children].indexOf(target), 0, ...list.splice(i, 1))
                        save(list)
                    }
                }
                tile.addEventListener("pointermove", move)
                tile.addEventListener("pointerup", up)
                tile.addEventListener("pointercancel", up)
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
    node.pasteFiles = addFiles
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
            // Read by For Each (comfyui_davcha_controlflow) to show one table row per picture.
            nodeType.prototype.getListLength = function () {
                return JSON.parse(this.widgets.find((w) => w.name === "images").value || "[]").length
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

