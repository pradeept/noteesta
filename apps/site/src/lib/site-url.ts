export const siteUrl = (process.env.NOTEESTA_SITE_URL ?? 'https://noteesta.com').replace(
  /\/+$/,
  '',
);
