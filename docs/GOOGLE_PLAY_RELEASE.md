# Publishing Penny to Google Play

Penny ships through two channels, and they are not the same binary.

| | GitHub Releases | Google Play |
|---|---|---|
| Artifact | APK (`penny-v*_arm64.apk`, `_x86_64.apk`) | App Bundle (`.aab`) |
| Build profile | `preview` / `emulator` / `x86` | `production` |
| `APP_VARIANT` | `preview` / `emulator` / `x86` | `production` |
| `DISTRIBUTION_CHANNEL` | unset | `play` |
| `REQUEST_INSTALL_PACKAGES` | declared | **not** declared |
| In-app updater | downloads and installs the next APK | opens the Play listing |
| Workflow | `.github/workflows/build-release-apk.yml` | `.github/workflows/play-release.yml` |

## Why builds stay local

EAS cloud builds are metered: 15 Android builds a month on the free plan, and
about $1 per build on paid plans. This repo cut 100 releases in the 45 days to
16 Sep 2026, so a cloud build per release exhausts the free quota in under a
week and costs real money after that. That is why `build-release-apk.yml` uses
`eas build --local`, and why the Play workflow does too.

EAS Submit is the part that is free on every plan, and it accepts a locally
built artifact:

```bash
eas submit --platform android --profile internal --path ./penny.aab
```

So publishing to Play costs no EAS build quota at all.

## Why the Play build has no in-app updater

Two separate Google Play rules land on the same feature:

1. **`REQUEST_INSTALL_PACKAGES` is restricted.** Declaring it requires that the
   app's core functionality is sending or receiving app packages *and*
   user-initiated installation of them: browsers, messengers with attachments,
   file managers, enterprise device management, backup/restore, device
   migration. A finance tracker is none of those, and the permission triggers a
   Play Console declaration form that cannot be answered honestly.
2. **Self-updating is banned outright.** The Device and Network Abuse policy
   forbids an app updating itself by any mechanism other than Play, so even a
   granted permission would not make the feature legal.

`app.config.js` therefore drops the permission when `DISTRIBUTION_CHANNEL=play`,
and sets `extra.distributionChannel` to `play`. That flag is deliberately not
`APP_VARIANT`: `emulator-screenshots.yml` prebuilds with `APP_VARIANT=production`
without being a store build, so overloading it would have silently turned a CI
screenshot job into a Play-shaped binary. Only the `production` profile in
`eas.json` sets `DISTRIBUTION_CHANNEL`. At runtime
`app/services/distribution.js` reads that value, and everything that downloads
or installs an APK checks `supportsInAppUpdates()` first.

**The update check itself still runs on Play builds.** Reading the GitHub
releases API is an ordinary HTTP request and breaks no rule, so the Play build
still notices a new version and still shows the "Update available" prompt. What
changes is the button: it says "Update in Google Play" and opens the listing
(`market://details?id=com.heywood8.monkeep`, falling back to the https URL)
instead of fetching an APK.

### Known limitation: EAS Update can overwrite the flag

`extra.distributionChannel` travels with the JS bundle, so an over-the-air update
republishes whatever `app.config.js` evaluated to when `eas update` ran. Publish
an update to the `production` channel without `DISTRIBUTION_CHANNEL=play` in the
environment and a Play install would start believing it is the GitHub build: it
would offer "Update now" and then fail at the installer, because the permission
is missing from the binary and no OTA can add it. The store binary stays
compliant either way; what breaks is the button.

So: **any `eas update` targeting the `production` channel must run with
`DISTRIBUTION_CHANNEL=play` set.** Nothing publishes OTA updates automatically
today (`eas-build-android.yml` is `workflow_dispatch` only), which is why this is
a documented rule rather than a guard.

One consequence worth knowing: the GitHub tag is cut before the Play release is
live, so between a tag and its Play rollout the prompt can send a user to a
listing that still offers the version they already have. The internal track
publishes instantly, so the window is small there; on the production track it is
as long as Play's review takes. If that becomes annoying, the fix is the Play
In-App Updates API (`com.google.android.play:app-update`), which asks Play
directly instead of inferring from GitHub. It needs a native module, so it is
not a config change.

## One-time setup

### 1. Google service account

EAS Submit authenticates to Play with a service account key. **It is stored on
the EAS side, not in this repository** — Expo keeps it with the project's Android
credentials, encrypted at rest, and reuses it for every submission. Check whether
one is already there before creating anything:

```bash
eas credentials -p android     # Service Credentials → Google Service Account Key
```

or open the project's **Credentials** page in the EAS dashboard.

