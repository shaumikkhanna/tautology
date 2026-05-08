export type ConnectionsPuzzle = {
  puzzleName: string;
  puzzleDescription: string;
  mistakesAllowed: number;
  allowHints: boolean;
  puzzle: Array<{
    word: string;
    category: number;
  }>;
  categories: Record<number, string>;
};

export const UNLIMITED_MISTAKES = 1000;

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ ,-'\".";
const CHAR_MAP = new Map(Array.from(CHARSET).map((char, index) => [char, index]));
const REVERSE_CHAR_MAP = Array.from(CHARSET);
const PUZZLE_FIELD_COUNT = 41;
const VERSION = "CONNECTIONS";
const CATEGORY_TOKENS = ["A", "B", "C", "D"];
const MISTAKE_TOKENS = ["U", "A", "B", "C", "D", "E", "F", "G", "H"];

export function normalizeAllowedText(value: string) {
  return Array.from(value.toUpperCase())
    .filter((char) => CHAR_MAP.has(char))
    .join("");
}

export function encodePuzzle(puzzle: ConnectionsPuzzle) {
  const fields = [
    VERSION,
    puzzle.puzzleName,
    puzzle.puzzleDescription,
    mistakesToToken(puzzle.mistakesAllowed),
    puzzle.allowHints ? "T" : "F",
    ...puzzle.puzzle.map((item) => item.word),
    ...puzzle.puzzle.map((item) => CATEGORY_TOKENS[item.category]),
    ...CATEGORY_TOKENS.map((_, index) => puzzle.categories[index] ?? ""),
  ];

  return encodeCustom(writeCsv(fields));
}

export function decodePuzzle(code: string): ConnectionsPuzzle {
  const fields = parseCsv(decodeCustom(code));

  if (fields.length !== PUZZLE_FIELD_COUNT || fields[0] !== VERSION) {
    throw new Error("This does not look like a Connections puzzle code.");
  }

  const puzzle = fields.slice(5, 21).map((word, index) => ({
    word,
    category: tokenToCategory(fields[21 + index]),
  }));
  const categories = Object.fromEntries(
    fields.slice(37, 41).map((category, index) => [index, category]),
  );

  return {
    puzzleName: fields[1],
    puzzleDescription: fields[2],
    mistakesAllowed: tokenToMistakes(fields[3]),
    allowHints: fields[4] === "T",
    puzzle,
    categories,
  };
}

export function extractGameCode(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    const queryCode = url.searchParams.get("gamecode") ?? url.searchParams.get("code");
    if (queryCode) {
      return queryCode.trim();
    }

    const parts = url.pathname.split("/").filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] ?? "").trim();
  } catch {
    return trimmed;
  }
}

function encodeCustom(value: string) {
  if (value.length > 65535) {
    throw new Error("Puzzle is too long to encode.");
  }

  let bits = value.length.toString(2).padStart(16, "0");
  for (const char of value) {
    const mapped = CHAR_MAP.get(char);
    if (mapped === undefined) {
      throw new Error(`Unsupported character: ${char}`);
    }
    bits += mapped.toString(2).padStart(5, "0");
  }

  bits = bits.padEnd(Math.ceil(bits.length / 8) * 8, "0");
  const bytes = new Uint8Array(bits.length / 8);
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2);
  }

  return bytesToBase64Url(bytes);
}

function decodeCustom(code: string) {
  const bytes = base64UrlToBytes(code);
  const bits = Array.from(bytes, (byte) => byte.toString(2).padStart(8, "0")).join("");
  const length = Number.parseInt(bits.slice(0, 16), 2);
  let output = "";

  for (let index = 0; index < length; index++) {
    const start = 16 + index * 5;
    const mapped = Number.parseInt(bits.slice(start, start + 5), 2);
    const char = REVERSE_CHAR_MAP[mapped];
    if (char === undefined) {
      throw new Error("Puzzle code contains unsupported data.");
    }
    output += char;
  }

  return output;
}

function writeCsv(fields: string[]) {
  return fields.map(writeCsvField).join(",");
}

function writeCsvField(field: string) {
  if (field.includes(",") || field.includes('"')) {
    return `"${field.replaceAll('"', '""')}"`;
  }

  return field;
}

function parseCsv(csv: string) {
  const fields: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index++) {
    const char = csv[index];

    if (quoted) {
      if (char === '"' && csv[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }

  fields.push(field);
  return fields;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function mistakesToToken(mistakes: number) {
  if (mistakes === UNLIMITED_MISTAKES) {
    return "U";
  }

  return MISTAKE_TOKENS[mistakes] ?? "U";
}

function tokenToMistakes(token: string) {
  if (token === "U") {
    return UNLIMITED_MISTAKES;
  }

  const index = MISTAKE_TOKENS.indexOf(token);
  return index > 0 ? index : UNLIMITED_MISTAKES;
}

function tokenToCategory(token: string) {
  const category = CATEGORY_TOKENS.indexOf(token);

  if (category === -1) {
    throw new Error("Puzzle code contains an invalid category.");
  }

  return category;
}
