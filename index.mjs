/*
Image Processing Script for Bun
Author: @sahillangoo
Functions:
- Recursively scan a directory for images
- Process each image using Bun's native Image API
- AI-Powered SEO Naming via Google Gemini API (when run with --ai)
- Resize, convert, and compress images
- Display the space saved and processing time
*/

import { promises as fs } from "node:fs";
import { cpus } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import chalk from "chalk";
import { FilenameTracker, createRenamedPath } from "./scripts/rename.mjs";

const useAI = process.argv.includes("--ai");
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const isGeminiEnabled =
	useAI && GEMINI_API_KEY && GEMINI_API_KEY !== "paste_your_key_here";

if (useAI && !isGeminiEnabled) {
	console.error(chalk.red("Error: --ai flag provided but GEMINI_API_KEY is missing or invalid in .env"));
	process.exit(1);
}

const config = {
	paths: {
		input: path.resolve(process.cwd(), "input"),
		output: path.resolve(process.cwd(), "output"),
	},
	image: {
		outputFormat: "webp",
		resizeWidth: 1920,
		resizeHeight: 1080,
		compressionQuality: 85,
		overwrite: true,
		supportedFormats: [
			".jpg",
			".jpeg",
			".png",
			".webp",
			".tiff",
			".avif",
			".gif",
		],
	},
	rename: {
		enabled: true,
		customName: "hotel-akbar-sonmarg",
		preserveOriginal: false,
	},
	// To avoid hitting 15 RPM limit on Gemini Free Tier, process sequentially if enabled
	concurrency: isGeminiEnabled ? 1 : Math.max(1, cpus().length),
};

const filenameTracker = new FilenameTracker();
const globalSeoMetadata = {};

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

const getSEOMetadata = async (inputPath) => {
	if (!isGeminiEnabled) return null;
	try {
		const b64 = await Bun.file(inputPath)
			.image()
			.resize(512, 512, { fit: "inside" })
			.jpeg({ quality: 60 })
			.toBase64();
		const body = {
			contents: [
				{
					parts: [
						{
							text: "Analyze this image and return a strict JSON object with two fields: 'slug' (a 3-5 word kebab-case string representing the image contents, e.g. 'snowy-mountain-peak') and 'alt' (a descriptive alt text sentence for visually impaired users).",
						},
						{ inline_data: { mime_type: "image/jpeg", data: b64 } },
					],
				},
			],
			generationConfig: { response_mime_type: "application/json" },
		};

		const res = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			},
		);

		if (!res.ok)
			throw new Error(`API Error ${res.status}: ${await res.text()}`);

		const data = await res.json();
		const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
		if (text) return JSON.parse(text);
	} catch (err) {
		console.error(
			chalk.yellow(
				`AI Naming failed for ${path.basename(inputPath)}: ${err.message}`,
			),
		);
	}
	return null;
};

const createOutputPath = (inputPath, index, aiSlug) => {
	if (aiSlug) {
		const desiredPath = path.join(
			config.paths.output,
			`${aiSlug}.${config.image.outputFormat}`,
		);
		return filenameTracker.getUniquePath(desiredPath); // Ensure uniqueness
	}

	if (!config.rename.enabled || config.rename.preserveOriginal) {
		return path.join(
			config.paths.output,
			`${path.parse(path.basename(inputPath)).name}.${config.image.outputFormat}`,
		);
	}
	const desiredPath = createRenamedPath(
		inputPath,
		config.paths.output,
		config.image.outputFormat,
		config.rename,
		index,
	);
	if (!config.rename.customName && config.rename.enabled) {
		return filenameTracker.getUniquePath(desiredPath);
	}
	return desiredPath;
};

