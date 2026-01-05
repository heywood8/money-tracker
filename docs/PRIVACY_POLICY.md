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
- **Minimal External Services**: We use only essential services (error reporting and app updates) with privacy protections

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

**Important**: This data is stored in a SQLite database (`penny.db`) in your app's private storage directory. No other apps can access this data, and it never leaves your device except in two specific circumstances described below (error reporting and manual backups).

### 2.2 Technical Data (Collected by Third Parties)

#### Sentry Error Reporting

To improve app stability and fix crashes, Penny uses Sentry (sentry.io) for error tracking. When the app experiences an error or crash, Sentry may collect:

- **Error Information**: Error messages, stack traces, and code execution logs
- **Device Information**: Device model, operating system version, app version
- **Session Data**: Timestamp of the error, app state at time of crash
- **Session Replays**: Visual recordings of 10% of app sessions and 100% of sessions with errors (anonymized)

**Privacy Configuration**: We have configured Sentry with `sendDefaultPii: false` to prevent transmission of personally identifiable information. Financial data (account balances, transaction amounts, descriptions) is **not included** in error reports.

**Data Location**: Sentry stores data on servers in Germany (EU data residency).

**Sentry's Privacy Policy**: [https://sentry.io/privacy/](https://sentry.io/privacy/)

#### Expo Updates

Penny uses Expo's over-the-air update service to deliver bug fixes and feature improvements without requiring a full app store update. This service collects:

- **Update Requests**: App version, platform (Android), device type
- **Update Success/Failure**: Whether updates were successfully applied

No personal information or financial data is transmitted during update checks.

**Expo's Privacy Policy**: [https://expo.dev/privacy](https://expo.dev/privacy)

### 2.3 Information We Do NOT Collect

Penny does **not** collect, store, or have access to:

- Personal names, email addresses, or phone numbers
- Location data or GPS coordinates
- Contact lists or address books
- Banking credentials or account login information
- Credit card numbers or payment information
- Biometric data (fingerprints, facial recognition)
- Social media profiles or connections
- Browsing history or activity outside the app
- Device identifiers for advertising purposes

---

## 3. How We Use Your Information

### Financial Data (Local Storage):
- Stored locally to provide core app functionality (tracking accounts, transactions, budgets, categories)
- Used to generate graphs, statistics, and financial insights displayed within the app
- Remains on your device and under your complete control

### Error Data (Sentry):
- Used solely to identify and fix bugs, crashes, and performance issues
- Helps us improve app stability and user experience
- Reviewed by our development team only when investigating specific issues

### Update Data (Expo):
- Used solely to deliver app updates and security patches
- Ensures you have the latest bug fixes and features

### We do NOT:
- Sell, rent, or share your data with advertisers, marketers, or data brokers
- Use your financial data for any purpose other than providing app functionality
- Track your behavior for analytics or advertising purposes
- Profile users or create marketing segments

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

Penny integrates with only two third-party services:

1. **Sentry (Error Tracking)**: As described in Section 2.2, error reports and crash logs are sent to Sentry (Germany-based servers) for debugging purposes only.

2. **Expo Updates**: Update checks are sent to Expo's servers to deliver over-the-air updates.

### No Data Sharing:
- We do **not** share, sell, rent, or trade your data with any third parties
- We do **not** use analytics services (no Google Analytics, Firebase Analytics, Facebook SDK, etc.)
- We do **not** integrate with advertising networks
- We do **not** send your financial data to any servers (ours or third-party)

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

**Sentry Data Deletion**: If you'd like error data associated with your device removed from Sentry, contact us at lopatinikita+pennyapp@gmail.com with your request.

**No Account Required**: Penny doesn't use accounts, logins, or cloud sync, so there's no account to delete or profile to manage.

---

## 7. Data Retention

**Local Data**: Penny retains all financial data on your device indefinitely until you delete it or uninstall the app. You control retention periods.

**Sentry Error Data**: Sentry retains error reports for 90 days by default, after which they are automatically deleted.

**Expo Update Data**: Expo retains update request logs for operational purposes (typically 30-90 days).

---

## 8. Children's Privacy (COPPA Compliance)

Penny is not directed at children under 13 years of age. We do not knowingly collect personal information from children under 13.

Because Penny:
- Does not require registration or personal information
- Stores all data locally on the device
- Does not collect personal information

We have no way to determine if users are under 13. Parents and guardians should supervise children's use of financial apps and ensure device-level parental controls are enabled.

If you believe a child under 13 has used Penny and you'd like error data removed from Sentry, please contact us at lopatinikita+pennyapp@gmail.com.

---

## 9. International Data Transfers

**Your Financial Data**: Never leaves your device, so no international transfers occur.

**Sentry Data (Error Reports)**: If you're located outside the European Union, error data sent to Sentry (hosted in Germany, EU) constitutes an international data transfer. Sentry complies with GDPR and provides appropriate safeguards for EU data protection standards.

**Expo Updates**: Expo's update service may involve data transfers across borders depending on your location. Only technical update metadata is transmitted (no personal or financial data).

---

## 10. Permissions Explained

Penny requires the following Android permissions:

**INTERNET**:
- **Purpose**: Send error reports to Sentry and check for app updates via Expo
- **Data Transmitted**: Error logs (crashes, bugs) and update check requests only
- **NOT used for**: Uploading financial data, analytics, advertising, or tracking

**READ_EXTERNAL_STORAGE**:
- **Purpose**: Import backup files you've previously exported
- **Access**: Only files you explicitly select via the file picker
- **NOT used for**: Scanning your files, reading photos, or accessing unrelated documents

**WRITE_EXTERNAL_STORAGE**:
- **Purpose**: Export backup files (JSON, CSV, SQLite) to your device storage
- **Access**: Only writes backup files you request
- **NOT used for**: Writing data without your knowledge

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
- Requests to delete Sentry error data
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
- ✅ Crash logs (via Sentry, no PII, optional)
- ✅ App performance data (via Sentry, anonymized)

### Data Usage:
- **App functionality**: Financial data stored locally
- **App analytics**: Error tracking only (Sentry)
- **No advertising**
- **No data shared with third parties** except Sentry (error logs only)

### Data Security:
- Data encrypted in transit (HTTPS for Sentry/Expo)
- Local data stored in Android app sandbox
- No cloud sync or backup to our servers
- You can request data deletion (Sentry error logs)

---

*This privacy policy was created to ensure transparency about how Penny handles your data. Your privacy is important to us, and we've designed Penny to keep your financial information secure and under your control.*
