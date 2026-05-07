import * as LocalAuthentication from 'expo-local-authentication';
import {
  authenticateWithBiometrics,
  checkBiometricAvailability,
  BiometricResult,
} from '../../app/services/BiometricService';

jest.mock('expo-local-authentication');

describe('BiometricService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkBiometricAvailability', () => {
    it('returns NOT_AVAILABLE when no hardware', async () => {
      LocalAuthentication.hasHardwareAsync.mockResolvedValue(false);
      const result = await checkBiometricAvailability();
      expect(result).toBe(BiometricResult.NOT_AVAILABLE);
    });

    it('returns NOT_ENROLLED when hardware present but not enrolled', async () => {
      LocalAuthentication.hasHardwareAsync.mockResolvedValue(true);
      LocalAuthentication.isEnrolledAsync.mockResolvedValue(false);
      const result = await checkBiometricAvailability();
      expect(result).toBe(BiometricResult.NOT_ENROLLED);
    });

    it('returns SUCCESS when hardware present and enrolled', async () => {
      LocalAuthentication.hasHardwareAsync.mockResolvedValue(true);
      LocalAuthentication.isEnrolledAsync.mockResolvedValue(true);
      const result = await checkBiometricAvailability();
      expect(result).toBe(BiometricResult.SUCCESS);
    });
  });

  describe('authenticateWithBiometrics', () => {
    it('returns NOT_AVAILABLE when no hardware', async () => {
      LocalAuthentication.hasHardwareAsync.mockResolvedValue(false);
      const result = await authenticateWithBiometrics('Test prompt');
      expect(result).toBe(BiometricResult.NOT_AVAILABLE);
      expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled();
    });

    it('returns NOT_ENROLLED when not enrolled', async () => {
      LocalAuthentication.hasHardwareAsync.mockResolvedValue(true);
      LocalAuthentication.isEnrolledAsync.mockResolvedValue(false);
      const result = await authenticateWithBiometrics('Test prompt');
      expect(result).toBe(BiometricResult.NOT_ENROLLED);
      expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled();
    });

    it('returns SUCCESS on successful authentication', async () => {
      LocalAuthentication.hasHardwareAsync.mockResolvedValue(true);
      LocalAuthentication.isEnrolledAsync.mockResolvedValue(true);
      LocalAuthentication.authenticateAsync.mockResolvedValue({ success: true });
      const result = await authenticateWithBiometrics('Authenticate to show balances');
      expect(result).toBe(BiometricResult.SUCCESS);
      expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith({
        promptMessage: 'Authenticate to show balances',
        disableDeviceFallback: false,
        cancelLabel: 'Cancel',
      });
    });

    it('returns CANCELLED on user_cancel error', async () => {
      LocalAuthentication.hasHardwareAsync.mockResolvedValue(true);
      LocalAuthentication.isEnrolledAsync.mockResolvedValue(true);
      LocalAuthentication.authenticateAsync.mockResolvedValue({ success: false, error: 'user_cancel' });
      const result = await authenticateWithBiometrics('Authenticate to show balances');
      expect(result).toBe(BiometricResult.CANCELLED);
    });

    it('returns CANCELLED on system_cancel error', async () => {
      LocalAuthentication.hasHardwareAsync.mockResolvedValue(true);
      LocalAuthentication.isEnrolledAsync.mockResolvedValue(true);
      LocalAuthentication.authenticateAsync.mockResolvedValue({ success: false, error: 'system_cancel' });
      const result = await authenticateWithBiometrics('Authenticate to show balances');
      expect(result).toBe(BiometricResult.CANCELLED);
    });

    it('returns FAILED on other auth errors', async () => {
      LocalAuthentication.hasHardwareAsync.mockResolvedValue(true);
      LocalAuthentication.isEnrolledAsync.mockResolvedValue(true);
      LocalAuthentication.authenticateAsync.mockResolvedValue({ success: false, error: 'too_many_attempts' });
      const result = await authenticateWithBiometrics('Authenticate to show balances');
      expect(result).toBe(BiometricResult.FAILED);
    });
  });
});
