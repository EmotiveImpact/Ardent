import { useState } from 'react'
import { View } from 'react-native'
import { Segmented as SegmentedControl } from '@/components/ui/Segmented'
import * as Haptics from 'expo-haptics'
import { AssetsList } from '@/components/lists/AssetsList'
import { ComplianceList } from '@/components/lists/ComplianceList'
import { OfflineBanner } from '@/components/ui/OfflineBanner'

const SEGMENTS = ['Assets', 'Compliance']

// Merged lookup tab — folds the old Assets + Compliance tabs into one,
// switched by a native segmented control (frees two slots off the tab bar).
export default function ReferenceScreen() {
  const [segment, setSegment] = useState(0)

  function onChange(index: number) {
    Haptics.selectionAsync()
    setSegment(index)
  }

  return (
    <View className="flex-1 bg-background">
      <OfflineBanner />
      <View className="bg-background px-4 pb-1 pt-3">
        <SegmentedControl
          values={SEGMENTS}
          selectedIndex={segment}
          onChange={(e) => onChange(e.nativeEvent.selectedSegmentIndex)}
          tintColor="#e8772e"
          activeFontStyle={{ color: '#fff' }}
        />
      </View>
      {segment === 0 ? <AssetsList /> : <ComplianceList />}
    </View>
  )
}
