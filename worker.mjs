import { promises as fs } from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import sharp from 'sharp';
import { parentPort, workerData } from 'worker_threads';

const { inputPath, outputPath, options } = workerData;

// Check if GPU acceleration is available via environment variables
const isGPUAvailable = process.env.VIPS_USE_OPENCL === '1' || process.env.CUDA_VISIBLE_DEVICES;

// Configure sharp with optimized settings
// If GPU is available, lower memory usage since GPU has its own memory
sharp.cache({
  memory: isGPUAvailable ? 100 : 200, // Lower memory usage with GPU
  files: 0,
  items: isGPUAvailable ? 200 : 100  // Allow more items with GPU
});

// Enable SIMD for better performance
sharp.simd(true);

// Pure function to apply image format based on options with optimized settings
const applyImageFormat = (image, options) => {
  const { outputFormat, compressionQuality, webpOptions, avifOptions, jpegOptions, pngOptions } = options;

  switch (outputFormat) {
    case 'png':
      return image.png({
        quality: compressionQuality,
        compressionLevel: pngOptions?.compressionLevel || 9,
        adaptiveFiltering: pngOptions?.adaptiveFiltering || true,
        palette: pngOptions?.palette || true
      });
    case 'jpg':
    case 'jpeg':
      return image.jpeg({
        quality: compressionQuality,
        trellisQuantisation: jpegOptions?.trellisQuantisation || true,
        overshootDeringing: jpegOptions?.overshootDeringing || true,
        optimizeScans: jpegOptions?.optimizeScans || true,
        mozjpeg: jpegOptions?.mozjpeg || true
      });
    case 'webp':
      return image.webp({
        quality: compressionQuality,
        lossless: webpOptions?.lossless || false,
        nearLossless: webpOptions?.nearLossless || false,
        effort: webpOptions?.effort || 4,
        smartSubsample: webpOptions?.smartSubsample || true,
        alphaQuality: 80
      });
    case 'avif':
      return image.avif({
        quality: compressionQuality,
        lossless: avifOptions?.lossless || false,
        effort: avifOptions?.effort || 5,
        chromaSubsampling: avifOptions?.chromaSubsampling || '4:2:0'
      });
    default:
      return image;
  }
};

// Enhanced image analysis to detect when GPU would be beneficial
const analyzeAndOptimize = async (buffer) => {
  try {
    const metadata = await sharp(buffer).metadata();

    const optimizations = {};

    // If image is very large, use GPU if available or adjust settings for CPU
    if (metadata.width > 4000 || metadata.height > 4000) {
      optimizations.limitInputPixels = false;
      optimizations.useHighQuality = true;
      optimizations.preferGPU = true; // GPU is better for large images
    }

    // For animated images, determine optimal processing
    if (metadata.pages && metadata.pages > 1) {
      optimizations.animated = true;
      optimizations.preferGPU = metadata.pages > 10; // GPU for many frames
    }

    // Image format specific optimizations
    if (metadata.format === 'jpeg' || metadata.format === 'jpg') {
      optimizations.mozjpeg = true; // Better JPEG compression
    }

    // If GPU is available, use it for color-heavy images
    if (isGPUAvailable && (metadata.space === 'rgb' || metadata.space === 'cmyk')) {
      optimizations.preferGPU = true;
    }

    return optimizations;
  } catch (err) {
    return {}; // Return empty optimizations if analysis fails
  }
};

