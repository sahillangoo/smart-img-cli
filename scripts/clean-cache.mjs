import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cacheDir = path.resolve(__dirname, '..', '.cache');

async function cleanCache() {
  try {
    console.log(`Cleaning cache directory: ${cacheDir}`);

    try {
      await fs.access(cacheDir);

      // Read all files in the cache directory
      const files = await fs.readdir(cacheDir);
      console.log(`Found ${files.length} cache files to remove`);

      // Delete each file
      for (const file of files) {
        const filePath = path.join(cacheDir, file);
        await fs.unlink(filePath);
      }

      console.log('Cache cleaned successfully!');
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log('Cache directory does not exist, nothing to clean.');
      } else {
        throw err;
      }
    }
  } catch (err) {
    console.error(`Error cleaning cache: ${err.message}`);
    process.exit(1);
  }
}

cleanCache();
