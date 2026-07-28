/* eslint-disable react/prop-types */
/**
 * Tests for OverlayHostContext — the app-wide overlay layer that shares a coordinate
 * space with the content it covers.
 *
 * The point of the layer is positional integrity: anything measured against `hostRef`
 * can be drawn in the outlet with no translation, because both live under one parent.
 * These tests pin the plumbing that makes that true (single shared ref, overlays
 * mounted into the outlet rather than in place, clean teardown).
 */
import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import {
  OverlayHostProvider,
  OverlayOutlet,
  OverlayPortal,
  useOverlayHost,
} from '../../app/contexts/OverlayHostContext';

const HostProbe = ({ onRef }) => {
  const { hostRef } = useOverlayHost();
  useEffect(() => { onRef(hostRef); }, [hostRef, onRef]);
  return null;
};

const Harness = ({ children }) => (
  <OverlayHostProvider>
    <View testID="content">{children}</View>
    <OverlayOutlet />
  </OverlayHostProvider>
);

describe('OverlayHostContext', () => {
  describe('Portal', () => {
    it('renders portal children into the outlet, not at the call site', async () => {
      const { getByTestId, getByText } = await render(
        <Harness>
          <OverlayPortal><Text>lifted</Text></OverlayPortal>
        </Harness>,
      );

      const outlet = await waitFor(() => getByTestId('overlay-outlet'));
      const content = getByTestId('content');

      let node = getByText('lifted').parent;
      const ancestors = [];
      while (node) { ancestors.push(node); node = node.parent; }

      expect(ancestors).toContain(outlet);
      expect(ancestors).not.toContain(content);
    });

    it('updates the mounted overlay when its children change', async () => {
      const { getByText, queryByText, rerender } = await render(
        <Harness>
          <OverlayPortal><Text>first</Text></OverlayPortal>
        </Harness>,
      );
      await waitFor(() => expect(getByText('first')).toBeTruthy());

      rerender(
        <Harness>
          <OverlayPortal><Text>second</Text></OverlayPortal>
        </Harness>,
      );

      await waitFor(() => expect(getByText('second')).toBeTruthy());
      expect(queryByText('first')).toBeNull();
    });

    it('removes the overlay — and the outlet — once the portal unmounts', async () => {
      const { queryByTestId, queryByText, rerender } = await render(
        <Harness>
          <OverlayPortal><Text>lifted</Text></OverlayPortal>
        </Harness>,
      );
      await waitFor(() => expect(queryByText('lifted')).toBeTruthy());

      rerender(<Harness>{null}</Harness>);

      await waitFor(() => expect(queryByText('lifted')).toBeNull());
      expect(queryByTestId('overlay-outlet')).toBeNull();
    });

    it('keeps several overlays side by side', async () => {
      const { getByText } = await render(
        <Harness>
          <OverlayPortal><Text>menu</Text></OverlayPortal>
          <OverlayPortal><Text>snackbar</Text></OverlayPortal>
        </Harness>,
      );

      await waitFor(() => expect(getByText('menu')).toBeTruthy());
      expect(getByText('snackbar')).toBeTruthy();
    });

    it('renders no outlet while nothing is mounted', async () => {
      const { queryByTestId } = await render(<Harness>{null}</Harness>);
      await waitFor(() => expect(queryByTestId('overlay-outlet')).toBeNull());
    });
  });

  describe('Host ref', () => {
    it('hands every consumer the same ref object', async () => {
      const refs = [];
      const collect = (ref) => refs.push(ref);

      await render(
        <Harness>
          <HostProbe onRef={collect} />
          <HostProbe onRef={collect} />
        </Harness>,
      );

      await waitFor(() => expect(refs).toHaveLength(2));
      expect(refs[0]).toBe(refs[1]);
    });

    it('stays the same ref across overlay mounts', async () => {
      const refs = [];
      const collect = (ref) => refs.push(ref);

      const { rerender } = await render(
        <Harness><HostProbe onRef={collect} /></Harness>,
      );
      await waitFor(() => expect(refs).toHaveLength(1));

      rerender(
        <Harness>
          <HostProbe onRef={collect} />
          <OverlayPortal><Text>lifted</Text></OverlayPortal>
        </Harness>,
      );

      // A ref that changed identity mid-flight would leave a row measuring against
      // one container while the clone is drawn in another — the exact drift this
      // layer exists to make impossible.
      await waitFor(() => expect(refs.length).toBeGreaterThan(0));
      refs.forEach((ref) => expect(ref).toBe(refs[0]));
    });
  });

  describe('Without a provider', () => {
    it('degrades to a no-op instead of throwing', async () => {
      const { queryByText } = await render(
        <OverlayPortal><Text>orphan</Text></OverlayPortal>,
      );
      await waitFor(() => expect(queryByText('orphan')).toBeNull());
    });
  });
});
