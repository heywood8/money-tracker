# iOS Widget Setup for Penny

This document describes how to set up iOS widgets for the Penny app. iOS widgets require native code and cannot be fully automated through Expo's managed workflow.

## Overview

iOS widgets are implemented using **WidgetKit** (SwiftUI) and require:
1. A widget extension target in Xcode
2. Swift/SwiftUI code for the widget UI
3. App Groups for data sharing between the app and widget
4. Manual configuration in Xcode

## Prerequisites

- macOS with Xcode installed
- iOS 14.0 or later (for WidgetKit support)
- Expo development build (already configured with `expo-dev-client`)

## Setup Steps

### 1. Create Widget Extension in Xcode

1. Open the Xcode project:
   ```bash
   cd ios
   open monkeep.xcworkspace  # or .xcodeproj
   ```

2. In Xcode, go to **File > New > Target**

3. Select **Widget Extension**

4. Configure the widget:
   - Product Name: `PennyWidget`
   - Team: Your development team
   - Organization Identifier: `com.heywood8`
   - Language: Swift
   - Include Configuration Intent: Yes (for widget customization)

5. Click **Finish** and **Activate** the scheme when prompted

### 2. Configure App Groups

App Groups allow the widget to access data from the main app.

#### In Xcode - Main App Target:

1. Select your main app target
2. Go to **Signing & Capabilities**
3. Click **+ Capability** and add **App Groups**
4. Add a new group: `group.com.heywood8.monkeep`

#### In Xcode - Widget Extension Target:

1. Select the `PennyWidget` target
2. Go to **Signing & Capabilities**
3. Click **+ Capability** and add **App Groups**
4. Enable the same group: `group.com.heywood8.monkeep`

### 3. Update App Code to Use App Groups

In the main React Native app, update the AsyncStorage configuration to use App Groups:

```javascript
// In App.js or a storage configuration file
import AsyncStorage from '@react-native-async-storage/async-storage';

// For iOS, we need to use a shared container
// This requires native module configuration
```

**Note:** You'll need to configure AsyncStorage to use the shared App Group container. This may require additional native module setup.

### 4. Widget Implementation Files

The widget extension will need these Swift files:

#### PennyWidget.swift

```swift
import WidgetKit
import SwiftUI

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> SimpleEntry {
        SimpleEntry(date: Date(), balances: [], accountCount: 0)
    }

    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> ()) {
        let entry = loadWidgetData()
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> ()) {
        let entry = loadWidgetData()

        // Update every 15 minutes
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))

        completion(timeline)
    }

    func loadWidgetData() -> SimpleEntry {
        // Load data from App Group shared container
        let sharedDefaults = UserDefaults(suiteName: "group.com.heywood8.monkeep")

        if let jsonData = sharedDefaults?.data(forKey: "penny_widget_data"),
           let widgetData = try? JSONDecoder().decode(WidgetData.self, from: jsonData) {
            return SimpleEntry(
                date: Date(),
                balances: widgetData.totalsByCurrency,
                accountCount: widgetData.accountCount
            )
        }

        return SimpleEntry(date: Date(), balances: [], accountCount: 0)
    }
}

struct SimpleEntry: TimelineEntry {
    let date: Date
    let balances: [Balance]
    let accountCount: Int
}

struct Balance: Codable {
    let currency: String
    let total: String
    let formatted: String
}

struct WidgetData: Codable {
    let totalsByCurrency: [Balance]
    let accountCount: Int
    let lastUpdate: String?
}

struct PennyWidgetEntryView : View {
    var entry: Provider.Entry

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                Text("💰 Penny")
                    .font(.headline)
                    .foregroundColor(.primary)
                Spacer()
                Text("\\(entry.accountCount) account\\(entry.accountCount != 1 ? "s" : "")")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            // Balances
            if entry.balances.isEmpty {
                Spacer()
                VStack(spacing: 4) {
                    Text("No accounts yet")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    Text("Open app to add accounts")
                        .font(.caption)
                        .foregroundColor(.tertiary)
                }
                .frame(maxWidth: .infinity)
                Spacer()
            } else {
                ForEach(entry.balances, id: \\.currency) { balance in
                    HStack {
                        Text(balance.currency)
                            .font(.subheadline)
                            .fontWeight(.semibold)
                            .foregroundColor(.secondary)
                        Spacer()
                        Text(balance.formatted)
                            .font(.body)
                            .fontWeight(.bold)
                            .foregroundColor(
                                Double(balance.total) ?? 0 >= 0 ? .green : .red
                            )
                    }
                    .padding(.vertical, 6)
                    .padding(.horizontal, 8)
                    .background(Color(.systemGray6))
                    .cornerRadius(8)
                }
            }
        }
        .padding()
    }
}

@main
struct PennyWidget: Widget {
    let kind: String = "PennyWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            PennyWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Penny Balance")
        .description("Shows your account balances")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct PennyWidget_Previews: PreviewProvider {
    static var previews: some View {
        PennyWidgetEntryView(entry: SimpleEntry(
            date: Date(),
            balances: [
                Balance(currency: "USD", total: "1000.00", formatted: "$1,000.00"),
                Balance(currency: "EUR", total: "500.50", formatted: "€500.50")
            ],
            accountCount: 3
        ))
        .previewContext(WidgetPreviewContext(family: .systemSmall))
    }
}
```

