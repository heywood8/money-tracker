# Privacy Policy for Penny Personal Finance Tracker

**Effective Date:** January 5, 2026
**Last Updated:** January 5, 2026
**Version:** 1.0
**Developer:** heywood8

---

**Your financial data stays on your device.**

---

## 1. Introduction

Welcome to Penny, a personal finance tracking application built with your privacy in mind. This Privacy Policy explains how Penny handles your data when you use our mobile application.

### Core Privacy Principles:

- **Local-First Design**: All your financial data is stored locally on your device, not on our servers
- **No Personal Information Required**: Penny doesn't require or collect names, emails, phone numbers, or any personally identifiable information
- **You Control Your Data**: Export, backup, and delete your data at any time
- **Minimal External Services**: We use only essential services (app updates and optional Google Sheets export) with privacy protections

---

## 2. Information We Collect

### 2.1 Financial Data (Stored Locally)

Penny stores the following financial information **locally on your device only**:

- **Accounts**: Account names, balances, currencies, display preferences, and monthly targets
- **Transactions**: Transaction amounts, types (expense/income/transfer), dates, descriptions, categories, and associated accounts
- **Categories**: Custom category names, types, icons, colors, and organizational structure
- **Budgets**: Budget amounts, currencies, time periods, and rollover settings
- **Balance History**: Historical account balance snapshots for tracking trends
- **App Preferences**: Theme selection (light/dark/system), language preference (English, Italian, Russian, Spanish, French, Chinese, German, Armenian), and display settings
- **Planned Operations**: Templates for recurring or one-time planned transactions

**Important**: This data is stored in a SQLite database (`penny.db`) in your app's private storage directory. No other apps can access this data, and it never leaves your device except in two specific circumstances: app update checks (no financial data transmitted) and optional Google Sheets export (only when you explicitly trigger it).

### 2.2 Technical Data (Collected by Third Parties)

#### Expo Over-the-Air Updates

Penny uses Expo's update service to deliver minor bug fixes and improvements without requiring a full app reinstall. This service collects:

- **Update Requests**: App version, platform (Android), device type, runtime version
- **Update Success/Failure**: Whether updates were successfully applied

No personal information or financial data is transmitted during update checks.

**Expo's Privacy Policy**: [https://expo.dev/privacy](https://expo.dev/privacy)

#### GitHub Releases API (App Update Checks)

When checking for new major app versions, Penny contacts the GitHub public API (`api.github.com`) to compare your current version against the latest release. This transmits:

- **App version**: Current version string (e.g., `Penny/0.86.2`)
- **Request metadata**: Standard HTTP headers (no personal or financial data)

No financial data is transmitted. GitHub's API is public and unauthenticated.

**GitHub's Privacy Policy**: [https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)

#### Google Sheets Export (Optional)

Penny offers an optional feature to export your financial data directly to a Google Sheets spreadsheet. This feature:

- **Requires Google Sign-In**: Uses your Google account via `@react-native-google-signin/google-signin`
- **Sends financial data to Google**: When you trigger an export, your transaction and account data is transmitted to Google's Sheets API and stored in your Google Drive
- **Is entirely opt-in**: The feature only activates when you explicitly initiate an export from Settings
- **Uses your own Google account**: Data goes to a spreadsheet in your Google Drive, not to our servers

**Important**: Once exported to Google Sheets, your financial data is subject to Google's privacy policy and storage practices, not ours.

**Google's Privacy Policy**: [https://policies.google.com/privacy](https://policies.google.com/privacy)

### 2.3 Information We Do NOT Collect

Penny does **not** collect, store, or have access to:

- Personal names, email addresses, or phone numbers (Google Sign-In credentials are used only to authorize the Sheets export and are not stored by us)
- Location data or GPS coordinates
- Contact lists or address books
- Banking credentials or account login information
- Credit card numbers or payment information
- Biometric data (fingerprints, facial recognition)
- Social media profiles or connections
- Browsing history or activity outside the app
- Device identifiers for advertising purposes
- Crash logs, error reports, or usage analytics (Penny has no crash reporting service)

---

## 3. How We Use Your Information

### Financial Data (Local Storage):
- Stored locally to provide core app functionality (tracking accounts, transactions, budgets, categories)
- Used to generate graphs, statistics, and financial insights displayed within the app
- Remains on your device and under your complete control

### Google Sheets Export Data:
- Transmitted to Google's Sheets API only when you explicitly initiate an export
- Written to a spreadsheet in your own Google Drive account
- We have no access to or copies of this exported data

### Update Data (Expo OTA + GitHub API):
- Used solely to deliver app updates and security patches
- Ensures you have the latest bug fixes and features
- No personal or financial data is included in update requests

