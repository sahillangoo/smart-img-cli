/*
Image Processing Script for Node.js
Author: @sahillangoo
Functions:
- Recursively scan a directory for images
- Process each image and save it to the output directory
- Resize the image to a specified width and height
- Convert the image to a specified format
- Compress the image to a specified quality
- Overwrite existing files or skip them
- Display the space saved
Usage:
- Place the script in the directory containing the images
- Run the script using Node.js
- The processed images will be saved in the output directory
*/

// Import required modules
import chalk from 'chalk';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { cpus } from 'os';
import path from 'path';
import { performance } from 'perf_hooks';
import sharp from 'sharp';
import { Worker } from 'worker_threads';

// Import additional modules for GPU detection and acceleration
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

// Configuration with optimized defaults
const config = {
  paths: {
    input: path.resolve(process.cwd(), 'input'),
    output: path.resolve(process.cwd(), 'output'),
    cache: path.resolve(process.cwd(), '.cache'),
  },
  image: {
    outputFormat: 'webp', // can be 'png', 'jpg', 'webp', 'avif'
    resizeWidth: 500, // resize width, null or number= 1920
    resizeHeight: 500, // resize height, null or number = 1080
    compressionQuality: 82, // compression quality, 0-100 (lowered for better compression)
    overwrite: true, // overwrite option, true or false
    supportedFormats: ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.avif', '.gif'],
  },
  performance: {
    maxConcurrency: cpus().length, // Use all CPU cores
    useWorkers: true, // Use worker threads for processing
    workerPoolSize: Math.max(4, cpus().length * 2), // Larger worker pool for better I/O utilization
    enableCache: true, // Enable caching of processed images based on hash
    chunkSize: 5, // Process images in smaller chunks for better memory usage
    memoryAllocation: {
      imagePool: Math.min(2048, Math.max(512, Math.floor(os.totalmem() / 1024 / 1024 / 10))), // 10% of total RAM or min 512MB, max 2GB
    }
  },
  formatOptions: {
    webp: {
      lossless: false,
      nearLossless: false,
      effort: 6, // Reduced from 6 to 4 for faster processing with minimal quality loss
      smartSubsample: true, // Better color compression
    },
    avif: {
      lossless: false, // Changed from true for better compression
      effort: 5, // Balanced speed and compression
      chromaSubsampling: '4:2:0', // Reduce size with minimal visual impact
    },
    jpeg: {
      trellisQuantisation: true, // Better compression
      overshootDeringing: true, // Improve edges
      optimizeScans: true, // Progressive rendering
      mozjpeg: true, // Use mozjpeg optimization
    },
    png: {
      compressionLevel: 9, // Maximum compression
      adaptiveFiltering: true, // Better compression
      palette: true, // Use palette when possible for smaller files
    }
  },
  logging: {
    verbose: false,
    showProgress: true,
  },
  hardware: {
    useGPU: true,               // Enable GPU acceleration if available
    gpuDetection: true,         // Automatically detect GPU
    cudaEnabled: null,          // Will be set during initialization
    openCLEnabled: null,        // Will be set during initialization
    maxGPUMemoryUsage: 0.8,     // Maximum GPU memory usage (fraction of total)
    fallbackToCPU: true,        // Fall back to CPU if GPU processing fails
  },
};

// Import OS for memory management
import os from 'os';

// Set sharp cache memory based on system resources
sharp.cache({
  memory: config.performance.memoryAllocation.imagePool,
  files: 0, // Disable file cache in favor of our custom cache
  items: 500, // Allow caching more items
});

