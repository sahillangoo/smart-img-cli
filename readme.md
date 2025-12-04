# Image Optimizer

A high-performance image optimization tool using [sharp](https://sharp.pixelplumbing.com/) with GPU acceleration support.

## Features

- GPU acceleration for faster processing (NVIDIA CUDA & OpenCL support)
- Optimized multi-threaded image processing
- Batch processing with memory management
- Support for multiple image formats (JPEG, PNG, WebP, AVIF)
- Progress visualization
- Detailed space-saving statistics
- Result caching for repeated operations

## Prerequisites

- Node.js (LTS version recommended)
- For GPU acceleration:
  - NVIDIA GPU with latest drivers (for CUDA support)
  - Or any OpenCL-compatible GPU (AMD, Intel, etc.)

## Installation

### Windows

1. Install Node.js:
   ```sh
   winget install "OpenJS.NodeJS.LTS"
   ```

2. Clone the repository:
   ```sh
   git clone https://github.com/sahillangoo/image-optimise-sharp.git
   cd image-optimise-sharp
   ```

3. Install dependencies:
   ```sh
   npm install
   ```

## Usage

1. Place images in the `input` directory.

2. Run the compression script:
   ```sh
   npm run compress
   ```

   For maximum compression:
   ```sh
   npm run compress:extreme
   ```

   For faster processing with less compression:
   ```sh
   npm run compress:fast
   ```

3. Check the `output` folder for the processed images.

## GPU Acceleration

The script automatically detects and utilizes GPU capabilities:

- NVIDIA GPUs: Uses CUDA acceleration when available
- AMD/Intel GPUs: Uses OpenCL acceleration when available
- Automatic fallback to CPU if GPU is not available or processing fails

To disable GPU acceleration, set `useGPU: false` in the config object.

## Configuration

You can configure the script by modifying the `config` object in [`index.mjs`](index.mjs):

```javascript
const config = {
  paths: {
    input: path.resolve(process.cwd(), 'input'),
    output: path.resolve(process.cwd(), 'output'),
    cache: path.resolve(process.cwd(), '.cache'),
  },
  image: {
    outputFormat: 'webp', // can be 'png', 'jpg', 'webp', 'avif'
    compressionQuality: 85, // compression quality, 0-100
    // ...other options
  },
  hardware: {
    useGPU: true,               // Enable GPU acceleration if available
    gpuDetection: true,         // Automatically detect GPU
    fallbackToCPU: true,        // Fall back to CPU if GPU processing fails
  },
  // ...other options
};
```

## Performance Tips

- For NVIDIA GPUs, ensure you have the latest graphics drivers installed
- For large image batches, the script will automatically manage memory usage
- When processing thousands of images, use the cache feature for faster reprocessing
- Delete the `.cache` directory or run `npm run clean` to clear cached results

## License

This project is licensed under the ISC License.
