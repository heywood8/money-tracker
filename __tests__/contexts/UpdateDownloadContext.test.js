import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { UpdateDownloadProvider, useUpdateDownload } from '../../app/contexts/UpdateDownloadContext';

let capturedOnPhaseChange = null;
let capturedOnProgress = null;

jest.mock('../../app/services/AppUpdateService', () => ({
  downloadAndInstallApk: jest.fn(),
}));

const wrapper = ({ children }) => (
  <UpdateDownloadProvider>{children}</UpdateDownloadProvider>
);

describe('UpdateDownloadContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnPhaseChange = null;
    capturedOnProgress = null;
    const { downloadAndInstallApk } = require('../../app/services/AppUpdateService');
    downloadAndInstallApk.mockImplementation((url, onProgress, options) => {
      capturedOnProgress = onProgress;
      capturedOnPhaseChange = options?.onPhaseChange ?? null;
      return Promise.resolve();
    });
  });

  it('exposes null downloadPhase initially', async () => {
    const { result } = await renderHook(() => useUpdateDownload(), { wrapper });
    expect(result.current.downloadPhase).toBeNull();
  });

  it('sets downloadPhase to "downloading" when startDownload is called', async () => {
    const { downloadAndInstallApk } = require('../../app/services/AppUpdateService');
    let resolveDownload;
    downloadAndInstallApk.mockImplementation((url, onProgress, options) => {
      capturedOnPhaseChange = options?.onPhaseChange ?? null;
      return new Promise((resolve) => { resolveDownload = resolve; });
    });

    const { result } = await renderHook(() => useUpdateDownload(), { wrapper });

    await act(async () => {
      result.current.startDownload('https://example.com/penny.apk');
    });

    expect(result.current.downloadPhase).toBe('downloading');

    await act(async () => { resolveDownload(); });
  });

  it('resets downloadPhase to null after download completes', async () => {
    const { result } = await renderHook(() => useUpdateDownload(), { wrapper });

    await act(async () => {
      await result.current.startDownload('https://example.com/penny.apk');
    });

    expect(result.current.downloadPhase).toBeNull();
  });

  it('sets downloadPhase to "verifying" and resets downloadProgress to 0 when onPhaseChange fires', async () => {
    const { downloadAndInstallApk } = require('../../app/services/AppUpdateService');
    let resolveDownload;
    downloadAndInstallApk.mockImplementation((url, onProgress, options) => {
      capturedOnPhaseChange = options?.onPhaseChange ?? null;
      capturedOnProgress = onProgress;
      return new Promise((resolve) => { resolveDownload = resolve; });
    });

    const { result } = await renderHook(() => useUpdateDownload(), { wrapper });

    await act(async () => {
      result.current.startDownload('https://example.com/penny.apk', { checksumUrl: 'https://example.com/penny.apk.sha256' });
    });

    await act(async () => { capturedOnProgress?.(1); });
    expect(result.current.downloadProgress).toBe(1);

    await act(async () => { capturedOnPhaseChange?.('verifying'); });
    expect(result.current.downloadPhase).toBe('verifying');
    expect(result.current.downloadProgress).toBe(0);

    await act(async () => { resolveDownload(); });
  });

  it('passes checksumUrl to downloadAndInstallApk', async () => {
    const { downloadAndInstallApk } = require('../../app/services/AppUpdateService');
    const { result } = await renderHook(() => useUpdateDownload(), { wrapper });

    await act(async () => {
      await result.current.startDownload('https://example.com/penny.apk', { checksumUrl: 'https://example.com/penny.apk.sha256' });
    });

    expect(downloadAndInstallApk).toHaveBeenCalledWith(
      'https://example.com/penny.apk',
      expect.any(Function),
      expect.objectContaining({ checksumUrl: 'https://example.com/penny.apk.sha256' }),
    );
  });
});
