# Pixel Motion Workbench

Pixel Motion Workbench is a local tool for creating pixel-art animation frames from an existing pixel-ready image.

The project is built around a simple idea:

> **Preserve first. Transform second. Generate only what cannot be derived.**

Instead of asking an image model to redraw an entire sprite for every frame, Pixel Motion Workbench aims to preserve the original pixels, palette, proportions, and attachment points wherever possible. Motion is handled with explicit constraints such as pivots, masks, transforms, deformation controls, and animation phases.

The long-term goal is to make it easier to turn a finished pixel sprite into a sequence of animation-ready PNG frames that can be refined in Aseprite and used in engines such as Godot.

## Why this project exists

A text prompt such as `flip this lever downward` sounds simple, but a generic image model has to infer many things at once:

- which pixels belong to the lever
- where the hinge is located
- which direction the lever should move
- what shape and length must be preserved
- which colors belong to the original palette
- which pixels in the rest of the machine must remain unchanged
- what should appear behind the lever after it moves

That can easily produce frames where a component detaches, changes size, rotates around the wrong point, changes colors, or modifies unrelated parts of the sprite.

Pixel Motion Workbench takes a more constrained approach. A user can identify the part that should move, define how it is attached, specify the motion, and let the program calculate as much of the next frame as possible instead of redrawing everything.

## Intended workflow

```text
pixel-ready PNG
       ↓
select a movable or deformable region
       ↓
define motion constraints
       ↓
preserve original structure and palette
       ↓
create the next frame
       ↓
compare against previous frames
       ↓
repeat or generate in-between frames
       ↓
PNG sequence / sprite sheet
       ↓
Aseprite / Godot
```