### 5. Update Widget Data Service to Use App Groups

Update the `WidgetDataService.js` to write to the shared App Group container on iOS:

```javascript
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// For iOS, you might need to use a native module to write to App Group
// For now, we'll use AsyncStorage which can be configured for App Groups

export const updateWidgetData = async () => {
  try {
    const widgetData = await prepareWidgetData();

    if (Platform.OS === 'ios') {
      // Write to App Group shared container
      // This might require a native module bridge
      // For now, use AsyncStorage (configure it to use App Group)
      await AsyncStorage.setItem(WIDGET_DATA_KEY, JSON.stringify(widgetData));
    } else {
      // Android uses regular AsyncStorage
      await AsyncStorage.setItem(WIDGET_DATA_KEY, JSON.stringify(widgetData));
    }

    console.log('Widget data updated successfully');
  } catch (error) {
    console.error('Failed to update widget data:', error);
  }
};
```

### 6. Build and Test

1. Build the app with the widget extension:
   ```bash
   npx expo run:ios
   ```

2. On the iOS device/simulator:
   - Long press on the home screen
   - Tap the "+" button in the top left
   - Search for "Penny"
   - Add the widget to your home screen

### 7. Troubleshooting

**Widget not appearing:**
- Ensure App Groups are configured correctly for both targets
- Check that the widget extension is included in the build
- Verify bundle identifiers match

**Widget shows no data:**
- Check that widget data is being written to shared container
- Verify App Group name matches in both app and widget
- Use Xcode debugger to check widget data loading

**Widget not updating:**
- Widgets update based on timeline
- Force update by removing and re-adding the widget
- Check widget timeline policy settings

## Limitations

- iOS widgets are read-only (tappable areas open the main app)
- Widgets update on a schedule (not real-time)
- Limited to specific sizes: small, medium, large
- Requires manual Xcode configuration (cannot be automated in Expo managed workflow)

## Future Enhancements

- Add widget configuration options (choose which account to display)
- Implement large widget size with recent transactions
- Add complications for Apple Watch
- Support for StandBy mode widgets (iOS 17+)

## Resources

- [Apple WidgetKit Documentation](https://developer.apple.com/documentation/widgetkit)
- [Creating a Widget Extension](https://developer.apple.com/documentation/widgetkit/creating-a-widget-extension)
- [App Groups Documentation](https://developer.apple.com/documentation/bundleresources/entitlements/com_apple_security_application-groups)
