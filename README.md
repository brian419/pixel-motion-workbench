# Pixel Motion Workbench

Pixel Motion Workbench is a local tool for turning an existing pixel-ready image into controlled pixel-art animation frames.

The project is built around one principle:

> **Preserve first. Transform second. Generate only what cannot be derived.**

Instead of asking a general image model to redraw an entire sprite for every animation frame, the workbench preserves the original sprite and applies explicit operations such as selection masks, pivots, rotation, and translation.

The long-term goal is to make it easier to create animation-ready PNG frames that can be refined in Aseprite and used in engines such as Godot.

## Current prototype status

The current prototype focuses on deterministic rigid-part motion. It is intentionally not an AI image-generation tool.

Implemented now:

- Load PNG, JPEG, and WebP source images.
- Drag and drop an image into the local web interface.
- Zoom the **Source Sprite** independently for more precise selection.
- Zoom the **Motion Preview** independently.
- Use **Move View** to drag around the zoomed source image.
- Draw a manual lasso around the part that should move.
- Set a pivot or hinge point.
- Rotate the selected part around that pivot.
- Translate the selected part on X and Y.
- Adjust rotation and translation with sliders.
- Type exact rotation and translation values when precision is needed.
- Preview the transformed frame immediately.
- Choose an output folder with the native macOS folder picker.
- Set the exported PNG filename.
- Save the candidate frame directly to the selected folder.
- Preserve the rest of the source image rather than regenerating it.

The current rigid transform deliberately leaves newly exposed pixels transparent. Automatic reconstruction of pixels that were hidden behind a moved component is a future problem and is not part of the current working prototype.

## Current workflow

```text
pixel-ready image
       ↓
zoom the Source Sprite if needed
       ↓
Move View to position the area precisely
       ↓
lasso the rigid part to move
       ↓
set its pivot / hinge
       ↓
rotate and/or translate
       ↓
inspect Motion Preview
       ↓
choose output folder + filename
       ↓
export PNG frame
       ↓
Aseprite cleanup / Godot
```

For a mechanical part such as a lever, the important idea is that the program moves the original selected pixels around an explicit hinge rather than asking a model to reinterpret what a lever should look like.

## Why this project exists

A text instruction such as `flip this lever downward` sounds simple, but a general image model has to infer many things at once:

- which pixels belong to the lever
- where the hinge is located
- which direction the lever should move
- what shape and length must be preserved
- which colors belong to the original palette
- which pixels in the rest of the machine must remain unchanged
- what should appear behind the lever after it moves

That can easily produce frames where a component detaches, changes dimensions, rotates around the wrong point, changes colors, or modifies unrelated areas.

Pixel Motion Workbench takes a more constrained approach: the user identifies the region, defines its attachment point, and specifies the transform. The software then calculates the frame from those explicit constraints.

## Relationship to Aseprite Image Pixel Converter

