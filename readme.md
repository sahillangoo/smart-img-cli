# Image Optimise Sharp

A blazing-fast, ultra-lean local CLI tool for bulk compressing and optimising images, natively powered by Bun's C++ Image API and local AI (LM Studio).

## 🚀 Features

- **Blazing Fast**: Compresses hundreds of images in seconds using maximum CPU concurrency.
- **Local AI SEO Renaming**: Automatically rename images based on visual contents (e.g. `snowy-mountain.webp`) using local vision models (zero cost, zero rate limits).
- **Decoupled Architecture**: Run compression and renaming phases independently!
- **Zero-Config Ready**: Comes with a `config.json` that is fully tweakable without diving into code.

## 📦 Installation

```bash
git clone https://github.com/sahillangoo/image-optimise-sharp.git
cd image-optimise-sharp
bun install
```

## 🛠️ Usage

Place your original images in the `input/` directory.

### 1. Basic Compression (Phase 1)
To only run high-speed compression without renaming:
```bash
bun run compress
```
This instantly compresses images and dumps them into `output/`.

### 2. AI SEO Renaming (Phase 2)
If you've already compressed images and want to run the local AI to rename them based on visual content:
```bash
bun run rename
```
*(Requires LM Studio running locally with a vision model loaded).*

### 3. Full Pipeline (Compression + Renaming)
To run compression and instantly follow it up with AI renaming:
```bash
bun run all
```

## ⚙️ Configuration (`config.json`)
All settings—including image resizing, output formats, and **AI Prompts**—are located in `config.json`. 

You can easily adjust the AI's system prompt to give it context about your specific images (e.g., *"These are real estate photos in Kashmir"*) without touching the JavaScript code!

## 📜 Scripts

- `bun run compress`: Run phase 1 (Compression)
- `bun run rename`: Run phase 2 (AI SEO Naming - ignores cached images)
- `bun run rename:force`: Run phase 2 but force re-generation for all images
- `bun run all`: Run both phases.
- `bun run lint`: Run Biome linter.

## License

MIT