Pixel Motion Workbench is intended to complement tools such as the [Aseprite Image Pixel Converter](https://github.com/brian419/aseprite-image-pixel-converter), not replace Aseprite itself.

A possible pipeline is:

```text
reference or generated image
       ↓
Aseprite Image Pixel Converter
       ↓
pixel-ready source image
       ↓
Pixel Motion Workbench
       ↓
animation frames
       ↓
Aseprite cleanup
       ↓
Godot
```

## Animation families

Different kinds of animation need different methods. The project is planned around three broad categories.

### 1. Mechanical and rigid motion

Best suited for objects that should keep the same shape while moving.

Examples:

- levers
- doors and hatches
- gears
- drawers
- wheels
- pistons
- machine components
- crystals or artifacts moving along a path

The preferred approach is deterministic rather than generative:

```text
part mask
+
pivot or attachment point
+
translation / rotation
+
original palette
       ↓
new frame
```

For example, a lever can be selected once, assigned a hinge point, and rotated around that exact point while the rest of the machine remains pixel-identical.

### 2. Deformation

Some objects need to change shape while still preserving their identity.

Examples:

- slime
- cloth
- tentacles
- branches
- character limbs
- soft bags
- flexible machine parts

These animations may use control points, mesh warping, or other constrained deformation rather than regenerating the sprite from scratch.

### 3. Organic and generative motion

Some effects naturally change silhouette and topology from frame to frame.

Examples:

- fire
- smoke
- explosions
- magical effects
- dissipating particles
- liquid effects

These are better candidates for controlled generative assistance. Even here, generation should be constrained by information such as:

- previous frame
- allowed palette
- animation phase
- anchor points
- maximum silhouette change
- regions that may change
- regions that must remain fixed

The goal is not to ask an image model to invent an unrelated next frame. The goal is to generate possible changes inside a well-defined set of rules.

## Preserve the original sprite

For a selected component, the tool should eventually be able to track information such as:

```text
part mask
original pixel coordinates
palette indices
bounding dimensions
pivot point
parent attachment
allowed movement
```

Whenever possible, transformed frames should reuse those original pixels rather than repainting them.

This makes it possible to enforce rules such as:

- attachment point stays connected
- length remains consistent
- palette does not change
- unrelated pixels remain unchanged
- movement follows the intended direction

## Hidden pixels and repair

Moving a component can expose pixels that were hidden in the original image.

For example, moving a lever may reveal a small section of the machine body that did not exist in the source frame.

Instead of regenerating the whole machine, the long-term plan is to repair only the newly exposed region:

```text
small missing region
       ↓
local reconstruction or inpainting
       ↓
snap result back to the sprite palette
       ↓
pixel cleanup if necessary
```

Generative AI is therefore treated as a targeted repair or assistance tool rather than the default animation engine.

## Candidate generation and validation

For operations that eventually use generation, the program should be able to create several possible frames and automatically reject obviously bad results.

Possible validation checks include:

- palette preservation
- attachment preservation
- object length and size deviation
- target angle or movement error
- unexpected changes outside the selected region
- excessive silhouette change
- unexpected new colors

The user can then choose from the strongest candidates instead of trusting a single generated result.

## Onion skinning and animation preview

Animation work needs visual comparison between frames. Planned preview tools include:

- previous-frame onion skin
- adjustable onion-skin opacity
- frame timeline
- loop preview
- frame stepping
- playback speed controls

The project is not intended to replace Aseprite's complete animation editor. These features exist to make generated or transformed frames easy to inspect before export.

## Automatic in-between frames

Rigid motion can often generate intermediate frames without AI.

For example:

```text
Frame 1   lever at -35°
Frame 2   lever at -21°
Frame 3   lever at  -7°
Frame 4   lever at   7°
Frame 5   lever at  21°
Frame 6   lever at  35°
```

Once a start state, end state, pivot, and motion path are known, Pixel Motion Workbench can calculate the frames in between.

Later versions may support timing curves such as:

- linear
- ease in
- ease out
- ease in/out
- overshoot
- bounce

## Text instructions

Natural-language instructions may eventually be supported, but text should describe intent rather than directly paint pixels.

For example:

```text
"flip this lever downward"
             ↓
command interpreter
             ↓
selected part: lever
operation: rotate
direction: clockwise
target angle: 35°
preserve attachment: yes
             ↓
motion engine
             ↓
next frame
```

This separates language understanding from pixel manipulation and gives the motion engine explicit constraints to follow.

## Possible pixel-native AI direction

If machine-learning support is added later, the project should favor a narrow next-frame problem rather than generic text-to-image generation.

A possible model interface could be:

```text
previous frame
+
motion mask
+
pivot / direction / deformation data
+
existing palette
       ↓
next frame candidate
```

Instead of predicting arbitrary RGB values, a future model could predict palette indices from the sprite's existing palette. That would prevent the model from inventing colors that do not belong to the asset.

## Development roadmap

| Version | Planned capability | AI required? |
| --- | --- | --- |
| **0.1** | Load a pixel PNG, select a part, mark a pivot, rotate or translate it, export the next frame | No |
| **0.2** | Multiple frames, timeline, onion skin, animation preview | No |
| **0.3** | Automatic in-between frame generation | No |
| **0.4** | Palette and shape consistency validation | No |
| **0.5** | Mesh or control-point deformation | No |
| **0.6** | Repair newly exposed pixels | Maybe |
| **0.7** | Organic motion assistance for fire, smoke, slime, and similar effects | Possibly |
| **0.8** | Text instruction to structured animation operation | Small local model possible |
| **0.9** | Controlled generative next-frame candidates | Yes |
| **1.0** | PNG sequence, sprite sheet, Aseprite-friendly and Godot-friendly export workflow | Mixed |

The exact roadmap may change as each stage is tested.

## First milestone

The first milestone deliberately avoids generative AI.

The initial proof of concept should be able to:

1. Load a pixel-art PNG.
2. Let the user select a rigid component such as a lever.
3. Let the user mark its attachment or pivot point.
4. Define a start and end position or angle.
5. Generate several structurally valid intermediate frames.
6. Keep unrelated pixels unchanged.
7. Preserve the original palette.
8. Preview the motion.
9. Export the frames as individual PNG files.

If this works reliably, more difficult animation types can be added one problem at a time.

## Local-first design

Pixel Motion Workbench is intended to run locally and remain useful without requiring a large generative model.

The core architecture should favor lightweight operations such as:

- masks
- pixel transforms
- palette analysis
- interpolation
- geometry
- validation
- small-region repair

If generative backends are added later, they should be optional and pluggable rather than required for the entire application.

A possible future architecture is:

```text
GeneratorBackend
    ├── deterministic only
    ├── small local model
    ├── local image model
    └── optional remote provider
```

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

These projects and papers are references for techniques and research directions. Pixel Motion Workbench is intended to develop its own workflow around constrained pixel animation and frame generation.
