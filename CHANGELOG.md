# Changelog

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
