import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

/** Take a photo with the camera, or pick one when there's no camera (the browser prototype). */
export async function pickPhoto(): Promise<{ uri: string; width: number; height: number } | undefined> {
  let result: ImagePicker.ImagePickerResult;
  if (Platform.OS === 'web') {
    result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  } else {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    result = perm.granted
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  }
  const a = result.canceled ? undefined : result.assets[0];
  return a ? { uri: a.uri, width: a.width, height: a.height } : undefined;
}
