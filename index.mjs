/*
Image Processing Script for Bun
Author: @sahillangoo
Functions:
- Recursively scan a directory for images
- Phase 1 (--compress): High-speed compression using Bun's native Image API (Max Concurrency)
- Phase 2 (--rename): Asynchronous Local AI-Powered SEO Naming via LM Studio (Sequential)
- Phase Tracking: Uses state.json to map inputs to outputs for decoupled processing.

🐎 Ponytail: Ultra-lean. Local execution, no rate limits, completely decoupled phases.
*/

import { promises as fs } from "node:fs";
import { cpus } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import chalk from "chalk";

import config from "./config.json";
import { FilenameTracker, createRenamedPath } from "./scripts/rename.mjs";
import { getSEOMetadata } from "./scripts/ai.mjs";

const runCompress =
	process.argv.includes("--compress") ||
	process.argv.includes("--all") ||
	(!process.argv.includes("--compress") && !process.argv.includes("--rename"));
const runRename =
	process.argv.includes("--rename") ||
	process.argv.includes("--all") ||
	(!process.argv.includes("--compress") && !process.argv.includes("--rename"));

const forceRename =
	process.argv.includes("--force-rename") ||
	process.argv.includes("--rename-force");

// Overwrite config paths to be absolute based on CWD
config.paths.input = path.resolve(process.cwd(), config.paths.input);
config.paths.output = path.resolve(process.cwd(), config.paths.output);
config.paths.state = path.join(config.paths.output, config.paths.state);
config.paths.cache = path.join(config.paths.output, config.paths.cache);
config.concurrency = Math.max(1, cpus().length);

const filenameTracker = new FilenameTracker();
const aiFilenameTracker = new FilenameTracker();

// Global State Caches
let globalSeoMetadata = {};
let appState = {};

const formatBytes = (bytes) => {
	if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
	return `${(bytes / 1024).toFixed(2)} KB`;
};

const isImageFile = (filePath) => {
	return config.image.supportedFormats.includes(
		path.extname(filePath).toLowerCase(),
	);
};

const scanDirectory = async (dir) => {
	try {
		const dirents = await fs.readdir(dir, { withFileTypes: true });
		const filePromises = dirents.map((dirent) => {
			const res = path.resolve(dir, dirent.name);
			return dirent.isDirectory() ? scanDirectory(res) : res;
		});
		const files = (await Promise.all(filePromises)).flat();
		return files.filter(isImageFile);
	} catch (err) {
		if (err.code === "ENOENT") return [];
		throw err;
	}
};

const loadStateAndCache = async () => {
	try {
		const existingMeta = await fs.readFile(config.paths.cache, "utf-8");
		const parsed = JSON.parse(existingMeta);
		if (
			Object.keys(parsed).length > 0 &&
			typeof Object.values(parsed)[0] === "object"
		) {
			globalSeoMetadata = parsed;
		}
	} catch {} // ignore missing cache

	try {
		const existingState = await fs.readFile(config.paths.state, "utf-8");
		appState = JSON.parse(existingState);
	} catch {} // ignore missing state
};

// PHASE 1: Compress an image
const processImagePhase1 = async (inputPath, index) => {
	try {
		const inputBasename = path.basename(inputPath);
		const fileHash = Bun.hash(await Bun.file(inputPath).arrayBuffer()).toString(16);

		let fallbackPath;
		if (!config.rename.enabled || config.rename.preserveOriginal) {
			fallbackPath = path.join(
				config.paths.output,
				`${path.parse(inputBasename).name}.${config.image.outputFormat}`,
			);
		} else {
			const desiredPath = createRenamedPath(
				inputPath,
				config.paths.output,
				config.image.outputFormat,
				config.rename,
				index,
			);
			fallbackPath = !config.rename.customName
				? filenameTracker.getUniquePath(desiredPath)
				: desiredPath;
		}

		if (!config.image.overwrite) {
			try {
				await fs.access(fallbackPath);
				appState[fileHash] = path.basename(fallbackPath);
				return { saved: 0, status: "skipped" };
			} catch {}
		}

		let image = Bun.file(inputPath).image();

		if (config.image.resizeWidth || config.image.resizeHeight) {
			image = image.resize(
				config.image.resizeWidth,
				config.image.resizeHeight,
				{ fit: "inside" },
			);
		}

		switch (config.image.outputFormat) {
			case "webp":
				image = image.webp({ quality: config.image.compressionQuality });
				break;
			case "jpeg":
			case "jpg":
				image = image.jpeg({ quality: config.image.compressionQuality });
				break;
			case "png":
				image = image.png();
				break;
			case "avif":
				image = image.avif({ quality: config.image.compressionQuality });
				break;
		}

		await image.write(fallbackPath);

		// Track current location of this input file
		appState[fileHash] = path.basename(fallbackPath);

		const initialSize = (await fs.stat(inputPath)).size;
		const finalSize = (await fs.stat(fallbackPath)).size;
		const spaceSaved = initialSize - finalSize;
		const percentSaved = ((spaceSaved / initialSize) * 100).toFixed(2);

		console.log(
			chalk.green(
				`Compressed: ${formatBytes(initialSize)} ==> ${formatBytes(finalSize)} (${percentSaved}% saved) 🔥`,
			),
		);

		return { saved: spaceSaved, status: "success" };
	} catch (err) {
		console.error(
			chalk.red(
				`Error compressing ${path.basename(inputPath)}: ${err.message}`,
			),
		);
		return { saved: 0, status: "error" };
	}
};