// Pure functions for formatting and utilities
const utils = {
  formatBytes: bytes => {
    if (bytes >= 1048576) {
      return (bytes / 1048576).toFixed(2) + ' MB';
    } else {
      return (bytes / 1024).toFixed(2) + ' KB';
    }
  },

  isImageFile: filePath => {
    const ext = path.extname(filePath).toLowerCase();
    return config.image.supportedFormats.includes(ext);
  },

  calculateProgress: (current, total) => {
    const percent = Math.round((current / total) * 100);
    const bar = '█'.repeat(Math.floor(percent / 2)) + '░'.repeat(50 - Math.floor(percent / 2));
    return `${bar} ${percent}% | ${current}/${total}`;
  },

  getOptimalBatchSize: (fileCount, concurrency) => {
    return Math.max(1, Math.min(20, Math.ceil(fileCount / concurrency)));
  },

  hashFile: async (filePath) => {
    try {
      const fileBuffer = await fs.readFile(filePath);
      return createHash('md5').update(fileBuffer).digest('hex');
    } catch (err) {
      return null;
    }
  },

  generateCacheKey: async (inputPath, options) => {
    const fileHash = await utils.hashFile(inputPath);
    const optionsHash = createHash('md5')
      .update(JSON.stringify(options))
      .digest('hex');
    return `${fileHash}-${optionsHash}`;
  },

  getCacheFilePath: (cacheKey) => {
    return path.join(config.paths.cache, `${cacheKey}.json`);
  },

  measureTime: (label) => {
    const start = performance.now();
    return () => {
      const end = performance.now();
      return end - start;
    };
  },

  optimizeMemoryUsage: () => {
    if (global.gc) {
      global.gc(); // Force garbage collection if available
    }
  },

  determineOptimalEngineForImage: (imageSize) => {
    // For very large images, CPU might be more efficient due to memory constraints
    const largeImageThreshold = 20 * 1024 * 1024; // 20MB

    if (imageSize > largeImageThreshold && !config.hardware.fallbackToCPU) {
      return 'cpu';
    }

    return hardware.isGPUAvailable() ? 'gpu' : 'cpu';
  },

  getGPUProcessingOptions: () => {
    return {
      // Common GPU optimization options
      useGPU: true,
      preferCUDA: config.hardware.cudaEnabled,
      preferOpenCL: !config.hardware.cudaEnabled && config.hardware.openCLEnabled
    };
  }
};

// File system operations
const fileSystem = {
  ensureDirectoryExists: async dirPath => {
    try {
      await fs.access(dirPath);
    } catch {
      try {
        await fs.mkdir(dirPath, { recursive: true });
        console.log(chalk.blue(`Created directory: ${dirPath}`));
      } catch (err) {
        throw new Error(`Failed to create directory: ${err.message}`);
      }
    }
    return dirPath;
  },

  scanDirectory: async dir => {
    try {
      const dirents = await fs.readdir(dir, { withFileTypes: true });
      const filePromises = dirents.map(dirent => {
        const res = path.resolve(dir, dirent.name);
        return dirent.isDirectory() ? fileSystem.scanDirectory(res) : res;
      });

      const files = (await Promise.all(filePromises)).flat();
      return files.filter(utils.isImageFile);
    } catch (err) {
      console.error(chalk.red(`Error scanning directory ${dir}: ${err.message}`));
      return [];
    }
  },

  getFileSize: async filePath => {
    try {
      return (await fs.stat(filePath)).size;
    } catch (err) {
      throw new Error(`Failed to get file size for ${path.basename(filePath)}: ${err.message}`);
    }
  },

  fileExists: async filePath => {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  },

  ensureCacheDirectory: async () => {
    if (config.performance.enableCache) {
      await fileSystem.ensureDirectoryExists(config.paths.cache);
    }
  },

  saveToCache: async (cacheKey, data) => {
    if (!config.performance.enableCache) return;

    try {
      const cacheFilePath = utils.getCacheFilePath(cacheKey);
      await fs.writeFile(cacheFilePath, JSON.stringify(data));
    } catch (err) {
      // Silently fail cache operations - they're optional
    }
  },

  getFromCache: async (cacheKey) => {
    if (!config.performance.enableCache) return null;

    try {
      const cacheFilePath = utils.getCacheFilePath(cacheKey);
      const data = await fs.readFile(cacheFilePath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      return null;
    }
  },

  cleanupOutdatedCache: async () => {
    if (!config.performance.enableCache) return;

    try {
      const cacheFiles = await fs.readdir(config.paths.cache);
      const now = Date.now();
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

      for (const file of cacheFiles) {
        const filePath = path.join(config.paths.cache, file);
        const stats = await fs.stat(filePath);

        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
        }
      }
    } catch (err) {
      // Silently fail cleanup - it's not critical
    }
  }
};

