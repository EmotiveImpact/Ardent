import RawSegmentedControl, {
  type SegmentedControlProps,
} from '@react-native-segmented-control/segmented-control'
import type { ComponentType } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'

// The library's bundled .d.ts declares its default export as an intersection of
// constructor signatures (`Constructor<NativeMethods> & typeof Component`). React
// 19's stricter JSX typing collapses that to just `NativeMethods` and rejects it
// ("SegmentedControl cannot be used as a JSX component"). The runtime component is
// perfectly fine — so we re-type it once, here, as a plain ComponentType and use
// this wrapper everywhere instead of importing the broken default directly.
//
// We also re-add `style`: the bundled SegmentedControlProps doesn't surface the
// inherited ViewProps `style` under React 19's typing, but the native component
// honours it.
type SegmentedProps = SegmentedControlProps & { style?: StyleProp<ViewStyle> }

export const Segmented = RawSegmentedControl as unknown as ComponentType<SegmentedProps>
export type { SegmentedControlProps }
