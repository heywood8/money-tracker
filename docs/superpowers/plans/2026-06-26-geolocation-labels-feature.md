# Geolocation Coordinates & Location-Based Label Suggestions — Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optionally attach the device's geolocation (latitude/longitude + a human-readable place label) to an operation at creation time, and use that location to power smarter label suggestions — primarily by surfacing the labels the user has historically used at the *same place*, secondarily by offering the reverse-geocoded place name / district as ready-made labels.

**Tech Stack:** React Native + Expo (managed workflow), `expo-location` (new dependency), Drizzle ORM over `expo-sqlite`, existing label system (`app/utils/labelUtils.js`).

**Status:** Design only. No code is changed by this document.

---

## 1. Why this design

The app already has a mature **label system** (`labelUtils.js`): labels live inside the operation's `description` column as a `|`-delimited list, and `LabelInput` renders them as chips with an autocomplete chip strip fed by `OperationsDB.getDistinctLabels()`. That existing pipeline is exactly the right place to inject location-aware suggestions — we add a new *source* of suggestions, we do not invent a new UI.

The single highest-value behaviour is **proximity recall**: "the last 6 times you were within ~150 m of here, you tagged the operation `Coffee` / `Starbucks`." This reuses the label store with zero new label semantics. Reverse-geocoding (turning coordinates into "Yerevan · Kentron" or a POI name) is a useful but secondary suggestion source and is also the only thing that needs network/permission beyond the GPS fix.

Design principles, in priority order:

1. **Privacy-first & opt-in.** Location is never captured unless the user turns it on. Foreground-only permission, requested lazily. A captured location can always be removed from an operation.
2. **Reuse, don't reinvent.** Suggestions flow through the existing `labelSuggestions` → `LabelInput` path. Coordinates ride along the operation through the same `mapOperationFields` / `createOperationInTx` / `updateOperation` plumbing.
3. **Graceful degradation.** Denied permission, GPS timeout, airplane mode, or a failed reverse-geocode must never block saving an operation. Worst case: the operation saves with no location, exactly like today.
4. **Bounded work.** Proximity queries use a SQL bounding-box prefilter + a JS haversine refine, mirroring the existing `getDistinctLabels` "scan a capped window, aggregate in JS" pattern. No full-table scans on the hot path.

---

## 2. Data model

### 2.1 Schema changes (`app/db/schema.js`)

Add four nullable columns to the `operations` table:

