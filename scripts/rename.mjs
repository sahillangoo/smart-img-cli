/**
 * Image Rename Module
 * Provides utilities for renaming images during processing
 * - Convert filenames to kebab-case
 * - Generate sequential numbered filenames with custom prefixes
 * - Handle duplicate names
 */

import path from "node:path";

/**
 * Convert a string to kebab-case
 * @param {string} str - The string to convert
 * @returns {string} - The kebab-case version
 */
export function toKebabCase(str) {
	return str
		.replace(/([a-z])([A-Z])/g, "$1-$2") // camelCase to kebab-case
		.replace(/[\s_]+/g, "-") // spaces and underscores to hyphens
		.replace(/[^\w-]+/g, "") // remove non-word chars except hyphens
		.replace(/-+/g, "-") // multiple hyphens to single hyphen
		.replace(/^-+/, "") // trim leading hyphens
		.replace(/-+$/, "") // trim trailing hyphens
		.toLowerCase();
}

/**
 * Generate a sequential filename with custom prefix
 * @param {string} customPrefix - The prefix to use (e.g., "project-image")
 * @param {number} index - The sequential number
 * @param {string} extension - The file extension (with dot)
 * @returns {string} - The formatted filename
 */
export function generateSequentialName(customPrefix, index, extension) {
	return `${customPrefix}-${index}${extension}`;
}

/**
 * Create renamed output path based on configuration
 * @param {string} inputPath - Original input file path
 * @param {string} outputDir - Output directory path
 * @param {string} outputFormat - Target format extension (without dot)
 * @param {Object} renameConfig - Rename configuration object
 * @param {boolean} renameConfig.enabled - Whether rename is enabled
 * @param {string|null} renameConfig.customName - Custom prefix for sequential naming
 * @param {number} [index] - Sequential index for numbering (required if customName is set)
 * @returns {string} - The complete output file path
 */
export function createRenamedPath(
	inputPath,
	outputDir,
	outputFormat,
	renameConfig,
	index = null,
) {
	const extension = `.${outputFormat}`;

	// If rename is not enabled, use original name
	if (!renameConfig.enabled) {
		const originalName = path.parse(path.basename(inputPath)).name;
		return path.join(outputDir, `${originalName}${extension}`);
	}

	// If customName is provided, generate sequential name
	if (renameConfig.customName) {
		if (index === null || index === undefined) {
			throw new Error(
				"Index is required when using customName for sequential numbering",
			);
		}
		const filename = generateSequentialName(
			renameConfig.customName,
			index,
			extension,
		);
		return path.join(outputDir, filename);
	}

	// Otherwise, convert to kebab-case
	const originalName = path.parse(path.basename(inputPath)).name;
	const kebabName = toKebabCase(originalName);
	return path.join(outputDir, `${kebabName}${extension}`);
}

/**
 * Handle potential filename collisions by tracking used names
 */
export class FilenameTracker {
	constructor() {
		this.usedNames = new Map(); // Map of basename -> count
	}

	/**
	 * Get a unique filename by appending a number if needed
	 * @param {string} desiredPath - The desired output path
	 * @returns {string} - A unique path (may have -1, -2, etc. appended)
	 */
	getUniquePath(desiredPath) {
		const dir = path.dirname(desiredPath);
		const ext = path.extname(desiredPath);
		const baseName = path.basename(desiredPath, ext);

		// Check if this name has been used
		if (!this.usedNames.has(baseName)) {
			this.usedNames.set(baseName, 1);
			return desiredPath;
		}

		// Name exists, append counter
		const count = this.usedNames.get(baseName);
		this.usedNames.set(baseName, count + 1);

		const uniqueName = `${baseName}-${count}${ext}`;
		return path.join(dir, uniqueName);
	}

	/**
	 * Reset the tracker
	 */
	reset() {
		this.usedNames.clear();
	}
}
