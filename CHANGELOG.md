# Changelog

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
