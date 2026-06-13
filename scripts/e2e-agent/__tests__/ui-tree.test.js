import { parseUITree } from '../src/utils/ui-tree.js';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="com.heywood8.monkeep:id/root" class="android.widget.FrameLayout" package="com.heywood8.monkeep" content-desc="" clickable="false" enabled="true" bounds="[0,0][1080,2400]">
    <node index="0" text="Add expense" resource-id="com.heywood8.monkeep:id/fab" class="android.widget.Button" package="com.heywood8.monkeep" content-desc="Add expense" clickable="true" enabled="true" bounds="[948,2268][1068,2388]"></node>
    <node index="1" text="Operations" resource-id="com.heywood8.monkeep:id/tab" class="android.widget.TextView" package="com.heywood8.monkeep" content-desc="" clickable="true" enabled="true" bounds="[0,2320][216,2400]"></node>
    <node index="2" text="System" resource-id="android:id/something" class="android.widget.TextView" package="android" content-desc="" clickable="false" enabled="true" bounds="[0,0][100,50]"></node>
  </node>
</hierarchy>`;

describe('parseUITree', () => {
  let elements;
  beforeEach(() => { elements = parseUITree(SAMPLE_XML); });

  it('filters out non-app elements', () => {
    expect(elements.some(e => e.resourceId && e.resourceId.startsWith('android:'))).toBe(false);
  });

  it('parses bounds to [x1,y1,x2,y2] array', () => {
    const fab = elements.find(e => e.text === 'Add expense');
    expect(fab.bounds).toEqual([948, 2268, 1068, 2388]);
  });

  it('includes clickable elements', () => {
    expect(elements.find(e => e.text === 'Add expense')).toBeDefined();
  });

  it('includes contentDesc', () => {
    expect(elements.find(e => e.text === 'Add expense').contentDesc).toBe('Add expense');
  });

  it('computes center coordinates', () => {
    const fab = elements.find(e => e.text === 'Add expense');
    expect(fab.centerX).toBe(1008);
    expect(fab.centerY).toBe(2328);
  });
});
