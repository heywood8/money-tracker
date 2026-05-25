import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import { downloadAndInstallApk } from '../services/AppUpdateService';

const UpdateDownloadContext = createContext(null);

export function UpdateDownloadProvider({ children }) {
  const [downloadProgress, setDownloadProgress] = useState(null);
  const isDownloadingRef = useRef(false);

  const startDownload = useCallback(async (downloadUrl, { onError, checksumUrl = null } = {}) => {
    if (isDownloadingRef.current) return;
    isDownloadingRef.current = true;
    setDownloadProgress(0);
    try {
      await downloadAndInstallApk(downloadUrl, setDownloadProgress, { checksumUrl });
    } catch (e) {
      onError?.(e);
    } finally {
      isDownloadingRef.current = false;
      setDownloadProgress(null);
    }
  }, []);

  const value = useMemo(() => ({
    downloadProgress,
    isDownloading: downloadProgress !== null,
    startDownload,
  }), [downloadProgress, startDownload]);

  return (
    <UpdateDownloadContext.Provider
      value={value}
    >
      {children}
    </UpdateDownloadContext.Provider>
  );
}

UpdateDownloadProvider.propTypes = {
  children: PropTypes.node,
};

export function useUpdateDownload() {
  const ctx = useContext(UpdateDownloadContext);
  if (!ctx) throw new Error('useUpdateDownload must be used within UpdateDownloadProvider');
  return ctx;
}
