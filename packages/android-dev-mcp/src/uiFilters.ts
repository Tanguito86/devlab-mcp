import type { UiNode, UiNodeMatch } from "./uiParser.js";

export type UiFilters = {
  text?: string;
  resourceId?: string;
  className?: string;
  packageName?: string;
  clickable?: boolean;
  enabled?: boolean;
};

function includesCaseInsensitive(value: string | undefined, query: string | undefined): boolean {
  if (!query) {
    return true;
  }

  return value?.toLowerCase().includes(query.toLowerCase()) ?? false;
}

function matchesBoolean(value: boolean | undefined, query: boolean | undefined): boolean {
  return query === undefined || value === query;
}

export function hasAnyUiFilter(filters: UiFilters): boolean {
  return Object.values(filters).some((value) => value !== undefined);
}

export function filterUiNodes(nodes: UiNode[], filters: UiFilters): UiNodeMatch[] {
  return nodes
    .filter((node) => includesCaseInsensitive(node.text, filters.text))
    .filter((node) => includesCaseInsensitive(node.resourceId, filters.resourceId))
    .filter((node) => includesCaseInsensitive(node.className, filters.className))
    .filter((node) => includesCaseInsensitive(node.packageName, filters.packageName))
    .filter((node) => matchesBoolean(node.clickable, filters.clickable))
    .filter((node) => matchesBoolean(node.enabled, filters.enabled))
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

export function formatUiFilters(filters: UiFilters): string {
  const entries = Object.entries(filters).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return "none";
  }

  return entries.map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(", ");
}

