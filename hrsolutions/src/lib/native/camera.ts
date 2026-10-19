import { Camera, CameraResultType, CameraSource, CameraDirection } from '@capacitor/camera';
import { isNativePlatform } from './platform';

export type CameraStreamResult = {
  stream: MediaStream;
  stop: () => void;
};

/**
 * Open a live selfie stream for attendance punch preview.
 * Prefers getUserMedia (works in Capacitor WebViews with permissions).
 */
export async function getSelfieStream(): Promise<CameraStreamResult> {
  if (!navigator?.mediaDevices?.getUserMedia) {
    throw new Error('Camera device API not supported');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });

  return {
    stream,
    stop: () => {
      stream.getTracks().forEach((track) => track.stop());
    },
  };
}

/**
 * Capture a single selfie photo via the Capacitor Camera plugin.
 * Use when live preview stream is unavailable on native.
 */
export async function captureSelfiePhoto(): Promise<string> {
  if (!isNativePlatform()) {
    throw new Error('Native camera capture is only available on device');
  }

  const photo = await Camera.getPhoto({
    quality: 80,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Camera,
    direction: CameraDirection.Front,
  });

  if (!photo.dataUrl) {
    throw new Error('Failed to capture selfie');
  }

  return photo.dataUrl;
}

/**
 * Pick a profile photo on native (camera or gallery prompt).
 * Returns a web-friendly data URL (plugin converts HEIC etc.).
 * Throws with message "User cancelled photos app" when dismissed.
 */
export async function pickAvatarPhoto(): Promise<string> {
  if (!isNativePlatform()) {
    throw new Error('Native photo picker is only available on device');
  }

  const permission = await Camera.checkPermissions();
  const photosOk =
    permission.photos === 'granted' || permission.photos === 'limited';
  const cameraOk = permission.camera === 'granted';
  if (!photosOk && !cameraOk) {
    const requested = await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
    const requestedPhotosOk =
      requested.photos === 'granted' || requested.photos === 'limited';
    if (!requestedPhotosOk && requested.camera !== 'granted') {
      throw new Error('Camera or photo library permission is required to update your profile photo');
    }
  }

  const photo = await Camera.getPhoto({
    quality: 90,
    allowEditing: true,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Prompt,
    promptLabelHeader: 'Profile photo',
    promptLabelPhoto: 'Choose from gallery',
    promptLabelPicture: 'Take photo',
    promptLabelCancel: 'Cancel',
  });

  if (!photo.dataUrl) {
    throw new Error('No photo selected');
  }

  return photo.dataUrl;
}

/** True when Capacitor Camera can open a system photo picker. */
export function canUseNativePhotoPicker(): boolean {
  return isNativePlatform();
}
