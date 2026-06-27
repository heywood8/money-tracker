# Geo-Optional Label Suggestions — Requirements Addendum

**Date:** 2026-06-27
**Status:** Proposed
**Tracking issue:** [#1091 — Design: geolocation coordinates + location-based label suggestions (KISS v1)](https://github.com/heywood8/money-tracker/issues/1091)
**Components:** `OperationsDB`, `OperationModal`, `LabelInput`, `DisplaySettingsContext`, `useOperationLocation`

## Purpose

Issue #1091 designs the v1 geolocation feature: optionally attach a device fix to
an operation, then suggest the labels the user has historically applied nearby
("proximity recall"). That design already makes **capture** opt-in (§4) and
mentions graceful degradation (§1.3, §6.2).

This addendum hardens that intent into **testable requirements**, because two
behaviours are load-bearing for the feature to be safe to ship and were left
implicit in the base design:

1. The feature must be **fully toggleable**. Turning geo off must never break,
   degrade, or change label functionality — it must only stop labels from
   *depending on* geo data.
2. **Partial** geo data must still be useful. When only some past operations
   carry coordinates, those still contribute suggestions; labels that have no
   geo backing are simply ranked **lower**, never dropped.

These requirements refine §4 and §6 of #1091. They do not change the schema,
the migration, or the capture UX.

---

## Definitions

- **Geo data** — the `latitude` / `longitude` pair on an operation row (issue
  #1091 §2). May be absent (both null) on any operation: legacy rows, rows saved
  while the toggle was off, rows where the fix timed out, or rows the user
  cleared.
- **Geo suggestions** — labels returned by `OperationsDB.getLabelsNearLocation`
  (#1091 §6.1), ranked by how often they were used near the current fix.
- **Base suggestions** — labels returned by the existing
  `OperationsDB.getDistinctLabels` (no geo involved).
- **Attach-location toggle** — the `attachLocation` preference (#1091 §4.1),
  default **off**.

---

## R1 — The feature is fully toggleable; labels never depend on geo

**R1.1 — Default off.** `attachLocation` defaults to `false`. With no user
action, the app behaves exactly as it does today: no permission prompt, no
capture, no location row in the operation form (#1091 §4.2).

**R1.2 — Label functionality is independent of geo state.** The label system
(entering, autocompleting, editing, and persisting labels) must be reachable and
fully functional in every one of these states, with identical behaviour to today
except for the *ordering* of the autocomplete strip:

| State | Label entry works | Autocomplete works | Geo suggestions shown |
|-------|:-:|:-:|:-:|
| Toggle off | ✅ | ✅ (base only) | ❌ |
| Toggle on, permission denied | ✅ | ✅ (base only) | ❌ |
| Toggle on, granted, no fix yet / fix failed | ✅ | ✅ (base only) | ❌ |
| Toggle on, granted, fix ready | ✅ | ✅ (geo + base) | ✅ |

**R1.3 — No geo dependency in the suggestion pipeline.** Computing the label
suggestion strip must not *require* a location. Concretely, the merge step must
treat geo suggestions as an optional prepend:

```
base   = await getDistinctLabels(50, categoryId)        // always runs
nearby = (attachLocation && location)
           ? await getLabelsNearLocation(lat, lng)       // only when we have a fix
           : []                                          // otherwise empty, no query
labelSuggestions = dedupe([...nearby, ...base])          // base alone is a valid result
```

When `nearby` is empty the result equals today's behaviour byte-for-byte:
`dedupe([...[], ...base]) === base`.

**R1.4 — Capture failure never blocks anything.** A denied permission, a GPS
timeout, or any `expo-location` error must leave label entry and operation saving
completely unaffected. The operation saves with `latitude = null`,
`longitude = null`, exactly as if the toggle were off (#1091 §1.3, §3.2). No
error dialog gates the save.

**R1.5 — Turning the toggle off is non-destructive and immediate.** Disabling
`attachLocation` stops new capture and hides the location row, but:
- existing coordinates already stored on past operations are **not** deleted;
- the next time the toggle is enabled, proximity recall works again over that
  retained history (no "cold start" beyond what the user already had).

**R1.6 — No silent re-enable.** Geo suggestions appear only while the toggle is
on *and* a fix for the current modal is available. Closing and reopening a modal
with the toggle off shows base-only suggestions.

---

## R2 — Partial geo data counts; non-geo data has lower priority

The realistic steady state is **partial coverage**: the user has hundreds of
operations, of which only some carry coordinates (everything saved before the
feature existed, or while the toggle was off, has none). The feature must be
useful in exactly that state.

**R2.1 — Partial geo data is counted, not gated.** `getLabelsNearLocation` ranks
by frequency over *whatever* operations have coordinates inside the bounding box.
A small number of nearby geo-tagged operations still produces geo suggestions;
there is no minimum-sample threshold below which geo recall is disabled. Rows
with null coordinates are simply skipped by the `latitude IS NOT NULL` filter
(#1091 §6.1) and never poison the box query.

**R2.2 — Non-geo labels are demoted, never excluded.** Base suggestions (which
include labels that have never been used with a location) must always remain
available in the strip; geo only changes their **rank**:

- Geo suggestions are placed **before** base suggestions (proximity-first).
- Base suggestions follow, preserving their existing order.
- De-duplication is **case-insensitive**, keeping the **first** (higher-priority)
  occurrence. A label that is both a geo hit and a base hit therefore appears
  once, in its geo (higher) position — it is *promoted* by proximity, and its
  duplicate base entry is dropped, not the other way around.

This is the precise meaning of "non-geo data has less priority": a label with no
geo backing can only ever appear *after* every geo-derived label, but it is never
removed for lack of geo data.

**R2.3 — Ordering is the only lever; downstream filtering is unchanged.**
`LabelInput.filteredSuggestions` already (a) removes labels already applied to
the operation, (b) substring-filters by the current input, and (c) caps the strip
at `MAX_SUGGESTION_CHIPS` (8). The merge step controls **order only**; it must not
change those three behaviours (#1091 §6.2). No change to `LabelInput` is required.

**R2.4 — The cap interacts with priority as expected.** Because the strip is
capped at 8 and geo suggestions come first, a dense set of nearby labels can fill
the visible strip and push base-only labels off-screen. That is the intended
"less priority" outcome. The strip must still surface base labels as soon as the
user types a substring that the geo set does not match (R2.3-b makes this
automatic — filtering runs over the full merged list, not just the visible head).

**R2.5 — Empty-box is the toggle-off case.** If the box query returns no rows
(no nearby geo-tagged operations yet — the genuine cold-start), `nearby` is
empty and the result is identical to R1.3's base-only path. Partial coverage
degrades smoothly down to zero coverage with no special-casing.

---

## Acceptance tests (extends #1091 §9)

These map one-to-one onto the requirements above and must be green before commit.

1. **Toggle off ⇒ today's behaviour.** With `attachLocation` off, mounting
   `OperationModal` yields `labelSuggestions === getDistinctLabels(...)` and
   `getLabelsNearLocation` is **never called**. (R1.1, R1.3)
2. **Permission denied ⇒ base only, save works.** Mock
   `requestForegroundPermissionsAsync` → denied; suggestions are base-only and an
   operation saves with `latitude/longitude = null`. (R1.2, R1.4)
3. **Fix ready ⇒ geo first.** With the toggle on and a mocked fix, nearby labels
   appear ahead of base labels; a label present in both appears once, in the geo
   position. (R2.2)
4. **Partial coverage ⇒ geo still contributes.** Seed a history where only a
   handful of operations near the fix have coordinates and the rest are null;
   assert those few still produce ranked geo suggestions and the null rows are
   ignored. (R2.1)
5. **Non-geo never dropped.** Assert that a base label with no geo backing is
   still present in the merged list (possibly beyond the visible cap), and
   becomes visible once typed as a substring. (R2.2, R2.3, R2.4)
6. **Toggle off is non-destructive.** Disabling `attachLocation` does not null out
   coordinates on existing rows; re-enabling restores proximity recall over the
   retained history. (R1.5)
7. **Empty box ⇒ base only.** With the toggle on, a fix available, but no nearby
   geo-tagged operations, the result equals the base-only path. (R2.5)

---

## Out of scope (unchanged from #1091 §10)

This addendum does not introduce distance weighting, accuracy gating, reverse
geocoding, or a minimum-sample threshold. Ranking remains frequency-only over a
bounding box; the only ordering rule is *geo-before-base*. Everything in #1091
§10 stays deferred to v2.