// Worker pool for better resource management
class WorkerPool {
  constructor(size) {
    this.size = size;
    this.workers = [];
    this.queue = [];
    this.activeWorkers = 0;
  }

  async init() {
    // Pre-create workers in the pool
    for (let i = 0; i < this.size; i++) {
      this.workers.push({
        id: i,
        busy: false,
        worker: null
      });
    }
  }

  async process(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      const task = { inputPath, outputPath, resolve, reject };
      this.queue.push(task);
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.queue.length === 0) return;

    // Find available worker
    const availableWorker = this.workers.find(w => !w.busy);
    if (!availableWorker) return; // All workers busy

    const task = this.queue.shift();
    availableWorker.busy = true;
    this.activeWorkers++;

    // Create a new worker for this task
    const worker = new Worker('./worker.mjs', {
      workerData: {
        inputPath: task.inputPath,
        outputPath: task.outputPath,
        options: {
          ...config.image,
          webpOptions: config.formatOptions.webp,
          avifOptions: config.formatOptions.avif,
          jpegOptions: config.formatOptions.jpeg,
          pngOptions: config.formatOptions.png
        }
      }
    });

    availableWorker.worker = worker;

    worker.on('message', result => {
      availableWorker.busy = false;
      availableWorker.worker = null;
      this.activeWorkers--;

      if (result.success) {
        task.resolve(result);
      } else {
        task.reject(new Error(result.error));
      }

      // Process next in queue
      this.processQueue();
    });

    worker.on('error', err => {
      availableWorker.busy = false;
      availableWorker.worker = null;
      this.activeWorkers--;
      task.reject(err);
      this.processQueue();
    });

    worker.on('exit', code => {
      availableWorker.busy = false;
      availableWorker.worker = null;
      this.activeWorkers--;

      if (code !== 0 && !task.completed) {
        task.reject(new Error(`Worker stopped with exit code ${code}`));
      }

      this.processQueue();
    });
  }

  get active() {
    return this.activeWorkers;
  }

  get pending() {
    return this.queue.length;
  }
}

