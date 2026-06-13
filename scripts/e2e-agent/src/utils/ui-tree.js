// scripts/e2e-agent/src/utils/ui-tree.js
import { XMLParser } from 'fast-xml-parser';

const APP_PACKAGE = 'com.heywood8.monkeep';

function parseBounds(str) {
  const m = str.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!m) return [0, 0, 0, 0];
  return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3]), parseInt(m[4])];
}

function extractNodes(node, results = []) {
  if (!node) return results;
  const pkg = node['@_package'] || '';
  const text = node['@_text'] || '';
  const contentDesc = node['@_content-desc'] || '';
  const clickable = node['@_clickable'] === 'true';
  const enabled = node['@_enabled'] === 'true';
  const resourceId = node['@_resource-id'] || '';
  const boundsStr = node['@_bounds'] || '';

  if (pkg === APP_PACKAGE && enabled && (clickable || text || contentDesc)) {
    const bounds = parseBounds(boundsStr);
    results.push({
      text, contentDesc, resourceId, clickable, bounds,
      centerX: Math.round((bounds[0] + bounds[2]) / 2),
      centerY: Math.round((bounds[1] + bounds[3]) / 2),
    });
  }

  const children = node.node ? (Array.isArray(node.node) ? node.node : [node.node]) : [];
  for (const child of children) extractNodes(child, results);
  return results;
}

export function parseUITree(xml) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const parsed = parser.parse(xml);
  return parsed.hierarchy ? extractNodes(parsed.hierarchy.node) : [];
}