| Column | Type | Notes |
|--------|------|-------|
| `latitude` | `text('latitude')` | Decimal degrees, stored as string (consistent with the codebase's "numbers as strings" convention; `parseFloat` at use). Nullable. |
| `longitude` | `text('longitude')` | Decimal degrees, string. Nullable. |
| `locationLabel` | `text('location_label')` | Cached reverse-geocoded display string (e.g. `"Kentron, Yerevan"` or a POI name). Nullable. Avoids re-geocoding on every render. |
| `locationAccuracy` | `text('location_accuracy')` | Reported accuracy in metres (string). Nullable. Used to decide whether a fix is trustworthy enough to use for proximity. |

Add a composite index to support the bounding-box prefilter:

```js
locationIdx: index('idx_operations_location').on(table.latitude, table.longitude),
```

Rationale for storing coordinates as `text`: the rest of the schema stores all "numbers that must round-trip exactly" (amounts, balances, rates) as text and parses on read. Coordinates do not need decimal-string precision the way currency does, but using `text` keeps null-handling and the backup/restore/CSV mappers uniform, and sidesteps any REAL-vs-string surprises in the JSON/SQLite export paths. (Alternative: `real` columns — acceptable, but then every export/import mapper must special-case numeric nulls. Not worth it.)

### 2.2 Migration (`drizzle/0009_add_operation_location.js`)

New migration following the established hand-written style (see `0008_soft_delete_accounts.js`). SQLite requires one `ADD COLUMN` per statement:

```sql
ALTER TABLE `operations` ADD COLUMN `latitude` text;
ALTER TABLE `operations` ADD COLUMN `longitude` text;
ALTER TABLE `operations` ADD COLUMN `location_label` text;
ALTER TABLE `operations` ADD COLUMN `location_accuracy` text;
CREATE INDEX IF NOT EXISTS `idx_operations_location` ON `operations` (`latitude`,`longitude`);
```

Plus:
- Append the entry to `drizzle/meta/_journal.json` and add the `meta/0009_snapshot.json`.
- Update `app/services/db.js` `verifyDatabaseIntegrity()` to assert the `latitude` column exists (mirrors the existing "Check operations has original_balance (migration 0006)" guard), so a fresh-vs-migrated DB is detected correctly.

> ⚠️ The `android/` folder is gitignored and migrations are bundled via `drizzle/migrations`. Generate the snapshot with the project's normal Drizzle Kit flow rather than hand-editing the meta JSON if possible, then verify `syncMigrationRecords` still lines up the journal count.

---

## 3. Native capability: `expo-location`

Verified against current Expo docs (SDK 52–54) via context7. The three APIs we need:

- `Location.requestForegroundPermissionsAsync()` → `{ status }`. **Required on Android before any geocoding.**
- `Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })` → `{ coords: { latitude, longitude, accuracy } }`.
- `Location.reverseGeocodeAsync({ latitude, longitude })` → array of `LocationGeocodedAddress` (`name`, `street`, `district`, `city`, `subregion`, `region`, `country`). Docs warn it is **resource-consuming**; call it at most once per capture, never in a loop, never in the background.

### 3.1 Install & config

- `npx expo install expo-location`.
- `app.config.js`: add the Android permissions and the config-plugin entry. The app is Android-only.

```js
android: {
  // …existing…
  permissions: [
    'android.permission.REQUEST_INSTALL_PACKAGES',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
  ],
},
plugins: [
  // …existing…
  [
    'expo-location',
    {
      locationAlwaysAndWhenInUsePermission: false,
      isAndroidForegroundServiceEnabled: false,
    },
  ],
],
```

We request **foreground only**. No background location, no `ACCESS_BACKGROUND_LOCATION`. `ACCESS_COARSE_LOCATION` is enough for label recall at ~150 m radius; `ACCESS_FINE_LOCATION` improves the fix when the user has granted precise location but is not required.

### 3.2 Service wrapper (`app/services/LocationService.js` — new)

A thin, defensive wrapper so the rest of the app never touches `expo-location` directly (also makes mocking trivial in tests):

```js
// Returns { granted: boolean, canAskAgain: boolean }
export const ensureLocationPermission = async () => { /* requestForegroundPermissionsAsync */ };

// Returns { latitude, longitude, accuracy } | null  (never throws)
export const getCurrentLocation = async ({ timeoutMs = 8000 } = {}) => { /* getCurrentPositionAsync w/ Promise.race timeout */ };

// Returns a short display label | null  (never throws; swallows geocoder errors)
export const reverseGeocode = async ({ latitude, longitude }) => { /* reverseGeocodeAsync → format */ };
```

`reverseGeocode` formatting picks the most useful non-empty components, preferring a POI `name` when it differs from `street`, else `district`/`city`. Result is clamped to `MAX_LABEL_LENGTH` so it is a legal label. All three functions are individually try/caught and return `null`/`{granted:false}` on any failure — capture must be best-effort.

> Note: Android's `reverseGeocodeAsync` uses the platform `Geocoder`, which on most devices needs connectivity. When offline it returns `[]` → we store coordinates only, no `locationLabel`. Proximity recall still works fully offline because it only needs the raw coordinates already in the DB.

---

## 4. Settings & permission UX

### 4.1 Opt-in toggle

Add a preference, defaulting **off**, following the `DisplaySettingsContext` + `PreferencesDB` pattern already used for `hideBalances`:

- New key in `PREF_KEYS`: `ATTACH_LOCATION` (e.g. `'attach_location'`).
- New state in `DisplaySettingsContext`: `attachLocation` / `setAttachLocation` (persisted via `setPreference`, read on mount).
- New row in `SettingsModal` ("Attach location to operations") — a plain switch row, no subpanel needed. When toggled on for the first time, call `ensureLocationPermission()` so the OS prompt appears in a clear context; if denied, flip the toggle back off and show an inline hint (reuse the subpanel inline-feedback convention if a rationale screen is wanted later).

### 4.2 Permission states

| State | Behaviour |
|-------|-----------|
| Toggle off | No capture, no permission prompt, location row hidden in the operation form. |
| Toggle on, permission `granted` | Auto-attempt a fix when a **new** operation modal opens (see §5). |
| Toggle on, permission `denied` but `canAskAgain` | Location row shows a "Enable location" affordance that re-requests. |
| Toggle on, permission permanently denied | Row shows a one-line hint pointing to system settings; never nags. |

---

## 5. Capture flow (operation modal)

Capture happens **only for new operations** (`isNew === true`) and **only when `attachLocation` is on**. Editing an existing operation shows whatever location it already has (with a remove affordance) but does not silently re-capture.

### 5.1 New hook `app/hooks/useOperationLocation.js`

Owns the capture lifecycle, kept out of the already-large `useOperationForm`:

```js
const {
  location,            // { latitude, longitude, accuracy, label } | null
  status,              // 'idle' | 'capturing' | 'ready' | 'denied' | 'error'
  capture,             // () => Promise<void>  manual (re)capture
  clearLocation,       // () => void           user removed it
  setLocationFromOperation, // hydrate when editing
} = useOperationLocation({ enabled: attachLocation, isNew, visible });
```

Behaviour:
- On modal open for a new op with `enabled`, run `capture()` once: permission → `getCurrentLocation()` → set coords immediately (`status: 'ready'`) → fire-and-forget `reverseGeocode()` to fill `label` when it resolves. Coordinates appear fast; the label fills in a beat later.
- `capture` is idempotent per open and debounced; never blocks the UI; all failures land in `status` without throwing.
- `clearLocation()` wipes coords + label so the saved op has `latitude=null`.

### 5.2 Wiring into `useOperationForm` / `prepareOperationData`

`prepareOperationData` already merges `values` with `overrides` and returns the object passed to `addOperation`/`updateOperation`. Extend the returned data with `latitude`, `longitude`, `locationLabel`, `locationAccuracy` taken from the location hook (passed in via `overrides` at save time, exactly like the flushed half-typed label). No change to the multi-currency logic.

### 5.3 Form UI (`OperationFormFields.js` / `OperationModal.js`)

A new compact **location row** rendered above or below `LabelInput` (only when `attachLocation` is on):

- `capturing`: spinner + "Getting location…".
- `ready`: map-pin icon + `locationLabel` (or `lat, lng` rounded to 4 dp if no label yet) + a small ✕ to `clearLocation`.
- `denied`/`error`: muted "Add location" button that re-triggers `capture`.

Follows existing inline-feedback conventions (no nested modal, no dialog). Coordinates are display-rounded but stored full-precision.

---

## 6. Location-based label suggestions (the core feature)

### 6.1 New DB query `OperationsDB.getLabelsNearLocation(lat, lng, opts)`

```js
/**
 * Most-frequent labels used on past operations within `radiusMeters` of (lat,lng).
 * @returns Promise<string[]>  ranked, de-duplicated, hidden/system labels excluded
 */
export const getLabelsNearLocation = async (lat, lng, { radiusMeters = 150, limit = 8 } = {}) => { … }
```

Implementation, mirroring `getDistinctLabels`'s shape:

1. **Bounding-box prefilter in SQL** (uses `idx_operations_location`). Compute a lat/lng delta from `radiusMeters` (`dLat = r/111320`; `dLng = r/(111320·cos(lat))`), then:
   ```sql
   SELECT description, latitude, longitude, COUNT(*) AS cnt
   FROM operations
   WHERE latitude  IS NOT NULL
     AND latitude  BETWEEN ? AND ?
     AND longitude BETWEEN ? AND ?
     AND description IS NOT NULL AND description != ''
   GROUP BY description, latitude, longitude
   ORDER BY cnt DESC
   LIMIT 2000
   ```
2. **Haversine refine in JS**: drop rows whose true distance > `radiusMeters`. (Box is a superset; this trims the corners and the cos-latitude approximation error.)
3. **Aggregate label frequency** across surviving rows via `parseLabels`, skipping `isHiddenLabel` labels (reuses the exact filter `getDistinctLabels` uses). Optionally weight by `1/(1+distance)` so closer hits rank higher.
4. Return the top `limit` labels.

Distance math goes in a new pure util `app/utils/geoUtils.js` (`haversineMeters(a, b)`, `boundingBox(lat, lng, radiusMeters)`) — pure functions, trivially unit-testable.

### 6.2 Reverse-geocode components as candidate labels

From the captured `LocationGeocodedAddress`, derive 1–3 candidate labels (e.g. POI `name`, `district`, `city`), each `sanitizeLabel`-d. These are *weaker* suggestions than proximity recall.

### 6.3 Merging into the existing suggestion strip

`OperationModal` currently does:

```js
getDistinctLabels(50, values.categoryId || null).then(setLabelSuggestions);
```

New combined effect (still feeding the **same** `labelSuggestions` state → `LabelInput`):

```
1. base       = await getDistinctLabels(50, categoryId)          // unchanged
2. nearby     = location ? await getLabelsNearLocation(lat,lng)  : []
3. placeParts = location?.addressComponents → sanitized labels   : []
4. labelSuggestions = dedupe([...nearby, ...placeParts, ...base]) // proximity first
```

De-dup is case-insensitive (reuse `hasLabel`/lowercase set). `LabelInput`'s `filteredSuggestions` already removes already-applied labels and substring-filters by the current input, and `MAX_SUGGESTION_CHIPS` (8) already caps the strip — so ordering is the only thing we control here, and proximity-derived labels come first. **No change to `LabelInput` is required.**

Re-run the effect when `location` becomes ready (debounced) and when `values.categoryId` changes (as today).

---

## 7. Cross-cutting plumbing

Every place that reads/writes an operation row must learn about the four new columns:

- **`mapOperationFields`** (`OperationsDB.js`): add `latitude`, `longitude`, `locationLabel`, `locationAccuracy` to the returned camelCase object.
- **`createOperationInTx`** + the `INSERT` column/placeholder lists in both `createOperationInTx` and `splitOperation`: add the four columns. New split siblings should **inherit** the parent's location (they happened at the same place).
- **`updateOperation`**: add the four `if (updates.x !== undefined)` blocks.
- **Backup/restore** (`BackupRestore.js`): include the new columns in JSON and CSV export/import. SQLite-format backup needs no change (full DB copy) but the importer's column-mapping must tolerate older backups lacking these columns (treat missing as null).
- **Google Sheets export** (`GoogleSheetsService.js`): add optional columns (latitude, longitude, location label) so exports stay lossless. Keep them at the end so existing sheet layouts don't shift.
- **Planned operations**: out of scope for v1 (a planned/recurring template has no single "place"). Schema untouched there.

---

## 8. Privacy, security & correctness notes

- **Opt-in, foreground-only, removable.** Matches the CLAUDE.md security guidance ("validate inputs", "don't store sensitive data carelessly"). Location is sensitive PII; it is captured only with an explicit toggle + OS permission and can be cleared per-operation.
- **No background capture, no tracking.** A fix is taken at most once per new-operation modal open.
- **Reverse-geocode sparingly** (Expo docs explicitly warn it is rate-limited/expensive) — once per capture, fire-and-forget, failures ignored.
- **Coordinates are display-rounded** (4 dp ≈ 11 m) in the UI but stored full-precision; proximity uses full precision.
- **Exports now contain coordinates** — call this out in the export UI copy / release notes so users know their backups include location.
- **Bounded queries** — both `getDistinctLabels` and `getLabelsNearLocation` cap the SQL scan window (2000 groups) and aggregate in JS, so the operations list / modal open stays fast even with large histories.

---

## 9. Testing (must be 100% green before commit — see CLAUDE.md)

New / updated tests:

1. **`__tests__/utils/geoUtils.test.js`** (new) — `haversineMeters` against known city-pair distances; `boundingBox` symmetry and cos-latitude shrink near the equator vs high latitude; degenerate inputs (NaN, missing, antimeridian — document/accept behaviour).
2. **`__tests__/services/OperationsDB.location.test.js`** (new) — seed operations with coordinates+labels; assert `getLabelsNearLocation` returns the right labels ranked by frequency, excludes far-away ops, excludes `isHiddenLabel` labels, and tolerates rows with null coordinates.
3. **`__tests__/services/LocationService.test.js`** (new) — mock `expo-location`; assert permission-denied, timeout, and reverse-geocode-failure paths all resolve to safe values and never throw.
4. **`__tests__/modals/OperationModal.test.js`** (update) — with `attachLocation` on, suggestions include nearby labels first; with it off, behaviour is identical to today; saving carries lat/lng through; remove-location clears them.
5. **`jest.setup.js`** (update) — global mock for `expo-location` (`requestForegroundPermissionsAsync`, `getCurrentPositionAsync`, `reverseGeocodeAsync`) so existing suites that mount the modal keep passing.
6. **Migration / mapper round-trip** — extend any existing `mapOperationFields` / backup-restore tests to cover the new columns (including older-backup-without-columns import).

Run `npm test -- --silent` throughout; do not commit with failures.

---

## 10. File map

| File | Action |
|------|--------|
| `app/db/schema.js` | Modify — 4 columns + location index on `operations` |
| `drizzle/0009_add_operation_location.js` + `meta/` | Create — migration & snapshot/journal |
| `app/services/db.js` | Modify — integrity check for `latitude` column |
| `app/services/LocationService.js` | Create — expo-location wrapper (permission / fix / reverse-geocode) |
| `app/utils/geoUtils.js` | Create — `haversineMeters`, `boundingBox` (pure) |
| `app/services/OperationsDB.js` | Modify — `getLabelsNearLocation`; extend `mapOperationFields`, `createOperationInTx`, `updateOperation`, `splitOperation` |
| `app/hooks/useOperationLocation.js` | Create — capture lifecycle hook |
| `app/hooks/useOperationForm.js` | Modify — thread location into `prepareOperationData`/save |
| `app/modals/OperationModal.js` | Modify — merge nearby+place suggestions; render location row |
| `app/components/operations/OperationFormFields.js` | Modify — location row UI |
| `app/contexts/DisplaySettingsContext.js` + `app/services/PreferencesDB.js` | Modify — `attachLocation` preference |
| `app/modals/SettingsModal.js` | Modify — "Attach location" switch row |
| `app/services/BackupRestore.js`, `app/services/GoogleSheetsService.js` | Modify — include new columns in export/import |
| `app.config.js` | Modify — Android location permissions + `expo-location` plugin |
| `package.json` | Modify — add `expo-location` |
| `assets/i18n/*.json` (×11) | Modify — new strings (`attach_location`, `getting_location`, `add_location`, `remove_location`, `location_permission_denied`, …) |
| `__tests__/**` + `jest.setup.js` | Create/Modify — see §9 |

---

## 11. Suggested implementation order

1. Schema + migration + `db.js` integrity check; extend `mapOperationFields` & write paths (location persists, no UI yet).
2. `geoUtils` + `getLabelsNearLocation` + their tests.
3. `expo-location` install/config + `LocationService` + tests + `jest.setup` mock.
4. `attachLocation` preference + Settings row.
5. `useOperationLocation` hook + form/modal location row + capture flow.
6. Merge nearby/place suggestions into `labelSuggestions`.
7. Backup/restore + Google Sheets columns.
8. i18n strings for all 11 languages.
9. Full `npm test` green; manual smoke on device (emulator GPS).

---

## 12. Open questions / future work

- **Radius tuning**: 150 m default. Could become a setting, or adapt to reported `accuracy`.
- **POI naming quality** depends on the Android Geocoder; a future enhancement could let the user pin a named place ("Home", "Office") and auto-suggest its labels by proximity.
- **Map preview** of an operation's location (tap the chip) — deferred; would add a maps dependency.
- **Planned-operation location** — intentionally excluded from v1.
