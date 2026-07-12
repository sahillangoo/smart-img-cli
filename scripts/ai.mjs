import chalk from "chalk";
import config from "../config.json";

export const getSEOMetadata = async (imagePath) => {
	try {
		const b64 = await Bun.file(imagePath)
			.image()
			.resize(512, 512, { fit: "inside" })
			.jpeg({ quality: 60 })
			.toBase64();

		const body = {
			model: config.ai.model,
			messages: [
				{
					role: "system",
					content: config.ai.systemPrompt,
				},
				{
					role: "user",
					content: [
						{
							type: "text",
							text: config.ai.userPrompt,
						},
						{
							type: "image_url",
							image_url: {
								url: `data:image/jpeg;base64,${b64}`,
							},
						},
					],
				},
			],
			temperature: config.ai.temperature,
		};

		const res = await fetch(config.ai.endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			throw new Error(`LM Studio API Error ${res.status}: ${await res.text()}`);
		}

		const data = await res.json();
		let text = data.choices?.[0]?.message?.content;
		if (!text) throw new Error("No text in response");

		text = text.trim();

		// Strip weird SLM safety warnings if present
		text = text
			.replace(/^[!*#\s]+.*?(IMPORTANT|AI generated|warning).*?[!*#\s]+/gi, "")
			.trim();

		// Strip conversational filler
		text = text
			.replace(
				/^(in the image|the image|this image|the scene|this is a picture of|a picture of|a close up of|an aerial view of|an aerial shot of|here we see)\s+(depicts|displays|shows|features|presents|captures|is|there is|there are|theres)?\s*(a|an|the)?\s*/i,
				"",
			)
			.trim();

		const slug = text
			.toLowerCase()
			.replace(/[^a-z0-9 ]/g, "")
			.split(/\s+/)
			.filter((word) => word.length > 0)
			.slice(0, 5)
			.join("-");

		if (!slug) throw new Error("Could not generate slug from text");

		return { slug: slug, alt: text };
	} catch (err) {
		console.error(chalk.yellow(`AI Analysis failed: ${err.message}`));
	}
	return null;
};
