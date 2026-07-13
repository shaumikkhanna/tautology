import { LookupTool } from "./LookupTool";

export const metadata = {
	title: "Lookup | toomuchmaths",
	description:
		"Search dictionary definitions and Wikidata entities from one small tool.",
};

export default function LookupPage() {
	return <LookupTool />;
}
