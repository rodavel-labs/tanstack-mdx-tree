import { describe, expect, it } from "vitest";
import { humanize } from "../tree-builder";

describe("humanize", () => {
	it("converts a single word to title case", () => {
		expect(humanize("hello", new Set())).toBe("Hello");
	});

	it("converts kebab-case to title case", () => {
		expect(humanize("getting-started", new Set())).toBe("Getting Started");
	});

	it("uppercases known acronyms", () => {
		const acronyms = new Set(["api", "ses"]);
		expect(humanize("ses-api-reference", acronyms)).toBe("SES API Reference");
	});

	it("handles mixed acronyms and regular words", () => {
		const acronyms = new Set(["sdk"]);
		expect(humanize("install-sdk-guide", acronyms)).toBe("Install SDK Guide");
	});

	it("handles a single acronym word", () => {
		expect(humanize("api", new Set(["api"]))).toBe("API");
	});
});
