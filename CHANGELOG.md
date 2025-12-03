# Changelog

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