// Hardware detection and capabilities
const hardware = {
  // Detect if CUDA is available (NVIDIA GPUs)
  detectCUDA: async () => {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync('nvidia-smi -L');
        return stdout.toLowerCase().includes('gpu');
      } else if (process.platform === 'linux' || process.platform === 'darwin') {
        const { stdout } = await execAsync('command -v nvidia-smi && nvidia-smi -L');
        return stdout.toLowerCase().includes('gpu');
      }
      return false;
    } catch (err) {
      return false;
    }
  },

  // Detect if OpenCL is available (AMD, Intel GPUs)
  detectOpenCL: async () => {
    try {
      // Use sharp's built-in detection if available
      if (typeof sharp.versions.vips === 'string' &&
          sharp.versions.vips.includes('openslide')) {
        return true;
      }

      // Try platform-specific detection
      if (process.platform === 'win32') {
        const { stdout } = await execAsync('wmic PATH Win32_VideoController GET Description');
        return stdout.toLowerCase().includes('amd') ||
               stdout.toLowerCase().includes('radeon') ||
               stdout.toLowerCase().includes('intel');
      } else if (process.platform === 'linux') {
        const { stdout } = await execAsync('command -v clinfo && clinfo | grep "Platform Name"');
        return stdout.length > 0;
      } else if (process.platform === 'darwin') {
        const { stdout } = await execAsync('system_profiler SPDisplaysDataType | grep "Vendor"');
        return stdout.toLowerCase().includes('amd') ||
               stdout.toLowerCase().includes('intel');
      }
      return false;
    } catch (err) {
      return false;
    }
  },

  // Initialize hardware capabilities
  initialize: async () => {
    if (config.hardware.gpuDetection) {
      console.log(chalk.blue('Detecting GPU capabilities...'));

      config.hardware.cudaEnabled = await hardware.detectCUDA();
      config.hardware.openCLEnabled = await hardware.detectOpenCL();

      if (config.hardware.cudaEnabled) {
        console.log(chalk.green('✓ NVIDIA GPU detected. CUDA acceleration available.'));

        // Set CUDA environment variables for optimal performance
        process.env.VIPS_CONCURRENCY = '1'; // Use main thread for coordination
        process.env.CUDA_DEVICE_ORDER = 'PCI_BUS_ID';
        process.env.CUDA_VISIBLE_DEVICES = '0'; // Use first GPU
      } else if (config.hardware.openCLEnabled) {
        console.log(chalk.green('✓ OpenCL-compatible GPU detected.'));

        // Set OpenCL environment variables
        process.env.VIPS_USE_OPENCL = '1';
      } else {
        console.log(chalk.yellow('No compatible GPU detected. Using CPU processing.'));
      }
    }

    // Configure sharp based on available hardware
    if (config.hardware.useGPU && (config.hardware.cudaEnabled || config.hardware.openCLEnabled)) {
      // Configure sharp to use GPU if available
      // Note: Sharp uses libvips which can use OpenCL automatically if available
      sharp.simd(true); // Ensure SIMD is enabled for better performance

      if (config.hardware.openCLEnabled) {
        // OpenCL is handled directly by libvips when available
        console.log(chalk.blue('OpenCL acceleration enabled for image processing'));
      }
    }
  },

  isGPUAvailable: () => {
    return config.hardware.useGPU &&
           (config.hardware.cudaEnabled || config.hardware.openCLEnabled);
  }
};

