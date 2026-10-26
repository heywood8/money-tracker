/**
 * The widget picker's name and description in every app language. The text is
 * read from assets/i18n, so a test against the real files also guards the keys.
 */

let stringsCb;
let dangerousCb;

jest.mock('@expo/config-plugins', () => ({
  withStringsXml: (config, cb) => {
    stringsCb = cb;
    return config;
  },
  withDangerousMod: (config, [, cb]) => {
    dangerousCb = cb;
    return config;
  },
  AndroidConfig: {
    Strings: {
      setStringItem: (items, xml) => ({ ...xml, items: [...(xml.items || []), ...items] }),
    },
  },
}));

const mockWrites = [];
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn((file, contents) => mockWrites.push([file, contents])),
  };
});

const path = require('path');
const withWidgetStrings = require('../../plugins/withWidgetStrings');
const {
  LABEL_STRING,
  DESCRIPTION_STRING,
  PAIR_LABEL_STRING,
  PAIR_DESCRIPTION_STRING,
  FORECAST_LABEL_STRING,
  FORECAST_DESCRIPTION_STRING,
  escapeAndroidString,
  allowDescriptionTranslations,
} = withWidgetStrings;
const en = require('../../assets/i18n/en.json');
const ru = require('../../assets/i18n/ru.json');
const appConfig = require('../../app.config').expo;

describe('withWidgetStrings', () => {
  beforeEach(() => {
    mockWrites.length = 0;
    withWidgetStrings({});
  });

  it('puts every widget’s English label in the default strings', () => {
    const result = stringsCb({ modResults: {} });
    expect(result.modResults.items).toEqual([
      { $: { name: LABEL_STRING }, _: en.widget_rate_label },
      { $: { name: PAIR_LABEL_STRING }, _: en.widget_pair_label },
      { $: { name: FORECAST_LABEL_STRING }, _: en.widget_forecast_label },
    ]);
  });

  it('writes the label and description for every other app language', async () => {
    await dangerousCb({ modRequest: { projectRoot: '/project' } });

    const files = Object.fromEntries(mockWrites.map(([file, xml]) => [path.relative('/project', file), xml]));
    expect(Object.keys(files).sort()).toEqual(
      ['de', 'es', 'fr', 'hy', 'it', 'ja', 'ko', 'pt', 'ru', 'zh']
        .map((lang) => `android/app/src/main/res/values-${lang}/widget_strings.xml`),
    );
    const russian = files['android/app/src/main/res/values-ru/widget_strings.xml'];
    expect(russian).toContain(`<string name="${LABEL_STRING}">${ru.widget_rate_label}</string>`);
    expect(russian).toContain(`<string name="${DESCRIPTION_STRING}">${escapeAndroidString(ru.widget_rate_description)}</string>`);
    expect(russian).toContain(`<string name="${PAIR_LABEL_STRING}">${ru.widget_pair_label}</string>`);
    expect(russian).toContain(`<string name="${PAIR_DESCRIPTION_STRING}">${escapeAndroidString(ru.widget_pair_description)}</string>`);
    expect(russian).toContain(`<string name="${FORECAST_LABEL_STRING}">${ru.widget_forecast_label}</string>`);
    expect(russian).toContain(`<string name="${FORECAST_DESCRIPTION_STRING}">${escapeAndroidString(ru.widget_forecast_description)}</string>`);
  });

  it('lets the library’s English description be translated, unescaping it for Expo’s writer', () => {
    // The library writes it pre-escaped and untranslatable; a translated
    // untranslatable string fails release builds (lint ExtraTranslation).
    const xml = {
      resources: {
        string: [
          { $: { name: DESCRIPTION_STRING, translatable: 'false' }, _: "today\\'s rate" },
          { $: { name: 'other', translatable: 'false' }, _: "keep\\'s" },
          { $: { name: PAIR_DESCRIPTION_STRING, translatable: 'false' }, _: 'two rates' },
          { $: { name: FORECAST_DESCRIPTION_STRING, translatable: 'false' }, _: "each account\\'s balance" },
        ],
      },
    };

    const result = allowDescriptionTranslations(xml);

    expect(result.resources.string[0]).toEqual({ $: { name: DESCRIPTION_STRING }, _: "today's rate" });
    expect(result.resources.string[1]).toEqual({ $: { name: 'other', translatable: 'false' }, _: "keep\\'s" });
    expect(result.resources.string[2]).toEqual({ $: { name: PAIR_DESCRIPTION_STRING }, _: 'two rates' });
    expect(result.resources.string[3]).toEqual({ $: { name: FORECAST_DESCRIPTION_STRING }, _: "each account's balance" });
  });

  it('runs its strings mod after the library’s, so the description is there to fix', () => {
    const plugins = appConfig.plugins.map((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin));
    expect(plugins.indexOf('./plugins/withWidgetStrings.js')).toBeLessThan(plugins.indexOf('react-native-android-widget'));
  });

  it('gives every widget a preview image that exists', () => {
    const fs = jest.requireActual('fs');
    const [, options] = appConfig.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'react-native-android-widget');
    options.widgets.forEach((widget) => {
      expect(fs.existsSync(path.join(__dirname, '..', '..', widget.previewImage))).toBe(true);
    });
  });

  it('escapes what aapt would read as markup', () => {
    expect(escapeAndroidString('l’app & "x" it\'s <b>')).toBe('l’app &amp; \\"x\\" it\\\'s &lt;b&gt;');
    expect(escapeAndroidString('@home')).toBe('\\@home');
  });

  it('names the same resources app.config.js hands the widget library', () => {
    const [, options] = appConfig.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'react-native-android-widget');
    const widget = options.widgets[0];
    expect(widget.label).toBe(`@string/${LABEL_STRING}`);
    // The library names the description resource after the widget.
    expect(DESCRIPTION_STRING).toBe(`widget_${widget.name.toLowerCase()}_description`);
    expect(widget.description).toBe(en.widget_rate_description);
    const pair = options.widgets[1];
    expect(pair.label).toBe(`@string/${PAIR_LABEL_STRING}`);
    expect(PAIR_DESCRIPTION_STRING).toBe(`widget_${pair.name.toLowerCase()}_description`);
    expect(pair.description).toBe(en.widget_pair_description);
    const forecast = options.widgets[2];
    expect(forecast.name).toBe('BalanceForecast');
    expect(forecast.label).toBe(`@string/${FORECAST_LABEL_STRING}`);
    expect(FORECAST_DESCRIPTION_STRING).toBe(`widget_${forecast.name.toLowerCase()}_description`);
    expect(forecast.description).toBe(en.widget_forecast_description);
    expect(appConfig.plugins).toContain('./plugins/withWidgetStrings.js');
  });
});
