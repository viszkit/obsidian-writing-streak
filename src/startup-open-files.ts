export interface OpenMarkdownFileRef {
	path: string;
}

export function uniqueOpenMarkdownFilePaths(files: OpenMarkdownFileRef[]): string[] {
	const seen = new Set<string>();
	const paths: string[] = [];

	for (const file of files) {
		if (seen.has(file.path)) continue;
		seen.add(file.path);
		paths.push(file.path);
	}

	return paths;
}