If there is none:

1. In Play Console: **Setup → API access**, link (or create) a Google Cloud
   project, then create a service account.
2. Grant it the **Release manager** role, or at minimum "Release apps to testing
   tracks" and "Manage production releases" for `com.heywood8.monkeep`.
3. Create a JSON key for the service account and download it.
4. Upload it in the EAS dashboard: **Credentials → Android → com.heywood8.monkeep
   → Service Credentials → Add a Google Service Account Key**.

Because the key lives on EAS, the workflow needs no Play secret of its own and no
Release-manager private key ever touches a CI runner.

**Alternative: keep the key in a repository secret.** If you would rather not
store it on Expo's servers, add the JSON as a secret, have the workflow write it
to `google-play-service-account.json` (already in `.gitignore`) and delete it in
an `if: always()` step, and point the submit profiles at it with
`"serviceAccountKeyPath": "./google-play-service-account.json"`. That path is
supported, just noisier.

### 2. Upload key

The Play workflow signs with the same `MYAPP_UPLOAD_*` secrets the APK workflow
uses. With Play App Signing enabled, Google re-signs the bundle with the app
signing key, so what matters is that this keystore matches the **upload
certificate** registered for `com.heywood8.monkeep`.

If it does not, the first submit fails with a signature error. Either register
this key as the upload key in Play Console (**Setup → App integrity → App
signing → upload key certificate**), or add the real upload keystore under new
secrets and point the workflow at them.

### 3. versionCode

`eas.json` sets `cli.appVersionSource: "remote"`, so EAS stores the
`versionCode` and the `production` profile's `autoIncrement: true` bumps it on
every build. Play requires it to increase monotonically and rejects anything at
or below what it already has.

If the remote counter has drifted below what Play holds, set it once:

```bash
eas build:version:set --platform android
```

## Releasing

Run **Actions → Publish to Google Play → Run workflow** and pick a track:

- **`internal`** — internal testing. Live immediately, no review, no tester
  minimum. The default, and the right choice for ordinary releases.
- **`closed`** — closed testing (Play's `alpha` track). This is a *different*
  track from internal testing, and it is the one that counts toward the
  12-testers/14-days production-access requirement — an upload to `internal`
  does nothing for that clock. Use this while the app is in closed testing.
  If the closed track has been renamed from the default in Play Console, change
  `submit.closed.android.track` in `eas.json` to match.
- **`production`** — uploads a **draft** release. Nothing reaches users until
  you promote it by hand in Play Console. Deliberate: this repo cuts releases
  roughly twice a day, and pushing each one to production users is neither
  useful nor reviewable.

### Retrying a submit without rebuilding

The build takes about 33 minutes; the submit that follows takes about 90 seconds.
When a submit fails for a reason that has nothing to do with the bundle — a
missing service account key, a Play permission not granted yet — rebuilding is
pure waste. Every run uploads its bundle as the `penny-aab` artifact, so paste
that run's id into the **aab_run_id** input and the workflow downloads the
bundle and goes straight to the submit step.

Leave `aab_run_id` empty for an ordinary release.

The workflow is manual on purpose. Once a dispatched run has succeeded end to
end, you can make it fire on every release tag by adding to `play-release.yml`:

```yaml
  push:
    tags:
      - 'penny-v*'
```

Until the upload key and service account are proven, an automatic trigger would
just paint CI red twice a day.

## First submission checklist

If `com.heywood8.monkeep` has never had a bundle uploaded, do the first one by
hand in Play Console so you can see exactly what Play objects to. After that,
`eas submit` handles it.

Play will also want, independently of anything in this repo:

- a store listing (title, description, screenshots, feature graphic)
- a **Data safety** form, which must cover the location data the
  attach-location-to-operations feature collects
- a publicly hosted privacy policy URL (the text lives in
  `docs/PRIVACY_POLICY.md`)
- a **location permissions** declaration for `ACCESS_FINE_LOCATION`
- a declaration for the `NotificationListenerService` that
  `plugins/withNotificationListener.js` registers — Play reviews notification
  access closely and it is a common rejection reason
- for a personal developer account created on or after 13 Nov 2023, a closed
  test with at least 12 testers opted in continuously for 14 days before you can
  apply for production access

## Existing GitHub installs cannot upgrade in place

Play App Signing re-signs the bundle, so the Play build and the GitHub APK carry
different signatures. Android refuses to install one over the other. A user who
installed from GitHub has to uninstall first, which wipes the local SQLite
database.

Tell them to export a backup (**Settings → Export**) before switching, and
restore it afterwards. This is not something the app can work around.