const processImage = async (inputPath, index) => {
	try {
		const start = performance.now();

		let aiSlug = null;
		let aiAlt = null;

		if (isGeminiEnabled) {
			console.log(
				chalk.gray(`Analyzing ${path.basename(inputPath)} with Gemini...`),
			);
			const metadata = await getSEOMetadata(inputPath);
			if (metadata?.slug) {
				aiSlug = metadata.slug;
				aiAlt = metadata.alt;
			}
		}

		const outputPath = createOutputPath(inputPath, index, aiSlug);

		if (!config.image.overwrite) {
			try {
				await fs.access(outputPath);
				console.log(
					chalk.yellow(
						`Image already exists, skipping: ${path.basename(outputPath)}`,
					),
				);
				return 0;
			} catch {
				// File does not exist, proceed
			}
		}

		let image = Bun.file(inputPath).image();

		if (config.image.resizeWidth || config.image.resizeHeight) {
			image = image.resize(
				config.image.resizeWidth,
				config.image.resizeHeight,
				{
					fit: "inside",
				},
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

		await image.write(outputPath);

		if (aiSlug && aiAlt) {
			globalSeoMetadata[path.basename(outputPath)] = aiAlt;
		}

		const initialSize = (await fs.stat(inputPath)).size;
		const finalSize = (await fs.stat(outputPath)).size;
		const spaceSaved = initialSize - finalSize;
		const percentSaved = ((spaceSaved / initialSize) * 100).toFixed(2);
		const timeTaken = (performance.now() - start).toFixed(2);

		console.log(
			chalk.green(`Processed: ${path.basename(outputPath)} in ${timeTaken}ms`),
		);
		console.log(
			`Compressed: ${formatBytes(initialSize)} ==> ${formatBytes(finalSize)} (${percentSaved}% saved) 🔥`,
		);

		// Respect Free Tier Rate limits (15 RPM -> 1 request per 4s)
		if (isGeminiEnabled) {
			await new Promise((r) => setTimeout(r, 4000));
		}

		return spaceSaved;
	} catch (err) {
		console.error(
			chalk.red(`Error processing ${path.basename(inputPath)}: ${err.message}`),
		);
		return 0;
	}
};

const processBatch = async (files) => {
	const chunks = [];
	for (let i = 0; i < files.length; i += config.concurrency) {
		chunks.push(files.slice(i, i + config.concurrency));
	}

	let totalSaved = 0;
	let index = 1;
	for (let i = 0; i < chunks.length; i++) {
		console.log(
			chalk.blue(
				`Processing batch ${i + 1}/${chunks.length} (${chunks[i].length} images)`,
			),
		);
		const promises = chunks[i].map(async (file) => {
			const saved = await processImage(file, index++);
			return saved;
		});
		const results = await Promise.all(promises);
		totalSaved += results.reduce((acc, val) => acc + val, 0);
		if (global.gc) global.gc();
	}
	return totalSaved;
};

const run = async () => {
	console.time("Total processing time");
	try {
		await fs.mkdir(config.paths.output, { recursive: true });

		console.log(chalk.blue(`Scanning input directory: ${config.paths.input}`));
		const files = await scanDirectory(config.paths.input);

		if (files.length === 0) {
			console.log(chalk.yellow("No image files found in the input directory."));
			return;
		}

		console.log(
			chalk.blue(`Found ${files.length} image files for processing.`),
		);
		if (isGeminiEnabled) {
			console.log(
				chalk.cyan(
					"Gemini AI SEO Naming ENABLED! (Rate-limited to 15 RPM for free tier)",
				),
			);
		}
		console.log(chalk.blue(`Using concurrency limit of ${config.concurrency}`));

		const totalSpaceSaved = await processBatch(files);

		if (Object.keys(globalSeoMetadata).length > 0) {
			const metaPath = path.join(config.paths.output, "seo-metadata.json");
			await fs.writeFile(metaPath, JSON.stringify(globalSeoMetadata, null, 2));
			console.log(
				chalk.cyan(
					`✅ Saved SEO metadata for ${Object.keys(globalSeoMetadata).length} images to ${metaPath}`,
				),
			);
		}

		console.log(
			chalk.green(
				`\n🎉 All done! ${files.length} files processed successfully.`,
			),
		);
		console.log(
			chalk.green(`Total space saved: ${formatBytes(totalSpaceSaved)}`),
		);
		console.timeEnd("Total processing time");
	} catch (err) {
		console.error(chalk.red(`Fatal error: ${err.message}`));
	}
};

run();
