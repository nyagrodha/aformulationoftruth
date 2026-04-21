import { Handlers } from '$fresh/server.ts';
import { resolveLanguagePreference, withLanguageCookie } from '../lib/language.ts';

export const handler: Handlers = {
  async GET(req, _ctx) {
    const preference = resolveLanguagePreference(req);
    let html = await Deno.readTextFile('./public/index.html');
    html = html.replace('<html lang="en">', `<html lang="${preference.htmlLang}">`);
    html = html.replace(
      '<body>',
      `<body data-boot-lang-mode="${preference.mode}" data-lang-mode="${preference.mode}">`,
    );

    const headers = withLanguageCookie(
      {
        'content-type': 'text/html; charset=utf-8',
      },
      req,
      preference.mode,
    );

    return new Response(html, {
      headers,
    });
  },
};
