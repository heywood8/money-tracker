# Changelog

## [0.133.2](https://github.com/heywood8/money-tracker/compare/penny-v0.133.1...penny-v0.133.2) (2026-06-13)


### Bug Fixes

* show release list instead of error when releases have no APKs ([#947](https://github.com/heywood8/money-tracker/issues/947)) ([6aeaf4b](https://github.com/heywood8/money-tracker/commit/6aeaf4bc874fe237e59dfb726d10af9cd714ffd4))

## [0.133.1](https://github.com/heywood8/money-tracker/compare/penny-v0.133.0...penny-v0.133.1) (2026-06-13)


### Bug Fixes

* **i18n:** complete translations across all 11 languages ([#944](https://github.com/heywood8/money-tracker/issues/944)) ([e9d5cd9](https://github.com/heywood8/money-tracker/commit/e9d5cd9e90ca1b3574dd5a4b53e72e015ced7d15))

## [0.133.0](https://github.com/heywood8/money-tracker/compare/penny-v0.132.8...penny-v0.133.0) (2026-06-13)


### Features

* **updates:** pull-to-refresh on check for updates panel ([#940](https://github.com/heywood8/money-tracker/issues/940)) ([d9aeeda](https://github.com/heywood8/money-tracker/commit/d9aeedabf76f9a0278e906f41c2b9c96327f50f3))

## [0.132.8](https://github.com/heywood8/money-tracker/compare/penny-v0.132.7...penny-v0.132.8) (2026-06-13)


### Performance Improvements

* **localization:** stabilize t() with useCallback, memoize provider value ([#912](https://github.com/heywood8/money-tracker/issues/912)) ([#929](https://github.com/heywood8/money-tracker/issues/929)) ([072c0f2](https://github.com/heywood8/money-tracker/commit/072c0f2f0bad09ca4b7a7edeeb3b34dafee724b3))

## [0.132.7](https://github.com/heywood8/money-tracker/compare/penny-v0.132.6...penny-v0.132.7) (2026-06-13)


### Bug Fixes

* **settings:** show error dialogs on database reset and Sheets restore failure ([#836](https://github.com/heywood8/money-tracker/issues/836) [#837](https://github.com/heywood8/money-tracker/issues/837)) ([#925](https://github.com/heywood8/money-tracker/issues/925)) ([6a8a645](https://github.com/heywood8/money-tracker/commit/6a8a64554c380521d737d785d0004a8b829be47d))

## [0.132.6](https://github.com/heywood8/money-tracker/compare/penny-v0.132.5...penny-v0.132.6) (2026-06-12)


### Bug Fixes

* **theme:** derive colorScheme synchronously — remove double-render flash on theme switch ([#919](https://github.com/heywood8/money-tracker/issues/919)) ([#923](https://github.com/heywood8/money-tracker/issues/923)) ([a90e128](https://github.com/heywood8/money-tracker/commit/a90e128bc4306e7780dafc953129950a7f966685))

## [0.132.5](https://github.com/heywood8/money-tracker/compare/penny-v0.132.4...penny-v0.132.5) (2026-06-12)


### Tests

* migrate to @testing-library/react-native v14 ([#908](https://github.com/heywood8/money-tracker/issues/908)) ([66adf9f](https://github.com/heywood8/money-tracker/commit/66adf9f55229bc0402be16e69c8ecd2506a1cd0b))

## [0.132.4](https://github.com/heywood8/money-tracker/compare/penny-v0.132.3...penny-v0.132.4) (2026-06-09)


### Miscellaneous Chores

* **deps:** bump expo/expo-github-action from 8 to 9 ([#898](https://github.com/heywood8/money-tracker/issues/898)) ([b48df7b](https://github.com/heywood8/money-tracker/commit/b48df7bce1ff128c51556a5e7a8ab4b83e5e2219))

## [0.132.3](https://github.com/heywood8/money-tracker/compare/penny-v0.132.2...penny-v0.132.3) (2026-06-09)


### Bug Fixes

* account edit buttons hidden behind floating tab bar on gesture-nav devices ([#905](https://github.com/heywood8/money-tracker/issues/905)) ([2fbeb7c](https://github.com/heywood8/money-tracker/commit/2fbeb7c9460424e040816444c17f07f40ea3904c))

## [0.132.2](https://github.com/heywood8/money-tracker/compare/penny-v0.132.1...penny-v0.132.2) (2026-06-08)


### Continuous Integration

* add PR title validation for release-please convention ([#903](https://github.com/heywood8/money-tracker/issues/903)) ([843004d](https://github.com/heywood8/money-tracker/commit/843004de648ae77b1988ba81f8aa2af9f7f30bfa))

## [0.132.1](https://github.com/heywood8/money-tracker/compare/penny-v0.132.0...penny-v0.132.1) (2026-06-08)


### Reverts

* native predictive-back bridge for live panel shrink ([#897](https://github.com/heywood8/money-tracker/issues/897)) ([ae7470b](https://github.com/heywood8/money-tracker/commit/ae7470be0b77273f5d9ac9e9f021ef2461f08e90))

## [0.132.0](https://github.com/heywood8/money-tracker/compare/penny-v0.131.0...penny-v0.132.0) (2026-06-08)


### Features

* native predictive-back bridge for live panel shrink ([#897](https://github.com/heywood8/money-tracker/issues/897)) ([09b7fb5](https://github.com/heywood8/money-tracker/commit/09b7fb593f4b41d66465a502ff32ab78f06f442c))

## [0.131.0](https://github.com/heywood8/money-tracker/compare/penny-v0.130.1...penny-v0.131.0) (2026-06-07)


### Features

* Telegram-style predictive back shrink for panels ([#895](https://github.com/heywood8/money-tracker/issues/895)) ([f61f0f1](https://github.com/heywood8/money-tracker/commit/f61f0f1f8f72b9a09e2d616b7cfeec4200421e80))

## [0.130.1](https://github.com/heywood8/money-tracker/compare/penny-v0.130.0...penny-v0.130.1) (2026-06-07)


### Bug Fixes

* save/Cancel buttons hidden behind floating tab bar in Edit Account ([#892](https://github.com/heywood8/money-tracker/issues/892)) ([17a721e](https://github.com/heywood8/money-tracker/commit/17a721e2dac251f99dd2a7cf8d093d36982dca7e))

## [0.130.0](https://github.com/heywood8/money-tracker/compare/penny-v0.129.0...penny-v0.130.0) (2026-06-06)


### Features

* red border on category chips when submitting without a category ([#891](https://github.com/heywood8/money-tracker/issues/891)) ([c9bfd64](https://github.com/heywood8/money-tracker/commit/c9bfd6416cc4685c74c69ca32f459b9835dc42c5))

## [0.129.0](https://github.com/heywood8/money-tracker/compare/penny-v0.128.8...penny-v0.129.0) (2026-06-04)


### Features

* backup database before installing app update ([#889](https://github.com/heywood8/money-tracker/issues/889)) ([17a1e46](https://github.com/heywood8/money-tracker/commit/17a1e4676fc32677b68df9d43686fdd3c3f312bb))

## [0.128.8](https://github.com/heywood8/money-tracker/compare/penny-v0.128.7...penny-v0.128.8) (2026-06-04)


### Code Refactoring

* move search out of Header, fix filter overlay and all-dates query ([#887](https://github.com/heywood8/money-tracker/issues/887)) ([86a46a8](https://github.com/heywood8/money-tracker/commit/86a46a88c0863cc03f47961db8aa78d5c6772a51))

## [0.128.7](https://github.com/heywood8/money-tracker/compare/penny-v0.128.6...penny-v0.128.7) (2026-06-02)


### Bug Fixes

* bypass Drizzle migrate() — apply pending migrations manually ([#884](https://github.com/heywood8/money-tracker/issues/884)) ([74773e5](https://github.com/heywood8/money-tracker/commit/74773e5c8c550ce2447cd87eb09c66c0ad956e5c))

## [0.128.6](https://github.com/heywood8/money-tracker/compare/penny-v0.128.5...penny-v0.128.6) (2026-06-02)


### Bug Fixes

* show green success indicator for all export types ([#879](https://github.com/heywood8/money-tracker/issues/879)) ([1ddcca2](https://github.com/heywood8/money-tracker/commit/1ddcca27794e0ace44926d2f0697bbdcadb2d1a2))

## [0.128.5](https://github.com/heywood8/money-tracker/compare/penny-v0.128.4...penny-v0.128.5) (2026-06-02)


### Bug Fixes

* move update indicator from header to Settings tab icon ([#880](https://github.com/heywood8/money-tracker/issues/880)) ([071c477](https://github.com/heywood8/money-tracker/commit/071c477861a4b323ef77da9d1c39d8c0ecf205e7))

## [0.128.4](https://github.com/heywood8/money-tracker/compare/penny-v0.128.3...penny-v0.128.4) (2026-06-02)


### Bug Fixes

* replace fragile table-rebuild migration with trigger-based type enforcement ([#877](https://github.com/heywood8/money-tracker/issues/877)) ([3fc55f1](https://github.com/heywood8/money-tracker/commit/3fc55f180416817a73759a6cdbb419c30d865b3c))
* soft-delete accounts to preserve balance history ([#872](https://github.com/heywood8/money-tracker/issues/872)) ([#876](https://github.com/heywood8/money-tracker/issues/876)) ([992beaf](https://github.com/heywood8/money-tracker/commit/992beafe52028098603592a63617706c1dd8a07a))

## [0.128.3](https://github.com/heywood8/money-tracker/compare/penny-v0.128.2...penny-v0.128.3) (2026-06-01)


### Bug Fixes

* **restore:** fix balance history silently dropped on restore ([#874](https://github.com/heywood8/money-tracker/issues/874)) ([21fe54b](https://github.com/heywood8/money-tracker/commit/21fe54b4ff37e90933b3b18c4a6f5e4d8e639100))

## [0.128.2](https://github.com/heywood8/money-tracker/compare/penny-v0.128.1...penny-v0.128.2) (2026-06-01)


### Bug Fixes

* handle Android back gesture in search/filter UI ([#868](https://github.com/heywood8/money-tracker/issues/868)) ([bd66e86](https://github.com/heywood8/money-tracker/commit/bd66e867d8b6a1a7dff078079fe837df2fe6b7ec))

## [0.128.1](https://github.com/heywood8/money-tracker/compare/penny-v0.128.0...penny-v0.128.1) (2026-05-31)


### Bug Fixes

* **search:** search UI polish and crash fixes ([#866](https://github.com/heywood8/money-tracker/issues/866)) ([06a10ab](https://github.com/heywood8/money-tracker/commit/06a10abaa49b43bd7c95ec19790039805f028b80))

## [0.128.0](https://github.com/heywood8/money-tracker/compare/penny-v0.127.5...penny-v0.128.0) (2026-05-31)


### Features

* **import:** add cancel button and safety backup step to all import flows ([#863](https://github.com/heywood8/money-tracker/issues/863)) ([5a1045f](https://github.com/heywood8/money-tracker/commit/5a1045fbcd335a4bb6bb406cbda3745f4b9a42dc))

## [0.127.5](https://github.com/heywood8/money-tracker/compare/penny-v0.127.4...penny-v0.127.5) (2026-05-31)


### Bug Fixes

* **settings:** remove gesture-handler, use LayoutAnimation for subpanels ([#860](https://github.com/heywood8/money-tracker/issues/860)) ([3eb3f33](https://github.com/heywood8/money-tracker/commit/3eb3f33914e02b7a287ffba05a668b32c1401fd6))

## [0.127.4](https://github.com/heywood8/money-tracker/compare/penny-v0.127.3...penny-v0.127.4) (2026-05-31)


### Bug Fixes

* **settings:** replace Animated API with reanimated for subpanel touch fix ([#858](https://github.com/heywood8/money-tracker/issues/858)) ([9b13927](https://github.com/heywood8/money-tracker/commit/9b139275469b230f052b27f265f7b7142445edba))

## [0.127.3](https://github.com/heywood8/money-tracker/compare/penny-v0.127.2...penny-v0.127.3) (2026-05-31)


### Bug Fixes

* **tabs:** smooth non-adjacent tab transitions and settings subpanel touch ([#854](https://github.com/heywood8/money-tracker/issues/854)) ([e770f18](https://github.com/heywood8/money-tracker/commit/e770f189df6593fe571374e88d26f49d691bc7da))

## [0.127.2](https://github.com/heywood8/money-tracker/compare/penny-v0.127.1...penny-v0.127.2) (2026-05-31)


### Bug Fixes

* Move dark/light theme switch to settings screen ([#851](https://github.com/heywood8/money-tracker/issues/851)) ([37e2d28](https://github.com/heywood8/money-tracker/commit/37e2d28299580bdfc76674146c190aaa10e4dac3))

## [0.127.1](https://github.com/heywood8/money-tracker/compare/penny-v0.127.0...penny-v0.127.1) (2026-05-31)


### Bug Fixes

* **settings:** disable pointer events on hidden settings list when subpanel is open ([#848](https://github.com/heywood8/money-tracker/issues/848)) ([a418659](https://github.com/heywood8/money-tracker/commit/a4186595f50582a45db6b215067115cd14145aae))

## [0.127.0](https://github.com/heywood8/money-tracker/compare/penny-v0.126.1...penny-v0.127.0) (2026-05-31)


### Features

* add Android back gesture for subpanels and tab navigation ([#845](https://github.com/heywood8/money-tracker/issues/845)) ([d21d7dd](https://github.com/heywood8/money-tracker/commit/d21d7dd36c11866fbc89c344d5072f97dc00cdb2))

## [0.126.1](https://github.com/heywood8/money-tracker/compare/penny-v0.126.0...penny-v0.126.1) (2026-05-31)


### Bug Fixes

* **ui:** tab bar width/padding tweaks and categories icon fix ([#846](https://github.com/heywood8/money-tracker/issues/846)) ([e8323d9](https://github.com/heywood8/money-tracker/commit/e8323d96da8859c59a3784bc98cb10fc7fd01324))

## [0.126.0](https://github.com/heywood8/money-tracker/compare/penny-v0.125.1...penny-v0.126.0) (2026-05-30)


### Features

* **settings:** accounts and categories as proper subpanels ([#843](https://github.com/heywood8/money-tracker/issues/843)) ([b4cc41e](https://github.com/heywood8/money-tracker/commit/b4cc41e10383da967398e66140114dc20fdda310))

## [0.125.1](https://github.com/heywood8/money-tracker/compare/penny-v0.125.0...penny-v0.125.1) (2026-05-30)


### Bug Fixes

* **settings:** use safe area insets for subpanel bottom padding ([#841](https://github.com/heywood8/money-tracker/issues/841)) ([980f4b3](https://github.com/heywood8/money-tracker/commit/980f4b33089cf35da3db90f0975e8f04b6a90ab6))

## [0.125.0](https://github.com/heywood8/money-tracker/compare/penny-v0.124.0...penny-v0.125.0) (2026-05-30)


### Features

* **settings:** move accounts management into a Settings subpanel ([#838](https://github.com/heywood8/money-tracker/issues/838)) ([22b9d1c](https://github.com/heywood8/money-tracker/commit/22b9d1c41e8e00901895343729bf35d4f4d85bff))

## [0.125.0] (Unreleased)

### Features

* **settings:** move accounts management into a Settings subpanel ([#835](https://github.com/heywood8/money-tracker/pull/835))

## [0.124.0](https://github.com/heywood8/money-tracker/compare/penny-v0.123.12...penny-v0.124.0) (2026-05-29)


### Features

* **settings:** move Settings from modal to 6th tab screen ([#833](https://github.com/heywood8/money-tracker/issues/833)) ([aa21cbb](https://github.com/heywood8/money-tracker/commit/aa21cbbed35dd1482eb46003397df7118c2890af))

## [0.123.12](https://github.com/heywood8/money-tracker/compare/penny-v0.123.11...penny-v0.123.12) (2026-05-29)


### Bug Fixes

* **ui:** restore flex layout on Check for updates panel ([#830](https://github.com/heywood8/money-tracker/issues/830)) ([4a6b52c](https://github.com/heywood8/money-tracker/commit/4a6b52c6dfaf84336a3203b55ffdadaa4e622834))

## [0.123.11](https://github.com/heywood8/money-tracker/compare/penny-v0.123.10...penny-v0.123.11) (2026-05-28)


### Bug Fixes

* make all operation mutations atomic with balance updates ([#746](https://github.com/heywood8/money-tracker/issues/746)) ([#823](https://github.com/heywood8/money-tracker/issues/823)) ([3e42108](https://github.com/heywood8/money-tracker/commit/3e42108eb48142692cccda251be4acfc3629151d))

## [0.123.10](https://github.com/heywood8/money-tracker/compare/penny-v0.123.9...penny-v0.123.10) (2026-05-28)


### Bug Fixes

* use Decimal.js for income/expense chart total accumulation ([#765](https://github.com/heywood8/money-tracker/issues/765)) ([#820](https://github.com/heywood8/money-tracker/issues/820)) ([2eb2719](https://github.com/heywood8/money-tracker/commit/2eb2719e6fa4b33f98e6f1db80b21ae43ee935c5))

## [0.123.9](https://github.com/heywood8/money-tracker/compare/penny-v0.123.8...penny-v0.123.9) (2026-05-28)


### Bug Fixes

* guard against corrupted balance when account deleted mid-transaction ([#745](https://github.com/heywood8/money-tracker/issues/745)) ([#822](https://github.com/heywood8/money-tracker/issues/822)) ([7373efd](https://github.com/heywood8/money-tracker/commit/7373efd8812053e6fcbf045cba42ce237ab5ff99))

## [0.123.8](https://github.com/heywood8/money-tracker/compare/penny-v0.123.7...penny-v0.123.8) (2026-05-28)


### Bug Fixes

* log database transaction errors instead of silently swallowing them ([#752](https://github.com/heywood8/money-tracker/issues/752)) ([#821](https://github.com/heywood8/money-tracker/issues/821)) ([d60ceb4](https://github.com/heywood8/money-tracker/commit/d60ceb42e57a1355d841d4a4a3d10fad08cb2247))

## [0.123.7](https://github.com/heywood8/money-tracker/compare/penny-v0.123.6...penny-v0.123.7) (2026-05-28)


### Bug Fixes

* **ui:** extract update panel into shared component, fix empty modal on startup ([#824](https://github.com/heywood8/money-tracker/issues/824)) ([c3652e1](https://github.com/heywood8/money-tracker/commit/c3652e1bc0b8993afaaf3065e445f1f8863af072))

## [0.123.6](https://github.com/heywood8/money-tracker/compare/penny-v0.123.5...penny-v0.123.6) (2026-05-28)


### Performance Improvements

* refactor OperationsList from nested FlatList+map to SectionList for proper virtualization ([#808](https://github.com/heywood8/money-tracker/issues/808)) ([d6de8aa](https://github.com/heywood8/money-tracker/commit/d6de8aa3265e27a817bdacf23d90fd34a18dff40))

## [0.123.5](https://github.com/heywood8/money-tracker/compare/penny-v0.123.4...penny-v0.123.5) (2026-05-28)


### Performance Improvements

* replace pure-JS SHA-256 with crypto.subtle.digest for APK verification     ([#813](https://github.com/heywood8/money-tracker/issues/813)) ([7c9cdce](https://github.com/heywood8/money-tracker/commit/7c9cdce2fddb21d6eb187a1ed193f3b85328c7f6))

## [0.123.4](https://github.com/heywood8/money-tracker/compare/penny-v0.123.3...penny-v0.123.4) (2026-05-27)


### Bug Fixes

* log and re-throw database transaction errors instead of silently swallowing them ([#806](https://github.com/heywood8/money-tracker/issues/806)) ([b1e1fc4](https://github.com/heywood8/money-tracker/commit/b1e1fc42f77a686915b73a4482a985832808277d))

## [0.123.3](https://github.com/heywood8/money-tracker/compare/penny-v0.123.2...penny-v0.123.3) (2026-05-27)


### Bug Fixes

* warn on sparse CSV rows during import to prevent silent data loss ([#805](https://github.com/heywood8/money-tracker/issues/805)) ([94044ab](https://github.com/heywood8/money-tracker/commit/94044ab8504d7af2b50c7097f6e7ae7d68ab6657))

## [0.123.2](https://github.com/heywood8/money-tracker/compare/penny-v0.123.1...penny-v0.123.2) (2026-05-26)


### Performance Improvements

* split BudgetsContext into BudgetsDataContext and BudgetsActionsContext ([#807](https://github.com/heywood8/money-tracker/issues/807)) ([8d8c877](https://github.com/heywood8/money-tracker/commit/8d8c877d16feedeb9053a595f872da4cb8fc1701))

## [0.123.1](https://github.com/heywood8/money-tracker/compare/penny-v0.123.0...penny-v0.123.1) (2026-05-26)


### Bug Fixes

* abort Google Sheets import on DB error instead of silently clearing preferences ([#803](https://github.com/heywood8/money-tracker/issues/803)) ([2e1d076](https://github.com/heywood8/money-tracker/commit/2e1d07605a340a7a9eb408cca3fd98c98d388a47))
* correct January balance history boundary and normalize date comparisons ([#801](https://github.com/heywood8/money-tracker/issues/801)) ([f320d08](https://github.com/heywood8/money-tracker/commit/f320d08ad03a6dc9271fad49d5c1ce0eed8aeb38))
* refresh quick-add suggestions on RELOAD_ALL event ([#800](https://github.com/heywood8/money-tracker/issues/800)) ([c0277f8](https://github.com/heywood8/money-tracker/commit/c0277f8cc57bc187180f0224e340d95ad53d237b))
* use Currency.add for precise chart total accumulation ([#802](https://github.com/heywood8/money-tracker/issues/802)) ([a049f43](https://github.com/heywood8/money-tracker/commit/a049f43c77f29c8efdb49b77ece0efd8fb79003a))
* use explicit CSV field lists to prevent silent data loss on export ([#799](https://github.com/heywood8/money-tracker/issues/799)) ([074f391](https://github.com/heywood8/money-tracker/commit/074f391b74163c4f837162519554ed10f529ab0f))


### Performance Improvements

* use ref for activeFilters in OperationsActionsContext to prevent memo invalidation on keypress ([#804](https://github.com/heywood8/money-tracker/issues/804)) ([55e9c29](https://github.com/heywood8/money-tracker/commit/55e9c29606323987de56266a2fc26da8fcb6cdc9))

## [0.123.0](https://github.com/heywood8/money-tracker/compare/penny-v0.122.7...penny-v0.123.0) (2026-05-25)


### Features

* show blurred category grid placeholder on initial load ([#797](https://github.com/heywood8/money-tracker/issues/797)) ([8e8dd87](https://github.com/heywood8/money-tracker/commit/8e8dd877cab9c86cdfbf8499f519cc152bc82de1))

## [0.122.7](https://github.com/heywood8/money-tracker/compare/penny-v0.122.6...penny-v0.122.7) (2026-05-25)


### Performance Improvements

* speed up APK checksum verification and keep UI responsive ([#795](https://github.com/heywood8/money-tracker/issues/795)) ([7c548d6](https://github.com/heywood8/money-tracker/commit/7c548d6b2ee3c2389049702a5d373adb529aff53))

## [0.122.6](https://github.com/heywood8/money-tracker/compare/penny-v0.122.5...penny-v0.122.6) (2026-05-25)


### Bug Fixes

* guard async setState calls after unmount in LocalizationContext and OperationsDataContext ([#784](https://github.com/heywood8/money-tracker/issues/784)) ([d2553d0](https://github.com/heywood8/money-tracker/commit/d2553d08e737bb98f5e7844ea4303a2ff4d642b2))
* refresh quick-add suggestions when operations change ([#779](https://github.com/heywood8/money-tracker/issues/779)) ([3ad6134](https://github.com/heywood8/money-tracker/commit/3ad6134aa0cf43c2aef7443b01cac360db76e83e))
* reset sqlite_sequence for all auto-increment tables on restore ([#786](https://github.com/heywood8/money-tracker/issues/786)) ([19d028a](https://github.com/heywood8/money-tracker/commit/19d028a96b7cf5412327cc8033bfcbbbbfefc76c))


### Performance Improvements

* wrap context values in useMemo to prevent cascade re-renders ([#781](https://github.com/heywood8/money-tracker/issues/781)) ([bbc4d56](https://github.com/heywood8/money-tracker/commit/bbc4d56721ed1ba345f20f4907087aab5c602233))

## [0.122.5](https://github.com/heywood8/money-tracker/compare/penny-v0.122.4...penny-v0.122.5) (2026-05-25)


### Tests

* cover uncovered branches in useExpenseData and useIncomeData to… ([#792](https://github.com/heywood8/money-tracker/issues/792)) ([5d31dc4](https://github.com/heywood8/money-tracker/commit/5d31dc48dfccd115bee3a4b7ead4339c6253da28))

## [0.122.4](https://github.com/heywood8/money-tracker/compare/penny-v0.122.3...penny-v0.122.4) (2026-05-25)


### Performance Improvements

* memoize BalanceHistoryCard computation and hoist Dimensions.get ([#785](https://github.com/heywood8/money-tracker/issues/785)) ([4ec0193](https://github.com/heywood8/money-tracker/commit/4ec0193d79e9da5fa57d4b847397087274b19511))

## [0.122.3](https://github.com/heywood8/money-tracker/compare/penny-v0.122.2...penny-v0.122.3) (2026-05-25)


### Performance Improvements

* consolidate PlannedOperationsScreen filter passes into single useMemo ([#782](https://github.com/heywood8/money-tracker/issues/782)) ([2b42ee1](https://github.com/heywood8/money-tracker/commit/2b42ee11e063b6738556c3962bc025260b1fa876))

## [0.122.2](https://github.com/heywood8/money-tracker/compare/penny-v0.122.1...penny-v0.122.2) (2026-05-25)


### Bug Fixes

* add cycle detection to getCategoryPath to prevent infinite loop ([#780](https://github.com/heywood8/money-tracker/issues/780)) ([cc9816c](https://github.com/heywood8/money-tracker/commit/cc9816cd68eb5541c822a624953de6ebfa91f6a7))

## [0.122.1](https://github.com/heywood8/money-tracker/compare/penny-v0.122.0...penny-v0.122.1) (2026-05-25)


### Bug Fixes

* reject Infinity and non-finite amounts in PlannedOperationsDB ([#778](https://github.com/heywood8/money-tracker/issues/778)) ([cc46a48](https://github.com/heywood8/money-tracker/commit/cc46a483e2448c6808f4e7b5e1c4c77f7d036a66))

## [0.122.0](https://github.com/heywood8/money-tracker/compare/penny-v0.121.0...penny-v0.122.0) (2026-05-25)


### Features

* skeleton placeholder for operations list during initial load ([#743](https://github.com/heywood8/money-tracker/issues/743)) ([3088ad6](https://github.com/heywood8/money-tracker/commit/3088ad6d2daf7a7c68ba3d12a1d009b3fbe5a023))


### Bug Fixes

* restrict review agent tools to read-only set ([#742](https://github.com/heywood8/money-tracker/issues/742)) ([28e5dbb](https://github.com/heywood8/money-tracker/commit/28e5dbb0167089f7493a239fba3bf4dbefa63464))

## [0.121.0](https://github.com/heywood8/money-tracker/compare/penny-v0.120.0...penny-v0.121.0) (2026-05-24)


### Features

* remove full-screen loading blocker on app startup ([#740](https://github.com/heywood8/money-tracker/issues/740)) ([37dab7b](https://github.com/heywood8/money-tracker/commit/37dab7ba4dd8ac8db096aac15e5fb43926c67124))

## [0.120.0](https://github.com/heywood8/money-tracker/compare/penny-v0.119.3...penny-v0.120.0) (2026-05-23)


### Features

* pre-restore snapshot for undo-able restore ([#734](https://github.com/heywood8/money-tracker/issues/734)) ([54e56ff](https://github.com/heywood8/money-tracker/commit/54e56ff5e5d37fa80cae2dfed7542ecadb34e536))

## [0.119.3](https://github.com/heywood8/money-tracker/compare/penny-v0.119.2...penny-v0.119.3) (2026-05-23)


### Bug Fixes

* locale-aware week start for weekly budget periods ([#735](https://github.com/heywood8/money-tracker/issues/735)) ([96255fc](https://github.com/heywood8/money-tracker/commit/96255fc226573f4b759be2377ee19184d6577dac))

## [0.119.2](https://github.com/heywood8/money-tracker/compare/penny-v0.119.1...penny-v0.119.2) (2026-05-23)


### Bug Fixes

* guard daily backup against empty/corrupt snapshots ([#733](https://github.com/heywood8/money-tracker/issues/733)) ([ef1b89e](https://github.com/heywood8/money-tracker/commit/ef1b89eed80b843eeb1320130689aedd9afa2709))

## [0.119.1](https://github.com/heywood8/money-tracker/compare/penny-v0.119.0...penny-v0.119.1) (2026-05-23)


### Bug Fixes

* useOperationForm unmount guard, split formatting, exchange rate validation ([#732](https://github.com/heywood8/money-tracker/issues/732)) ([f904569](https://github.com/heywood8/money-tracker/commit/f904569558bad290a5a66b34d8567fd40c862f82))

## [0.119.0](https://github.com/heywood8/money-tracker/compare/penny-v0.118.5...penny-v0.119.0) (2026-05-23)


### Features

* remove logo and app name from header, slim header height ([#730](https://github.com/heywood8/money-tracker/issues/730)) ([ce2cca1](https://github.com/heywood8/money-tracker/commit/ce2cca17f0890e010fbbd4b0b4c219a79fc00cc8))

## [0.118.5](https://github.com/heywood8/money-tracker/compare/penny-v0.118.4...penny-v0.118.5) (2026-05-23)


### Bug Fixes

* move original_balance pre-migration check before migrate() to break infinite failure loop ([#728](https://github.com/heywood8/money-tracker/issues/728)) ([724e15d](https://github.com/heywood8/money-tracker/commit/724e15d180e57386da61546b470c8f77dddfdda1))

## [0.118.4](https://github.com/heywood8/money-tracker/compare/penny-v0.118.3...penny-v0.118.4) (2026-05-22)


### Bug Fixes

* install correct expo-clipboard and expo-splash-screen for SDK 54 ([#725](https://github.com/heywood8/money-tracker/issues/725)) ([6466867](https://github.com/heywood8/money-tracker/commit/64668677724f17a1725974874295051a2cd9d7ae))

## [0.118.3](https://github.com/heywood8/money-tracker/compare/penny-v0.118.2...penny-v0.118.3) (2026-05-22)


### Bug Fixes

* replace withExclusiveTransactionAsync with serialized withTransactionAsync ([#723](https://github.com/heywood8/money-tracker/issues/723)) ([ca4c547](https://github.com/heywood8/money-tracker/commit/ca4c5477f17f3b5c30096548dbd0a1222f7a54f0))

## [0.118.2](https://github.com/heywood8/money-tracker/compare/penny-v0.118.1...penny-v0.118.2) (2026-05-22)


### Bug Fixes

* restore downloaded APKs list in up-to-date changelog view ([843b844](https://github.com/heywood8/money-tracker/commit/843b84409671ea08da1c0c637178f2d363f30ed6))

## [0.118.1](https://github.com/heywood8/money-tracker/compare/penny-v0.118.0...penny-v0.118.1) (2026-05-22)


### Bug Fixes

* NativeDatabase.prepareAsync errors during account balance adjustment ([#719](https://github.com/heywood8/money-tracker/issues/719)) ([b0013cf](https://github.com/heywood8/money-tracker/commit/b0013cfa0fb0feab22507341d45254c14b7e8da5))

## [0.118.0](https://github.com/heywood8/money-tracker/compare/penny-v0.117.0...penny-v0.118.0) (2026-05-22)


### Features

* tap to expand log entries, long-press to copy ([#717](https://github.com/heywood8/money-tracker/issues/717)) ([6d5bfee](https://github.com/heywood8/money-tracker/commit/6d5bfee4c2e6656dfa8bffc215dc3e322b3aea3e))


### Bug Fixes

* today marker x-position alignment in balance history chart ([#716](https://github.com/heywood8/money-tracker/issues/716)) ([596c98b](https://github.com/heywood8/money-tracker/commit/596c98bdd7841539a451036e45cdc2c61e8b8f12))

## [0.117.0](https://github.com/heywood8/money-tracker/compare/penny-v0.116.2...penny-v0.117.0) (2026-05-21)


### Features

* always show 10 latest release changelogs on the update page ([05e629d](https://github.com/heywood8/money-tracker/commit/05e629d323fbb1563fb51e9cae31dd89116b9954))

## [0.116.2](https://github.com/heywood8/money-tracker/compare/penny-v0.116.1...penny-v0.116.2) (2026-05-20)


### Bug Fixes

* validate currencies before falling back on null destination_amount in transfers ([#708](https://github.com/heywood8/money-tracker/issues/708)) ([c4df4f6](https://github.com/heywood8/money-tracker/commit/c4df4f67aac79470b87ca24ead4410958c284494))

## [0.116.1](https://github.com/heywood8/money-tracker/compare/penny-v0.116.0...penny-v0.116.1) (2026-05-20)


### Bug Fixes

* refuse to write empty snapshots over real backup data (issue [#690](https://github.com/heywood8/money-tracker/issues/690)) ([#707](https://github.com/heywood8/money-tracker/issues/707)) ([e82cf20](https://github.com/heywood8/money-tracker/commit/e82cf203b077ae2cbdd1ac9b5a8d3fb25172bb4a))

## [0.116.0](https://github.com/heywood8/money-tracker/compare/penny-v0.115.5...penny-v0.116.0) (2026-05-20)


### Features

* **currencies:** add Georgian Lari (GEL) ([#709](https://github.com/heywood8/money-tracker/issues/709)) ([67de578](https://github.com/heywood8/money-tracker/commit/67de5785f0ad1101321623ae32d8b4830909a859))

## [0.115.5](https://github.com/heywood8/money-tracker/compare/penny-v0.115.4...penny-v0.115.5) (2026-05-20)


### Bug Fixes

* **settings:** center up-to-date message in settings update modal ([#704](https://github.com/heywood8/money-tracker/issues/704)) ([b35922d](https://github.com/heywood8/money-tracker/commit/b35922d54eba6606ea990e0b56779e5a98865e3d))

## [0.115.4](https://github.com/heywood8/money-tracker/compare/penny-v0.115.3...penny-v0.115.4) (2026-05-20)


### Bug Fixes

* crash when saving account with createAdjustmentOperation checked but no balance change ([#702](https://github.com/heywood8/money-tracker/issues/702)) ([a5764a0](https://github.com/heywood8/money-tracker/commit/a5764a0d6e4bfc0cfffa7d5e1c2765bb44fdb222))

## [0.115.3](https://github.com/heywood8/money-tracker/compare/penny-v0.115.2...penny-v0.115.3) (2026-05-20)


### Bug Fixes

* abort restore early when backup has unmapped account IDs, add skip counter and pre-restore snapshot ([#700](https://github.com/heywood8/money-tracker/issues/700)) ([49ac338](https://github.com/heywood8/money-tracker/commit/49ac3381988b7b64945e5e147d11766bfb26ffd8))

## [0.115.2](https://github.com/heywood8/money-tracker/compare/penny-v0.115.1...penny-v0.115.2) (2026-05-19)


### Bug Fixes

* make planned-operation execution atomic to prevent duplicate charges ([#697](https://github.com/heywood8/money-tracker/issues/697)) ([18bc1d8](https://github.com/heywood8/money-tracker/commit/18bc1d8dea6622492482e74a6983d32267688fb1))

## [0.115.1](https://github.com/heywood8/money-tracker/compare/penny-v0.115.0...penny-v0.115.1) (2026-05-19)


### Bug Fixes

* enforce operations.type enum at SQLite and JS layers ([#695](https://github.com/heywood8/money-tracker/issues/695)) ([251cb3b](https://github.com/heywood8/money-tracker/commit/251cb3b845ef8514aeeb82c836b8903d6ffa1809))

## [0.115.0](https://github.com/heywood8/money-tracker/compare/penny-v0.114.15...penny-v0.115.0) (2026-05-18)


### Features

* serve lazy-load chunks from in-memory cache instead of DB ([#681](https://github.com/heywood8/money-tracker/issues/681)) ([417dc69](https://github.com/heywood8/money-tracker/commit/417dc69545fc0b038d8f9a45a48541b4e5436726))

## [0.114.15](https://github.com/heywood8/money-tracker/compare/penny-v0.114.14...penny-v0.114.15) (2026-05-18)


### Bug Fixes

* catch computeSha256 OOM errors so download succeeds rather than failing ([#682](https://github.com/heywood8/money-tracker/issues/682)) ([a9cba57](https://github.com/heywood8/money-tracker/commit/a9cba57269003d7e58f471dcba27e7e6af805283))

## [0.114.14](https://github.com/heywood8/money-tracker/compare/penny-v0.114.13...penny-v0.114.14) (2026-05-18)


### Bug Fixes

* wrap deleteCategory and deleteAccount check-then-delete in single transaction ([#677](https://github.com/heywood8/money-tracker/issues/677)) ([3e2a4e6](https://github.com/heywood8/money-tracker/commit/3e2a4e66c3895c5d11d139a296a2b94a93b2c4e9))

## [0.114.13](https://github.com/heywood8/money-tracker/compare/penny-v0.114.12...penny-v0.114.13) (2026-05-18)


### Bug Fixes

* emit RELOAD_ALL synchronously after default data creation (issue [#605](https://github.com/heywood8/money-tracker/issues/605)) ([#675](https://github.com/heywood8/money-tracker/issues/675)) ([5d02ed5](https://github.com/heywood8/money-tracker/commit/5d02ed5a03780b15fa9c8c09f546ad0adff0ee81))
* validate operation type enum in createOperation and updateOperation ([#674](https://github.com/heywood8/money-tracker/issues/674)) ([ad5f5dd](https://github.com/heywood8/money-tracker/commit/ad5f5dda587ea42ed655d2cb6bc1254c5e03bee0))


### Miscellaneous Chores

* **deps-dev:** bump jest from 30.3.0 to 30.4.2 ([#671](https://github.com/heywood8/money-tracker/issues/671)) ([24687b6](https://github.com/heywood8/money-tracker/commit/24687b6fb674f1e7a3e59b339a6c152117515865))

## [0.114.12](https://github.com/heywood8/money-tracker/compare/penny-v0.114.11...penny-v0.114.12) (2026-05-18)


### Bug Fixes

* validate live FX rate values before caching (issue [#595](https://github.com/heywood8/money-tracker/issues/595)) ([#672](https://github.com/heywood8/money-tracker/issues/672)) ([c04ab11](https://github.com/heywood8/money-tracker/commit/c04ab11611b5c9fb3dcfb3bb9dab63ecf0fcf00b))

## [0.114.11](https://github.com/heywood8/money-tracker/compare/penny-v0.114.10...penny-v0.114.11) (2026-05-17)


### Bug Fixes

* use precise string arithmetic in budget spending calculations ([#669](https://github.com/heywood8/money-tracker/issues/669)) ([ff064e9](https://github.com/heywood8/money-tracker/commit/ff064e9574790e8c3c0867cea0d3e4810c4482fa))

## [0.114.10](https://github.com/heywood8/money-tracker/compare/penny-v0.114.9...penny-v0.114.10) (2026-05-16)


### Bug Fixes

* use NestableScrollContainer so account drag-to-reorder works ([#657](https://github.com/heywood8/money-tracker/issues/657)) ([f1c9125](https://github.com/heywood8/money-tracker/commit/f1c9125bd5b2dd2037292423ae9c31d4baed3f2d))

## [0.114.9](https://github.com/heywood8/money-tracker/compare/penny-v0.114.8...penny-v0.114.9) (2026-05-16)


### Bug Fixes

* harden APK download against path traversal and missing checksum verification ([#662](https://github.com/heywood8/money-tracker/issues/662)) ([a5ec4a0](https://github.com/heywood8/money-tracker/commit/a5ec4a03516e9ccb2d8f6edcceabef9276d9c0dc))
* replace new Function() with safe expression parser in calculatorUtils ([#661](https://github.com/heywood8/money-tracker/issues/661)) ([4cb8d58](https://github.com/heywood8/money-tracker/commit/4cb8d58b831b01212a79346090944acb582b084c))

## [0.114.8](https://github.com/heywood8/money-tracker/compare/penny-v0.114.7...penny-v0.114.8) (2026-05-16)


### Documentation

* mark issue [#593](https://github.com/heywood8/money-tracker/issues/593) (unencrypted backups at rest) as known won't fix ([#659](https://github.com/heywood8/money-tracker/issues/659)) ([116304f](https://github.com/heywood8/money-tracker/commit/116304f864043bfc9ffb26174b0bf1c0d082bf7b))

## [0.114.7](https://github.com/heywood8/money-tracker/compare/penny-v0.114.6...penny-v0.114.7) (2026-05-16)


### Bug Fixes

* rewrite getAllPreferences to use queryAll instead of deprecated WebSQL API ([#656](https://github.com/heywood8/money-tracker/issues/656)) ([2cb4819](https://github.com/heywood8/money-tracker/commit/2cb4819816d1dbc984ee13e9e2fe458dfd9dad81))

## [0.114.6](https://github.com/heywood8/money-tracker/compare/penny-v0.114.5...penny-v0.114.6) (2026-05-16)


### Bug Fixes

* wrap reorderAccounts updates in a single transaction ([#652](https://github.com/heywood8/money-tracker/issues/652)) ([b197925](https://github.com/heywood8/money-tracker/commit/b197925dd7baf0b45d8953530c191f6271be2fe8))

## [0.114.5](https://github.com/heywood8/money-tracker/compare/penny-v0.114.4...penny-v0.114.5) (2026-05-16)


### Bug Fixes

* check if update APK was already downloaded before re-downloading ([#653](https://github.com/heywood8/money-tracker/issues/653)) ([e13921d](https://github.com/heywood8/money-tracker/commit/e13921ddff54bcd3af4a51e10229e6e6b20ad23f))

## [0.114.4](https://github.com/heywood8/money-tracker/compare/penny-v0.114.3...penny-v0.114.4) (2026-05-16)


### Bug Fixes

* redact sensitive financial data from debug logs ([#649](https://github.com/heywood8/money-tracker/issues/649)) ([bc32db8](https://github.com/heywood8/money-tracker/commit/bc32db8a8e9718e1efd8a67635cfaf9eaad76378))

## [0.114.3](https://github.com/heywood8/money-tracker/compare/penny-v0.114.2...penny-v0.114.3) (2026-05-16)


### Bug Fixes

* rewrite parseCSV to handle multiline quoted values ([#647](https://github.com/heywood8/money-tracker/issues/647)) ([3ef0451](https://github.com/heywood8/money-tracker/commit/3ef04516cebece136d281b3aa80949f2d261e160))

## [0.114.2](https://github.com/heywood8/money-tracker/compare/penny-v0.114.1...penny-v0.114.2) (2026-05-15)


### Bug Fixes

* **transfer:** fix race condition in multi-currency destination amount on save ([#644](https://github.com/heywood8/money-tracker/issues/644)) ([b020a45](https://github.com/heywood8/money-tracker/commit/b020a45b4d0d31b2ca919eaacb7aba1ee10718e2))

## [0.114.1](https://github.com/heywood8/money-tracker/compare/penny-v0.114.0...penny-v0.114.1) (2026-05-15)


### Bug Fixes

* **search:** fold Russian ё/е so keyboard autocomplete doesn't break search ([#642](https://github.com/heywood8/money-tracker/issues/642)) ([cfbd098](https://github.com/heywood8/money-tracker/commit/cfbd09805f23141087ea3f8b0f3d159a4922024c))

## [0.114.0](https://github.com/heywood8/money-tracker/compare/penny-v0.113.1...penny-v0.114.0) (2026-05-15)


### Features

* make description suggestion chips horizontally scrollable ([#640](https://github.com/heywood8/money-tracker/issues/640)) ([6141461](https://github.com/heywood8/money-tracker/commit/61414611f4332bc71cb57a899466f71a88ebe188))

## [0.113.1](https://github.com/heywood8/money-tracker/compare/penny-v0.113.0...penny-v0.113.1) (2026-05-14)


### Bug Fixes

* replace createFunctionAsync with createCustomFunctionAsync (expo-sqlite 16.x API) ([#638](https://github.com/heywood8/money-tracker/issues/638)) ([114ef15](https://github.com/heywood8/money-tracker/commit/114ef15c0ec70b287ef5ba9056af2379eeb7f149))

## [0.113.0](https://github.com/heywood8/money-tracker/compare/penny-v0.112.13...penny-v0.113.0) (2026-05-14)


### Features

* scan all releases for updates instead of stopping at first non-newer ([#636](https://github.com/heywood8/money-tracker/issues/636)) ([f0ab4b1](https://github.com/heywood8/money-tracker/commit/f0ab4b1a239ddcaaf1651b26993420231689cc17))

## [0.112.13](https://github.com/heywood8/money-tracker/compare/penny-v0.112.12...penny-v0.112.13) (2026-05-14)


### Bug Fixes

* cyrillic text search and improve search UX ([#634](https://github.com/heywood8/money-tracker/issues/634)) ([5070b52](https://github.com/heywood8/money-tracker/commit/5070b52cffdee389863d6a32d8920a33f7696a36))

## [0.112.12](https://github.com/heywood8/money-tracker/compare/penny-v0.112.11...penny-v0.112.12) (2026-05-14)


### Bug Fixes

* cyrillic text search and improve search UX ([#632](https://github.com/heywood8/money-tracker/issues/632)) ([87d028d](https://github.com/heywood8/money-tracker/commit/87d028d57195327d0b62a5c803cf3e2489188825))

## [0.112.11](https://github.com/heywood8/money-tracker/compare/penny-v0.112.10...penny-v0.112.11) (2026-05-14)


### Bug Fixes

* eliminate parseFloat in aggregation queries, use Currency.add end-to-end ([#630](https://github.com/heywood8/money-tracker/issues/630)) ([ab9abd1](https://github.com/heywood8/money-tracker/commit/ab9abd1bdbab2840bd57651b645463ae27c7fcce))

## [0.112.10](https://github.com/heywood8/money-tracker/compare/penny-v0.112.9...penny-v0.112.10) (2026-05-14)


### Bug Fixes

* eliminate float precision loss and transfer desync in financial ops ([#628](https://github.com/heywood8/money-tracker/issues/628)) ([bdb0669](https://github.com/heywood8/money-tracker/commit/bdb0669c25ce624e9300c4fdf2fee6756e036e8c))

## [0.112.9](https://github.com/heywood8/money-tracker/compare/penny-v0.112.8...penny-v0.112.9) (2026-05-14)


### Bug Fixes

* add missing i18n mappings for Armenian, Japanese, Korean, and Portuguese ([#626](https://github.com/heywood8/money-tracker/issues/626)) ([cc7f32a](https://github.com/heywood8/money-tracker/commit/cc7f32a144cfa1bb26864232ed649747b2b9321d))

## [0.112.8](https://github.com/heywood8/money-tracker/compare/penny-v0.112.7...penny-v0.112.8) (2026-05-14)


### Bug Fixes

* **#588:** make split operation atomic and use precise arithmetic ([#624](https://github.com/heywood8/money-tracker/issues/624)) ([78c5484](https://github.com/heywood8/money-tracker/commit/78c54848794185b4b028956d139236572f10a1cd))

## [0.112.7](https://github.com/heywood8/money-tracker/compare/penny-v0.112.6...penny-v0.112.7) (2026-05-14)


### Bug Fixes

* use account-specific expenses for balance history spending prediction ([#622](https://github.com/heywood8/money-tracker/issues/622)) ([c735648](https://github.com/heywood8/money-tracker/commit/c735648108961c1b9017f5a99fad91bb49905a46))

## [0.112.6](https://github.com/heywood8/money-tracker/compare/penny-v0.112.5...penny-v0.112.6) (2026-05-14)


### Bug Fixes

* **search:** resolve TDZ crash, lazy-load gap, and stale-state bugs ([#620](https://github.com/heywood8/money-tracker/issues/620)) ([1a0a44d](https://github.com/heywood8/money-tracker/commit/1a0a44d08b4390b2520e94089b5bc334fc2591ad))

## [0.112.5](https://github.com/heywood8/money-tracker/compare/penny-v0.112.4...penny-v0.112.5) (2026-05-14)


### Bug Fixes

* expense graph now aggregates all accounts for selected currency ([#618](https://github.com/heywood8/money-tracker/issues/618)) ([16d31c0](https://github.com/heywood8/money-tracker/commit/16d31c0705209fa5d9a1d8f1e7cffd552eb8a13e))

## [0.112.4](https://github.com/heywood8/money-tracker/compare/penny-v0.112.3...penny-v0.112.4) (2026-05-14)


### Bug Fixes

* show foreign currency amount as primary in operation modal ([#616](https://github.com/heywood8/money-tracker/issues/616)) ([511a59c](https://github.com/heywood8/money-tracker/commit/511a59c41690734543603fbef9841e3c2185a26a))

## [0.112.3](https://github.com/heywood8/money-tracker/compare/penny-v0.112.2...penny-v0.112.3) (2026-05-13)


### Bug Fixes

* show editable exchange rate fields for foreign currency ops in OperationModal ([#614](https://github.com/heywood8/money-tracker/issues/614)) ([5349715](https://github.com/heywood8/money-tracker/commit/5349715404e98585bd1de023257e26385b9e68c1))

## [0.112.2](https://github.com/heywood8/money-tracker/compare/penny-v0.112.1...penny-v0.112.2) (2026-05-13)


### Bug Fixes

* multicurrency operation data resets when editing description in OperationModal ([#612](https://github.com/heywood8/money-tracker/issues/612)) ([6d765fa](https://github.com/heywood8/money-tracker/commit/6d765fa4f1fe66df02291314afff7212791d262c))

## [0.112.1](https://github.com/heywood8/money-tracker/compare/penny-v0.112.0...penny-v0.112.1) (2026-05-12)


### Bug Fixes

* preserve multicurrency exchange rate when editing description in OperationModal ([#610](https://github.com/heywood8/money-tracker/issues/610)) ([7191c02](https://github.com/heywood8/money-tracker/commit/7191c02d02828334c98a9b033be55af97fe002d6))

## [0.112.0](https://github.com/heywood8/money-tracker/compare/penny-v0.111.1...penny-v0.112.0) (2026-05-12)


### Features

* add foreign currency expense/income support with live exchange rates ([#582](https://github.com/heywood8/money-tracker/issues/582)) ([4858067](https://github.com/heywood8/money-tracker/commit/48580673eeba0afbe847c393c34765bbe4b838f9))

## [0.111.1](https://github.com/heywood8/money-tracker/compare/penny-v0.111.0...penny-v0.111.1) (2026-05-12)


### Bug Fixes

* "up to date" layout in Check for updates panel ([#580](https://github.com/heywood8/money-tracker/issues/580)) ([e8c0f37](https://github.com/heywood8/money-tracker/commit/e8c0f37f66c11bb1ae570472fa8584759e545b78))

## [0.111.0](https://github.com/heywood8/money-tracker/compare/penny-v0.110.1...penny-v0.111.0) (2026-05-11)


### Features

* **ui:** move version display from header to update button in Settings ([#577](https://github.com/heywood8/money-tracker/issues/577)) ([b2acae5](https://github.com/heywood8/money-tracker/commit/b2acae51457833c44cc67f2d075c0cdabf89aeff))

## [0.110.1](https://github.com/heywood8/money-tracker/compare/penny-v0.110.0...penny-v0.110.1) (2026-05-11)


### Bug Fixes

* remove border styling from calculator buttons ([#575](https://github.com/heywood8/money-tracker/issues/575)) ([877b747](https://github.com/heywood8/money-tracker/commit/877b747aff6b6a665a4c5fb378b97c75f47ae3a4))

## [0.110.0](https://github.com/heywood8/money-tracker/compare/penny-v0.109.1...penny-v0.110.0) (2026-05-11)


### Features

* **graphs:** refine expense/income card category drill-down UX ([#572](https://github.com/heywood8/money-tracker/issues/572)) ([c219c97](https://github.com/heywood8/money-tracker/commit/c219c9726470a727dc2150ff9a08732466dc35fa))

## [0.109.1](https://github.com/heywood8/money-tracker/compare/penny-v0.109.0...penny-v0.109.1) (2026-05-11)


### Bug Fixes

* **graphs:** guard WheelPicker against empty data to prevent launch crash ([#570](https://github.com/heywood8/money-tracker/issues/570)) ([c1daee1](https://github.com/heywood8/money-tracker/commit/c1daee13b33efcfb927cdfdf56f86b91d63cc650))

## [0.109.0](https://github.com/heywood8/money-tracker/compare/penny-v0.108.0...penny-v0.109.0) (2026-05-11)


### Features

* **graphs:** donut chart with arc icons and side legend ([#568](https://github.com/heywood8/money-tracker/issues/568)) ([c9eb0a8](https://github.com/heywood8/money-tracker/commit/c9eb0a814dd900acb97176d3b5ec6e0cb606e828))

## [0.108.0](https://github.com/heywood8/money-tracker/compare/penny-v0.107.2...penny-v0.108.0) (2026-05-11)


### Features

* **graphs:** floating wheel FABs for currency and period selection ([#566](https://github.com/heywood8/money-tracker/issues/566)) ([bcff60e](https://github.com/heywood8/money-tracker/commit/bcff60ef58e34ea05e85f854c70d83e520f209d8))

## [0.107.2](https://github.com/heywood8/money-tracker/compare/penny-v0.107.1...penny-v0.107.2) (2026-05-11)


### Miscellaneous Chores

* **main:** release penny 0.107.1 ([#564](https://github.com/heywood8/money-tracker/issues/564)) ([cf0786a](https://github.com/heywood8/money-tracker/commit/cf0786a8df16422ed322e7f3733b6efd09ce9d1e))

## [0.107.1](https://github.com/heywood8/money-tracker/compare/penny-v0.107.0...penny-v0.107.1) (2026-05-11)


### Bug Fixes

* transfer target accounts not showing all available options in QuickAdd ([#561](https://github.com/heywood8/money-tracker/issues/561)) ([6788fb6](https://github.com/heywood8/money-tracker/commit/6788fb66a0bbb86244214c2fa6bbfd67e204e88c))

## [0.107.0](https://github.com/heywood8/money-tracker/compare/penny-v0.106.0...penny-v0.107.0) (2026-05-11)


### Features

* redesign update dialog with compact downloaded APKs display ([#560](https://github.com/heywood8/money-tracker/issues/560)) ([65568f9](https://github.com/heywood8/money-tracker/commit/65568f99dc6b7514dc9f84401b69b51aa0d711b8))

## [0.106.0](https://github.com/heywood8/money-tracker/compare/penny-v0.105.2...penny-v0.106.0) (2026-05-11)


### Features

* add percentage stacked bar view to category spending trend VS mode ([#558](https://github.com/heywood8/money-tracker/issues/558)) ([fc6e5a1](https://github.com/heywood8/money-tracker/commit/fc6e5a1bd668bd776817550750330a93d73460fa))

## [0.105.2](https://github.com/heywood8/money-tracker/compare/penny-v0.105.1...penny-v0.105.2) (2026-05-11)


### Bug Fixes

* category search missing non-ASCII names in lazy loading ([#555](https://github.com/heywood8/money-tracker/issues/555)) ([ea7d574](https://github.com/heywood8/money-tracker/commit/ea7d574ed12911273dcbdcbbceeed2175a460e0c))

## [0.105.1](https://github.com/heywood8/money-tracker/compare/penny-v0.105.0...penny-v0.105.1) (2026-05-11)


### Bug Fixes

* currency picker to show as popover anchored to button ([#554](https://github.com/heywood8/money-tracker/issues/554)) ([831aef4](https://github.com/heywood8/money-tracker/commit/831aef4a0e14102b3aa9ac180f3227bdf33fb1cc))

## [0.105.0](https://github.com/heywood8/money-tracker/compare/penny-v0.104.0...penny-v0.105.0) (2026-05-10)


### Features

* show downloaded APKs in the check-for-updates panel ([#551](https://github.com/heywood8/money-tracker/issues/551)) ([9393c13](https://github.com/heywood8/money-tracker/commit/9393c138a1bdce3668b68f45bca1189dd93665ec))

## [0.104.0](https://github.com/heywood8/money-tracker/compare/penny-v0.103.4...penny-v0.104.0) (2026-05-10)


### Features

* replace month and currency pickers on GraphsScreen with WheelPicker ([#550](https://github.com/heywood8/money-tracker/issues/550)) ([d0107d3](https://github.com/heywood8/money-tracker/commit/d0107d3e5970ef58a7af0e8ed5a1765da9f89b34))

## [0.103.4](https://github.com/heywood8/money-tracker/compare/penny-v0.103.3...penny-v0.103.4) (2026-05-10)


### Bug Fixes

* replace startup update dialog with rich UpdateAvailableModal ([#547](https://github.com/heywood8/money-tracker/issues/547)) ([b469873](https://github.com/heywood8/money-tracker/commit/b4698731cba33ceed72bb4a892c986aa88dc8ed4))

## [0.103.3](https://github.com/heywood8/money-tracker/compare/penny-v0.103.2...penny-v0.103.3) (2026-05-10)


### Bug Fixes

* add missing trailing comma in Header.js animation sequence ([#546](https://github.com/heywood8/money-tracker/issues/546)) ([354252a](https://github.com/heywood8/money-tracker/commit/354252afc087a42860a2fd816ad27396a5d5802a))

## [0.103.2](https://github.com/heywood8/money-tracker/compare/penny-v0.103.1...penny-v0.103.2) (2026-05-10)


### Bug Fixes

* format chart legend amounts with K/M/B and currency symbol ([#543](https://github.com/heywood8/money-tracker/issues/543)) ([d09f7a2](https://github.com/heywood8/money-tracker/commit/d09f7a2d32e9914e7473811c3fddd3746d8d6aec))
* replace ActivityIndicator with animated arrow-down icon for update download ([#544](https://github.com/heywood8/money-tracker/issues/544)) ([1d15bf9](https://github.com/heywood8/money-tracker/commit/1d15bf9f45cfbfbe6ea8cee6ee48727d7b365c1b))

## [0.103.1](https://github.com/heywood8/money-tracker/compare/penny-v0.103.0...penny-v0.103.1) (2026-05-10)


### Bug Fixes

* hide expand chevron for leaf categories in pie chart legends ([#541](https://github.com/heywood8/money-tracker/issues/541)) ([d41282c](https://github.com/heywood8/money-tracker/commit/d41282c4d17fb4429e7741d0aa1c1518d2b879ad))

## [0.103.0](https://github.com/heywood8/money-tracker/compare/penny-v0.102.0...penny-v0.103.0) (2026-05-10)


### Features

* **graphs:** smooth sequenced card expand animation with Reanimated ([#539](https://github.com/heywood8/money-tracker/issues/539)) ([3c2e620](https://github.com/heywood8/money-tracker/commit/3c2e6207dcd25bf9d71fe3f085326a080ce6de1e))

## [0.102.0](https://github.com/heywood8/money-tracker/compare/penny-v0.101.0...penny-v0.102.0) (2026-05-10)


### Features

* **graphs:** animate income/expense card expand with corner-drag effect ([#537](https://github.com/heywood8/money-tracker/issues/537)) ([dcf2d5b](https://github.com/heywood8/money-tracker/commit/dcf2d5b33a0e69015ef6959257cd93dbd55c1919))

## [0.101.0](https://github.com/heywood8/money-tracker/compare/penny-v0.100.1...penny-v0.101.0) (2026-05-10)


### Features

* **graphs:** expand income and expense cards inline instead of modal ([#531](https://github.com/heywood8/money-tracker/issues/531)) ([28ba2bf](https://github.com/heywood8/money-tracker/commit/28ba2bfcc27668fa9a42b3e28e986c3e13a151f7))

## [0.100.1](https://github.com/heywood8/money-tracker/compare/penny-v0.100.0...penny-v0.100.1) (2026-05-10)


### Bug Fixes

* **settings:** fix import progress panel z-order and double-tap crash ([#534](https://github.com/heywood8/money-tracker/issues/534)) ([a92978e](https://github.com/heywood8/money-tracker/commit/a92978e318372e17ba440b194772a9e249380ac1))

## [0.100.0](https://github.com/heywood8/money-tracker/compare/penny-v0.99.0...penny-v0.100.0) (2026-05-10)


### Features

* **graphs:** Add vs category comparison to spending trend chart ([#532](https://github.com/heywood8/money-tracker/issues/532)) ([cdd325d](https://github.com/heywood8/money-tracker/commit/cdd325d2f1e331abde2fbaa44dc54902c6074724))

## [0.99.0](https://github.com/heywood8/money-tracker/compare/penny-v0.98.0...penny-v0.99.0) (2026-05-09)


### Features

* add step-by-step progress subpanel for Google Sheets export ([#528](https://github.com/heywood8/money-tracker/issues/528)) ([c03640a](https://github.com/heywood8/money-tracker/commit/c03640ae168fd055406ca543b12b2b87f83dc80e))

## [0.98.0](https://github.com/heywood8/money-tracker/compare/penny-v0.97.0...penny-v0.98.0) (2026-05-09)


### Features

* apply basic filters to all sheets after Google Sheets export ([#527](https://github.com/heywood8/money-tracker/issues/527)) ([37471f1](https://github.com/heywood8/money-tracker/commit/37471f11d20b19f3040ca4f535360d29e429e6e9))

## [0.97.0](https://github.com/heywood8/money-tracker/compare/penny-v0.96.0...penny-v0.97.0) (2026-05-09)


### Features

* **settings:** multi-step import flow, source picker, save backup in export ([#525](https://github.com/heywood8/money-tracker/issues/525)) ([7150c61](https://github.com/heywood8/money-tracker/commit/7150c61f8927c074b69d1818801d409364a11066))

## [0.96.0](https://github.com/heywood8/money-tracker/compare/penny-v0.95.2...penny-v0.96.0) (2026-05-09)


### Features

* **settings:** refactor sub-navigation to unified subpanel pattern ([#522](https://github.com/heywood8/money-tracker/issues/522)) ([3497013](https://github.com/heywood8/money-tracker/commit/34970130650dce5689341f48d7e4bbf4c1db5f8c))

## [0.95.2](https://github.com/heywood8/money-tracker/compare/penny-v0.95.1...penny-v0.95.2) (2026-05-09)


### Bug Fixes

* prev month balance graph drops to 0 on last day of longer months ([#518](https://github.com/heywood8/money-tracker/issues/518)) ([aa79acc](https://github.com/heywood8/money-tracker/commit/aa79accb29e8eaf0844e49682931f6402634c940))

## [0.95.1](https://github.com/heywood8/money-tracker/compare/penny-v0.95.0...penny-v0.95.1) (2026-05-09)


### Bug Fixes

* **operations:** prevent layout slide when switching operation types ([#519](https://github.com/heywood8/money-tracker/issues/519)) ([38322d4](https://github.com/heywood8/money-tracker/commit/38322d4b6f3c43049eaf9d0cdfbe80187740fe7b))

## [0.95.0](https://github.com/heywood8/money-tracker/compare/penny-v0.94.3...penny-v0.95.0) (2026-05-08)


### Features

* **quickadd:** show up to 8 scrollable description suggestions after quick add ([#515](https://github.com/heywood8/money-tracker/issues/515)) ([70cf996](https://github.com/heywood8/money-tracker/commit/70cf996ec063284293c4a53cba89f3ca0405ba63))

## [0.94.3](https://github.com/heywood8/money-tracker/compare/penny-v0.94.2...penny-v0.94.3) (2026-05-07)


### Bug Fixes

* **calendar:** improve edit row UX in balance history calendar ([#513](https://github.com/heywood8/money-tracker/issues/513)) ([d7a2162](https://github.com/heywood8/money-tracker/commit/d7a21623e49b43342c07655d71f85f9b3064a558))

## [0.94.2](https://github.com/heywood8/money-tracker/compare/penny-v0.94.1...penny-v0.94.2) (2026-05-07)


### Bug Fixes

* show correct currency symbol in graphs currency selector ([#511](https://github.com/heywood8/money-tracker/issues/511)) ([8b35a97](https://github.com/heywood8/money-tracker/commit/8b35a9708adb2ddafcd5010d0adf1ff29bc4fcee))

## [0.94.1](https://github.com/heywood8/money-tracker/compare/penny-v0.94.0...penny-v0.94.1) (2026-05-07)


### Bug Fixes

* **ModalShell:** eliminate open and close flicker in slide animation ([#508](https://github.com/heywood8/money-tracker/issues/508)) ([f66da79](https://github.com/heywood8/money-tracker/commit/f66da79ad3ba78a6febba978e552a9ff5e017c1a))

## [0.94.0](https://github.com/heywood8/money-tracker/compare/penny-v0.93.2...penny-v0.94.0) (2026-05-07)


### Features

* **graphs:** inline calendar view replaces BalanceHistoryModal ([#506](https://github.com/heywood8/money-tracker/issues/506)) ([b050533](https://github.com/heywood8/money-tracker/commit/b0505333b75ea09ab05996b3a392dc29ce1079e6))

## [0.93.2](https://github.com/heywood8/money-tracker/compare/penny-v0.93.1...penny-v0.93.2) (2026-05-07)


### Bug Fixes

* **graphs:** stretch balance history chart to fill card width ([#504](https://github.com/heywood8/money-tracker/issues/504)) ([bf7564f](https://github.com/heywood8/money-tracker/commit/bf7564fc5937e65d3f3cf0be54edb09fb9ba58b8))

## [0.93.1](https://github.com/heywood8/money-tracker/compare/penny-v0.93.0...penny-v0.93.1) (2026-05-07)


### Bug Fixes

* **modal:** fix double-slide, bottom gap, and description visibility ([#502](https://github.com/heywood8/money-tracker/issues/502)) ([80b3fd5](https://github.com/heywood8/money-tracker/commit/80b3fd5b26d07390d7741ac4f8438bc709359bf4))

## [0.93.0](https://github.com/heywood8/money-tracker/compare/penny-v0.92.1...penny-v0.93.0) (2026-05-07)


### Features

* **planned:** redesign screen with summary strip, sections, and swipe-to-execute ([#500](https://github.com/heywood8/money-tracker/issues/500)) ([5e2b8ac](https://github.com/heywood8/money-tracker/commit/5e2b8acc575fac983fb5b7c128df26e862e8fa28))

## [0.92.1](https://github.com/heywood8/money-tracker/compare/penny-v0.92.0...penny-v0.92.1) (2026-05-07)


### Bug Fixes

* no error when biometrics not configured for hide balances toggle ([#498](https://github.com/heywood8/money-tracker/issues/498)) ([efd3eca](https://github.com/heywood8/money-tracker/commit/efd3eca917abd40f69654dd0b2f305873282428b))

## [0.92.0](https://github.com/heywood8/money-tracker/compare/penny-v0.91.0...penny-v0.92.0) (2026-05-07)


### Features

* **logs:** improve logs modal UX and fix animation consistency ([#496](https://github.com/heywood8/money-tracker/issues/496)) ([2648fab](https://github.com/heywood8/money-tracker/commit/2648fab7f7688eadc6b5290c210d3d7f9e2f8e49))

## [0.91.0](https://github.com/heywood8/money-tracker/compare/penny-v0.90.0...penny-v0.91.0) (2026-05-07)


### Features

* show spinner on update check row while check is in progress ([2417c97](https://github.com/heywood8/money-tracker/commit/2417c97219bc0774f282c107de3433ada6e7748d))

## [0.90.0](https://github.com/heywood8/money-tracker/compare/penny-v0.89.0...penny-v0.90.0) (2026-05-07)


### Features

* add drag-to-dismiss gesture to ModalShell bottom sheet ([#490](https://github.com/heywood8/money-tracker/issues/490)) ([5cf7d62](https://github.com/heywood8/money-tracker/commit/5cf7d6202c29c7435c5246b0b8795bb569421008))

## [0.89.0](https://github.com/heywood8/money-tracker/compare/penny-v0.88.0...penny-v0.89.0) (2026-05-06)


### Features

* **ui:** modal style standardization ([#488](https://github.com/heywood8/money-tracker/issues/488)) ([d17665a](https://github.com/heywood8/money-tracker/commit/d17665a1c65b076b045cbe1d2fc674e0d7b80ce8))

## [0.88.0](https://github.com/heywood8/money-tracker/compare/penny-v0.87.0...penny-v0.88.0) (2026-05-05)


### Features

* **ui:** replace category row list with grid in operation modal ([#486](https://github.com/heywood8/money-tracker/issues/486)) ([50eb319](https://github.com/heywood8/money-tracker/commit/50eb3193629ec27b96f8989960764e98c5a6da61))

## [0.87.0](https://github.com/heywood8/money-tracker/compare/penny-v0.86.4...penny-v0.87.0) (2026-05-05)


### Features

* **ui:** replace category row list with grid in operation picker ([#484](https://github.com/heywood8/money-tracker/issues/484)) ([e287dab](https://github.com/heywood8/money-tracker/commit/e287dab3eab051dac3e92e441e49ae3bd06f43b7))

## [0.86.4](https://github.com/heywood8/money-tracker/compare/penny-v0.86.3...penny-v0.86.4) (2026-05-05)


### Documentation

* audit and update all documentation for accuracy ([#482](https://github.com/heywood8/money-tracker/issues/482)) ([35293b8](https://github.com/heywood8/money-tracker/commit/35293b8208098d07d3b8901c66947a2f8572a78d))

## [0.86.3](https://github.com/heywood8/money-tracker/compare/penny-v0.86.2...penny-v0.86.3) (2026-05-05)


### Bug Fixes

* **logging:** reclassify log levels across codebase ([#477](https://github.com/heywood8/money-tracker/issues/477)) ([26dac01](https://github.com/heywood8/money-tracker/commit/26dac0111f4c9670c2c27bb9ce96c576be03f655))


### Documentation

* add receipt scanner implementation plan ([#480](https://github.com/heywood8/money-tracker/issues/480)) ([bbe623b](https://github.com/heywood8/money-tracker/commit/bbe623b4b83e73c7f07462e387850e32b915cba2))

## [0.86.2](https://github.com/heywood8/money-tracker/compare/penny-v0.86.1...penny-v0.86.2) (2026-05-05)


### Styles

* refine theme colors for selected/accent elements ([#478](https://github.com/heywood8/money-tracker/issues/478)) ([46bef58](https://github.com/heywood8/money-tracker/commit/46bef58f566979481bfc5bdc8470439e445c9039))

## [0.86.1](https://github.com/heywood8/money-tracker/compare/penny-v0.86.0...penny-v0.86.1) (2026-05-05)


### Bug Fixes

* **useLogEntries:** defer setTick to avoid setState-during-render ([#475](https://github.com/heywood8/money-tracker/issues/475)) ([3f05344](https://github.com/heywood8/money-tracker/commit/3f053444b70dec39d14436e28f695f0ec83f76dc))

## [0.86.0](https://github.com/heywood8/money-tracker/compare/penny-v0.85.0...penny-v0.86.0) (2026-05-05)


### Features

* **categories:** remove list view, keep grid-only layout ([#473](https://github.com/heywood8/money-tracker/issues/473)) ([b70c2c7](https://github.com/heywood8/money-tracker/commit/b70c2c794b3f117c6542e0904ceb349696b78cfd))

## [0.85.0](https://github.com/heywood8/money-tracker/compare/penny-v0.84.0...penny-v0.85.0) (2026-05-05)


### Features

* **categories:** bottom sheet modal with animated picker panels ([#471](https://github.com/heywood8/money-tracker/issues/471)) ([f0646f2](https://github.com/heywood8/money-tracker/commit/f0646f235f7f603cdd94ab3c3669092137b9a23c))

## [0.84.0](https://github.com/heywood8/money-tracker/compare/penny-v0.83.1...penny-v0.84.0) (2026-05-05)


### Features

* **accounts:** bottom sheet modal with animated currency panel ([#469](https://github.com/heywood8/money-tracker/issues/469)) ([e1b3a55](https://github.com/heywood8/money-tracker/commit/e1b3a55521fe78b56b948373490e57307bbd9849))

## [0.83.1](https://github.com/heywood8/money-tracker/compare/penny-v0.83.0...penny-v0.83.1) (2026-05-05)


### Documentation

* sync project guidance with actual codebase state ([#467](https://github.com/heywood8/money-tracker/issues/467)) ([f8233e3](https://github.com/heywood8/money-tracker/commit/f8233e3ccad1c807fdc617d177513be169f57182))

## [0.83.0](https://github.com/heywood8/money-tracker/compare/penny-v0.82.1...penny-v0.83.0) (2026-05-05)


### Features

* **google-sheets:** add Google Sheets export ([#465](https://github.com/heywood8/money-tracker/issues/465)) ([32674ca](https://github.com/heywood8/money-tracker/commit/32674ca8360c134f83bbf0aef4d7804a7f3f6ef1))

## [0.82.1](https://github.com/heywood8/money-tracker/compare/penny-v0.82.0...penny-v0.82.1) (2026-05-04)


### Bug Fixes

* **header:** hide search bar when navigating away from operations screen ([#463](https://github.com/heywood8/money-tracker/issues/463)) ([94b1c2f](https://github.com/heywood8/money-tracker/commit/94b1c2fdc7528ddc13afcb71fa29a820f12d251f))

## [0.82.0](https://github.com/heywood8/money-tracker/compare/penny-v0.81.2...penny-v0.82.0) (2026-05-03)


### Features

* **quickadd:** add second suggested row for categories and transfer accounts ([#461](https://github.com/heywood8/money-tracker/issues/461)) ([93962a3](https://github.com/heywood8/money-tracker/commit/93962a3014f00cd1e7281a85cb2f00f967b4151a))

## [0.81.2](https://github.com/heywood8/money-tracker/compare/penny-v0.81.1...penny-v0.81.2) (2026-05-03)


### Styles

* **quickadd:** align form borders with operation group style ([#459](https://github.com/heywood8/money-tracker/issues/459)) ([3a1eca7](https://github.com/heywood8/money-tracker/commit/3a1eca7a5267903073d9d70ab641d6de37c6f44f))

## [0.81.1](https://github.com/heywood8/money-tracker/compare/penny-v0.81.0...penny-v0.81.1) (2026-05-03)


### Continuous Integration

* mitigate cache poisoning and untrusted checkout in emulator-screenshots ([#457](https://github.com/heywood8/money-tracker/issues/457)) ([68731c6](https://github.com/heywood8/money-tracker/commit/68731c6e663871d75166e618ec5c6ba6777eb405))

## [0.81.0](https://github.com/heywood8/money-tracker/compare/penny-v0.80.1...penny-v0.81.0) (2026-05-03)


### Features

* **quickadd:** remove outline and background from QuickAdd ([#455](https://github.com/heywood8/money-tracker/issues/455)) ([9b9e80a](https://github.com/heywood8/money-tracker/commit/9b9e80a5fed52423f98fd85d836bde34c832cf6e))

## [0.80.1](https://github.com/heywood8/money-tracker/compare/penny-v0.80.0...penny-v0.80.1) (2026-05-03)


### Tests

* rewrite skipped search tests against Header and SearchOverlay ([#453](https://github.com/heywood8/money-tracker/issues/453)) ([0a32d9d](https://github.com/heywood8/money-tracker/commit/0a32d9d177e8c826d6260788e503e92172a191c6))

## [0.80.0](https://github.com/heywood8/money-tracker/compare/penny-v0.79.0...penny-v0.80.0) (2026-05-03)


### Features

* **quickadd:** shrink QuickAddForm height by ~15% ([#451](https://github.com/heywood8/money-tracker/issues/451)) ([59e6780](https://github.com/heywood8/money-tracker/commit/59e6780b8305a251161d08067a631857e0d03ce3))

## [0.79.0](https://github.com/heywood8/money-tracker/compare/penny-v0.78.0...penny-v0.79.0) (2026-05-03)


### Features

* **search:** auto-scroll to top when filter closes if user is near recent entries ([#449](https://github.com/heywood8/money-tracker/issues/449)) ([6729d16](https://github.com/heywood8/money-tracker/commit/6729d16875a9b7ad2adc82d7d36c29b3f82dba4c))

## [0.78.0](https://github.com/heywood8/money-tracker/compare/penny-v0.77.1...penny-v0.78.0) (2026-05-03)


### Features

* **search:** filter panel redesign ([#447](https://github.com/heywood8/money-tracker/issues/447)) ([2d21ea0](https://github.com/heywood8/money-tracker/commit/2d21ea0d0751ac69eb4cced82de142a80d028648))

## [0.77.1](https://github.com/heywood8/money-tracker/compare/penny-v0.77.0...penny-v0.77.1) (2026-05-02)


### Bug Fixes

* **search:** fix filters not appearing when toggled during search ([#445](https://github.com/heywood8/money-tracker/issues/445)) ([167f5dd](https://github.com/heywood8/money-tracker/commit/167f5dd142b3b2637ed7b497f1d279cc263bd63b))

## [0.77.0](https://github.com/heywood8/money-tracker/compare/penny-v0.76.2...penny-v0.77.0) (2026-05-02)


### Features

* **update:** improve app update check to handle releases without APKs ([#442](https://github.com/heywood8/money-tracker/issues/442)) ([7ab278b](https://github.com/heywood8/money-tracker/commit/7ab278b46df58a12a41d5dbf631ed3b9fda15fdd))


### Bug Fixes

* scroll-to-date race condition with synchronous guard ([#441](https://github.com/heywood8/money-tracker/issues/441)) ([097574b](https://github.com/heywood8/money-tracker/commit/097574b20053253fa5e9830f12b35acafaac6f66))

## [0.76.2](https://github.com/heywood8/money-tracker/compare/penny-v0.76.1...penny-v0.76.2) (2026-05-02)


### Bug Fixes

* **search:** support category hierarchy in operations search ([#439](https://github.com/heywood8/money-tracker/issues/439)) ([ccc1922](https://github.com/heywood8/money-tracker/commit/ccc192275f79bf7b5f93d43515cc9eacf88b3c13))

## [0.76.1](https://github.com/heywood8/money-tracker/compare/penny-v0.76.0...penny-v0.76.1) (2026-05-02)


### Bug Fixes

* eliminate search bar flicker by moving text state into SearchBar ([#437](https://github.com/heywood8/money-tracker/issues/437)) ([79540ae](https://github.com/heywood8/money-tracker/commit/79540ae3334f6d03e1be7b574d26ac7573fde05c))

## [0.76.0](https://github.com/heywood8/money-tracker/compare/penny-v0.75.1...penny-v0.76.0) (2026-05-02)


### Features

* make text search case-insensitive in SQL queries ([#435](https://github.com/heywood8/money-tracker/issues/435)) ([e11bc4e](https://github.com/heywood8/money-tracker/commit/e11bc4e0c3e81ed351d7403b88cac7679797ee98))

## [0.75.1](https://github.com/heywood8/money-tracker/compare/penny-v0.75.0...penny-v0.75.1) (2026-05-01)


### Documentation

* add emulator verification skill ([#433](https://github.com/heywood8/money-tracker/issues/433)) ([6102476](https://github.com/heywood8/money-tracker/commit/61024768f39745056931f4d66a06fdde39e1c336))

## [0.75.0](https://github.com/heywood8/money-tracker/compare/penny-v0.74.0...penny-v0.75.0) (2026-05-01)


### Features

* redesign description suggestion row UX ([#430](https://github.com/heywood8/money-tracker/issues/430)) ([d6e6cdd](https://github.com/heywood8/money-tracker/commit/d6e6cdd9245071399a84643cfa05ea05668fab2d))
* redesign operations filter to integrated header search ([#431](https://github.com/heywood8/money-tracker/issues/431)) ([eb864da](https://github.com/heywood8/money-tracker/commit/eb864dab1ccda3f64a4b7dcfb1afffd53a3299f9))

## [0.74.0](https://github.com/heywood8/money-tracker/compare/penny-v0.73.3...penny-v0.74.0) (2026-04-30)


### Features

* inline description suggestion after QuickAdd save ([#428](https://github.com/heywood8/money-tracker/issues/428)) ([64a7ea4](https://github.com/heywood8/money-tracker/commit/64a7ea4199abb1a40648ad5eab4a04b5d67ce6b4))

## [0.73.3](https://github.com/heywood8/money-tracker/compare/penny-v0.73.2...penny-v0.73.3) (2026-04-30)


### Miscellaneous Chores

* add .superpowers/ to .gitignore ([#426](https://github.com/heywood8/money-tracker/issues/426)) ([7fb6038](https://github.com/heywood8/money-tracker/commit/7fb6038ab1ad21a4b59ed2d36af57be340f5a952))

## [0.73.2](https://github.com/heywood8/money-tracker/compare/penny-v0.73.1...penny-v0.73.2) (2026-04-30)


### Code Refactoring

* extract LoadingView, EmptyState, and ModalHeader shared components ([d562cfb](https://github.com/heywood8/money-tracker/commit/d562cfbe1467ca3e3fca05ec4279f90fdcce9729))

## [0.73.1](https://github.com/heywood8/money-tracker/compare/penny-v0.73.0...penny-v0.73.1) (2026-04-29)


### Code Refactoring

* extract AddFAB into reusable component with consistent styling ([#422](https://github.com/heywood8/money-tracker/issues/422)) ([a418a9b](https://github.com/heywood8/money-tracker/commit/a418a9baafc105e42e963c280b97a8856833ca10))

## [0.73.0](https://github.com/heywood8/money-tracker/compare/penny-v0.72.0...penny-v0.73.0) (2026-04-29)


### Features

* **graphs:** show account picker as bottom sheet with balance ([#419](https://github.com/heywood8/money-tracker/issues/419)) ([631d634](https://github.com/heywood8/money-tracker/commit/631d634cf5a0b417254742893123cbb078345fda))

## [0.72.0](https://github.com/heywood8/money-tracker/compare/penny-v0.71.2...penny-v0.72.0) (2026-04-27)


### Features

* **logs:** persist app logs to daily files ([#417](https://github.com/heywood8/money-tracker/issues/417)) ([7cf917b](https://github.com/heywood8/money-tracker/commit/7cf917bd74a6adb6e2fe89dc2739046f0d90afea))

## [0.71.2](https://github.com/heywood8/money-tracker/compare/penny-v0.71.1...penny-v0.71.2) (2026-04-27)


### Bug Fixes

* show balance graph below 0 ([#415](https://github.com/heywood8/money-tracker/issues/415)) ([810cfe4](https://github.com/heywood8/money-tracker/commit/810cfe45b7a97d9fef6776d2e9ec4d62ace7f401))

## [0.71.1](https://github.com/heywood8/money-tracker/compare/penny-v0.71.0...penny-v0.71.1) (2026-04-27)


### Bug Fixes

* account picker balance inline and bottom-sheet style ([#413](https://github.com/heywood8/money-tracker/issues/413)) ([2281f12](https://github.com/heywood8/money-tracker/commit/2281f1292c98d05b4c0bbb7509603c63f2d41836))

## [0.71.0](https://github.com/heywood8/money-tracker/compare/penny-v0.70.0...penny-v0.71.0) (2026-04-26)


### Features

* clean up old APKs after in-app update download ([#411](https://github.com/heywood8/money-tracker/issues/411)) ([ac5d589](https://github.com/heywood8/money-tracker/commit/ac5d589a97676f93fd53c36e1f0ffa70dc00b571))

## [0.70.0](https://github.com/heywood8/money-tracker/compare/penny-v0.69.1...penny-v0.70.0) (2026-04-26)


### Features

* local Maestro screenshot flow (all 26 screens, light + dark) ([#409](https://github.com/heywood8/money-tracker/issues/409)) ([c148891](https://github.com/heywood8/money-tracker/commit/c148891703a31fd84d8e670f68c550cbafdd2e56))


### Build System

* **deps:** bump googleapis/release-please-action from 4 to 5 ([#408](https://github.com/heywood8/money-tracker/issues/408)) ([fae472c](https://github.com/heywood8/money-tracker/commit/fae472c3bbcde81fdf5e269c926de28933a51e83))

## [0.69.1](https://github.com/heywood8/money-tracker/compare/penny-v0.69.0...penny-v0.69.1) (2026-04-26)


### Bug Fixes

* calculate previous month daily average from total expenses ([33f4091](https://github.com/heywood8/money-tracker/commit/33f4091ede5896771756a8e3170b25847c1cba9a))

## [0.69.0](https://github.com/heywood8/money-tracker/compare/penny-v0.68.3...penny-v0.69.0) (2026-04-25)


### Features

* non-blocking APK update download with header progress indicator ([#404](https://github.com/heywood8/money-tracker/issues/404)) ([a2b6dc0](https://github.com/heywood8/money-tracker/commit/a2b6dc0e31579c110b95837861b366b29231eb22))

## [0.68.3](https://github.com/heywood8/money-tracker/compare/penny-v0.68.2...penny-v0.68.3) (2026-04-25)


### Bug Fixes

* spending trend visibility ([91d4359](https://github.com/heywood8/money-tracker/commit/91d435938c9ad83940503d5f9bb6457daa96f197))

## [0.68.2](https://github.com/heywood8/money-tracker/compare/penny-v0.68.1...penny-v0.68.2) (2026-04-25)


### Miscellaneous Chores

* adding agent skills ([#400](https://github.com/heywood8/money-tracker/issues/400)) ([fe34cdd](https://github.com/heywood8/money-tracker/commit/fe34cddccedb9766c64bc4dff3c364a94c314cdd))

## [0.68.1](https://github.com/heywood8/money-tracker/compare/penny-v0.68.0...penny-v0.68.1) (2026-04-23)


### Bug Fixes

* settings modal layout and header styling ([#398](https://github.com/heywood8/money-tracker/issues/398)) ([1440346](https://github.com/heywood8/money-tracker/commit/14403465476db005a2e39d062dfe102e61a2599f))

## [0.68.0](https://github.com/heywood8/money-tracker/compare/penny-v0.67.0...penny-v0.68.0) (2026-04-23)


### Features

* **graphs:** redesign BalanceHistoryCard header ([#396](https://github.com/heywood8/money-tracker/issues/396)) ([a22ed93](https://github.com/heywood8/money-tracker/commit/a22ed93cbf8d5cfa8a3a3b0deeaaed263ea5964a))

## [0.67.0](https://github.com/heywood8/money-tracker/compare/penny-v0.66.0...penny-v0.67.0) (2026-04-23)


### Features

* **graphs:** redesign category spending card with interactive bar chart ([#394](https://github.com/heywood8/money-tracker/issues/394)) ([ea5bbd6](https://github.com/heywood8/money-tracker/commit/ea5bbd619538203dbf76aa0d585ed88ddd60796c))

## [0.66.0](https://github.com/heywood8/money-tracker/compare/penny-v0.65.0...penny-v0.66.0) (2026-04-23)


### Features

* **graphs:** redesign filter chips and summary cards ([#392](https://github.com/heywood8/money-tracker/issues/392)) ([7844186](https://github.com/heywood8/money-tracker/commit/7844186797e389e8405286fc55bd68e932c6528f))

## [0.65.0](https://github.com/heywood8/money-tracker/compare/penny-v0.64.0...penny-v0.65.0) (2026-04-21)


### Features

* **operations:** redesign operations list with grouped date cards ([#389](https://github.com/heywood8/money-tracker/issues/389)) ([52372c8](https://github.com/heywood8/money-tracker/commit/52372c8fa3af26e167b358ab56b2779811c315db))

## [0.64.0](https://github.com/heywood8/money-tracker/compare/penny-v0.63.0...penny-v0.64.0) (2026-04-20)


### Features

* **accounts:** enhance net worth display and number formatting ([#387](https://github.com/heywood8/money-tracker/issues/387)) ([7826522](https://github.com/heywood8/money-tracker/commit/7826522559bac75dfc3c223782ce4e581a2f2e63))

## [0.63.0](https://github.com/heywood8/money-tracker/compare/penny-v0.62.2...penny-v0.63.0) (2026-04-20)


### Features

* **categories:** add grid view with list/grid toggle ([#385](https://github.com/heywood8/money-tracker/issues/385)) ([859ef45](https://github.com/heywood8/money-tracker/commit/859ef45570010af3111f30cac2d27276c7f77073))

## [0.62.2](https://github.com/heywood8/money-tracker/compare/penny-v0.62.1...penny-v0.62.2) (2026-04-15)


### Build System

* **deps:** bump actions/github-script from 8 to 9 ([#379](https://github.com/heywood8/money-tracker/issues/379)) ([40e6f6f](https://github.com/heywood8/money-tracker/commit/40e6f6f6c2efb920bdea83d18ac16e9cddb15351))
* **deps:** bump marocchino/sticky-pull-request-comment from 3.0.2 to 3.0.4 ([#381](https://github.com/heywood8/money-tracker/issues/381)) ([39f76ce](https://github.com/heywood8/money-tracker/commit/39f76ceb79c20ec921aaff389200fdf836bd201d))
* **deps:** bump softprops/action-gh-release from 2 to 3 ([#380](https://github.com/heywood8/money-tracker/issues/380)) ([464edec](https://github.com/heywood8/money-tracker/commit/464edec810ad64c4e1de93a9fb8cca00d328bfae))

## [0.62.1](https://github.com/heywood8/money-tracker/compare/penny-v0.62.0...penny-v0.62.1) (2026-03-29)


### Bug Fixes

* **graphs:** correct prev month legend daily avg and end calculations ([#376](https://github.com/heywood8/money-tracker/issues/376)) ([1305fca](https://github.com/heywood8/money-tracker/commit/1305fcaa2dea8239a007ab12b0f5dba67fcf583e))

## [0.62.0](https://github.com/heywood8/money-tracker/compare/penny-v0.61.3...penny-v0.62.0) (2026-03-28)


### Features

* add blur overlay to SettingsModal and ImportProgressModal ([#358](https://github.com/heywood8/money-tracker/issues/358)) ([7053cf0](https://github.com/heywood8/money-tracker/commit/7053cf085d03070bf7b2e7e8a02b04216568e4b5))
* add glassmorphism blur effect when modals are open ([#354](https://github.com/heywood8/money-tracker/issues/354)) ([8806a37](https://github.com/heywood8/money-tracker/commit/8806a37ecdb085efffc2ec22bdf546ec8539c408))
* add hide account balances privacy setting ([#362](https://github.com/heywood8/money-tracker/issues/362)) ([03d9365](https://github.com/heywood8/money-tracker/commit/03d9365836ab1b5e407884481a8e6cbc8e38f1d6))
* add in-app local backup viewer to Settings ([#347](https://github.com/heywood8/money-tracker/issues/347)) ([872f4a7](https://github.com/heywood8/money-tracker/commit/872f4a72a4d54f046054aa5a0a9531f5762d8450))
* animated sliding switch for hide balances toggle ([#367](https://github.com/heywood8/money-tracker/issues/367)) ([7666294](https://github.com/heywood8/money-tracker/commit/7666294171860e895a9f206f67313084ba32c852))
* extend hideBalances to graphs page and refactor to context-direct pattern ([#365](https://github.com/heywood8/money-tracker/issues/365)) ([666d0de](https://github.com/heywood8/money-tracker/commit/666d0deb0129ded02b97fb0a28b0969b36d0a9c6))
* keep executed recurring ops enabled, sort to bottom ([#360](https://github.com/heywood8/money-tracker/issues/360)) ([55c04ab](https://github.com/heywood8/money-tracker/commit/55c04aba330e062a7e7b77409b5b0881de284068))
* show category and date pickers side-by-side when editing operation ([#348](https://github.com/heywood8/money-tracker/issues/348)) ([225f1b4](https://github.com/heywood8/money-tracker/commit/225f1b412a5005282cfd8976700550374b785b88))
* show category/to-account and date side-by-side for all operation types ([#356](https://github.com/heywood8/money-tracker/issues/356)) ([8bcdab1](https://github.com/heywood8/money-tracker/commit/8bcdab1bfcc12ae8375949132111e4e14219fc3b))


### Bug Fixes

* apk install intent missing permission and activity flag ([#371](https://github.com/heywood8/money-tracker/issues/371)) ([b7f1926](https://github.com/heywood8/money-tracker/commit/b7f1926f87a35b18512948e10d5de75d6c80f4f1))
* correct prev month avg and end in burndown legend ([#350](https://github.com/heywood8/money-tracker/issues/350)) ([5ebeec6](https://github.com/heywood8/money-tracker/commit/5ebeec6c17c43fe100a5fb8a90ede1eae111102c))
* description hints visibility ([6814575](https://github.com/heywood8/money-tracker/commit/68145758bfe5408d41c086e70ebd40fefc862c12))
* download APK in-app to fix 99% hang on Android ([#345](https://github.com/heywood8/money-tracker/issues/345)) ([803abfd](https://github.com/heywood8/money-tracker/commit/803abfd6e925f1151f0f368462154b9d968538f7))
* replace sharing with intenrLauncher for APK installation ([2ce3b5d](https://github.com/heywood8/money-tracker/commit/2ce3b5de4b3b6a26957b9feb1636796f66627839))
* show description input above keyboard when editing transactions ([#369](https://github.com/heywood8/money-tracker/issues/369)) ([2018668](https://github.com/heywood8/money-tracker/commit/20186685b708cf625d3f3028616ed140ed1afb61))


### Miscellaneous Chores

* **main:** release penny 0.52.0 ([#344](https://github.com/heywood8/money-tracker/issues/344)) ([eaa3b5a](https://github.com/heywood8/money-tracker/commit/eaa3b5afacca8d55ed42ffb07489d9e1836322dd))
* **main:** release penny 0.53.0 ([#346](https://github.com/heywood8/money-tracker/issues/346)) ([e6baaab](https://github.com/heywood8/money-tracker/commit/e6baaabb92d3044eae4e76eced988630517172ad))
* **main:** release penny 0.54.0 ([#349](https://github.com/heywood8/money-tracker/issues/349)) ([1ccfb9b](https://github.com/heywood8/money-tracker/commit/1ccfb9bee9480d1d5d4cf190bcce045f6502b061))
* **main:** release penny 0.54.1 ([#351](https://github.com/heywood8/money-tracker/issues/351)) ([38982ed](https://github.com/heywood8/money-tracker/commit/38982eddbff1119af3d4049eef02119c3b4f51a7))
* **main:** release penny 0.54.2 ([#353](https://github.com/heywood8/money-tracker/issues/353)) ([a7f8051](https://github.com/heywood8/money-tracker/commit/a7f80517edf14ef6d0561cbddab4298137fda2d7))
* **main:** release penny 0.55.0 ([#355](https://github.com/heywood8/money-tracker/issues/355)) ([83ace14](https://github.com/heywood8/money-tracker/commit/83ace14736617c97f09402b7ec08dd1ea5ee7396))
* **main:** release penny 0.56.0 ([#357](https://github.com/heywood8/money-tracker/issues/357)) ([0bbd653](https://github.com/heywood8/money-tracker/commit/0bbd653edb9f1b596b7de1fd50fc8c9b7dbeba40))
* **main:** release penny 0.57.0 ([#359](https://github.com/heywood8/money-tracker/issues/359)) ([52f8127](https://github.com/heywood8/money-tracker/commit/52f8127e3fe6eb738b1945f4b5f090c73cc739bc))
* **main:** release penny 0.58.0 ([#361](https://github.com/heywood8/money-tracker/issues/361)) ([a655ed8](https://github.com/heywood8/money-tracker/commit/a655ed8ddd6cdda2a223786391ad75579971f5ba))
* **main:** release penny 0.59.0 ([#363](https://github.com/heywood8/money-tracker/issues/363)) ([1269a12](https://github.com/heywood8/money-tracker/commit/1269a12017e6fe70287b8adb9ea24dd7ecfb8e1c))
* **main:** release penny 0.60.0 ([#366](https://github.com/heywood8/money-tracker/issues/366)) ([e3e32d6](https://github.com/heywood8/money-tracker/commit/e3e32d63398c1f3711a2a4e8c704cd0399efdfbe))
* **main:** release penny 0.61.0 ([#368](https://github.com/heywood8/money-tracker/issues/368)) ([00158b3](https://github.com/heywood8/money-tracker/commit/00158b3c321970186f6049ced20d58ef0e331fb4))
* **main:** release penny 0.61.1 ([#370](https://github.com/heywood8/money-tracker/issues/370)) ([107846b](https://github.com/heywood8/money-tracker/commit/107846b6acbc2beefd2ba5a99e304f5ecf80ed82))
* **main:** release penny 0.61.2 ([#372](https://github.com/heywood8/money-tracker/issues/372)) ([bc0830e](https://github.com/heywood8/money-tracker/commit/bc0830e209dad48e0485205568e03483734ee506))
* **main:** release penny 0.61.3 ([#374](https://github.com/heywood8/money-tracker/issues/374)) ([39777e5](https://github.com/heywood8/money-tracker/commit/39777e5d0e327cc9b07229b7bc6071947e43f38f))

## [0.61.3](https://github.com/heywood8/money-tracker/compare/penny-v0.61.2...penny-v0.61.3) (2026-03-28)


### Bug Fixes

* description hints visibility ([6814575](https://github.com/heywood8/money-tracker/commit/68145758bfe5408d41c086e70ebd40fefc862c12))

## [0.61.2](https://github.com/heywood8/money-tracker/compare/penny-v0.61.1...penny-v0.61.2) (2026-03-28)


### Bug Fixes

* apk install intent missing permission and activity flag ([#371](https://github.com/heywood8/money-tracker/issues/371)) ([b7f1926](https://github.com/heywood8/money-tracker/commit/b7f1926f87a35b18512948e10d5de75d6c80f4f1))

## [0.61.1](https://github.com/heywood8/money-tracker/compare/penny-v0.61.0...penny-v0.61.1) (2026-03-28)


### Bug Fixes

* show description input above keyboard when editing transactions ([#369](https://github.com/heywood8/money-tracker/issues/369)) ([2018668](https://github.com/heywood8/money-tracker/commit/20186685b708cf625d3f3028616ed140ed1afb61))

## [0.61.0](https://github.com/heywood8/money-tracker/compare/penny-v0.60.0...penny-v0.61.0) (2026-03-28)


### Features

* animated sliding switch for hide balances toggle ([#367](https://github.com/heywood8/money-tracker/issues/367)) ([7666294](https://github.com/heywood8/money-tracker/commit/7666294171860e895a9f206f67313084ba32c852))

## [0.60.0](https://github.com/heywood8/money-tracker/compare/penny-v0.59.0...penny-v0.60.0) (2026-03-28)


### Features

* extend hideBalances to graphs page and refactor to context-direct pattern ([#365](https://github.com/heywood8/money-tracker/issues/365)) ([666d0de](https://github.com/heywood8/money-tracker/commit/666d0deb0129ded02b97fb0a28b0969b36d0a9c6))

## [0.59.0](https://github.com/heywood8/money-tracker/compare/penny-v0.58.0...penny-v0.59.0) (2026-03-27)


### Features

* add hide account balances privacy setting ([#362](https://github.com/heywood8/money-tracker/issues/362)) ([03d9365](https://github.com/heywood8/money-tracker/commit/03d9365836ab1b5e407884481a8e6cbc8e38f1d6))

## [0.58.0](https://github.com/heywood8/money-tracker/compare/penny-v0.57.0...penny-v0.58.0) (2026-03-23)


### Features

* keep executed recurring ops enabled, sort to bottom ([#360](https://github.com/heywood8/money-tracker/issues/360)) ([55c04ab](https://github.com/heywood8/money-tracker/commit/55c04aba330e062a7e7b77409b5b0881de284068))

## [0.57.0](https://github.com/heywood8/money-tracker/compare/penny-v0.56.0...penny-v0.57.0) (2026-03-23)


### Features

* add blur overlay to SettingsModal and ImportProgressModal ([#358](https://github.com/heywood8/money-tracker/issues/358)) ([7053cf0](https://github.com/heywood8/money-tracker/commit/7053cf085d03070bf7b2e7e8a02b04216568e4b5))

## [0.56.0](https://github.com/heywood8/money-tracker/compare/penny-v0.55.0...penny-v0.56.0) (2026-03-22)


### Features

* show category/to-account and date side-by-side for all operation types ([#356](https://github.com/heywood8/money-tracker/issues/356)) ([8bcdab1](https://github.com/heywood8/money-tracker/commit/8bcdab1bfcc12ae8375949132111e4e14219fc3b))

## [0.55.0](https://github.com/heywood8/money-tracker/compare/penny-v0.54.2...penny-v0.55.0) (2026-03-22)


### Features

* add glassmorphism blur effect when modals are open ([#354](https://github.com/heywood8/money-tracker/issues/354)) ([8806a37](https://github.com/heywood8/money-tracker/commit/8806a37ecdb085efffc2ec22bdf546ec8539c408))

## [0.54.2](https://github.com/heywood8/money-tracker/compare/penny-v0.54.1...penny-v0.54.2) (2026-03-22)


### Bug Fixes

* replace sharing with intenrLauncher for APK installation ([2ce3b5d](https://github.com/heywood8/money-tracker/commit/2ce3b5de4b3b6a26957b9feb1636796f66627839))

## [0.54.1](https://github.com/heywood8/money-tracker/compare/penny-v0.54.0...penny-v0.54.1) (2026-03-22)


### Bug Fixes

* correct prev month avg and end in burndown legend ([#350](https://github.com/heywood8/money-tracker/issues/350)) ([5ebeec6](https://github.com/heywood8/money-tracker/commit/5ebeec6c17c43fe100a5fb8a90ede1eae111102c))

## [0.54.0](https://github.com/heywood8/money-tracker/compare/penny-v0.53.0...penny-v0.54.0) (2026-03-22)


### Features

* show category and date pickers side-by-side when editing operation ([#348](https://github.com/heywood8/money-tracker/issues/348)) ([225f1b4](https://github.com/heywood8/money-tracker/commit/225f1b412a5005282cfd8976700550374b785b88))

## [0.53.0](https://github.com/heywood8/money-tracker/compare/penny-v0.52.0...penny-v0.53.0) (2026-03-22)


### Features

* add in-app local backup viewer to Settings ([#347](https://github.com/heywood8/money-tracker/issues/347)) ([872f4a7](https://github.com/heywood8/money-tracker/commit/872f4a72a4d54f046054aa5a0a9531f5762d8450))


### Bug Fixes

* download APK in-app to fix 99% hang on Android ([#345](https://github.com/heywood8/money-tracker/issues/345)) ([803abfd](https://github.com/heywood8/money-tracker/commit/803abfd6e925f1151f0f368462154b9d968538f7))

## [0.52.0](https://github.com/heywood8/money-tracker/compare/penny-v0.51.0...penny-v0.52.0) (2026-03-22)


### Features

* add description autocomplete to operation form ([#343](https://github.com/heywood8/money-tracker/issues/343)) ([a1837c1](https://github.com/heywood8/money-tracker/commit/a1837c1e0ea30c92fdf6d30b8358a6670a1167de))

## [0.51.0](https://github.com/heywood8/money-tracker/compare/penny-v0.50.4...penny-v0.51.0) (2026-03-21)


### Features

* add GitHub release APK update checks ([#341](https://github.com/heywood8/money-tracker/issues/341)) ([28d0442](https://github.com/heywood8/money-tracker/commit/28d0442bcc1636613856ab85643ae105c310d986))

## [0.50.4](https://github.com/heywood8/money-tracker/compare/penny-v0.50.3...penny-v0.50.4) (2026-03-21)


### Bug Fixes

* stabilize DailyBackupService week-sensitive tests ([#339](https://github.com/heywood8/money-tracker/issues/339)) ([e6d17ec](https://github.com/heywood8/money-tracker/commit/e6d17ec3e529113746a15b6c0973587b0a6b69a2))

## [0.50.3](https://github.com/heywood8/money-tracker/compare/penny-v0.50.2...penny-v0.50.3) (2026-03-21)


### Bug Fixes

* increase transfer quick-target fetch buffer ([#337](https://github.com/heywood8/money-tracker/issues/337)) ([d0ab249](https://github.com/heywood8/money-tracker/commit/d0ab249d748e1da1b965b0fc23ed5a762ef99cb5))

## [0.50.2](https://github.com/heywood8/money-tracker/compare/penny-v0.50.1...penny-v0.50.2) (2026-03-21)


### Build System

* **deps:** bump marocchino/sticky-pull-request-comment from 2.9.4 to 3.0.2 ([#335](https://github.com/heywood8/money-tracker/issues/335)) ([77a85d1](https://github.com/heywood8/money-tracker/commit/77a85d1a4a26e36ee0e3d62715381dcb8fd9d229))

## [0.50.1](https://github.com/heywood8/money-tracker/compare/penny-v0.50.0...penny-v0.50.1) (2026-03-09)


### Bug Fixes

* add flexDirection row to search input in FilterModal ([#333](https://github.com/heywood8/money-tracker/issues/333)) ([d87564c](https://github.com/heywood8/money-tracker/commit/d87564cecb29788444f6e87f50d10f1a1da57519))

## [0.50.0](https://github.com/heywood8/money-tracker/compare/penny-v0.49.3...penny-v0.50.0) (2026-03-01)


### Features

* use hierarchical category picker in planned operations modal ([4eff456](https://github.com/heywood8/money-tracker/commit/4eff45659738dae152de5a27d45e6a1dca9304cc))

## [0.49.3](https://github.com/heywood8/money-tracker/compare/penny-v0.49.2...penny-v0.49.3) (2026-03-01)


### Build System

* **deps:** bump actions/upload-artifact from 6 to 7 ([#327](https://github.com/heywood8/money-tracker/issues/327)) ([3c5a34a](https://github.com/heywood8/money-tracker/commit/3c5a34adedd9506b3c93433e75d81e9f9a0cdf9d))

## [0.49.2](https://github.com/heywood8/money-tracker/compare/penny-v0.49.1...penny-v0.49.2) (2026-03-01)


### Bug Fixes

* migrate share logs from deprecated expo-file-system API to new File/Paths classes ([4f7b7b6](https://github.com/heywood8/money-tracker/commit/4f7b7b6e7f83db9559c3bd35939650268b1a83df))

## [0.49.1](https://github.com/heywood8/money-tracker/compare/penny-v0.49.0...penny-v0.49.1) (2026-03-01)


### Documentation

* move dev content to DEVELOPMENT.md, rewrite README for end users ([d9fe6fc](https://github.com/heywood8/money-tracker/commit/d9fe6fcd3051d581cc2cdf51153c97775cbac766))

## [0.49.0](https://github.com/heywood8/money-tracker/compare/penny-v0.48.1...penny-v0.49.0) (2026-03-01)


### Features

* add planned operations feature for monthly budget planning ([#322](https://github.com/heywood8/money-tracker/issues/322)) ([5538431](https://github.com/heywood8/money-tracker/commit/5538431a7352f4bb29dff274c8d4a1c4165a70db))

## [0.48.1](https://github.com/heywood8/money-tracker/compare/penny-v0.48.0...penny-v0.48.1) (2026-02-28)


### Continuous Integration

* enable auto-merge for release-please PRs when checks pass ([#320](https://github.com/heywood8/money-tracker/issues/320)) ([c4ac5fd](https://github.com/heywood8/money-tracker/commit/c4ac5fdd0b25846d71d40e23a9fbbded2194fca4))

## [0.48.0](https://github.com/heywood8/money-tracker/compare/penny-v0.47.0...penny-v0.48.0) (2026-02-26)


### Features

* daily automatic backup service with retention policy ([#318](https://github.com/heywood8/money-tracker/issues/318)) ([7ffe1de](https://github.com/heywood8/money-tracker/commit/7ffe1de8573ff32a2a0a03acae2c9c5da1ef0ca5))

## [0.47.0](https://github.com/heywood8/money-tracker/compare/penny-v0.46.7...penny-v0.47.0) (2026-02-26)


### Features

* add in-app log viewer in settings ([#316](https://github.com/heywood8/money-tracker/issues/316)) ([ceb5102](https://github.com/heywood8/money-tracker/commit/ceb51023147e0385f05ac7860e2d556754ac1f52))

## [0.46.7](https://github.com/heywood8/money-tracker/compare/penny-v0.46.6...penny-v0.46.7) (2026-02-19)


### Bug Fixes

* correct daily avg calculation for previous month in balance history chart ([#314](https://github.com/heywood8/money-tracker/issues/314)) ([3d57a7f](https://github.com/heywood8/money-tracker/commit/3d57a7fb70da7e209235bbe3ed83500adb9d6bc7))

## [0.46.6](https://github.com/heywood8/money-tracker/compare/penny-v0.46.5...penny-v0.46.6) (2026-02-17)


### Build System

* **deps:** bump actions/cache from 4 to 5 ([#312](https://github.com/heywood8/money-tracker/issues/312)) ([f2dc626](https://github.com/heywood8/money-tracker/commit/f2dc626b144d255439469118ba5cf7f158548feb))

## [0.46.5](https://github.com/heywood8/money-tracker/compare/penny-v0.46.4...penny-v0.46.5) (2026-02-12)


### Continuous Integration

* add dependency caching to screenshot workflow ([#308](https://github.com/heywood8/money-tracker/issues/308)) ([3294d02](https://github.com/heywood8/money-tracker/commit/3294d02758111db878bbd5cd76f81f71eda85869))

## [0.46.4](https://github.com/heywood8/money-tracker/compare/penny-v0.46.3...penny-v0.46.4) (2026-02-12)


### Bug Fixes

* categories not translated after database reset and language selection ([3f31f00](https://github.com/heywood8/money-tracker/commit/3f31f00b14d7d067642d853d6420591ece4f93fc))
* quick add buttons showing parent categories instead of leaf categories ([1cd436f](https://github.com/heywood8/money-tracker/commit/1cd436fa0d8acd298bc6ed0d4e5d8e97bf194bf5))
* update FONT_SIZE.xs test assertion to match new value ([827b97a](https://github.com/heywood8/money-tracker/commit/827b97a86507647370767b7fab5911721edf4559))


### Code Refactoring

* faster spring animation for tab transitions ([13b2efa](https://github.com/heywood8/money-tracker/commit/13b2efa9c08b8bae9ff2efdf48b52b7483fbfeb3))
* taller category shortcut buttons with 2-line text support ([55540f8](https://github.com/heywood8/money-tracker/commit/55540f85ddc60ad92815bd416bcf8a7db2d0124a))

## [0.46.3](https://github.com/heywood8/money-tracker/compare/penny-v0.46.2...penny-v0.46.3) (2026-02-12)


### Code Refactoring

* compact account picker with icon and balance ([#306](https://github.com/heywood8/money-tracker/issues/306)) ([3532a29](https://github.com/heywood8/money-tracker/commit/3532a29b40797514a70558350a781206451295cf))
* compact category and transfer shortcut buttons ([e1a33c0](https://github.com/heywood8/money-tracker/commit/e1a33c03a39659dcfc9593ee83cc78b595c646f2))
* compact date separators to single line and even spacing ([4db529b](https://github.com/heywood8/money-tracker/commit/4db529b23e71ff98938d96dafd3a8e9740f281d8))

## [0.46.2](https://github.com/heywood8/money-tracker/compare/penny-v0.46.1...penny-v0.46.2) (2026-02-11)


### Bug Fixes

* improve dark theme visual contrast ([#304](https://github.com/heywood8/money-tracker/issues/304)) ([0ba5b02](https://github.com/heywood8/money-tracker/commit/0ba5b02afea1dfec3b0b8c4fbc8f08ade99c8192))

## [0.46.1](https://github.com/heywood8/money-tracker/compare/penny-v0.46.0...penny-v0.46.1) (2026-02-11)


### Code Refactoring

* modernize settings modal UX ([#302](https://github.com/heywood8/money-tracker/issues/302)) ([dc3d80b](https://github.com/heywood8/money-tracker/commit/dc3d80b4b526790f5bf3405284f292dca36dd5ce))

## [0.46.0](https://github.com/heywood8/money-tracker/compare/penny-v0.45.0...penny-v0.46.0) (2026-02-11)


### Features

* auto-submit transfer when selecting from all accounts picker ([c69c065](https://github.com/heywood8/money-tracker/commit/c69c06509bb97b77734196689cbf48c74a76b492))


### Bug Fixes

* add bottom padding so floating tab bar and FAB don't cover last list items ([c91af23](https://github.com/heywood8/money-tracker/commit/c91af23ca42ef91790d3df7f166ca593f4eb232a))
* alphabetize style properties after lint autofix ([bdc5291](https://github.com/heywood8/money-tracker/commit/bdc52918ef9c3d0b42317d92803675df43b3acca))
* income categories height; always 4 items ([4779540](https://github.com/heywood8/money-tracker/commit/47795403899ccde7537c4dff941e7a3994160cbb))
* multicurrency transfer rate not applied on quick account selection ([#300](https://github.com/heywood8/money-tracker/issues/300)) ([2bdfc95](https://github.com/heywood8/money-tracker/commit/2bdfc95ad783f9581103ac71ab715e3290f140fe))
* remove transfer target account pre-selection ([b612776](https://github.com/heywood8/money-tracker/commit/b6127763d7b6507278a189473ba3c006bea1ddfb))

## [0.45.0](https://github.com/heywood8/money-tracker/compare/penny-v0.44.0...penny-v0.45.0) (2026-02-10)


### Features

* floating pill tab bar redesign ([#297](https://github.com/heywood8/money-tracker/issues/297)) ([#298](https://github.com/heywood8/money-tracker/issues/298)) ([1fe6942](https://github.com/heywood8/money-tracker/commit/1fe69422493932aa0f88555f91d57b58117e6b1d))

## [0.44.0](https://github.com/heywood8/money-tracker/compare/penny-v0.43.2...penny-v0.44.0) (2026-02-10)


### Features

* rework QuickAdd transfer layout with target account shortcuts ([#295](https://github.com/heywood8/money-tracker/issues/295)) ([ce14939](https://github.com/heywood8/money-tracker/commit/ce149397b41b904bf7b71c3fbe8965f69a170320))


### Bug Fixes

* remove resolution setting from pixel7-pro screenshots ci ([fef1802](https://github.com/heywood8/money-tracker/commit/fef1802ac60fec04fa45369e2bf48a8fc864440b))

## [0.43.2](https://github.com/heywood8/money-tracker/compare/penny-v0.43.1...penny-v0.43.2) (2026-02-10)


### Bug Fixes

* show quick category shortcuts for income when no usage history ([4ae4484](https://github.com/heywood8/money-tracker/commit/4ae4484679c401e87b449cde7419d20d4f1436eb))


### Tests

* add tests for quick category fallback behavior ([2f3031d](https://github.com/heywood8/money-tracker/commit/2f3031d60e73525feae96814009907b601abd680))

## [0.43.1](https://github.com/heywood8/money-tracker/compare/penny-v0.43.0...penny-v0.43.1) (2026-02-08)


### Miscellaneous Chores

* switch emulator to Pixel 7 Pro with reduced hardware ([#290](https://github.com/heywood8/money-tracker/issues/290)) ([7465c46](https://github.com/heywood8/money-tracker/commit/7465c46990fe134b0d4b23eb3deeaa25c3bc59df))

## [0.43.0](https://github.com/heywood8/money-tracker/compare/penny-v0.42.2...penny-v0.43.0) (2026-02-08)


### Features

* live exchange rates for multi-currency transfers ([#288](https://github.com/heywood8/money-tracker/issues/288)) ([7ac67ce](https://github.com/heywood8/money-tracker/commit/7ac67ce2dcdf4e8fb5572c32e2ccb5c64fc50a20))

## [0.42.2](https://github.com/heywood8/money-tracker/compare/penny-v0.42.1...penny-v0.42.2) (2026-02-08)


### Bug Fixes

* auto-calculate exchange rate and destination amount in QuickAdd form ([64bf934](https://github.com/heywood8/money-tracker/commit/64bf934b1131a4ef5332f3276889e6ac48c30818))
* fetch more top categories to ensure 3 suggestions per type ([6e1eeb0](https://github.com/heywood8/money-tracker/commit/6e1eeb03893599043d55736f81e43cdaeb5cd182))
* hide scroll indicator in OperationModal ([27e65fe](https://github.com/heywood8/money-tracker/commit/27e65fe25f84b831862687e7b9cc77fab3f8e97c))
* place split and delete buttons on same row in OperationModal ([218234c](https://github.com/heywood8/money-tracker/commit/218234c9cef6e83f1cae0df3db390fe14c0903e2))
* reduce spacing between account picker and calculator keypad ([7da8ebf](https://github.com/heywood8/money-tracker/commit/7da8ebf629ee4819d3a9498b5395c1718a04cade))
* shorten split and delete button labels for inline layout ([8875822](https://github.com/heywood8/money-tracker/commit/8875822e6dc7cc9181c25a4978a3aa13c58dc8fc))
* show suggested categories for operations created today ([98ec3cd](https://github.com/heywood8/money-tracker/commit/98ec3cd48c6af40d4b72596f903c7c264a552ad6))
* use inline type selector in OperationModal to match QuickAdd form ([7139487](https://github.com/heywood8/money-tracker/commit/7139487d5b12e77195498d01ae1b1262ae63cb21))


### Documentation

* remove old architecture review ([514e3d1](https://github.com/heywood8/money-tracker/commit/514e3d1d04fd15f55cf46c9d4b84514221315bc1))
* remove old plan docs ([236ed0a](https://github.com/heywood8/money-tracker/commit/236ed0a01dab57b115294fe4c376b233111ffe33))

## [0.42.1](https://github.com/heywood8/money-tracker/compare/penny-v0.42.0...penny-v0.42.1) (2026-02-07)


### Bug Fixes

* maestro dark mode swipe ([#284](https://github.com/heywood8/money-tracker/issues/284)) ([e234c99](https://github.com/heywood8/money-tracker/commit/e234c99879694b3654e0a8e97f4fdd0d9197c254))

## [0.42.0](https://github.com/heywood8/money-tracker/compare/penny-v0.41.0...penny-v0.42.0) (2026-02-05)


### Features

* remove excludeFromForecast feature from categories ([#282](https://github.com/heywood8/money-tracker/issues/282)) ([fb8b043](https://github.com/heywood8/money-tracker/commit/fb8b043386d138a715908d4a2ddcc094e5200f92))

## [0.41.0](https://github.com/heywood8/money-tracker/compare/penny-v0.40.0...penny-v0.41.0) (2026-02-05)


### Features

* capture screenshots in both light and dark modes ([7097b3c](https://github.com/heywood8/money-tracker/commit/7097b3c899a6e6195ea5908ac11f4b77c74111b0))


### Bug Fixes

* add scroll to force FlatList re-render for dark mode categories ([27782d7](https://github.com/heywood8/money-tracker/commit/27782d7ff32c91db34e4ffa81ed4c40205acc3c0))
* defaults ([f292039](https://github.com/heywood8/money-tracker/commit/f2920393e74580ee4251f6e46538a6e3274a8383))
* navigate after theme toggle to allow dark mode to propagate ([14f2fce](https://github.com/heywood8/money-tracker/commit/14f2fce966723dfe5ecac204ccbe9fc1899b49a2))
* update test to match default income amount of 1000.00 ([48997e5](https://github.com/heywood8/money-tracker/commit/48997e58950940888a90ce2b5cb2141b4220a376))

## [0.40.0](https://github.com/heywood8/money-tracker/compare/penny-v0.39.4...penny-v0.40.0) (2026-02-04)


### Features

* seed default operations on database init and reset ([9ddf8c5](https://github.com/heywood8/money-tracker/commit/9ddf8c5309ebb668a463a9b2b53a03d59ca43cd1))


### Code Refactoring

* simplify default accounts to 3 generic USD accounts ([2d33e2e](https://github.com/heywood8/money-tracker/commit/2d33e2e904912e6142d1890fef838363f80beee3))

## [0.39.4](https://github.com/heywood8/money-tracker/compare/penny-v0.39.3...penny-v0.39.4) (2026-02-04)


### Bug Fixes

* properly reload all screens after database reset ([#278](https://github.com/heywood8/money-tracker/issues/278)) ([f0025f9](https://github.com/heywood8/money-tracker/commit/f0025f99578b130d9a394db8a0673e893d715bd6))

## [0.39.3](https://github.com/heywood8/money-tracker/compare/penny-v0.39.2...penny-v0.39.3) (2026-02-03)


### Bug Fixes

* add modal overlay tap-to-close functionality to ChartModal ([#275](https://github.com/heywood8/money-tracker/issues/275)) ([e808fbd](https://github.com/heywood8/money-tracker/commit/e808fbd5c441d24ebafc691ebce9f247102f8ee8))

## [0.39.2](https://github.com/heywood8/money-tracker/compare/penny-v0.39.1...penny-v0.39.2) (2026-02-02)


### Bug Fixes

* balance history chart to show full data for past months ([#273](https://github.com/heywood8/money-tracker/issues/273)) ([47a25ad](https://github.com/heywood8/money-tracker/commit/47a25ad693e1072fddbbfef5d5911ae0659a4c16))
* store emulator screenshots in ci-screenshots branch with preview to post them as pictures to pull request  ([#266](https://github.com/heywood8/money-tracker/issues/266)) ([dc7efb1](https://github.com/heywood8/money-tracker/commit/dc7efb1f52cb3d5aab90d2dcc62f947de681ec35))
* update emulator skin resolution for screenshot workflow ([#272](https://github.com/heywood8/money-tracker/issues/272)) ([4660d70](https://github.com/heywood8/money-tracker/commit/4660d70dbe9671de1fdfff934b535a42cbb9829c))


### Build System

* add emulator screenshot workflow for pull requests ([#264](https://github.com/heywood8/money-tracker/issues/264)) ([aaebeb8](https://github.com/heywood8/money-tracker/commit/aaebeb888e5b73f2cb90e6e3f12d7289226a265a))
* **deps:** bump actions/checkout from 4 to 6 ([#268](https://github.com/heywood8/money-tracker/issues/268)) ([83cdc4a](https://github.com/heywood8/money-tracker/commit/83cdc4adc64f90ba01def0c2fc6992ec3f02877c))
* **deps:** bump actions/github-script from 7 to 8 ([#269](https://github.com/heywood8/money-tracker/issues/269)) ([26dc5e0](https://github.com/heywood8/money-tracker/commit/26dc5e028bf345dd41dc9a391a02d717992d12d1))
* **deps:** bump actions/setup-java from 4 to 5 ([#267](https://github.com/heywood8/money-tracker/issues/267)) ([bce7b97](https://github.com/heywood8/money-tracker/commit/bce7b97280079283e27ea1a0ffd1a61fe723128b))
* **deps:** bump actions/upload-artifact from 4 to 6 ([#270](https://github.com/heywood8/money-tracker/issues/270)) ([7c98b65](https://github.com/heywood8/money-tracker/commit/7c98b656e191b44de3461de19509c8efa8009c74))

## [0.39.1](https://github.com/heywood8/money-tracker/compare/penny-v0.39.0...penny-v0.39.1) (2026-01-30)


### Bug Fixes

* remove maxHeight constraint from language modal content ([#262](https://github.com/heywood8/money-tracker/issues/262)) ([94ab067](https://github.com/heywood8/money-tracker/commit/94ab0671c25980af27dc9b76c642ec602b0abc25))

## [0.39.0](https://github.com/heywood8/money-tracker/compare/penny-v0.38.0...penny-v0.39.0) (2026-01-29)


### Features

* add category shortcuts to quickadd form ([#259](https://github.com/heywood8/money-tracker/issues/259)) ([ff4491c](https://github.com/heywood8/money-tracker/commit/ff4491c39ceab70d5e314a6cc8c947ec0eb8ac43))

## [0.38.0](https://github.com/heywood8/money-tracker/compare/penny-v0.37.0...penny-v0.38.0) (2026-01-29)


### Features

* abbreviate large amounts (K/M) and center-align summary cards ([c41acc5](https://github.com/heywood8/money-tracker/commit/c41acc53e6b7379a5cc725a7de1e08acbcc067fa))


### Bug Fixes

* equalize picker widths and consistent filter row spacing ([80930be](https://github.com/heywood8/money-tracker/commit/80930be66ec6faa144fcaa0e732ba27726d281f7))
* update summary card tests to match simplified component output ([#260](https://github.com/heywood8/money-tracker/issues/260)) ([927fe74](https://github.com/heywood8/money-tracker/commit/927fe7451f1533e325d22a050ffbaac20e64a737))
* use flex instead of explicit width for equal summary card sizing ([f84e766](https://github.com/heywood8/money-tracker/commit/f84e7665bbf68fcaf235709fd3edbff3344264a9))


### Code Refactoring

* restyle summary cards with muted color-coded amounts ([284d156](https://github.com/heywood8/money-tracker/commit/284d1565211b85690d137478528edfcd370491dc))
* simplify summary cards to one-liner format with currency symbols ([95ac1a3](https://github.com/heywood8/money-tracker/commit/95ac1a38ee5cf4e5b91cceb525130fc36a483b5b))

## [0.37.0](https://github.com/heywood8/money-tracker/compare/penny-v0.36.0...penny-v0.37.0) (2026-01-28)


### Features

* add vertical "today" line with day label on burndown graph ([5be5135](https://github.com/heywood8/money-tracker/commit/5be5135c64ed9ad11dd28082ed9b5c6790548ee1))
* combine actual and forecast into single continuous line on burndown graph ([cac49be](https://github.com/heywood8/money-tracker/commit/cac49becc1313cbca17016402100ad42a62f3033))


### Bug Fixes

* added armenian language on burndown graph ([64a05b7](https://github.com/heywood8/money-tracker/commit/64a05b7338fa9f5b4b7d29d72f532aae17ee44d4))
* ensure equal width for expense/income summary cards ([0064a1a](https://github.com/heywood8/money-tracker/commit/0064a1aba08b4971b259a409ca57ac94717d5859))
* improve burndown graph UX with better visibility and tap hint ([07ed73e](https://github.com/heywood8/money-tracker/commit/07ed73e936d141435f886ba038e1f021a810ca58))
* lint issues ([c3ebffe](https://github.com/heywood8/money-tracker/commit/c3ebffef99a4a25dc1fe169e72e80513defdd9f3))
* use explicit calculated width for summary cards ([3356e37](https://github.com/heywood8/money-tracker/commit/3356e37dcff2f7edd616f83c01751b5feb1bd7ae))


### Miscellaneous Chores

* armenian translation ([38bedfa](https://github.com/heywood8/money-tracker/commit/38bedfa34c572097c9039d1eff7643210b1d171a))


### Code Refactoring

* arrange expense/income cards side by side and reduce height ([41d7483](https://github.com/heywood8/money-tracker/commit/41d748361c1957bead849b76dfe6a6cc2cec7914))
* remove days elapsed progress bar from burndown graph ([62708be](https://github.com/heywood8/money-tracker/commit/62708be9a5e8b43157bc698ccf7f65d9c33ada3c))
* remove pie chart previews from expense/income summary cards ([85c2cbc](https://github.com/heywood8/money-tracker/commit/85c2cbc4db365c6a7dfc66d70c9ea56a2b127973))
* remove tap for details hint from burndown graph ([08de06e](https://github.com/heywood8/money-tracker/commit/08de06eaedfb3076beda368bb840fa189efd5076))

## [0.36.0](https://github.com/heywood8/money-tracker/compare/penny-v0.35.0...penny-v0.36.0) (2026-01-27)


### Features

* combined balance history and spending prediction graphs ([#255](https://github.com/heywood8/money-tracker/issues/255)) ([91bc928](https://github.com/heywood8/money-tracker/commit/91bc92809f10d7c7bfbd110de11433b909b9ede6))

## [0.35.0](https://github.com/heywood8/money-tracker/compare/penny-v0.34.2...penny-v0.35.0) (2026-01-27)


### Features

* combine year and month pickers into single period picker on GraphsScreen ([047046d](https://github.com/heywood8/money-tracker/commit/047046d8462d762c59c7e25788ecbec89742fd3a))

## [0.34.2](https://github.com/heywood8/money-tracker/compare/penny-v0.34.1...penny-v0.34.2) (2026-01-27)


### Bug Fixes

* include build commits in release-please changelog ([eadbd71](https://github.com/heywood8/money-tracker/commit/eadbd7110b5fd93dc5a0b10b9b52b7ae08af6c34))


### Build System

* **deps-dev:** bump @testing-library/react-native from 12.9.0 to 13.3.3 ([#249](https://github.com/heywood8/money-tracker/issues/249)) ([06ad9c5](https://github.com/heywood8/money-tracker/commit/06ad9c5e1d726a1ddca080049b5552ce2ec11e88))

## [0.34.1](https://github.com/heywood8/money-tracker/compare/penny-v0.34.0...penny-v0.34.1) (2026-01-27)


### Bug Fixes

* expand button clickable area in category spending card ([#251](https://github.com/heywood8/money-tracker/issues/251)) ([3aa0806](https://github.com/heywood8/money-tracker/commit/3aa080655dba35cea26ba8d9aadac4bb3fa2b326))

## [0.34.0](https://github.com/heywood8/money-tracker/compare/penny-v0.33.1...penny-v0.34.0) (2026-01-26)


### Features

* collapsible category picker with single-expand behavior ([39dd794](https://github.com/heywood8/money-tracker/commit/39dd7949b73b11f3be24af7247ae744ca177bd76))


### Bug Fixes

* change CategorySpendingCard from barchart to linechart ([79079d5](https://github.com/heywood8/money-tracker/commit/79079d549c00f2d10c2e59486cd98d03490a9bf9))

## [0.33.1](https://github.com/heywood8/money-tracker/compare/penny-v0.33.0...penny-v0.33.1) (2026-01-25)


### Bug Fixes

* added ability to choose subcategory as well ([b2e6242](https://github.com/heywood8/money-tracker/commit/b2e62429b783a3ea6c9b51a5b9d13cad4e78b747))
* months namings on monthly spending by category ([0d96f65](https://github.com/heywood8/money-tracker/commit/0d96f65738556b4e113cb221aa9f21a4c6fc0027))
* spending trend by month was only visible if the full year was selected ([291d2d9](https://github.com/heywood8/money-tracker/commit/291d2d998e64f02147ee1572e9821d0b6f9b6ac3))
* splitted operation did not get updated amount on modal ([5818a5a](https://github.com/heywood8/money-tracker/commit/5818a5a89cffc4741dd2ff4e7cdbb5fc24c2cd67))
* switch to last 12 months for spending by category trend ([ae21a0c](https://github.com/heywood8/money-tracker/commit/ae21a0cbc8d3fd3c3134984cf186ac19847b936f))
* tests ([e511236](https://github.com/heywood8/money-tracker/commit/e511236d2a765fbd04a00ef3d5b245e62f760747))

## [0.33.0](https://github.com/heywood8/money-tracker/compare/penny-v0.32.0...penny-v0.33.0) (2026-01-24)


### Features

* add transaction split feature ([1b00976](https://github.com/heywood8/money-tracker/commit/1b00976e3598332cc5e22b79b7a4a47abd018ea9))


### Bug Fixes

* run builds on dependabot branches ([165dde8](https://github.com/heywood8/money-tracker/commit/165dde8b3cddc455491d1edf426c1885d93be181))

## [0.32.0](https://github.com/heywood8/money-tracker/compare/penny-v0.31.7...penny-v0.32.0) (2026-01-24)


### Features

* add year-wide monthly spending by category graph ([fcacc16](https://github.com/heywood8/money-tracker/commit/fcacc1678599b47e0d9fbfe95b482dce0ee00f09))

## [0.31.7](https://github.com/heywood8/money-tracker/compare/penny-v0.31.6...penny-v0.31.7) (2026-01-23)


### Bug Fixes

* add expo prebuild step to fix New Architecture codegen failures ([88e4e7f](https://github.com/heywood8/money-tracker/commit/88e4e7f576ab7f33b4709c97e7e1629ca4437c09))
* another try of fixing the ci build ([53e3b20](https://github.com/heywood8/money-tracker/commit/53e3b2053367cae9c6c320addeb5e3fdc0ee4821))
* build ([0fd04b3](https://github.com/heywood8/money-tracker/commit/0fd04b38d694094d070f17c7d8c6f4db5fed20f3))
* disable C++ autolinking for modules with codegen race condition ([cb329e4](https://github.com/heywood8/money-tracker/commit/cb329e44f10f0fcbb0435956c4f15cf5026a30a4))
* readd gen native code back ([2172582](https://github.com/heywood8/money-tracker/commit/2172582b1ff13177e1ea548f3d7160131a7a6205))
* removed async storage ([0365877](https://github.com/heywood8/money-tracker/commit/03658774a62321d96f680ac082133b0d207d2add))
* replace canary expo packages with stable SDK 54 versions ([2e7af0e](https://github.com/heywood8/money-tracker/commit/2e7af0ed52a537f9db846ad05fc7489b9f68724d))
* revert dependencies and settings to penny v0.31.0 ([#245](https://github.com/heywood8/money-tracker/issues/245)) ([1decfa9](https://github.com/heywood8/money-tracker/commit/1decfa90c60b0056459be01e502bd815b727daea))
* with cmake lists ([cb2b946](https://github.com/heywood8/money-tracker/commit/cb2b9469592f574a345fe10d734451789fe8cfe6))

## [0.31.6](https://github.com/heywood8/money-tracker/compare/penny-v0.31.5...penny-v0.31.6) (2026-01-22)


### Bug Fixes

* build ([2c66f1e](https://github.com/heywood8/money-tracker/commit/2c66f1e9587f0eac316163fc1da1cbaf505e725f))
* disable New Architecture to fix codegen build failures ([9308566](https://github.com/heywood8/money-tracker/commit/9308566042d3acb44f35fa081b4197fc01b7f0d4))
* revert to Expo SDK 54 to fix build failures ([72b4999](https://github.com/heywood8/money-tracker/commit/72b49997fd9d8e367392d4ea02806f2e55da296b))
* show overall coverage in the test results comment ([c2c6f04](https://github.com/heywood8/money-tracker/commit/c2c6f04d765703c55d0fb2fe11139290868d41d0))
* skipped tests ([8664a23](https://github.com/heywood8/money-tracker/commit/8664a23ba806e67856bb0c9ddc59aee390247100))
* upgrade to Expo SDK 55 canary to fix RN 0.83 build failures ([6702112](https://github.com/heywood8/money-tracker/commit/67021121c522773189aa7731ad75d67ac280c64e))

## [0.31.5](https://github.com/heywood8/money-tracker/compare/penny-v0.31.4...penny-v0.31.5) (2026-01-20)


### Bug Fixes

* build-release-apk workflow ([5a5dc57](https://github.com/heywood8/money-tracker/commit/5a5dc57efba4da179c2b4b472d8f006285aa5435))
* load older operations ([7b71443](https://github.com/heywood8/money-tracker/commit/7b7144306542e7c485d4ff9b4df6d4a874a744ac))

## [0.31.4](https://github.com/heywood8/money-tracker/compare/penny-v0.31.3...penny-v0.31.4) (2026-01-20)


### Bug Fixes

* ci memory allocations ([#238](https://github.com/heywood8/money-tracker/issues/238)) ([a20c5a2](https://github.com/heywood8/money-tracker/commit/a20c5a22acb28b6e65d44aa199a43c353a20f28e))

## [0.31.3](https://github.com/heywood8/money-tracker/compare/penny-v0.31.2...penny-v0.31.3) (2026-01-19)


### Bug Fixes

* budgetMonal.test ([4079d4f](https://github.com/heywood8/money-tracker/commit/4079d4fe3d3439c1e7929a0e2b896670196ffe7c))
* coverage for BudgetModal ([ee20204](https://github.com/heywood8/money-tracker/commit/ee202045c89cbe60712742612cbe6b4a8fc20a92))
* lint SimpleTabs test mocks ([9e978e4](https://github.com/heywood8/money-tracker/commit/9e978e4ed3a28543394481abe271a2b6c87d7f00))
* more tests ([8231662](https://github.com/heywood8/money-tracker/commit/8231662295bc08082f1206498c080d7172088040))
* more tests ([715e42a](https://github.com/heywood8/money-tracker/commit/715e42ad6d85cde285724e9b54e619cc5d57eaa6))
* npm tests ([bd39ffe](https://github.com/heywood8/money-tracker/commit/bd39ffe30eebfea233b0fb12b9d27609edd8d389))
* **test:** resolve parsing error in summary card tests ([90a5954](https://github.com/heywood8/money-tracker/commit/90a59542ab182f40be4274477d6f58e20420efc2))
* update graphs on a new operation ([84c6b29](https://github.com/heywood8/money-tracker/commit/84c6b29d295fb231b125825128d7b242337b3212))

## [0.31.2](https://github.com/heywood8/money-tracker/compare/penny-v0.31.1...penny-v0.31.2) (2026-01-13)


### Bug Fixes

* improve BalanceHistoryCard.js coverage ([91efb9c](https://github.com/heywood8/money-tracker/commit/91efb9cc3db30ca4df841562693837fe7e597224))
* remove Sentry from the project ([#233](https://github.com/heywood8/money-tracker/issues/233)) ([ac41477](https://github.com/heywood8/money-tracker/commit/ac414776775ded48b8fc07c3bad5d03c884068b9))

## [0.31.1](https://github.com/heywood8/money-tracker/compare/penny-v0.31.0...penny-v0.31.1) (2026-01-13)


### Bug Fixes

* components tests ([#231](https://github.com/heywood8/money-tracker/issues/231)) ([7f2bd39](https://github.com/heywood8/money-tracker/commit/7f2bd39b3465887d1a05af080ef81b40758146ed))
* picker tests ([4bd7406](https://github.com/heywood8/money-tracker/commit/4bd7406b4e5f2c52f29138a40c9f6405c376bc39))

## [0.31.0](https://github.com/heywood8/money-tracker/compare/penny-v0.30.0...penny-v0.31.0) (2026-01-12)


### Features

* reorder screens, graph is now the second screen ([#222](https://github.com/heywood8/money-tracker/issues/222)) ([309761a](https://github.com/heywood8/money-tracker/commit/309761a4d3b95bae7ae3bd142e41d78bd4d73c09))


### Bug Fixes

* db schema test coverage ([70841b0](https://github.com/heywood8/money-tracker/commit/70841b053c20b6a9e8dfef42a282606c01ffef57))
* tests for app/utils ([66803ed](https://github.com/heywood8/money-tracker/commit/66803ed4b82ab3d3d0a7b009d74342d16838cb97))
* utils tests ([a711c8a](https://github.com/heywood8/money-tracker/commit/a711c8a76bbf0cc674abf16758b603a2820436b4))

## [0.30.0](https://github.com/heywood8/money-tracker/compare/penny-v0.29.0...penny-v0.30.0) (2026-01-12)


### Features

* split React contexts to optimize re-renders ([#3](https://github.com/heywood8/money-tracker/issues/3)) ([#219](https://github.com/heywood8/money-tracker/issues/219)) ([781eddf](https://github.com/heywood8/money-tracker/commit/781eddf661086e495f9137faa8eb43c87dcd59df))

## [0.29.0](https://github.com/heywood8/money-tracker/compare/penny-v0.28.0...penny-v0.29.0) (2026-01-11)


### Features

* performance optimization by eliminating anonymous function creation in JSX render cycles. ([#212](https://github.com/heywood8/money-tracker/issues/212)) ([7e46997](https://github.com/heywood8/money-tracker/commit/7e469979d69ba28554c50c2ae438e55e4961124c))


### Performance Improvements

* complete anonymous function optimization in OperationsScreen ([8ebffc4](https://github.com/heywood8/money-tracker/commit/8ebffc4eab4915ee007554503d44d3fdfaea56f1))

## [0.28.0](https://github.com/heywood8/money-tracker/compare/penny-v0.27.6...penny-v0.28.0) (2026-01-10)


### Features

* Extract custom hooks and modal components to reduce component size ([#209](https://github.com/heywood8/money-tracker/issues/209)) ([ef0cab9](https://github.com/heywood8/money-tracker/commit/ef0cab9a60f1b76f2d86d84d1d349f5b3e6c33c8))

## [0.27.6](https://github.com/heywood8/money-tracker/compare/penny-v0.27.5...penny-v0.27.6) (2026-01-09)


### Bug Fixes

* UI tweaks: gaps between pickers, rounding, multi-currency transfer operation text positioning ([1aa1068](https://github.com/heywood8/money-tracker/commit/1aa1068425067b0bba86a803cddeb1053c1819a7))

## [0.27.5](https://github.com/heywood8/money-tracker/compare/penny-v0.27.4...penny-v0.27.5) (2026-01-08)


### Bug Fixes

* instant scroll to date when jumping to past dates ([#203](https://github.com/heywood8/money-tracker/issues/203)) ([f0223a4](https://github.com/heywood8/money-tracker/commit/f0223a4ce6a49ad96290b0ca2ecbf07c5b588eb1))

## [0.27.4](https://github.com/heywood8/money-tracker/compare/penny-v0.27.3...penny-v0.27.4) (2026-01-08)


### Bug Fixes

* enable vertical scrolling with horizontal swipe gestures ([#201](https://github.com/heywood8/money-tracker/issues/201)) ([c02578e](https://github.com/heywood8/money-tracker/commit/c02578e2524344445c41033993400de6b1c18704))

## [0.27.3](https://github.com/heywood8/money-tracker/compare/penny-v0.27.2...penny-v0.27.3) (2026-01-08)


### Bug Fixes

* smoother jump to date ([1a64656](https://github.com/heywood8/money-tracker/commit/1a64656f4b854065605d208760987f1b18733707))

## [0.27.2](https://github.com/heywood8/money-tracker/compare/penny-v0.27.1...penny-v0.27.2) (2026-01-08)


### Bug Fixes

* calculator amount center alignment ([eb4d9ec](https://github.com/heywood8/money-tracker/commit/eb4d9ecefed277b8461c0389c1ff556fa85a4ef0))
* calculator amount center alignment ([90b6b0c](https://github.com/heywood8/money-tracker/commit/90b6b0c3515eb8207308457adedf261bb64506de))
* calculator color on "Edit operation" modal ([15619f2](https://github.com/heywood8/money-tracker/commit/15619f267d6c815d19eb97cdb402d471886ad046))
* flashy calc amounts ([3031565](https://github.com/heywood8/money-tracker/commit/3031565c2bcc58e212b6172ce21e0a8ffc01e91d))
* move scroll on modals to the right ([3a63df3](https://github.com/heywood8/money-tracker/commit/3a63df3f80965a985b868d2a42ef07c380186def))
* remove "Edit operation" title from modal ([96dde15](https://github.com/heywood8/money-tracker/commit/96dde1522d96cfc3ef90c568a6758b8381b43de3))
* removed chevron-down from dropdowns ([c0ce7e0](https://github.com/heywood8/money-tracker/commit/c0ce7e0fa1bd02fff6efec86fd5a8083cae15057))
* show category is required on operation edit if category is not chosen ([570f77d](https://github.com/heywood8/money-tracker/commit/570f77d2897831cf721737fd5f1a41d692360267))
* smoother swipes between screens ([9f29ada](https://github.com/heywood8/money-tracker/commit/9f29ada25a9efd8a9c2c57c065bb2c1c8997df67))
* when changing operation type, reset category ([1b101f0](https://github.com/heywood8/money-tracker/commit/1b101f0873e746aeac968663fb0e63f4334d64b2))

## [0.27.1](https://github.com/heywood8/money-tracker/compare/penny-v0.27.0...penny-v0.27.1) (2026-01-08)


### Bug Fixes

* calc additional tests ([7cf7105](https://github.com/heywood8/money-tracker/commit/7cf7105327d31724276f998c04fb002e53425f6c))
* calculator alternative add operation; tests ([9aa0f08](https://github.com/heywood8/money-tracker/commit/9aa0f08c263e344cf8a620c350e0d1b7886c1057))
* make swiping between screens smoother ([534cfd0](https://github.com/heywood8/money-tracker/commit/534cfd02f0245ec2576309fae048be84f574b407))
* prevent unwanted loops ([c301811](https://github.com/heywood8/money-tracker/commit/c301811727ce1845f17a2b3ade6dad565da303d2))
* tapping outside of settings modal now closes it; tests ([eae8503](https://github.com/heywood8/money-tracker/commit/eae8503f2803fed54f365a1b7c35b2dde4c5b8ad))

## [0.27.0](https://github.com/heywood8/money-tracker/compare/penny-v0.26.0...penny-v0.27.0) (2026-01-08)


### Features

* Implement left/right swipe screen switching ([#195](https://github.com/heywood8/money-tracker/issues/195)) ([f7e0513](https://github.com/heywood8/money-tracker/commit/f7e05136ae0d1525b654ca34a33d3b5e60be3c17))
* move delete button to amount row in calculator ([#197](https://github.com/heywood8/money-tracker/issues/197)) ([f749a9b](https://github.com/heywood8/money-tracker/commit/f749a9ba40302983521f7cacc770e44574922d7c))

## [0.26.0](https://github.com/heywood8/money-tracker/compare/penny-v0.25.1...penny-v0.26.0) (2026-01-07)


### Features

* combine daily average with days elapsed text in spending prediction ([#192](https://github.com/heywood8/money-tracker/issues/192)) ([e0ea348](https://github.com/heywood8/money-tracker/commit/e0ea34838f98b6992eefdd59ff747be91328a304))
* format category reports in single line with columns ([#193](https://github.com/heywood8/money-tracker/issues/193)) ([aef8093](https://github.com/heywood8/money-tracker/commit/aef809345fd822effcdd9146c960072c101159be))


### Bug Fixes

* correct days elapsed calculation in expense prediction ([#190](https://github.com/heywood8/money-tracker/issues/190)) ([a0c278f](https://github.com/heywood8/money-tracker/commit/a0c278fa515e2e0edb2fd2910fc28de8400c695e))
* improve balance history graph axis scaling ([#194](https://github.com/heywood8/money-tracker/issues/194)) ([1a4b48e](https://github.com/heywood8/money-tracker/commit/1a4b48e5c3c16584648a4d1530e79ba53b63b683))

## [0.25.1](https://github.com/heywood8/money-tracker/compare/penny-v0.25.0...penny-v0.25.1) (2026-01-07)


### Bug Fixes

* calculator long press repeat functionality ([035eae1](https://github.com/heywood8/money-tracker/commit/035eae189a8f97e35e12cd78cb6afeedd61ba3bb))

## [0.25.0](https://github.com/heywood8/money-tracker/compare/penny-v0.24.0...penny-v0.25.0) (2026-01-07)


### Features

* redesigned operationListItem ([efe4747](https://github.com/heywood8/money-tracker/commit/efe4747dbe1c5c2d751b2eba79e8e5186fde95aa))

## [0.24.0](https://github.com/heywood8/money-tracker/compare/penny-v0.23.1...penny-v0.24.0) (2026-01-07)


### Features

* add date picker to operations screen for quick date navigation ([#186](https://github.com/heywood8/money-tracker/issues/186)) ([eb7d64d](https://github.com/heywood8/money-tracker/commit/eb7d64d0cff877559d1eafb05280f2a023561ee4))
* lowering the apk build time ([1dca76f](https://github.com/heywood8/money-tracker/commit/1dca76f020bd7363dee6055738c9cdb06d66d072))


### Bug Fixes

* balance graphs ([e0af4c7](https://github.com/heywood8/money-tracker/commit/e0af4c731b5527e0e469a5a97d2cdf16535b8b79))

## [0.23.1](https://github.com/heywood8/money-tracker/compare/penny-v0.23.0...penny-v0.23.1) (2026-01-06)


### Bug Fixes

* use NaN for missing data points instead of null ([329be66](https://github.com/heywood8/money-tracker/commit/329be669ffe9bc989cdad6d732dc9f3f2ae37087))

## [0.23.0](https://github.com/heywood8/money-tracker/compare/penny-v0.22.6...penny-v0.23.0) (2026-01-06)


### Features

* add date picker to operations screen for quick date navigation ([#182](https://github.com/heywood8/money-tracker/issues/182)) ([95bbd8d](https://github.com/heywood8/money-tracker/commit/95bbd8d543fca541b59a497f3ed69269ecdee3b8))
* show parent category name in brackets when selecting categories ([#183](https://github.com/heywood8/money-tracker/issues/183)) ([31ce0a4](https://github.com/heywood8/money-tracker/commit/31ce0a475b875e6f6c53fc381112602bc843b1f2))


### Bug Fixes

* extend balance graph line to end of month for previous months ([#180](https://github.com/heywood8/money-tracker/issues/180)) ([cd54851](https://github.com/heywood8/money-tracker/commit/cd548516c6dc9f9695c5645e71ca516ef5f49eb8))

## [0.22.6](https://github.com/heywood8/money-tracker/compare/penny-v0.22.5...penny-v0.22.6) (2026-01-06)


### Bug Fixes

* pie chart back swipe now navigates to parent category ([#178](https://github.com/heywood8/money-tracker/issues/178)) ([8447a28](https://github.com/heywood8/money-tracker/commit/8447a28406a582c008d5d9d80e4abae68013ac52))

## [0.22.5](https://github.com/heywood8/money-tracker/compare/penny-v0.22.4...penny-v0.22.5) (2026-01-06)


### Bug Fixes

* lint ([797028e](https://github.com/heywood8/money-tracker/commit/797028e718725e54b55cae9239b9ad6ce026608f))
* Show/Hide hidden accounts button misbehaving ([fca1c87](https://github.com/heywood8/money-tracker/commit/fca1c879299c8311408feb6ab3940bb8450cd1fe))

## [0.22.4](https://github.com/heywood8/money-tracker/compare/penny-v0.22.3...penny-v0.22.4) (2026-01-06)


### Bug Fixes

* adjust colors ([f32cb99](https://github.com/heywood8/money-tracker/commit/f32cb995b8d3472a897f10142476d9884b19ba63))
* adjust spacing ([58e33bb](https://github.com/heywood8/money-tracker/commit/58e33bb2af9a7cf70c797727ff6a86a343de4962))
* Balance history legend ([a10a690](https://github.com/heywood8/money-tracker/commit/a10a690548cf7f976e3071a6d5e9e516acfbdd98))
* calculator button colors ([9723428](https://github.com/heywood8/money-tracker/commit/9723428a288345771103ddd3559c31bcf9a1d5e8))
* component splitting ([#175](https://github.com/heywood8/money-tracker/issues/175)) ([e76dbbd](https://github.com/heywood8/money-tracker/commit/e76dbbd8b1bf1beb376fe7fd6edbf7de96b9b922))
* lint for balancehistoryCard ([86bc5fa](https://github.com/heywood8/money-tracker/commit/86bc5fafdf09cf8cbd063dfd5b6b02b00c2f3e7c))
* linting ([a34f95e](https://github.com/heywood8/money-tracker/commit/a34f95ed99290f64ce8b2b97b3ea07e8a658eeec))
* tests ([8405a6f](https://github.com/heywood8/money-tracker/commit/8405a6fd3fa0f5cc4c8da9854e6d65dd8e7abfc8))
* UI inconsistencies after components refactor ([3e5699c](https://github.com/heywood8/money-tracker/commit/3e5699c8fd49a6dfaceaeb6b93b84d467540b15b))

## [0.22.3](https://github.com/heywood8/money-tracker/compare/penny-v0.22.2...penny-v0.22.3) (2026-01-05)


### Bug Fixes

* configure Gradle JVM memory via config plugin ([9556f41](https://github.com/heywood8/money-tracker/commit/9556f418d626ea9f1c430372f966a061680c0753))
* reduce Gradle memory and remove --no-wait from local builds ([113b7ce](https://github.com/heywood8/money-tracker/commit/113b7ceb188e8321ae3e5181d30e0b78f711dc7c))

## [0.22.2](https://github.com/heywood8/money-tracker/compare/penny-v0.22.1...penny-v0.22.2) (2026-01-05)


### Bug Fixes

* set APP_VARIANT=production to build production APK ([256c058](https://github.com/heywood8/money-tracker/commit/256c0586c877696fb71b580b7380edad3d788b0d))
* use APP_VARIANT=preview instead of production ([27d093b](https://github.com/heywood8/money-tracker/commit/27d093b3e4f4802a19dec1226db5a18fa068894a))

## [0.22.1](https://github.com/heywood8/money-tracker/compare/penny-v0.22.0...penny-v0.22.1) (2026-01-05)


### Bug Fixes

* APK file name when uploading to a release ([7e0aad2](https://github.com/heywood8/money-tracker/commit/7e0aad21a8827f3e4cab200531e05857bb00a5f5))
* update build workflow to use assembleRelease and configure signing ([58ce2a9](https://github.com/heywood8/money-tracker/commit/58ce2a9a1bbd85c5db7709f10f5ccffe507f8e5b))

## [0.22.0](https://github.com/heywood8/money-tracker/compare/penny-v0.21.2...penny-v0.22.0) (2026-01-05)


### Features

* privacy policy added; disabled sending usage data ([0811c9e](https://github.com/heywood8/money-tracker/commit/0811c9e2f358a1a06effc570557dddab98cadd75))


### Bug Fixes

* on a new tag, build preview release, not a debug release ([d92aaea](https://github.com/heywood8/money-tracker/commit/d92aaeac945848256c2b79cb03b081c23063bafa))

## [0.21.2](https://github.com/heywood8/money-tracker/compare/penny-v0.21.1...penny-v0.21.2) (2026-01-05)


### Bug Fixes

* "Show hidden accounts" button disappearing after account reorder ([aa17a61](https://github.com/heywood8/money-tracker/commit/aa17a61d349669fcbda64225157159f070d5d286))
* lints for AccountsScreen ([6d05e3d](https://github.com/heywood8/money-tracker/commit/6d05e3dbaabc4e3e2233a40b40b9f731bc0629c9))

## [0.21.1](https://github.com/heywood8/money-tracker/compare/penny-v0.21.0...penny-v0.21.1) (2026-01-01)


### Bug Fixes

* -XX:MaxMetaspaceSize=2g ([f1a9fb4](https://github.com/heywood8/money-tracker/commit/f1a9fb45507e1d8a74bd787813bd653a13296809))
* **build:** for assembleRelease, only do arm64-v82 ([763a15f](https://github.com/heywood8/money-tracker/commit/763a15fe98858e2d8826b6de64062c6a97c8b374))
* **build:** get version from metadata ([86052c2](https://github.com/heywood8/money-tracker/commit/86052c2ff120d9134dc78ac897dc73851fd945d0))

## [0.21.0](https://github.com/heywood8/money-tracker/compare/penny-v0.20.4...penny-v0.21.0) (2026-01-01)


### Features

* add burndown for previous month ([443b10d](https://github.com/heywood8/money-tracker/commit/443b10dea42161aec31e55ac84fb211a62b92862))
* added armenian language ([4d5b24b](https://github.com/heywood8/money-tracker/commit/4d5b24b482846d74d249fcafb6d6647d56d8262a))


### Bug Fixes

* add missing files for translations ([b577f8b](https://github.com/heywood8/money-tracker/commit/b577f8b44a0000eabb01c07b8d751cd7c8301c28))
* adjustment operations ([2a030b7](https://github.com/heywood8/money-tracker/commit/2a030b703c51cbb848e95d05b763736d8e031759))
* export modal options fitting ([4c6e1f0](https://github.com/heywood8/money-tracker/commit/4c6e1f0d3dddd543d3676cc61daf13e4b9f59c56))
* failing tests ([de9d737](https://github.com/heywood8/money-tracker/commit/de9d737593c067a6f1be9bc2d4d3e911254e7a59))
* missing armenian translation file ([a0c1987](https://github.com/heywood8/money-tracker/commit/a0c1987704d3c012695c710d09cf2b2a1e7d30ab))

## [0.20.4](https://github.com/heywood8/money-tracker/compare/penny-v0.20.3...penny-v0.20.4) (2025-12-28)


### Bug Fixes

* -XX:MaxMetaspaceSize ([f893215](https://github.com/heywood8/money-tracker/commit/f893215ae702c915cbab8f8bc4a3434dd22f1076))

## [0.20.3](https://github.com/heywood8/money-tracker/compare/penny-v0.20.2...penny-v0.20.3) (2025-12-28)


### Bug Fixes

* increase gradle settings ([d670a5c](https://github.com/heywood8/money-tracker/commit/d670a5c0deb16dca49f1b435bb66c05d7e225435))
* revert eas.json changes ([24e91d3](https://github.com/heywood8/money-tracker/commit/24e91d343270afe7afca2c23fa509fa83a227deb))

## [0.20.2](https://github.com/heywood8/money-tracker/compare/penny-v0.20.1...penny-v0.20.2) (2025-12-28)


### Bug Fixes

* increase Gradle memory allocation to resolve Metaspace OOM error ([#153](https://github.com/heywood8/money-tracker/issues/153)) ([ca859e9](https://github.com/heywood8/money-tracker/commit/ca859e9a1b14ae94e833a4ab0e5c0b208cc6bab3))

## [0.20.1](https://github.com/heywood8/money-tracker/compare/penny-v0.20.0...penny-v0.20.1) (2025-12-28)


### Bug Fixes

* remove unnecessary jest import from app.config.js ([#151](https://github.com/heywood8/money-tracker/issues/151)) ([d8b2708](https://github.com/heywood8/money-tracker/commit/d8b2708559711291585bef0600a7c5a88cad88de))

## [0.20.0](https://github.com/heywood8/money-tracker/compare/penny-v0.19.1...penny-v0.20.0) (2025-12-28)


### Miscellaneous Chores

* release v0.20.0 ([8ed66e2](https://github.com/heywood8/money-tracker/commit/8ed66e2b6618e141a5faf7bb9ff0ed447cb10368))

## [0.19.1](https://github.com/heywood8/money-tracker/compare/penny-v0.19.0...penny-v0.19.1) (2025-12-27)


### Bug Fixes

* accounts color when choosing in calculator screen ([c640bf7](https://github.com/heywood8/money-tracker/commit/c640bf73956cc727f3182420f74595a03e6f33e4))
* budget decimal digits ([a32219d](https://github.com/heywood8/money-tracker/commit/a32219d9bcd7d647cfdbd5d5f89dae5075e3253a))
* calculating expression automatically when pressing add ([cb1d60a](https://github.com/heywood8/money-tracker/commit/cb1d60a6e3e99f14cf5b316497ef5e80ed891d99))
* decimal digits in account list ([5b763dc](https://github.com/heywood8/money-tracker/commit/5b763dc9efd0c09e8d10a2bdc863eb848cbe7b63))

## [0.19.0](https://github.com/heywood8/money-tracker/compare/penny-v0.18.1...penny-v0.19.0) (2025-12-23)


### Features

* edit category type (entry/parent) ([b5ed22d](https://github.com/heywood8/money-tracker/commit/b5ed22d48f2f2c485b9901c8105694051dcaa669))


### Bug Fixes

* adjust settings/database buttons style ([3ea451e](https://github.com/heywood8/money-tracker/commit/3ea451ebce9050ab8d94e19155d768e108c53bec))
* altRow color ([5ac41f4](https://github.com/heywood8/money-tracker/commit/5ac41f45da87dcfe2d963c035cc53656c8f76803))

## [0.18.1](https://github.com/heywood8/money-tracker/compare/penny-v0.18.0...penny-v0.18.1) (2025-12-23)


### Bug Fixes

* accounts items height ([60eace3](https://github.com/heywood8/money-tracker/commit/60eace32fe96c8996e3f5ffef6db3c0b39feae49))
* calc to match width with other elements ([b4f4e40](https://github.com/heywood8/money-tracker/commit/b4f4e403db8de3b1537e1c515d75b85b81175389))
* calculator color to be altrow ([7dd76ed](https://github.com/heywood8/money-tracker/commit/7dd76edd465c8653b49435146fdc5bc8238bc905))
* categories to match padding with operations and accounts ([4dae3ec](https://github.com/heywood8/money-tracker/commit/4dae3ecbe79e3e8e2b6c512a1b223fb76c38903d))
* edit graph screen colors ([bb79b1d](https://github.com/heywood8/money-tracker/commit/bb79b1d563fa6b50b3ae861cfad54fe91771af16))
* expence/income colors ([1d4161a](https://github.com/heywood8/money-tracker/commit/1d4161ad2b97eea4e8ec5bd2e6d81ab73ae10fb6))
* graphs screen elements height and width ([4139832](https://github.com/heywood8/money-tracker/commit/4139832bce9bab5720dc173c2989d6e536740f0d))
* show hidden accounts not switching theme ([7d69e68](https://github.com/heywood8/money-tracker/commit/7d69e68eb79ca993d1f78f1ef9c6720b4df6d612))

## [0.18.0](https://github.com/heywood8/money-tracker/compare/penny-v0.17.0...penny-v0.18.0) (2025-12-22)


### Features

* design reusability ([#132](https://github.com/heywood8/money-tracker/issues/132)) ([f952b51](https://github.com/heywood8/money-tracker/commit/f952b51da933eacae1361badba968860dcc9f0aa))


### Bug Fixes

* adjust some UI numbers ([63c364a](https://github.com/heywood8/money-tracker/commit/63c364aadff9f685301eed30cb8c4353d671f45e))
* all the lint warnings and errors ([#129](https://github.com/heywood8/money-tracker/issues/129)) ([2a22240](https://github.com/heywood8/money-tracker/commit/2a2224049fe2fa67810fee7c777f9be4034ef5a5))
* creating transfer operations ([1d5441e](https://github.com/heywood8/money-tracker/commit/1d5441e151ef64adb2d4699a44c98297720aff09))
* lint ([4b3f036](https://github.com/heywood8/money-tracker/commit/4b3f03658689967e081d231c607c737f1151e0c6))
* lint ([77caa32](https://github.com/heywood8/money-tracker/commit/77caa324933b84efb2e558bcea55eb6a07cc7577))
* styles layout ([#131](https://github.com/heywood8/money-tracker/issues/131)) ([8ee23e2](https://github.com/heywood8/money-tracker/commit/8ee23e224d09ced409dc2fe4846fad9fe1aa75d8))
* tests ([884275b](https://github.com/heywood8/money-tracker/commit/884275b92166abeef1b45cda02061fdf62aaacdf))

## [0.17.0](https://github.com/heywood8/money-tracker/compare/penny-v0.16.2...penny-v0.17.0) (2025-12-17)


### Features

* add scroll-to-top button on operations page ([#125](https://github.com/heywood8/money-tracker/issues/125)) ([aa298c8](https://github.com/heywood8/money-tracker/commit/aa298c842d954087ecc47aa7317353c8d2332322))


### Bug Fixes

* add italian language ([3b772a3](https://github.com/heywood8/money-tracker/commit/3b772a338e2f62e6c55df4554587bb90ab44ddda))
* languages in their native notations + flags ([441009a](https://github.com/heywood8/money-tracker/commit/441009a31b557a47317f98023e08df40fd6e6f21))
* some lints ([edde32e](https://github.com/heywood8/money-tracker/commit/edde32ebbd643489b1b9b18c8341d99cb70bf557))

## [0.16.2](https://github.com/heywood8/money-tracker/compare/penny-v0.16.1...penny-v0.16.2) (2025-12-16)


### Bug Fixes

* adjust forecasted amount logic ([6ce3b02](https://github.com/heywood8/money-tracker/commit/6ce3b0296a3ed21a15f5c8b3b8532f2c5238d084))
* burndown graph adjustments ([ed19aea](https://github.com/heywood8/money-tracker/commit/ed19aeadfe772beadbc7a9edf2f5b5f4ce527303))
* graphscreen.js lint ([35a3564](https://github.com/heywood8/money-tracker/commit/35a3564ca6d3ea0035435f25146fb31c6297bb53))
* lint ([a60f9e9](https://github.com/heywood8/money-tracker/commit/a60f9e9228d8d13a465f81349f86faf636ed87f2))
* prefill quickadd transfer destination with account ([2776f74](https://github.com/heywood8/money-tracker/commit/2776f74f6078fc56db9771a54a49b5d7085dc26d))
* remove description from quick add screen ([8095cf2](https://github.com/heywood8/money-tracker/commit/8095cf2d84d6e5f47134d4c28a6ad225f9ea1afa))

## [0.16.1](https://github.com/heywood8/money-tracker/compare/penny-v0.16.0...penny-v0.16.1) (2025-12-16)


### Bug Fixes

* Android lint analysis failure in dev menu ([#122](https://github.com/heywood8/money-tracker/issues/122)) ([03adc0e](https://github.com/heywood8/money-tracker/commit/03adc0e25de5ee63e1f77b0c964247a991592055))
* balance_adjustments appearing on parent category graph ([7356693](https://github.com/heywood8/money-tracker/commit/73566932a6a68c4bdea5d1cd00d5dc7c045b13be))
* dates in the balance_history ([ab84a9f](https://github.com/heywood8/money-tracker/commit/ab84a9f4526abc72823b112a24bb2daa7e9679d1))
* OK button was disabled after import ([ef0cb45](https://github.com/heywood8/money-tracker/commit/ef0cb45f57799362d659cc405607d2d24597f08e))
* tests ([c9c5967](https://github.com/heywood8/money-tracker/commit/c9c5967fa0cc535b5789b3a9d6947962d3c37cf8))
* updating balance_history todays entry on any balance/operation update ([a2a02ba](https://github.com/heywood8/money-tracker/commit/a2a02baa870f6f4055d9843f820c758e5c4f5f2a))

## [0.16.0](https://github.com/heywood8/money-tracker/compare/penny-v0.15.1...penny-v0.16.0) (2025-12-15)


### Features

* fast add operation on category select ([2198cce](https://github.com/heywood8/money-tracker/commit/2198cce792d6dd0fa89f72fd26ce74d0aeaa63ec))


### Bug Fixes

* close settings window automatically after backup creation ([e92b685](https://github.com/heywood8/money-tracker/commit/e92b685b79996f8fe0b166e85b8aca417054e273))
* database import errors ([1433246](https://github.com/heywood8/money-tracker/commit/1433246697516fac2f0198a5779088843a3437c8))
* remove autofocus on account name when editing an account ([b776ab1](https://github.com/heywood8/money-tracker/commit/b776ab1a63addb2a614eb7601aaa90a21a58c2b1))
* remove extra modal after db import ([f93ca09](https://github.com/heywood8/money-tracker/commit/f93ca099934fc15ede28ccee24163ecba696259f))
* tests with mockdb ([1b56170](https://github.com/heywood8/money-tracker/commit/1b56170fc7c28e5a624640741a7d854ad09ca8e0))

## [0.15.1](https://github.com/heywood8/money-tracker/compare/penny-v0.15.0...penny-v0.15.1) (2025-12-15)


### Bug Fixes

* fasten the build ([40486f1](https://github.com/heywood8/money-tracker/commit/40486f17a6c3d296d01493e2b435d94743d85630))
* trying to fix a corrupted database after migrations ([ece1814](https://github.com/heywood8/money-tracker/commit/ece1814ffcefabf1fe89121748f5409a8c69611b))

## [0.15.0](https://github.com/heywood8/money-tracker/compare/penny-v0.14.2...penny-v0.15.0) (2025-12-15)


### Features

* reintroducing balance history ([#118](https://github.com/heywood8/money-tracker/issues/118)) ([beba1ec](https://github.com/heywood8/money-tracker/commit/beba1ecc22a39797fe358fca41d3eb85ca12f64e))


### Bug Fixes

* broken migrations ([2f77d78](https://github.com/heywood8/money-tracker/commit/2f77d78626ca5b7a6bd9c30c3e5d80f8b2fe44f8))

## [0.14.2](https://github.com/heywood8/money-tracker/compare/penny-v0.14.1...penny-v0.14.2) (2025-12-15)


### Bug Fixes

* configure development and preview channels in eas.json ([9a70e41](https://github.com/heywood8/money-tracker/commit/9a70e416677217aeeb8d9715fefafb29976be8ed))
* set SENTRY_AUTH_TOKEN ([33bfdc0](https://github.com/heywood8/money-tracker/commit/33bfdc0e3e7f3bb09a0c38129ce971d6bf4c4f27))

## [0.14.1](https://github.com/heywood8/money-tracker/compare/penny-v0.14.0...penny-v0.14.1) (2025-12-15)


### Bug Fixes

* add prebuild stage to ci ([3f5931f](https://github.com/heywood8/money-tracker/commit/3f5931fd235346ac68bc810f0b4dd43d0cefcf99))

## [0.14.0](https://github.com/heywood8/money-tracker/compare/penny-v0.13.0...penny-v0.14.0) (2025-12-15)


### Features

* add theme toggle icon to header ([#111](https://github.com/heywood8/money-tracker/issues/111)) ([e2c94eb](https://github.com/heywood8/money-tracker/commit/e2c94eb46f1d0d3f9326ce82f9a2c71789ba0811))
* backup import progress ([#112](https://github.com/heywood8/money-tracker/issues/112)) ([a659fd7](https://github.com/heywood8/money-tracker/commit/a659fd739651d74750f0705cb38a435c4d7d90dc))


### Bug Fixes

* cleanup old database migrations ([#109](https://github.com/heywood8/money-tracker/issues/109)) ([ed71a5a](https://github.com/heywood8/money-tracker/commit/ed71a5a8b4e8044af8fb764ccc691f2293f76ccf))
* crashes ([bc710bb](https://github.com/heywood8/money-tracker/commit/bc710bb74c0cead1597fa08ac83402fec70a1c8c))
* docs and proper migration on db import ([b2f6354](https://github.com/heywood8/money-tracker/commit/b2f6354dd794a834605f03ba45a64efc7e57a47a))
* turn .sql files into .js files ([b0d21f0](https://github.com/heywood8/money-tracker/commit/b0d21f07fd53336dd1ea66d8090530c363903621))

## [0.13.0](https://github.com/heywood8/money-tracker/compare/penny-v0.12.0...penny-v0.13.0) (2025-12-12)


### Features

* add reset filters button on operations page ([#106](https://github.com/heywood8/money-tracker/issues/106)) ([4903ef9](https://github.com/heywood8/money-tracker/commit/4903ef9358c1d651f9653e30dd68b1c1b8872d0b))


### Bug Fixes

* excluded from forecast categories properly imported ([9758c4d](https://github.com/heywood8/money-tracker/commit/9758c4d3444c8fe136abacebb2d27f6c3e1fd9c6))
* include budgets in backups ([fd811bf](https://github.com/heywood8/money-tracker/commit/fd811bf9a2c330fed668dd3cdf1f1bb9e21936a7))
* removed burndown ([24683b1](https://github.com/heywood8/money-tracker/commit/24683b19cfb6487be4b1f551a8514b03b71c6d9d))
* removed export to xls ([1a71160](https://github.com/heywood8/money-tracker/commit/1a711609f1f54dfa18818306c4d5d834fc367ea4))

## [0.12.0](https://github.com/heywood8/money-tracker/compare/penny-v0.11.3...penny-v0.12.0) (2025-12-08)


### Features

* added toggle to show mean line (might be buggy) ([b39400a](https://github.com/heywood8/money-tracker/commit/b39400ac3433761d4caadcba58370df8689d09d5))
* burndown graph performance increase; added switch to enable a mean line ([7a8eb12](https://github.com/heywood8/money-tracker/commit/7a8eb12c5d98f1cbec0bb4b5a5f09579a613b3e1))


### Bug Fixes

* move income card to the bottom ([e39fdf2](https://github.com/heywood8/money-tracker/commit/e39fdf2fe5f697998ecbc32892ca22a31ae79f69))
* operations from hidden accounts not shown correctly ([dd3c144](https://github.com/heywood8/money-tracker/commit/dd3c1443aa648a27bd013df2f057301efcdde793))
* reorder graphs ([7eb55d4](https://github.com/heywood8/money-tracker/commit/7eb55d4d4430630e9c112feb0ab50a355262af90))
* tests ([b3135cf](https://github.com/heywood8/money-tracker/commit/b3135cf49017d30131e0e300365f93cb9ae5d2bd))
* texts and translations ([4fe5c3f](https://github.com/heywood8/money-tracker/commit/4fe5c3f09945753a2e694eac87332cb060badb94))

## [0.11.3](https://github.com/heywood8/money-tracker/compare/penny-v0.11.2...penny-v0.11.3) (2025-12-08)


### Bug Fixes

* **build:** production build ([19b7907](https://github.com/heywood8/money-tracker/commit/19b790712b05020265ae998ae82bc7bf7d58934f))

## [0.11.2](https://github.com/heywood8/money-tracker/compare/penny-v0.11.1...penny-v0.11.2) (2025-12-08)


### Bug Fixes

* **perf:** optimizing build with r8 ([4a38ea0](https://github.com/heywood8/money-tracker/commit/4a38ea0a51db41fb47e5ce095323edbd4a335257))

## [0.11.1](https://github.com/heywood8/money-tracker/compare/penny-v0.11.0...penny-v0.11.1) (2025-12-08)


### Bug Fixes

* drop xlsx export/import support to fix vulnerabilities ([20292dc](https://github.com/heywood8/money-tracker/commit/20292dcd5c469ae386c5588bfede2cf95998c27e))
* eas update for main branch ([0e9916d](https://github.com/heywood8/money-tracker/commit/0e9916dccce722faf8fc570a2896b811201e8ece))
* switch to another coverage library ([4d31688](https://github.com/heywood8/money-tracker/commit/4d316886fa03bd8a816f9b9ef3ef2727718a1ef5))

## [0.11.0](https://github.com/heywood8/money-tracker/compare/penny-v0.10.1...penny-v0.11.0) (2025-12-08)


### Features

* more currencies support ([10bdec5](https://github.com/heywood8/money-tracker/commit/10bdec521533828c6f9ce0afd8c319be20d5d0cd))
* more languages support ([7c3b0b3](https://github.com/heywood8/money-tracker/commit/7c3b0b39bedbfdb7526e3701c6b67cea646439bb))

## [0.10.1](https://github.com/heywood8/money-tracker/compare/penny-v0.10.0...penny-v0.10.1) (2025-12-08)


### Bug Fixes

* filters - categories parent/child, ordering ([419658b](https://github.com/heywood8/money-tracker/commit/419658b5acc0a6e6704d7842b9c44d9ee4072695))
* filters - shrink fields 10% ([d83e6da](https://github.com/heywood8/money-tracker/commit/d83e6da171b707ff7ff983ac36e8a185959d1a0d))

## [0.10.0](https://github.com/heywood8/money-tracker/compare/penny-v0.9.0...penny-v0.10.0) (2025-12-08)


### Features

* added burndown chart to the graphs page ([#97](https://github.com/heywood8/money-tracker/issues/97)) ([f309846](https://github.com/heywood8/money-tracker/commit/f309846f8be630291803558831377963989a76fd))

## [0.9.0](https://github.com/heywood8/money-tracker/compare/penny-v0.8.1...penny-v0.9.0) (2025-12-07)


### Features

* search for operations ([#96](https://github.com/heywood8/money-tracker/issues/96)) ([d723f71](https://github.com/heywood8/money-tracker/commit/d723f71329e22528371172b4ee82a6123b54ebf3))


### Bug Fixes

* close button on add-new-operation / categories screen ([a2141fd](https://github.com/heywood8/money-tracker/commit/a2141fddf72b9ae412293c4092e90c1e61cfbcb5))

## [0.8.1](https://github.com/heywood8/money-tracker/compare/penny-v0.8.0...penny-v0.8.1) (2025-12-04)


### Bug Fixes

* database initialization and importing ([3552eac](https://github.com/heywood8/money-tracker/commit/3552eac5863683cf17b59bcff09167ad48cd3d82))

## [0.8.0](https://github.com/heywood8/money-tracker/compare/penny-v0.7.0...penny-v0.8.0) (2025-12-04)


### Features

* sum of operations on every day delimiter ([a88d07d](https://github.com/heywood8/money-tracker/commit/a88d07d5e36ffcf26c4f7fa2d8b5b3cbe96f08d4))


### Bug Fixes

* calc buttons performance ([8daf4be](https://github.com/heywood8/money-tracker/commit/8daf4bee2e99ceab447d32a885df353e38c246ee))
* database restore ([68b4009](https://github.com/heywood8/money-tracker/commit/68b4009319c4a7b2aa9c82c6aad1a33aed0a9ba1))
* more visibility to calculator buttons ([84aa96b](https://github.com/heywood8/money-tracker/commit/84aa96b992ddb9075978ef97a6cc2d3f38b2a31a))
* UI edges for operations page ([e94ad31](https://github.com/heywood8/money-tracker/commit/e94ad3126a88cbe0fe2563c42c0c992290eeb979))

## [0.7.0](https://github.com/heywood8/money-tracker/compare/penny-v0.6.1...penny-v0.7.0) (2025-12-04)


### Features

* added calculator for "Add new operation" window ([#85](https://github.com/heywood8/money-tracker/issues/85)) ([367bfad](https://github.com/heywood8/money-tracker/commit/367bfad0dc706d5fa708035c6948caabd0c9e608))
* **graphs:** add an option to show full year stats ([#76](https://github.com/heywood8/money-tracker/issues/76)) ([29525ee](https://github.com/heywood8/money-tracker/commit/29525ee51cf362d9139422da9c62a959201e463f))
* migrate to drizzle orm ([#79](https://github.com/heywood8/money-tracker/issues/79)) ([f2b7a6f](https://github.com/heywood8/money-tracker/commit/f2b7a6f8628b2160fb9bab9e29d742708a668740))
* operations lazy loading ([#84](https://github.com/heywood8/money-tracker/issues/84)) ([6a01dd2](https://github.com/heywood8/money-tracker/commit/6a01dd2f6509a1009e4a4de006d851303f1781b0))
* quick add button when choosing a category for a new operation ([#81](https://github.com/heywood8/money-tracker/issues/81)) ([59ba658](https://github.com/heywood8/money-tracker/commit/59ba6583ba5d2de259766c08b84646ccc1c2a24e))
* setting for a category to be excluded from forecast ([#77](https://github.com/heywood8/money-tracker/issues/77)) ([f5b084a](https://github.com/heywood8/money-tracker/commit/f5b084ad8c71d528a842c66fc2d5cf0ed454720a))
* show balance on selected account when adding a new operation ([#80](https://github.com/heywood8/money-tracker/issues/80)) ([4c7929a](https://github.com/heywood8/money-tracker/commit/4c7929aed06c058aa8a27ed71bff2f68e242c704))


### Bug Fixes

* add .release-please-manifest.json ([52c97eb](https://github.com/heywood8/money-tracker/commit/52c97eb687426d1f154e5ec9b72cb24f870d69fb))
* add build.gradle to extra-files for release-please ([e91c2de](https://github.com/heywood8/money-tracker/commit/e91c2dec3bbd161d188381e889be24351809d634))
* add release-please-config.json to change version properly ([c88f968](https://github.com/heywood8/money-tracker/commit/c88f968eb2ef451f3fdfd2fa32e920c3215033e8))
* annotate with x-release-please-version ([1ceec90](https://github.com/heywood8/money-tracker/commit/1ceec90d228db1c9f7dd1ac8c5d277439b3e9a81))
* app name for preview eas builds ([239ae34](https://github.com/heywood8/money-tracker/commit/239ae34c519af399f339eff58717cf820e137de7))
* bug when editing operation, showing previous amount ([#88](https://github.com/heywood8/money-tracker/issues/88)) ([86ca67e](https://github.com/heywood8/money-tracker/commit/86ca67e430dd0da50bca06733bbe458efb0d691c))
* edit category modal - to fit the actions; to translate text ([#74](https://github.com/heywood8/money-tracker/issues/74)) ([fc4b91f](https://github.com/heywood8/money-tracker/commit/fc4b91f96df9c63b289dd6ee98f7886e8c5dee46))
* lower commit-search-depth for release-please ([f3dedb4](https://github.com/heywood8/money-tracker/commit/f3dedb454953e29cc09f1dc6b2f62a4ba94956e5))
* memory leak in EAS CLI dependencies ([#78](https://github.com/heywood8/money-tracker/issues/78)) ([73f4078](https://github.com/heywood8/money-tracker/commit/73f4078b9e56bf16e240d9d7e91fd20a5b8fb631))
* removed android folder from history, added to gitignore ([18b85c1](https://github.com/heywood8/money-tracker/commit/18b85c101a8e8f2fc3324847830cf6bf49d91a95))
* removed package name ([d6eddbc](https://github.com/heywood8/money-tracker/commit/d6eddbcb38884dc53396d14da0c538bcb127d9b6))
* suppress test exceptions ([#73](https://github.com/heywood8/money-tracker/issues/73)) ([36c09eb](https://github.com/heywood8/money-tracker/commit/36c09ebc89ea3bde6a8a9c3d96b298079327c311))
* switch release-please to node type ([0e17ecf](https://github.com/heywood8/money-tracker/commit/0e17ecf060de16f6205bc853813d291be623d0be))
* test for quick add button ([#82](https://github.com/heywood8/money-tracker/issues/82)) ([6145ee1](https://github.com/heywood8/money-tracker/commit/6145ee1f0ea06d0912b382b02b8c3ddf76429671))
* use APP_VARIANT env var for app naming in builds ([be60628](https://github.com/heywood8/money-tracker/commit/be60628b669b934c7b0932a245924ddab31a9e6f))
* when transferring money, show accounts in one line ([#83](https://github.com/heywood8/money-tracker/issues/83)) ([5438b0b](https://github.com/heywood8/money-tracker/commit/5438b0b68f69cfb36406a465fc61239d4874fb95))

## [0.6.1](https://github.com/heywood8/money-tracker/compare/penny-v0.6.0...penny-v0.6.1) (2025-12-03)


### Bug Fixes

* app name for preview eas builds ([83e1e1d](https://github.com/heywood8/money-tracker/commit/83e1e1d28c5ebb853364ec4ddb828711a7376ff4))
* removed package name ([1071616](https://github.com/heywood8/money-tracker/commit/10716164a1e7f19c1181835a1af1b9b28581e17c))

## [0.6.0](https://github.com/heywood8/money-tracker/compare/penny-v0.5.0...penny-v0.6.0) (2025-12-03)


### Miscellaneous Chores

* release 0.6.0 ([934bcc5](https://github.com/heywood8/money-tracker/commit/934bcc522d4b8c30ea058a256c3325a36ee4340f))

## [0.5.0](https://github.com/heywood8/money-tracker/compare/penny-v0.4.4...penny-v0.5.0) (2025-12-03)


### Features

* added calculator for "Add new operation" window ([#85](https://github.com/heywood8/money-tracker/issues/85)) ([0ef2427](https://github.com/heywood8/money-tracker/commit/0ef2427eaeb54722f9e6e38caa756081801ae854))
* **graphs:** add an option to show full year stats ([#76](https://github.com/heywood8/money-tracker/issues/76)) ([bec8eae](https://github.com/heywood8/money-tracker/commit/bec8eaef133b506d598bc314951c4f22efde0807))
* migrate to drizzle orm ([#79](https://github.com/heywood8/money-tracker/issues/79)) ([ca4c7f3](https://github.com/heywood8/money-tracker/commit/ca4c7f36ffb3778a12d08cf8421889728ac1b6b1))
* operations lazy loading ([#84](https://github.com/heywood8/money-tracker/issues/84)) ([e8b58c9](https://github.com/heywood8/money-tracker/commit/e8b58c90f6ed8545b85f7160e3f20cd4356ad0da))
* quick add button when choosing a category for a new operation ([#81](https://github.com/heywood8/money-tracker/issues/81)) ([9defffe](https://github.com/heywood8/money-tracker/commit/9defffeb249ea9ca77f64ebe3c0e67209ae42b39))
* setting for a category to be excluded from forecast ([#77](https://github.com/heywood8/money-tracker/issues/77)) ([921ba0d](https://github.com/heywood8/money-tracker/commit/921ba0d01b490f33c3ba80d066e5f728a145ca72))
* show balance on selected account when adding a new operation ([#80](https://github.com/heywood8/money-tracker/issues/80)) ([ed4aabd](https://github.com/heywood8/money-tracker/commit/ed4aabda870e41fda1e42954281fef53bdd2d6c4))
* switch to decimal library for handling cents ([#72](https://github.com/heywood8/money-tracker/issues/72)) ([4ca8ece](https://github.com/heywood8/money-tracker/commit/4ca8ece8374cc225cab18fd8f6cc1990d98dd715))


### Bug Fixes

* add .release-please-manifest.json ([03dab0c](https://github.com/heywood8/money-tracker/commit/03dab0ca6912157789933c19091adb328b8ce00e))
* add build.gradle to extra-files for release-please ([fd403f6](https://github.com/heywood8/money-tracker/commit/fd403f691577b2424d2b2c3ae973d8ade09c8da0))
* add release-please-config.json to change version properly ([e9a16c1](https://github.com/heywood8/money-tracker/commit/e9a16c1a5ed7d130c2b572622455a6d0e309dfeb))
* android prebuild ([1017be0](https://github.com/heywood8/money-tracker/commit/1017be08c0b35976a89b4982fe84b4e99910e208))
* annotate with x-release-please-version ([82cd5b6](https://github.com/heywood8/money-tracker/commit/82cd5b6069ee3e7d0aca7e8f40eeaef5ecbfa019))
* Configure preview environment for build ([#64](https://github.com/heywood8/money-tracker/issues/64)) ([46b9f89](https://github.com/heywood8/money-tracker/commit/46b9f897aa4e70d9fd9b8017a39f567a6150ea16))
* edit category modal - to fit the actions; to translate text ([#74](https://github.com/heywood8/money-tracker/issues/74)) ([9163ce5](https://github.com/heywood8/money-tracker/commit/9163ce5f0895906aa52d97b0c5d9c280ed7ea822))
* invalid EAS build configuration properties ([#62](https://github.com/heywood8/money-tracker/issues/62)) ([47545ff](https://github.com/heywood8/money-tracker/commit/47545ff14fec04481ba0b99bd5d06a342b73e731))
* lower commit-search-depth for release-please ([75cc13e](https://github.com/heywood8/money-tracker/commit/75cc13ed5e3e72be27069b4cc8b727da62174951))
* memory leak in EAS CLI dependencies ([#78](https://github.com/heywood8/money-tracker/issues/78)) ([81f8ef5](https://github.com/heywood8/money-tracker/commit/81f8ef5413ca493938dc8e5030a5f467b1774517))
* operation date change ([#67](https://github.com/heywood8/money-tracker/issues/67)) ([f99edcd](https://github.com/heywood8/money-tracker/commit/f99edcde165eec8d0ef0713d9c31ccf5b53b0df6))
* **operations:** editing existing operation - choose a folder first ([#70](https://github.com/heywood8/money-tracker/issues/70)) ([621fed7](https://github.com/heywood8/money-tracker/commit/621fed777aca18b822f2f710431403b0dc87c445))
* suppress test exceptions ([#73](https://github.com/heywood8/money-tracker/issues/73)) ([00c6e8f](https://github.com/heywood8/money-tracker/commit/00c6e8fe3fd11bb13c018b709fc5dcc808d44e31))
* switch release-please to node type ([a64bd41](https://github.com/heywood8/money-tracker/commit/a64bd41bfa4d20ad51cdc426fd7fc82584a04486))
* test for quick add button ([#82](https://github.com/heywood8/money-tracker/issues/82)) ([204a387](https://github.com/heywood8/money-tracker/commit/204a38733aa592677c8b7faebc2efdf9a67fbda4))
* when transferring money, show accounts in one line ([#83](https://github.com/heywood8/money-tracker/issues/83)) ([e4a415d](https://github.com/heywood8/money-tracker/commit/e4a415d58b917dc67cfd4a598619b949fe8178cb))

## [0.5.0](https://github.com/heywood8/money-tracker/compare/v0.4.4...v0.5.0) (2025-12-02)


### Features

* switch to decimal library for handling cents ([#72](https://github.com/heywood8/money-tracker/issues/72)) ([4ca8ece](https://github.com/heywood8/money-tracker/commit/4ca8ece8374cc225cab18fd8f6cc1990d98dd715))


### Bug Fixes

* **operations:** editing existing operation - choose a folder first ([#70](https://github.com/heywood8/money-tracker/issues/70)) ([621fed7](https://github.com/heywood8/money-tracker/commit/621fed777aca18b822f2f710431403b0dc87c445))
* suppress test exceptions ([#73](https://github.com/heywood8/money-tracker/issues/73)) ([00c6e8f](https://github.com/heywood8/money-tracker/commit/00c6e8fe3fd11bb13c018b709fc5dcc808d44e31))

## [0.4.4](https://github.com/heywood8/money-tracker/compare/v0.4.3...v0.4.4) (2025-11-29)


### Bug Fixes

* operation date change ([#67](https://github.com/heywood8/money-tracker/issues/67)) ([f99edcd](https://github.com/heywood8/money-tracker/commit/f99edcde165eec8d0ef0713d9c31ccf5b53b0df6))

## [0.4.3](https://github.com/heywood8/money-tracker/compare/v0.4.2...v0.4.3) (2025-11-28)


### Bug Fixes

* android prebuild ([1017be0](https://github.com/heywood8/money-tracker/commit/1017be08c0b35976a89b4982fe84b4e99910e208))

## [0.4.2](https://github.com/heywood8/money-tracker/compare/v0.4.1...v0.4.2) (2025-11-28)


### Bug Fixes

* Configure preview environment for build ([#64](https://github.com/heywood8/money-tracker/issues/64)) ([46b9f89](https://github.com/heywood8/money-tracker/commit/46b9f897aa4e70d9fd9b8017a39f567a6150ea16))

## [0.4.1](https://github.com/heywood8/money-tracker/compare/v0.4.0...v0.4.1) (2025-11-28)


### Bug Fixes

* invalid EAS build configuration properties ([#62](https://github.com/heywood8/money-tracker/issues/62)) ([47545ff](https://github.com/heywood8/money-tracker/commit/47545ff14fec04481ba0b99bd5d06a342b73e731))

## [0.4.0](https://github.com/heywood8/money-tracker/compare/v0.3.0...v0.4.0) (2025-11-28)


### Features

* account deletion transfer confirmation dialog ([#55](https://github.com/heywood8/money-tracker/issues/55)) ([9916e0a](https://github.com/heywood8/money-tracker/commit/9916e0aae58be10220f34038177e5dce193b4cd6))
* an option to disable adjustment operation ([c08f1c7](https://github.com/heywood8/money-tracker/commit/c08f1c7726fc4cafbf94d3efb88bdfb75b5d88ef))
* option to hide accounts ([#59](https://github.com/heywood8/money-tracker/issues/59)) ([4dbac2e](https://github.com/heywood8/money-tracker/commit/4dbac2ef1fc19e9b4cfdb1372d2bc55812d903b9))
* split applications into Penny and PennyDev ([6e9eff8](https://github.com/heywood8/money-tracker/commit/6e9eff8739d2b727b4ccc14604611c748b10ef02))
* when adding operation, split by parent categories ([211206a](https://github.com/heywood8/money-tracker/commit/211206a0c325dde4750f0d0dc4f0f3f1d5122b49))


### Bug Fixes

* change icon ([d1a9a8a](https://github.com/heywood8/money-tracker/commit/d1a9a8aacfce4a1f4fb0af6bba5df928fd38f370))
* currency symbols in operation list, +/- signs removed ([7840045](https://github.com/heywood8/money-tracker/commit/784004592640bf2f768de4ba5f6d18b44489016a))
* delimiter between days on operations list page ([b2d147c](https://github.com/heywood8/money-tracker/commit/b2d147c120374c95108c7fbb3102de88a616b704))
* icon in the header ([#61](https://github.com/heywood8/money-tracker/issues/61)) ([b3d940c](https://github.com/heywood8/money-tracker/commit/b3d940c5e1602334ba70b49b0ace814995b499fd))
* replace alerts with materialUI handlers; add translations ([#60](https://github.com/heywood8/money-tracker/issues/60)) ([21da199](https://github.com/heywood8/money-tracker/commit/21da199a2349f35bbfc96c13d66658c2296f2a30))
* replaced currency codes with symbols in operations list ([#56](https://github.com/heywood8/money-tracker/issues/56)) ([4868304](https://github.com/heywood8/money-tracker/commit/4868304bd994411a0801d2f227809a4f2a46b571))

## [0.3.0](https://github.com/heywood8/money-tracker/compare/v0.2.0...v0.3.0) (2025-11-27)


### Features

* monthly and weekly budget settings ([#52](https://github.com/heywood8/money-tracker/issues/52)) ([701e63d](https://github.com/heywood8/money-tracker/commit/701e63d9f0c5c45c8a591737f8311ba3ef2780e3))
* multi-currency account transfers with static rates ([#49](https://github.com/heywood8/money-tracker/issues/49)) ([c30f780](https://github.com/heywood8/money-tracker/commit/c30f78056d5bb2794ba0a1cbbaef7fb6e50d3a2a))

## [0.2.0](https://github.com/heywood8/money-tracker/compare/v0.1.7...v0.2.0) (2025-11-27)


### Features

* add spending prediction graph for filtered range ([f6b8e80](https://github.com/heywood8/money-tracker/commit/f6b8e803c51eb83b16103896b4116b28a9fcc98d))
* **settings:** Add SVC, Excel, and SQLite export options ([#46](https://github.com/heywood8/money-tracker/issues/46)) ([8420111](https://github.com/heywood8/money-tracker/commit/8420111ddaa3d2f3376dad3d5677fa3122c10cf0))

## [0.1.7](https://github.com/heywood8/money-tracker/compare/v0.1.6...v0.1.7) (2025-11-26)


### Bug Fixes

* **workflows:** rename apk before uploading to release ([719a85e](https://github.com/heywood8/money-tracker/commit/719a85e47f5c696147a3633d984e917b993d0dfc))

## [0.1.6](https://github.com/heywood8/money-tracker/compare/v0.1.5...v0.1.6) (2025-11-26)


### Features

* **workflows:** configure versioning in app.json using release-please ([f5795af](https://github.com/heywood8/money-tracker/commit/f5795afb0ceafbe381019d75e6506688b7fac83b))


### Bug Fixes

* **workflows:** revert adding release please config, in favor of setting the configuration straight in gha ([d398667](https://github.com/heywood8/money-tracker/commit/d3986677cd1d70d82f2ae4368ded20d07c76b255))


### Miscellaneous Chores

* release 0.1.6 ([8c653fd](https://github.com/heywood8/money-tracker/commit/8c653fd74796f84faeec40a61c309048926fb847))

## [0.1.5](https://github.com/heywood8/money-tracker/compare/v0.1.4...v0.1.5) (2025-11-26)


### Bug Fixes

* **graphs:** expense graph category filtering logic ([#39](https://github.com/heywood8/money-tracker/issues/39)) ([4e86d8f](https://github.com/heywood8/money-tracker/commit/4e86d8f09370b008a073bdb43ab59d16f750294d))
* **workflows:** conditional signing of APK ([#43](https://github.com/heywood8/money-tracker/issues/43)) ([6bf012f](https://github.com/heywood8/money-tracker/commit/6bf012fdf3d599576998530ed0fc0d213a17a13a))

## [0.1.4](https://github.com/heywood8/money-tracker/compare/v0.1.3...v0.1.4) (2025-11-26)


### Bug Fixes

* **sentry:** added proper configuration ([b1b38d6](https://github.com/heywood8/money-tracker/commit/b1b38d651cf17365b79c793b2d94509108c19bd7))

## [0.1.3](https://github.com/heywood8/money-tracker/compare/v0.1.2...v0.1.3) (2025-11-26)


### Bug Fixes

* **workflows:** set token to be PAT ([e96263b](https://github.com/heywood8/money-tracker/commit/e96263b9c5e3afc43deca18b5055f6f2bb3d46ee))

## [0.1.2](https://github.com/heywood8/money-tracker/compare/v0.1.1...v0.1.2) (2025-11-26)


### Bug Fixes

* **workflows:** set gradle memory limits for publishing apk ([#35](https://github.com/heywood8/money-tracker/issues/35)) ([8c6874f](https://github.com/heywood8/money-tracker/commit/8c6874fb861096ceb95707edc55beda192267669))

## [0.1.1](https://github.com/heywood8/money-tracker/compare/v0.1.0...v0.1.1) (2025-11-26)


### Bug Fixes

* **workflows:** add manual builds on tags ([6f5e8fc](https://github.com/heywood8/money-tracker/commit/6f5e8fc9ae04a35d9b2905dfa6cb6159bbddde65))

## 0.1.0 (2025-11-26)


### Features

* **build:** Add release-please workflow for automatic releases ([2bab89d](https://github.com/heywood8/money-tracker/commit/2bab89d9cce27c314c555c5d16f32e4d9d2abc9f))
* cancel modal by pressing outside ([9c77403](https://github.com/heywood8/money-tracker/commit/9c7740388478eb9834d68d00e95181accd0d7fef))
* **ci:** add APK build workflow for releases ([#32](https://github.com/heywood8/money-tracker/issues/32)) ([16fa364](https://github.com/heywood8/money-tracker/commit/16fa36465007368165088b2018d1d397999872e3))
* **graphs:** Redesign graphs page with filters and charts ([#29](https://github.com/heywood8/money-tracker/issues/29)) ([b13cf67](https://github.com/heywood8/money-tracker/commit/b13cf67310a009770e371f7a95a6aeafdfcdf829))
* **monitoring:** configured sentry ([3cb72d6](https://github.com/heywood8/money-tracker/commit/3cb72d65e3fd6838ed40c7bb00b7476be3650208))


### Bug Fixes

* make the theme global; adjust settings modal ([b2f30af](https://github.com/heywood8/money-tracker/commit/b2f30afacdee3b2665809959daaa3bf99a715ce1))
* **UI:** extra space between header and the phone border ([#31](https://github.com/heywood8/money-tracker/issues/31)) ([4c68b0c](https://github.com/heywood8/money-tracker/commit/4c68b0c7e538bdda5983f9b3b6010ce9153e7a11))
* **workflows:** add version prefix to release-please ([#33](https://github.com/heywood8/money-tracker/issues/33)) ([db023ea](https://github.com/heywood8/money-tracker/commit/db023eaf2d74b49963b49b14a2828399b359c49b))
* **workflows:** disable eas build on push to main ([a01d078](https://github.com/heywood8/money-tracker/commit/a01d0783ee5966b79001a1156e1f887246571080))


### Miscellaneous Chores

* release 0.1.0 ([da8bbb1](https://github.com/heywood8/money-tracker/commit/da8bbb11799965649b9e00ab51d409a803db30ba))