Pixel Motion Workbench is intended to complement the [Aseprite Image Pixel Converter](https://github.com/brian419/aseprite-image-pixel-converter), not replace Aseprite itself.

A practical pipeline is:

```text
reference or generated image
       ↓
Aseprite Image Pixel Converter
       ↓
pixel-ready source image
       ↓
Pixel Motion Workbench
       ↓
controlled animation frame
       ↓
Aseprite cleanup / additional frame work
       ↓
Godot
```

The converter prepares source artwork for pixel work. Pixel Motion Workbench focuses on moving pieces of that finished pixel artwork while preserving as much of the original as possible.

## Running locally

The current launcher is designed for macOS.

From the repository folder, run:

```bash
open start.command
```

The launcher:

1. moves into the repository directory,
2. creates `.venv` if needed,
3. installs the Python dependencies,
4. opens `http://127.0.0.1:8766`, and
5. starts the local server.

The current Python dependencies are lightweight:

- Flask
- Waitress

All rigid image transforms happen locally. Exported PNGs are written only to the output folder selected by the user.

## Current project structure

```text
pixel-motion-workbench/
├── README.md
├── requirements.txt
├── server.py
├── start.command
└── web/
    ├── app.js
    ├── controls.css
    ├── index.html
    ├── pan.css
    ├── pan.js
    └── styles.css
```

`server.py` hosts the local application and handles native folder-selection/export requests. The browser-side files handle selection, zooming, view movement, pivot placement, rigid transforms, preview, and UI controls.

## Current limitations

This is still an early prototype.

- Part selection is manual lasso selection.
- The lasso must be drawn carefully when the moving component touches stationary artwork.
- Rotation is a 2D screen-plane transform only.
- There is no depth or 3D hinge simulation.
- The tool does not reconstruct hidden artwork after a component moves.
- There is no animation timeline yet.
- There is no onion skinning yet.
- There is no automatic in-between frame generation yet.
- There is no mesh deformation yet.
- There is no generative model dependency.

These limitations are intentional while the rigid-motion workflow is being proven.

## Animation families

The longer-term project separates animation into different families rather than trying to solve every motion with one technique.

### 1. Mechanical and rigid motion

Best suited for objects that should preserve their shape while moving:

- levers
- doors and hatches
- gears
- drawers
- wheels
- pistons
- machine components
- crystals or artifacts moving along a path

The preferred approach is deterministic:

```text
part mask
+
pivot or attachment point
+
translation / rotation
+
original pixels
       ↓
new frame
```

This is the family implemented by the current prototype.

### 2. Deformation

Some objects need to change shape while preserving their identity:

- slime
- cloth
- tentacles
- branches
- character limbs
- flexible machine parts

These may eventually use control points, mesh warping, or other constrained deformation instead of regenerating the whole sprite.

### 3. Organic and generative motion

Some effects naturally change silhouette and topology from frame to frame:

- fire
- smoke
- explosions
- magical effects
- particles
- liquid effects

These are more reasonable candidates for constrained generative assistance. If generation is added, it should still be limited by the previous frame, palette, masks, anchors, and regions that are allowed to change.

## Preserve the original sprite

For a selected component, the workbench can already preserve the original pixel data while applying a rigid transform. Longer term, a component may track information such as:

```text
part mask
original pixel coordinates
palette indices
bounding dimensions
pivot point
parent attachment
allowed movement
```

That supports rules such as:

- keep unrelated pixels unchanged
- preserve dimensions
- preserve palette
- preserve the intended hinge
- keep motion constrained to the requested operation

## Hidden pixels and future reconstruction

Moving a component can reveal artwork that never existed in the original source image because it was hidden behind that component.

For example, rotating a lever away from a machine may expose part of the machine body that was completely covered in the original frame.

That is fundamentally different from rotation itself. The rigid transform can be calculated exactly, but the hidden pixels have to be reconstructed or supplied from somewhere else.

A future solution may use a narrowly constrained workflow such as:

```text
small missing region
       ↓
local reconstruction / inpainting
       ↓
palette and structure validation
       ↓
pixel cleanup if necessary
```

The project should avoid regenerating the entire sprite just to solve a small hidden region.

## Planned animation tools

Future versions may add:

- multiple frames
- frame timeline
- onion skinning
- loop preview
- frame stepping
- playback speed controls
- automatic in-between frames
- easing curves
- palette consistency checks
- attachment and shape validation
- constrained deformation
- narrowly targeted reconstruction tools

For rigid motion, intermediate frames can eventually be calculated without AI once the start state, end state, pivot, and timing curve are known.

Example:

```text
Frame 1   lever at -35°
Frame 2   lever at -21°
Frame 3   lever at  -7°
Frame 4   lever at   7°
Frame 5   lever at  21°
Frame 6   lever at  35°
```

## Possible future AI direction

If machine-learning support is eventually added, the project should favor narrow, controllable tasks rather than unrestricted text-to-image generation.

A possible interface could be:

```text
previous frame
+
change mask
+
pivot / direction / deformation data
+
existing palette
       ↓
next-frame candidate
```

Generation should be optional. Deterministic transforms remain the preferred solution whenever the result can be derived mathematically.

## Development roadmap

| Version | Planned capability | AI required? |
| --- | --- | --- |
| **0.1** | Rigid-part prototype: load image, lasso part, set pivot, rotate/translate, preview, choose output folder, export PNG | No |
| **0.2** | Multiple frames, timeline, onion skin, animation preview | No |
| **0.3** | Automatic in-between frame generation | No |
| **0.4** | Palette and shape consistency validation | No |
| **0.5** | Mesh or control-point deformation | No |
| **0.6** | Narrow reconstruction of newly exposed pixels | Maybe |
| **0.7** | Organic motion assistance for fire, smoke, slime, and similar effects | Possibly |
| **0.8** | Text instruction to structured animation operation | Small local model possible |
| **0.9** | Controlled generative next-frame candidates | Yes |
| **1.0** | PNG sequence, sprite sheet, Aseprite-friendly and Godot-friendly export workflow | Mixed |

The roadmap can change as each stage is tested.

## Branch workflow

- `main` is the stable backup/default branch.
- `development` is the normal integration branch for active work.
- Temporary feature or experiment branches should start from `development` and be removed after they are either integrated or rejected.

## Local-first design

Pixel Motion Workbench is intended to remain useful without a large local model or cloud image service.

The core architecture favors lightweight operations such as:

- masks
- pixel transforms
- geometry
- palette analysis
- interpolation
- validation

If generative backends are added later, they should be optional rather than required for the application to function.

## Research direction

The project is informed by research and experimentation in controllable image editing, sprite generation, pixel-native generation, mesh deformation, and palette-preserving image synthesis.

Useful references include:

- [DragDiffusion: Harnessing Diffusion Models for Interactive Point-based Image Editing](https://openaccess.thecvf.com/content/CVPR2024/html/Shi_DragDiffusion_Harnessing_Diffusion_Models_for_Interactive_Point-based_Image_Editing_CVPR_2024_paper.html)
- [Sprite Sheet Diffusion](https://arxiv.org/abs/2412.03685)
- [Palette: Image-to-Image Diffusion Models](https://research.google/pubs/palette-image-to-image-diffusion-models/)
- [Imputation of missing pixel art character poses with differentiable palette quantization](https://www.sciencedirect.com/science/article/pii/S1875952125001016)
- [PixelGPT 24x24](https://github.com/unstonio/pixelgpt-24x24)
- [VQ-Diffusion Pixel Art 16x16](https://huggingface.co/achsaf/vq-diffusion-pixelart-16x16)
- [PixelLLM experiment](https://github.com/danfking/pixel-llm)
- [Stretchy Studio](https://github.com/MangoLion/stretchystudio)
- [LibreSprite](https://github.com/LibreSprite/LibreSprite)

These references are research directions, not required dependencies of the current application.
