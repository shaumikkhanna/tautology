import fs from "node:fs";
import path from "node:path";

export type Section = {
	slug: string;
	label: string;
	description: string;
};

export type SectionItem = {
	slug: string;
	title: string;
	description: string;
	body?: string;
	image?: string;
	playHref?: string;
	requiresBackend?: boolean;
	status?: string;
	href: string;
};

export const sections: Section[] = [
	{
		slug: "games",
		label: "Games",
		description: "Playable things, puzzles, rules, experiments.",
	},
	{
		slug: "projects",
		label: "Projects",
		description: "My own half-polished contraptions.",
	},
	{
		slug: "tools",
		label: "Tools",
		description: "Everything else that doesn't fit in the other sections.",
	},
];

const contentRoot = path.join(process.cwd(), "content");

type ItemMeta = {
	title?: string;
	description?: string;
	body?: string;
	image?: string;
	playHref?: string;
	requiresBackend?: boolean;
	status?: string;
	href?: string;
};

export function getSection(slug: string) {
	return sections.find((section) => section.slug === slug);
}

export function getSectionItems(sectionSlug: string): SectionItem[] {
	const sectionPath = path.join(contentRoot, sectionSlug);

	if (!fs.existsSync(sectionPath)) {
		return [];
	}

	return fs
		.readdirSync(sectionPath, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => readItem(sectionSlug, entry.name))
		.filter((item): item is SectionItem => item !== null)
		.sort((a, b) => a.title.localeCompare(b.title));
}

export function getSectionItem(sectionSlug: string, itemSlug: string) {
	return readItem(sectionSlug, itemSlug);
}

function readItem(sectionSlug: string, itemSlug: string): SectionItem | null {
	const itemPath = path.join(contentRoot, sectionSlug, itemSlug);

	if (!fs.existsSync(itemPath)) {
		return null;
	}

	const meta = readMeta(path.join(itemPath, "meta.json"));
	const title = meta.title ?? titleFromSlug(itemSlug);

	return {
		slug: itemSlug,
		title,
		description:
			meta.description ?? "A small thing waiting to become real.",
		body: meta.body,
		image: meta.image,
		playHref: meta.playHref,
		requiresBackend: meta.requiresBackend,
		status: meta.status,
		href: meta.href ?? `/${sectionSlug}/${itemSlug}`,
	};
}

function readMeta(metaPath: string): ItemMeta {
	if (!fs.existsSync(metaPath)) {
		return {};
	}

	return JSON.parse(fs.readFileSync(metaPath, "utf8")) as ItemMeta;
}

function titleFromSlug(slug: string) {
	return slug
		.split("-")
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}