### We do NOT:
- Sell, rent, or share your data with advertisers, marketers, or data brokers
- Use your financial data for any purpose other than providing app functionality
- Track your behavior for analytics or advertising purposes
- Profile users or create marketing segments
- Collect crash reports, error logs, or usage analytics

---

## 4. Data Storage and Security

### 4.1 Local Storage

All your financial data is stored in a SQLite database file (`penny.db`) in your app's private storage directory on your Android device. This storage is:

- **Private**: Only accessible by the Penny app, protected by Android's app sandboxing
- **Unencrypted**: Stored in plaintext on your device (standard for Android apps)
- **Device-Dependent**: If you uninstall the app or perform a factory reset, all data is permanently deleted

#### Security Recommendations:
- Enable device-level encryption in your Android settings
- Use a strong device lock screen (PIN, pattern, password, or biometric)
- Create regular backups (see Backup & Export section below)

### 4.2 Backup & Export Security

Penny allows you to manually export your data in three formats:

- **JSON**: Complete database backup in JSON format
- **CSV**: Spreadsheet-compatible format for analysis
- **SQLite**: Raw database file for complete restoration

#### Important Security Notes:
- Exported files are **unencrypted** and contain all your financial data in plaintext
- Anyone with access to these files can read your complete financial history
- We recommend storing backups securely:
  - Use encrypted cloud storage (Google Drive with encryption, encrypted folders)
  - Store on encrypted external drives
  - Password-protect compressed archives (ZIP with password)
- Never share backup files via unsecured channels (email, messaging apps)

---

## 5. Data Sharing and Third Parties

### Third-Party Services:

Penny integrates with three third-party services:

1. **Expo OTA Updates**: Minor update checks sent to Expo's servers. No personal or financial data transmitted.

2. **GitHub Releases API**: Version checks sent to `api.github.com` to detect new APK releases. Only app version string transmitted; no personal or financial data.

3. **Google Sheets API (optional)**: When you use the Google Sheets export feature, your financial data is sent to Google's API and stored in your Google Drive. This is entirely opt-in and only happens when you explicitly trigger it.

### No Data Sharing:
- We do **not** share, sell, rent, or trade your data with any third parties
- We do **not** use analytics or crash reporting services (no Sentry, no Firebase, no Google Analytics, etc.)
- We do **not** integrate with advertising networks
- We do **not** send your financial data to our own servers

### Legal Requirements:
- Because we don't collect or store your personal data on our servers, we have no data to provide to authorities even if legally required
- Your data remains on your device under your control

---

## 6. Your Rights and Data Control

You have complete control over your data in Penny:

**Access**: You can view all your financial data within the app at any time.

**Export**: Use the Settings > Backup/Export feature to download your complete database in JSON, CSV, or SQLite format.

**Delete**:
- Delete individual transactions, accounts, categories, or budgets within the app
- Delete all data using Settings > Advanced > Reset Database
- Uninstall the app to permanently remove all local data

**Modify**: Edit any financial data (transactions, accounts, categories, budgets) within the app at any time.

**Portability**: Exported data can be imported into other financial apps or analyzed with spreadsheet software.

**Google Sheets Data**: If you've exported data to Google Sheets and want it removed, delete the spreadsheet directly from your Google Drive. We have no access to or copies of that data.

**No Account Required**: Penny doesn't use its own accounts, logins, or cloud sync, so there's no account to delete or profile to manage. Google Sign-In is used only to authorize the optional Sheets export.

---

## 7. Data Retention

**Local Data**: Penny retains all financial data on your device indefinitely until you delete it or uninstall the app. You control retention periods.

**Expo Update Data**: Expo retains update request logs for operational purposes (typically 30-90 days). No personal or financial data is included.

**GitHub API Data**: GitHub may log API requests (app version, IP address) per their standard server logging practices.

**Google Sheets Data**: If you use the Sheets export feature, data is retained in your Google Drive until you delete it. Subject to Google's data retention policies.

---

## 8. Children's Privacy (COPPA Compliance)

Penny is not directed at children under 13 years of age. We do not knowingly collect personal information from children under 13.

Because Penny:
- Does not require registration or personal information
- Stores all data locally on the device
- Does not collect personal information

We have no way to determine if users are under 13. Parents and guardians should supervise children's use of financial apps and ensure device-level parental controls are enabled.

If you have concerns about a child under 13 using Penny, please contact us at lopatinikita+pennyapp@gmail.com.

---

## 9. International Data Transfers

**Your Financial Data**: Never leaves your device, so no international transfers occur.

**Expo OTA Updates**: Expo's update service may involve data transfers across borders depending on your location. Only technical update metadata is transmitted (no personal or financial data).

**GitHub API**: Update version checks contact GitHub's US-based servers. Only app version metadata is transmitted.

