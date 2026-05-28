export type UiNode = {
  text?: string;
  resourceId?: string;
  className?: string;
  packageName?: string;
  clickable?: boolean;
  enabled?: boolean;
  bounds?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
};

export type UiNodeMatch = UiNode & {
  centerX?: number;
  centerY?: number;
};

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function readAttribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  return match ? decodeXml(match[1]) : undefined;
}

function readBooleanAttribute(tag: string, name: string): boolean | undefined {
  const value = readAttribute(tag, name);
  if (value === undefined) {
    return undefined;
  }

  return value === "true";
}

function parseBounds(value?: string): UiNode["bounds"] {
  if (!value) {
    return undefined;
  }

  const match = value.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
  if (!match) {
    return undefined;
  }

  return {
    left: Number(match[1]),
    top: Number(match[2]),
    right: Number(match[3]),
    bottom: Number(match[4])
  };
}

export function parseUiNodes(xml: string): UiNode[] {
  const tags = xml.match(/<node\b[^>]*>/g) ?? [];

  return tags.map((tag) => ({
    text: readAttribute(tag, "text"),
    resourceId: readAttribute(tag, "resource-id"),
    className: readAttribute(tag, "class"),
    packageName: readAttribute(tag, "package"),
    clickable: readBooleanAttribute(tag, "clickable"),
    enabled: readBooleanAttribute(tag, "enabled"),
    bounds: parseBounds(readAttribute(tag, "bounds"))
  }));
}

function includesCaseInsensitive(value: string | undefined, query: string | undefined): boolean {
  if (!query) {
    return true;
  }

  return value?.toLowerCase().includes(query.toLowerCase()) ?? false;
}

export function findUiNodes(nodes: UiNode[], query: { text?: string; resourceId?: string }): UiNodeMatch[] {
  return nodes
    .filter((node) => includesCaseInsensitive(node.text, query.text))
    .filter((node) => includesCaseInsensitive(node.resourceId, query.resourceId))
    .map((node) => {
      if (!node.bounds) {
        return node;
      }

      return {
        ...node,
        centerX: Math.round((node.bounds.left + node.bounds.right) / 2),
        centerY: Math.round((node.bounds.top + node.bounds.bottom) / 2)
      };
    });
}

export function formatUiMatch(match: UiNodeMatch, index: number): string {
  const bounds = match.bounds
    ? `[${match.bounds.left},${match.bounds.top}][${match.bounds.right},${match.bounds.bottom}]`
    : "none";
  const center =
    match.centerX !== undefined && match.centerY !== undefined ? `(${match.centerX},${match.centerY})` : "none";
  const label = match.text ? `"${match.text}"` : "(no text)";

  return [
    `[${index}] ${label}`,
    `resource-id=${match.resourceId || ""}`,
    `class=${match.className || ""}`,
    `package=${match.packageName || ""}`,
    `clickable=${match.clickable ?? ""}`,
    `enabled=${match.enabled ?? ""}`,
    `bounds=${bounds}`,
    `center=${center}`
  ].join("\n");
}
