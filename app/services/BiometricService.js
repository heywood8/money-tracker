import * as LocalAuthentication from 'expo-local-authentication';

export const BiometricResult = {
  SUCCESS: 'success',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  NOT_AVAILABLE: 'not_available',
  NOT_ENROLLED: 'not_enrolled',
};

export async function checkBiometricAvailability() {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return BiometricResult.NOT_AVAILABLE;
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  if (!isEnrolled) return BiometricResult.NOT_ENROLLED;
  return BiometricResult.SUCCESS;
}

export async function authenticateWithBiometrics(promptMessage) {
  const availability = await checkBiometricAvailability();
  if (availability !== BiometricResult.SUCCESS) return availability;

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    disableDeviceFallback: false,
    cancelLabel: 'Cancel',
  });

  if (result.success) return BiometricResult.SUCCESS;
  if (result.error === 'user_cancel' || result.error === 'system_cancel') return BiometricResult.CANCELLED;
  return BiometricResult.FAILED;
}
