# Smart Img CLI

Lightning-fast image compression and local AI-powered SEO renaming, built on Bun and LM Studio.

## 🚀 Features

- **Blazing Fast**: Compresses hundreds of images in seconds using maximum CPU concurrency.
- **Local AI SEO Renaming**: Automatically rename images based on visual contents (e.g. `snowy-mountain.webp`) using local vision models (zero cost, zero rate limits).
- **Decoupled Architecture**: Run compression and renaming phases independently!
- **Zero-Config Ready**: Comes with a `config.json` that is fully tweakable without diving into code.

## 📋 Prerequisites

Make sure you have the following installed before getting started:
- **[Bun](https://bun.sh/)**: Required for running the tool.
- **[LM Studio](https://lmstudio.ai/)**: Required if you want to use the AI SEO Renaming feature.
- **Gemma 4 Model**: You can download the recommended Gemma 4 model directly from within the LM Studio app by searching for it, or download it from [Hugging Face](https://huggingface.co/models?search=gemma-4).

## 📦 Installation

```bash
git clone https://github.com/sahillangoo/smart-img-cli.git
cd smart-img-cli
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
*(Requires LM Studio running locally with a vision model loaded. **Gemma 4** LLM is highly recommended).*

### 3. Full Pipeline (Compression + Renaming)
To run compression and instantly follow it up with AI renaming:
```bash
bun run all
```

## ⚙️ Configuration (`config.json`)

The tool is completely driven by `config.json`. You can tweak all settings—including image sizing, output formats, and AI prompts—without touching any code. 

Here is a breakdown of all available options:

### `paths`
Controls where the CLI looks for files and saves states:
- `input`: Directory for your original, unoptimized images (default: `"input"`).
- `output`: Directory where compressed/renamed images are saved (default: `"output"`).
- `state` / `cache`: Internal JSON files used to track progress and cache AI responses so you aren't reprocessing identical files.

### `image`
Settings for Bun's native compression phase:
- `outputFormat`: The format to convert images into (e.g. `"webp"`, `"avif"`, `"jpg"`).
- `resizeWidth` / `resizeHeight`: Target dimensions for images (default: `1920x1080`). Images are scaled proportionally.
- `compressionQuality`: Number from `1-100`. Higher means better quality but larger file size (default: `85`).
- `overwrite`: Whether to overwrite existing files in the output directory (default: `true`).
- `supportedFormats`: List of input file extensions the tool will look for.

### `rename`
Settings for the AI SEO renaming phase:
- `enabled`: Set to `false` to disable renaming globally.
- `customName`: A base name/prefix added to all files (e.g. `"hotel-akbar-sonmarg"`).
- `preserveOriginal`: If `true`, keeps the original filename alongside the AI generated tags.

### `ai`
Settings for communicating with LM Studio:
- `endpoint`: The local LM Studio API endpoint (default: `"http://127.0.0.1:1234/v1/chat/completions"`).
- `model`: The model identifier (LM Studio usually ignores this and uses whatever is loaded).
- `temperature`: Creativity of the AI (default: `0.7`). Lower means more literal descriptions.
- `systemPrompt`: The system instructions for the AI. **Adjust this to give context about your specific images.** (e.g., *"You are an expert SEO image captioner for 'Hotel Akbar Sonmarg'..."*)
- `userPrompt`: The actual request sent per image (e.g., *"Caption this image using exactly 3 to 5 descriptive words..."*).

## 📜 Scripts

- `bun run compress`: Run phase 1 (Compression)
- `bun run rename`: Run phase 2 (AI SEO Naming - ignores cached images)
- `bun run rename:force`: Run phase 2 but force re-generation for all images
- `bun run all`: Run both phases.
- `bun run lint`: Run Biome linter.

## License

MIT
