/**
 * Simple test file for the rename module
 * Run with: node scripts/test-rename.mjs
 */

import {
	FilenameTracker,
	createRenamedPath,
	generateSequentialName,
	toKebabCase,
} from "./rename.mjs";

console.log("Testing Rename Module\n");

// Test 1: toKebabCase
console.log("Test 1: toKebabCase");
console.log("  My Photo Image.jpg ->", toKebabCase("My Photo Image"));
console.log("  project_image_2024 ->", toKebabCase("project_image_2024"));
console.log("  SomeFileName ->", toKebabCase("SomeFileName"));
console.log("  multiple   spaces ->", toKebabCase("multiple   spaces"));
console.log("");

// Test 2: generateSequentialName
console.log("Test 2: generateSequentialName");
console.log(
	"  project-image, 1, .webp ->",
	generateSequentialName("project-image", 1, ".webp"),
);
console.log(
	"  project-image, 42, .webp ->",
	generateSequentialName("project-image", 42, ".webp"),
);
console.log("  photo, 5, .jpg ->", generateSequentialName("photo", 5, ".jpg"));
console.log("");

// Test 3: createRenamedPath with kebab-case (customName null)
console.log("Test 3: createRenamedPath - Kebab-case mode");
const config1 = { enabled: true, customName: null };
console.log("  Input: input/My Photo.jpg");
console.log(
	"  Output:",
	createRenamedPath("input/My Photo.jpg", "output", "webp", config1),
);
console.log("");

// Test 4: createRenamedPath with custom name
console.log("Test 4: createRenamedPath - Custom name mode");
const config2 = { enabled: true, customName: "project-image" };
console.log("  Input: input/IMG_0001.jpg, index: 1");
console.log(
	"  Output:",
	createRenamedPath("input/IMG_0001.jpg", "output", "webp", config2, 1),
);
console.log("  Input: input/IMG_0002.jpg, index: 2");
console.log(
	"  Output:",
	createRenamedPath("input/IMG_0002.jpg", "output", "webp", config2, 2),
);
console.log("");

// Test 5: createRenamedPath disabled
console.log("Test 5: createRenamedPath - Disabled mode");
const config3 = { enabled: false, customName: null };
console.log("  Input: input/My Photo.jpg");
console.log(
	"  Output:",
	createRenamedPath("input/My Photo.jpg", "output", "webp", config3),
);
console.log("");

// Test 6: FilenameTracker
console.log("Test 6: FilenameTracker - Collision handling");
const tracker = new FilenameTracker();
console.log(
	"  First call: my-photo.webp ->",
	tracker.getUniquePath("output/my-photo.webp"),
);
console.log(
	"  Second call: my-photo.webp ->",
	tracker.getUniquePath("output/my-photo.webp"),
);
console.log(
	"  Third call: my-photo.webp ->",
	tracker.getUniquePath("output/my-photo.webp"),
);
console.log("");

console.log("All tests completed! ✓");
