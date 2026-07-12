# Image Optimizer (Bun Native)

An ultra-lean, high-performance image optimization tool built on [Bun's native Image API](https://bun.sh/docs/api/image). Zero external dependencies (no `node_modules`, no C++ compilation).

## Features

- **Blazing Fast:** Leverages Bun's built-in native image processing for incredible speed and zero overhead.
- **Zero Dependencies:** No need for `sharp` or complex build tools.
- **AI-Powered SEO Naming:** Automatically analyzes images using the Google Gemini API to generate descriptive `alt` text and SEO-friendly kebab-case filenames.
- **Batch Processing:** Handles thousands of images optimally.
- **Multiple Formats:** Support for JPEG, PNG, WebP, AVIF, and more.

## Prerequisites

- [Bun](https://bun.sh/) (Fast all-in-one JavaScript runtime)
- (Optional) Google AI Studio API Key for AI renaming.

## Installation

1. Install Bun (Windows):
   ```sh
   powershell -c "irm bun.sh/install.ps1 | iex"
   ```
2. Clone the repository:
   ```sh
   git clone https://github.com/sahillangoo/image-optimise-sharp.git
   cd image-optimise-sharp
   ```
3. Install dev-dependencies (Biome formatter):
   ```sh
   bun install
   ```

## Usage

1. Place images in the `input` directory.
2. Run the compression script:
   ```sh
   bun run compress
   ```

### AI-Powered Renaming (SEO)

To automatically rename your images based on their visual content and generate alt-text:

1. Create a `.env` file in the root.
2. Add your Gemini API key:
   ```env
   GEMINI_API_KEY="your-api-key-here"
   ```
3. Run the AI compress command:
   ```sh
   bun run compress:ai
   ```
This will output your processed images with SEO-friendly slugs (e.g., `snowy-mountain-peak.webp`) and generate an `seo-metadata.json` file in the output directory mapping the filenames to descriptive alt texts.

## Configuration

You can configure the script by modifying the `config` object in `index.mjs`:

```javascript
const config = {
	paths: {
		input: path.resolve(process.cwd(), "input"),
		output: path.resolve(process.cwd(), "output"),
	},
	image: {
		outputFormat: "webp", // "avif", "jpeg", "png"
		resizeWidth: 1920,
		resizeHeight: 1080,
		compressionQuality: 85,
		overwrite: true,
	},
	rename: {
		enabled: true,
		customName: "hotel-akbar-sonmarg", // Used as a fallback if AI is disabled
		preserveOriginal: false,
	},
};
```

## Development & Linting

This project uses [Biome](https://biomejs.dev/) for extremely fast code formatting and linting.

```sh
bun run format  # Auto-format all code
bun run lint    # Run the linter
bun run check   # Run both format and lint checks
```

## License

This project is licensed under the ISC License.
