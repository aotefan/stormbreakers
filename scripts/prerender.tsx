import React from 'react';
import { renderToString } from 'react-dom/server';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import App from '../src/ui/App';
import { REPOSITORY_URL, SITE_URL, siteText } from '../src/site';

const template = await readFile('dist/index.html', 'utf8');
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
for (const language of ['zh', 'en'] as const) {
  const content = siteText[language];
  const url = `${SITE_URL}${language === 'en' ? '/en/' : '/'}`;
  const image = `${SITE_URL}/social-preview.png`;
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'VideoGame', '@id': `${SITE_URL}/#game`,
        name: 'Stormbreakers', alternateName: '破风者', url: `${SITE_URL}/`,
        description: content.description, image, genre: ['Naval combat', 'Action'],
        gamePlatform: 'Web browser', operatingSystem: 'Any OS with a WebGL-capable browser',
        applicationCategory: 'GameApplication', inLanguage: ['zh-CN', 'en'],
        isAccessibleForFree: true, license: `${REPOSITORY_URL}/blob/main/LICENSE`,
        playMode: ['https://schema.org/SinglePlayer', 'https://schema.org/MultiPlayer'],
        numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 6 },
        sameAs: [REPOSITORY_URL],
      },
      {
        '@type': 'SoftwareSourceCode', '@id': `${SITE_URL}/#source`,
        name: 'Stormbreakers source code', codeRepository: REPOSITORY_URL,
        programmingLanguage: 'TypeScript', license: `${REPOSITORY_URL}/blob/main/LICENSE`,
        runtimePlatform: 'Node.js', targetProduct: { '@id': `${SITE_URL}/#game` },
      },
      {
        '@type': 'WebPage', '@id': `${url}#page`, url, name: content.title,
        inLanguage: language === 'zh' ? 'zh-CN' : 'en', about: { '@id': `${SITE_URL}/#game` },
      },
    ],
  };
  const head = `
    <meta name="description" content="${escape(content.description)}" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
    <link rel="canonical" href="${url}" />
    <link rel="alternate" hreflang="zh-CN" href="${SITE_URL}/" />
    <link rel="alternate" hreflang="en" href="${SITE_URL}/en/" />
    <link rel="alternate" hreflang="x-default" href="${SITE_URL}/" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Stormbreakers / 破风者" />
    <meta property="og:title" content="${escape(content.title)}" />
    <meta property="og:description" content="${escape(content.description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:locale" content="${language === 'zh' ? 'zh_CN' : 'en_US'}" />
    <meta property="og:locale:alternate" content="${language === 'zh' ? 'en_US' : 'zh_CN'}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Stormbreakers naval battle gameplay" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escape(content.title)}" />
    <meta name="twitter:description" content="${escape(content.description)}" />
    <meta name="twitter:image" content="${image}" />
    <meta name="twitter:image:alt" content="Stormbreakers naval battle gameplay" />
    <script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`;
  const html = template.replace('<html lang="zh-CN">', `<html lang="${language === 'zh' ? 'zh-CN' : 'en'}">`)
    .replace(/<title>.*?<\/title>/, `<title>${escape(content.title)}</title>`)
    .replace('<!-- seo-head -->', head)
    .replace('<div id="root"></div>', `<div id="root">${renderToString(<App initialLang={language} />)}</div>`);
  const directory = language === 'en' ? 'dist/en' : 'dist';
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/index.html`, html);
}
console.log('Prerendered Chinese and English pages with shared visible content and metadata.');