// PHASE 2: AI Rename a compressed image
const processImagePhase2 = async (fileHash, currentBasename) => {
	try {
		const currentPath = path.join(config.paths.output, currentBasename);

		// Verify file still exists
		try {
			await fs.access(currentPath);
		} catch {
			console.log(chalk.red(`File missing: ${currentBasename}`));
			return;
		}

		let aiSlug = null;
		let aiAlt = null;
		let outputBasename = currentBasename;

		if (!forceRename && globalSeoMetadata[fileHash]?.output) {
			// Cached
			outputBasename = globalSeoMetadata[fileHash].output;
			console.log(
				chalk.gray(`Skipping AI. Found cached rename for ${fileHash.substring(0, 8)}...`),
			);
		} else {
			// Needs AI
			console.log(chalk.gray(`Analyzing ${currentBasename} with AI...`));
			const metadata = await getSEOMetadata(currentPath);

			if (metadata?.slug) {
				aiSlug = metadata.slug;
				aiAlt = metadata.alt;

				// Generate new unique slug filename
				const desiredPath = path.join(
					config.paths.output,
					`${aiSlug}.${config.image.outputFormat}`,
				);
				const finalPath = aiFilenameTracker.getUniquePath(desiredPath);
				outputBasename = path.basename(finalPath);

				// Cache it
				globalSeoMetadata[fileHash] = {
					output: outputBasename,
					alt: aiAlt,
				};
			} else {
				console.log(
					chalk.yellow(
						`AI Naming failed. Keeping current name: ${outputBasename}`,
					),
				);
			}
		}

		// Rename the file if the AI gave it a new name (or if we fetched a new name from cache)
		if (outputBasename !== currentBasename) {
			const finalPath = path.join(config.paths.output, outputBasename);
			await fs.rename(currentPath, finalPath);
			// Update state Tracker so future runs know where this file went!
			appState[fileHash] = outputBasename;
			console.log(chalk.green(`Renamed -> ${outputBasename}`));
			return true;
		}
		return false;
	} catch (err) {
		console.error(chalk.red(`AI Rename Error for ${fileHash.substring(0, 8)}...: ${err.message}`));
		return false;
	}
};

const run = async () => {
	try {
		await fs.mkdir(config.paths.output, { recursive: true });
		await loadStateAndCache();

		if (runCompress) {
			console.time("Phase 1: Compression Time");
			console.log(
				chalk.blue(`Scanning input directory: ${config.paths.input}`),
			);
			const files = await scanDirectory(config.paths.input);

			if (files.length === 0) {
				console.log(
					chalk.yellow("No image files found in the input directory."),
				);
			} else {
				console.log(
					chalk.blue(
						`Phase 1: Compressing ${files.length} images (Concurrency: ${config.concurrency})...`,
					),
				);

				const chunks = [];
				for (let i = 0; i < files.length; i += config.concurrency) {
					chunks.push(files.slice(i, i + config.concurrency));
				}

				let totalSaved = 0;
				let index = 1;

				for (let i = 0; i < chunks.length; i++) {
					const promises = chunks[i].map(async (file) => {
						const res = await processImagePhase1(file, index++);
						return res.saved;
					});
					const results = await Promise.all(promises);
					totalSaved += results.reduce((acc, val) => acc + val, 0);
					if (global.gc) global.gc();
				}

				// Save state after compression so renaming phase knows what to target
				await fs.writeFile(
					config.paths.state,
					JSON.stringify(appState, null, 2),
				);

				console.log(
					chalk.green(
						`\n🎉 Phase 1 Complete! ${files.length} files compressed.`,
					),
				);
				console.log(
					chalk.green(`Total space saved: ${formatBytes(totalSaved)}`),
				);
				console.timeEnd("Phase 1: Compression Time");
				console.log(
					chalk.cyan("Your images are ready to use in the output folder!"),
				);
			}
		}

		if (runRename) {
			const stateEntries = Object.entries(appState);
			if (stateEntries.length === 0) {
				console.log(
					chalk.yellow(
						"No compressed images found in state.json. Run --compress first.",
					),
				);
			} else {
				console.log(
					chalk.magenta(
						`\n🤖 Phase 2: Starting AI Renaming (Press Ctrl+C to cancel if you don't want to wait)...`,
					),
				);

				let alreadyRenamed = 0;
				for (const [fileHash] of stateEntries) {
					if (!forceRename && globalSeoMetadata[fileHash]?.output) {
						alreadyRenamed++;
					}
				}
				const pending = stateEntries.length - alreadyRenamed;
				console.log(
					chalk.cyan(
						`📊 Status: ${stateEntries.length} total | ${alreadyRenamed} cached | ${pending} pending AI renaming`,
					),
				);

				// Local AI tokens process sequentially
				let newlyRenamed = 0;
				for (const [fileHash, currentBasename] of stateEntries) {
					const renamed = await processImagePhase2(fileHash, currentBasename);
					if (renamed) newlyRenamed++;
				}

				// Save cache and state
				if (Object.keys(globalSeoMetadata).length > 0) {
					await fs.writeFile(
						config.paths.cache,
						JSON.stringify(globalSeoMetadata, null, 2),
					);
					await fs.writeFile(
						config.paths.state,
						JSON.stringify(appState, null, 2),
					);
					console.log(chalk.cyan(`✅ Saved SEO metadata to ${config.paths.cache}`));
				}
				console.log(chalk.magenta(`🤖 Phase 2 Complete! ${newlyRenamed} images were successfully renamed this run.`));
			}
		}
	} catch (err) {
		console.error(chalk.red(`Fatal error: ${err.message}`));
	}
};

run();