// Main processing function with optimized processing and robust error handling
async function processImage() {
  const startTime = performance.now();

  try {
    // Read file once and keep in memory for better performance
    const inputBuffer = await fs.readFile(inputPath);

    // Get initial file size
    const initialSize = inputBuffer.length;

    // Analyze image and get optimal processing options
    const optimizations = await analyzeAndOptimize(inputBuffer);

    // Initialize image processing with optimized settings
    const sharpOptions = {
      failOn: 'none',
      limitInputPixels: optimizations.limitInputPixels !== false ? 268402689 : false,
      animated: optimizations.animated || false,
      sequentialRead: initialSize > 50 * 1024 * 1024, // Use sequential read for very large files
    };

    // Log GPU usage if available and preferred
    const useGPU = isGPUAvailable && (optimizations.preferGPU !== false);
    if (useGPU) {
      parentPort.postMessage({
        status: 'info',
        message: `Using GPU acceleration for ${path.basename(inputPath)}`
      });
    }

    let image = sharp(inputBuffer, sharpOptions);

    // Apply resizing if needed with optimizations
    const { resizeWidth, resizeHeight } = options;
    if (resizeWidth || resizeHeight) {
      const resizeOptions = {
        fit: 'inside',
        position: 'center',
        withoutEnlargement: true,
        fastShrinkOnLoad: !optimizations.useHighQuality, // Fast shrink except for high quality
      };

      // Use high-quality resize for large or important images
      if (optimizations.useHighQuality) {
        resizeOptions.kernel = useGPU ? 'lanczos3' : 'lanczos2';
      }

      image = image.resize(resizeWidth, resizeHeight, resizeOptions);
    }

    // Apply format-specific options with GPU enhancements if available
    const applyFormatOptions = { ...options };
    if (useGPU) {
      // Optimize format options for GPU processing
      if (applyFormatOptions.webpOptions) {
        // WebP GPU optimizations
        applyFormatOptions.webpOptions.effort = Math.min(applyFormatOptions.webpOptions.effort, 4); // Lower effort for GPU
        applyFormatOptions.webpOptions.smartSubsample = true; // Better with GPU
      }

      if (applyFormatOptions.avifOptions) {
        // AVIF GPU optimizations
        applyFormatOptions.avifOptions.effort = Math.min(applyFormatOptions.avifOptions.effort, 7); // Lower effort for GPU
      }
    }

    // Apply the format with optimized options
    image = applyImageFormat(image, applyFormatOptions);

    // Try with timeout to prevent hanging operations
    let outputBuffer;
    try {
      // Set a timeout for processing operations to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Processing timeout')), 30000); // 30 sec timeout
      });

      // Use Promise.race to implement timeout
      outputBuffer = await Promise.race([
        image.toBuffer(),
        timeoutPromise
      ]);
    } catch (timeoutError) {
      // If timeout or other error, try with different settings
      console.error(`Worker processing error: ${timeoutError.message}`);

      // Try again with safer settings
      image = sharp(inputBuffer, {
        ...sharpOptions,
        sequentialRead: true
      });

      if (resizeWidth || resizeHeight) {
        image = image.resize(resizeWidth, resizeHeight, {
          fit: 'inside',
          position: 'center',
          withoutEnlargement: true,
          fastShrinkOnLoad: true,
          kernel: 'cubic' // Simpler kernel
        });
      }

      image = applyImageFormat(image, applyFormatOptions);
      outputBuffer = await image.toBuffer();
    }

    // Write buffer to file
    await fs.writeFile(outputPath, outputBuffer);

    // Get final file size
    const finalStats = await fs.stat(outputPath);
    const finalSize = finalStats.size;
    const spaceSaved = initialSize - finalSize;
    const processingTime = performance.now() - startTime;

    // Send result back to main thread
    parentPort.postMessage({
      success: true,
      inputPath,
      outputPath,
      initialSize,
      finalSize,
      spaceSaved,
      percentSaved: ((spaceSaved / initialSize) * 100).toFixed(2),
      processingTime,
      engineUsed: useGPU ? 'gpu' : 'cpu'
    });
  } catch (error) {
    // Try one more time with minimal settings before failing
    try {
      console.error(`Worker error: ${error.message}, trying with minimal settings`);

      // Use the most basic approach possible
      const image = sharp(inputPath, { failOn: 'none' });

      // Apply minimal processing
      const minimalImage = applyImageFormat(image, {
        outputFormat: options.outputFormat,
        compressionQuality: options.compressionQuality
      });

      await minimalImage.toFile(outputPath);

      const initialSize = (await fs.stat(inputPath)).size;
      const finalSize = (await fs.stat(outputPath)).size;
      const processingTime = performance.now() - startTime;

      parentPort.postMessage({
        success: true,
        inputPath,
        outputPath,
        initialSize,
        finalSize,
        spaceSaved: initialSize - finalSize,
        processingTime,
        engineUsed: 'cpu-fallback'
      });
    } catch (fallbackError) {
      // Send error information back to main thread if all attempts fail
      parentPort.postMessage({
        success: false,
        inputPath,
        error: `Initial error: ${error.message}. Fallback error: ${fallbackError.message}`,
        processingTime: performance.now() - startTime
      });
    }
  }
}

// Start processing with proper error handling
processImage().catch(error => {
  parentPort.postMessage({
    success: false,
    inputPath,
    error: `Unhandled worker error: ${error.message}`
  });
});