**Google Sheets Export (if used)**: Your financial data is transmitted to Google's servers, which may be located in multiple countries depending on your Google account settings. Subject to Google's data transfer policies and GDPR compliance measures.

---

## 10. Permissions Explained

Penny requires the following Android permissions:

**INTERNET**:
- **Purpose**: Check for app updates (Expo OTA + GitHub Releases API) and enable optional Google Sheets export
- **Data Transmitted**: App version metadata for update checks; your financial data only if you explicitly trigger a Google Sheets export
- **NOT used for**: Uploading financial data without your action, analytics, advertising, or tracking

**REQUEST_INSTALL_PACKAGES**:
- **Purpose**: Install APK update files that you download through the in-app update prompt
- **When used**: Only when you confirm an update download and choose to install it
- **NOT used for**: Installing any software without your explicit confirmation

**File access (via Expo document picker)**:
- Penny uses Expo's file system APIs to read backup files you select for import and write backup files you request to export
- This does not require legacy `READ_EXTERNAL_STORAGE` or `WRITE_EXTERNAL_STORAGE` permissions on modern Android versions
- Access is limited to files you explicitly select or locations you choose

All permissions are used only for their stated purposes and not for tracking, advertising, or data collection.

---

## 11. Security Measures

### App-Level Security:
- SQLite database with foreign key constraints to maintain data integrity
- Atomic transactions to prevent data corruption
- Error boundaries to handle crashes gracefully
- Code obfuscation (R8/ProGuard) to protect against reverse engineering

### Device-Level Security Recommendations:
- Enable Android device encryption (Settings > Security)
- Use strong screen lock (PIN, password, pattern, or biometric)
- Install Penny only from official Google Play Store
- Keep your Android OS updated with latest security patches
- Enable Google Play Protect for app scanning

### Backup Security:
- Store exported backups in encrypted locations
- Use password-protected archives for backup files
- Avoid sharing backup files via unsecured channels

### Limitations:
- Local storage is not encrypted by the app (standard Android app behavior)
- Physical access to an unlocked device allows access to Penny data
- Exported backups are unencrypted plaintext files

---

## 12. Changes to This Privacy Policy

We may update this Privacy Policy periodically to reflect:
- Changes in data handling practices
- New features or functionality
- Legal or regulatory requirements
- User feedback and transparency improvements

### Notification of Changes:
- Updated Effective Date will be shown at the top of this policy
- Material changes will be announced via an in-app notification
- Continued use of Penny after changes constitutes acceptance

### Version History:
- **Version 1.0** (January 5, 2026) - Initial privacy policy

We encourage you to review this policy periodically. The current version is always available at: [https://heywood8.github.io/money-tracker/PRIVACY_POLICY](https://heywood8.github.io/money-tracker/PRIVACY_POLICY)

---

## 13. Contact Information

If you have questions, concerns, or requests regarding this Privacy Policy or Penny's data practices:

**Developer**: heywood8
**Email**: lopatinikita+pennyapp@gmail.com
**GitHub**: [https://github.com/heywood8/money-tracker](https://github.com/heywood8/money-tracker)
**Privacy Policy URL**: [https://heywood8.github.io/money-tracker/PRIVACY_POLICY](https://heywood8.github.io/money-tracker/PRIVACY_POLICY)

**Response Time**: We aim to respond to privacy inquiries within 7 business days.

### Requests We Can Help With:
- Questions about data handling practices
- Bug reports or security concerns
- Privacy policy clarifications

### Requests We Cannot Help With:
- Recovering lost local data (we don't have access to your device)
- Resetting forgotten device passwords
- Accessing data from uninstalled apps

---

## 14. Google Play Store Data Safety

This section summarizes how Penny's data practices align with Google Play Store's Data Safety requirements:

### Data Collection:
- ❌ No personal information (name, email, phone, address)
- ❌ No location data
- ❌ No photos, videos, or audio
- ❌ No contacts or calendar data
- ❌ No crash logs or error reports (Penny has no crash reporting service)
- ✅ Financial data — stored locally on device only, never collected by us
- ✅ Google account used for optional Sheets export (not stored by us)

### Data Usage:
- **App functionality**: All financial data stored locally on device
- **Optional export**: Financial data sent to Google Sheets only when you explicitly trigger it
- **No analytics or crash reporting**
- **No advertising**
- **No data shared with third parties** except Google (only if you use the Sheets export feature)

### Data Security:
- Data encrypted in transit (HTTPS for Expo/GitHub/Google APIs)
- Local data stored in Android app sandbox
- No cloud sync or backup to our servers
- Google Sheets export data can be deleted by removing the spreadsheet from your Drive

---

*This privacy policy was created to ensure transparency about how Penny handles your data. Your privacy is important to us, and we've designed Penny to keep your financial information secure and under your control.*