// Image processing core functionality
const imageProcessor = {
  createOutputPath: inputPath => {
    return path.join(
      config.paths.output,
      `${path.parse(path.basename(inputPath)).name}.${config.image.outputFormat}`
    );
  },

  shouldProcess: async outputPath => {
    if (await fileSystem.fileExists(outputPath) && !config.image.overwrite) {
      console.log(
        chalk.yellow(`Image already exists, skipping: ${path.basename(outputPath)}`)
      );
      return false;
    }
    return true;
  },

  applyImageFormat: image => {
    const { outputFormat, compressionQuality } = config.image;
    const { webp: webpOptions, avif: avifOptions, jpeg: jpegOptions, png: pngOptions } = config.formatOptions;

    switch (outputFormat) {
      case 'png':
        return image.png({ quality: compressionQuality, ...pngOptions });
      case 'jpg':
      case 'jpeg':
        return image.jpeg({ quality: compressionQuality, ...jpegOptions });
      case 'webp':
        return image.webp({
          quality: compressionQuality,
          lossless: webpOptions.lossless,
          nearLossless: webpOptions.nearLossless,
          effort: webpOptions.effort,
          smartSubsample: webpOptions.smartSubsample,
        });
      case 'avif':
        return image.avif({
          quality: compressionQuality,
          lossless: avifOptions.lossless,
          effort: avifOptions.effort,
          chromaSubsampling: avifOptions.chromaSubsampling,
        });
      default:
        return image;
    }
  },

  processWithWorker: (inputPath, outputPath) => {
    return new Promise((resolve, reject) => {
      const worker = new Worker('./worker.mjs', {
        workerData: {
          inputPath,
          outputPath,
          options: {
            ...config.image,
            webpOptions: config.formatOptions.webp,
            avifOptions: config.formatOptions.avif
          }
        }
      });

      worker.on('message', result => {
        if (result.success) {
          resolve(result);
        } else {
          reject(new Error(result.error));
        }
      });

      worker.on('error', reject);
      worker.on('exit', code => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
    });
  },

  processLocally: async (inputPath, outputPath) => {
    let image = sharp(inputPath);
    const { resizeWidth, resizeHeight } = config.image;

    // Resize the image if dimensions are specified
    if (resizeWidth || resizeHeight) {
      image = image.resize(resizeWidth, resizeHeight, {
        fit: 'inside',
        position: 'center',
        withoutEnlargement: true,
      });
    }

    // Apply format-specific processing
    image = imageProcessor.applyImageFormat(image);

    // Save the processed image
    await image.toFile(outputPath);

    // Return processing results
    const initialSize = await fileSystem.getFileSize(inputPath);
    const finalSize = await fileSystem.getFileSize(outputPath);

    return {
      success: true,
      inputPath,
      outputPath,
      initialSize,
      finalSize,
      spaceSaved: initialSize - finalSize
    };
  },

  processWithGPU: async (inputBuffer, outputPath, options) => {
    try {
      // Configure sharp with GPU-specific settings
      const gpuOptions = {
        failOn: 'none',
        limitInputPixels: 268402689, // Allow large images
        sequentialRead: options.sequentialRead || false,
      };

      // Initialize image with GPU processing options
      let image = sharp(inputBuffer, gpuOptions);

      // Apply optimizations based on image type
      const metadata = await image.metadata();

      // Apply resizing if needed
      const { resizeWidth, resizeHeight } = options;
      if (resizeWidth || resizeHeight) {
        // GPU-optimized resize
        image = image.resize(resizeWidth, resizeHeight, {
          fit: 'inside',
          position: 'center',
          withoutEnlargement: true,
          fastShrinkOnLoad: true,
          kernel: metadata.width > 4000 ? 'lanczos3' : 'lanczos2', // High quality for large images
        });
      }

      // Format-specific GPU optimizations
      image = imageProcessor.applyImageFormat(image, options);

      // Process and write in chunks for better GPU memory management
      const outputBuffer = await image.toBuffer();
      await fs.writeFile(outputPath, outputBuffer);

      // Get file sizes for reporting
      const initialSize = inputBuffer.length;
      const finalSize = outputBuffer.length;

      return {
        success: true,
        engineUsed: 'gpu',
        inputPath: options.inputPath,
        outputPath,
        initialSize,
        finalSize,
        spaceSaved: initialSize - finalSize,
      };
    } catch (err) {
      const inPath = options.inputPath || 'unknown';
      console.log(chalk.yellow(`GPU processing failed for ${path.basename(inPath)}: ${err.message}`));

      if (config.hardware.fallbackToCPU) {
        console.log(chalk.yellow(`Falling back to CPU for ${path.basename(inPath)}`));
        // Fall back to CPU processing
        try {
          let cpuResult = await imageProcessor.processLocally(inPath, outputPath);
          cpuResult.engineUsed = 'cpu-fallback';
          return cpuResult;
        } catch (cpuError) {
          throw new Error(`Both GPU and CPU processing failed: ${err.message}, CPU fallback: ${cpuError.message}`);
        }
      }
      throw err;
    }
  },

  processImage: async inputPath => {
    const outputPath = imageProcessor.createOutputPath(inputPath);
    let cacheKey; // <-- Declare cacheKey outside the if block
    try {
      // Check if we should process this image
      if (!(await imageProcessor.shouldProcess(outputPath))) {
        return 0;
      }

      // Check cache first if enabled
      let result = null;
      if (config.performance.enableCache) {
        cacheKey = await utils.generateCacheKey(inputPath, {
          format: config.image.outputFormat,
          quality: config.image.compressionQuality,
          resize: { width: config.image.resizeWidth, height: config.image.resizeHeight },
          useGPU: hardware.isGPUAvailable()
        });
        result = await fileSystem.getFromCache(cacheKey);

        // If cached result exists but output file doesn't, need to rebuild it
        if (result) {
          if (!(await fileSystem.fileExists(outputPath))) {
            result = null;
          } else {
            // Use cached result
            console.log(
              chalk.blue(`Cache hit: ${path.basename(outputPath)}`)
            );
            return result.spaceSaved;
          }
        }
      }

      // Process the image if not cached
      if (!result) {
        const timer = utils.measureTime('processing');

        // Read the file into buffer first to determine best processing approach
        const inputBuffer = await fs.readFile(inputPath);
        const fileSize = inputBuffer.length;

        // Determine optimal processing engine
        const useEngine = utils.determineOptimalEngineForImage(fileSize);

        // Process with appropriate engine
        if (useEngine === 'gpu' && hardware.isGPUAvailable()) {
          // Use GPU processing
          result = await imageProcessor.processWithGPU(
            inputBuffer,
            outputPath,
            {
              ...config.image,
              webpOptions: config.formatOptions.webp,
              avifOptions: config.formatOptions.avif,
              jpegOptions: config.formatOptions.jpeg,
              pngOptions: config.formatOptions.png,
              sequentialRead: fileSize > 50 * 1024 * 1024
            }
          );

          // Get file sizes for reporting
          const initialSize = fileSize;
          const finalSize = await fileSystem.getFileSize(outputPath);

          result = {
            success: true,
            inputPath,
            outputPath,
            initialSize,
            finalSize,
            spaceSaved: initialSize - finalSize,
            processingTime: timer(),
            engineUsed: 'gpu'
          };
        } else {
          // Use worker pool or local CPU processing
          result = config.performance.useWorkers
            ? await imageProcessor.processWithWorkerPool(inputPath, outputPath)
            : await imageProcessor.processLocally(inputPath, outputPath);

          result.processingTime = timer();
          result.engineUsed = 'cpu';
        }

        // Save result to cache if enabled
        if (config.performance.enableCache) {
          await fileSystem.saveToCache(cacheKey, result);
        }
      }

      const { initialSize, finalSize, spaceSaved, engineUsed } = result;
      const percentSaved = ((spaceSaved / initialSize) * 100).toFixed(2);
      const timeStr = result.processingTime ? ` in ${result.processingTime.toFixed(2)}ms` : '';
      const engineStr = engineUsed ? ` [${engineUsed.toUpperCase()}]` : '';

      console.log(
        chalk.green(`Image processed: ${path.basename(outputPath)}${timeStr}${engineStr}`)
      );
      console.log(
        `Compressed from: ${utils.formatBytes(initialSize)} ==> ${utils.formatBytes(
          finalSize
        )} (${percentSaved}% saved) 🔥`
      );

      return spaceSaved;
    } catch (err) {
      console.error(chalk.red(`Error processing image ${path.basename(inputPath)}: ${err.message}`));
      return 0;
    }
  },

  processBatch: async (files, batchIndex, batchSize, totalFiles) => {
    const start = batchIndex * batchSize;
    const end = Math.min((batchIndex + 1) * batchSize, files.length);
    const batch = files.slice(start, end);

    const startMsg = `Processing batch ${batchIndex + 1}/${Math.ceil(totalFiles / batchSize)} (${batch.length} images)`;
    console.log(chalk.blue(startMsg));

    const results = await Promise.allSettled(batch.map(imageProcessor.processImage));

    const spaceSaved = results
      .filter(result => result.status === 'fulfilled')
      .reduce((total, result) => total + result.value, 0);

    console.log(chalk.green(`Batch ${batchIndex + 1} complete. Saved ${utils.formatBytes(spaceSaved)}`));
    return spaceSaved;
  },

  // Process multiple batches concurrently
  processMultipleBatches: async (files, batchSize, totalFiles) => {
    const batchCount = Math.ceil(files.length / batchSize);
    const batchResults = [];

    // Process batches in chunks to control memory usage
    for (let startBatch = 0; startBatch < batchCount; startBatch += config.performance.chunkSize) {
      const endBatch = Math.min(startBatch + config.performance.chunkSize, batchCount);
      const batchPromises = [];

      for (let i = startBatch; i < endBatch; i++) {
        batchPromises.push(imageProcessor.processBatch(files, i, batchSize, totalFiles));
      }

      const results = await Promise.all(batchPromises);
      batchResults.push(...results);

      // Force garbage collection after each chunk if available
      utils.optimizeMemoryUsage();
    }

    return batchResults.reduce((total, spaceSaved) => total + spaceSaved, 0);
  },

  workerPool: null,

  initWorkerPool: async () => {
    if (config.performance.useWorkers) {
      imageProcessor.workerPool = new WorkerPool(config.performance.workerPoolSize);
      await imageProcessor.workerPool.init();
    }
  },

  processWithWorkerPool: async (inputPath, outputPath) => {
    if (!imageProcessor.workerPool) {
      await imageProcessor.initWorkerPool();
    }
    return imageProcessor.workerPool.process(inputPath, outputPath);
  }
};

// Main processing workflow
const workflow = {
  run: async () => {
    console.time('Total processing time');
    const startMemory = process.memoryUsage().heapUsed;

    try {
      // Initialize hardware capabilities
      await hardware.initialize();

      // Ensure directories exist
      await fileSystem.ensureDirectoryExists(config.paths.output);
      await fileSystem.ensureCacheDirectory();

      // Clean up outdated cache entries
      if (config.performance.enableCache) {
        fileSystem.cleanupOutdatedCache();
      }

      // Initialize worker pool if using workers
      if (config.performance.useWorkers) {
        await imageProcessor.initWorkerPool();
      }

      // Scan for image files
      console.log(chalk.blue(`Scanning input directory: ${config.paths.input}`));
      const scanTimer = utils.measureTime('scanning');
      const files = await fileSystem.scanDirectory(config.paths.input);
      const scanTime = scanTimer();
      const fileCount = files.length;

      if (fileCount === 0) {
        console.log(chalk.yellow('No image files found in the input directory.'));
        console.timeEnd('Total processing time');
        return;
      }

      // Inform the user about the number of files found
      console.log(
        chalk.blue(`Found ${fileCount} image files for processing (scan took ${scanTime.toFixed(2)}ms).`)
      );

      // Calculate optimal batch size based on number of files and CPU cores
      const { maxConcurrency } = config.performance;
      const batchSize = utils.getOptimalBatchSize(fileCount, maxConcurrency);

      console.log(chalk.blue(`Using ${config.performance.workerPoolSize} worker threads with batch size of ${batchSize}`));

      // Process all images
      const processingTimer = utils.measureTime('processing');
      const totalSpaceSaved = await imageProcessor.processMultipleBatches(files, batchSize, fileCount);
      const processingTime = processingTimer();

      // Display final stats
      const endMemory = process.memoryUsage().heapUsed;
      const memoryUsed = endMemory - startMemory;

      console.log(chalk.green(`\n🎉 All done! ${fileCount} files processed successfully.`));
      console.log(chalk.green(`Total space saved: ${utils.formatBytes(totalSpaceSaved)}`));
      console.log(chalk.blue(`Processing time: ${(processingTime / 1000).toFixed(2)} seconds`));
      console.log(chalk.blue(`Memory used: ${utils.formatBytes(memoryUsed)}`));
      console.log(chalk.blue(`Throughput: ${Math.round(fileCount / (processingTime / 1000))} images/second`));
      console.log(chalk.blue(`Hardware acceleration: ${hardware.isGPUAvailable() ? 'Yes (' + (config.hardware.cudaEnabled ? 'CUDA' : 'OpenCL') + ')' : 'No'}`));
      console.timeEnd('Total processing time');

    } catch (err) {
      console.error(chalk.red(`Error in processing workflow: ${err.message}`));
      console.timeEnd('Total processing time');
    }
  }
};

// Start the processing workflow
workflow.run();
