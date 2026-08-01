/*
 * site-nav.js — auto-inject shared navigation bar
 * Include this script on any page to get the a4 brand + horizontal links.
 * Detects the current page and marks the active link.
 */
(function () {
    var path = window.location.pathname;

    // Determine which link is active
    var active = '';
    if (path === '/' || path === '/index.html') active = 'questionnaire';
    else if (path.indexOf('/about') === 0) active = 'about';
    else if (path.indexOf('/contact') === 0) active = 'contact';
    else if (path.indexOf('/privacy') === 0) active = 'privacy';
    else if (path.indexOf('/questions') === 0 || path.indexOf('/proust') === 0) active = 'questionnaire';

    // Build nav using safe DOM methods
    var nav = document.createElement('nav');
    nav.className = 'site-nav';
    nav.setAttribute('aria-label', 'Site navigation');

    // Brand link
    var brand = document.createElement('a');
    brand.href = '/';
    brand.className = 'site-nav__brand';
    brand.title = 'a formulation of truth';

    var a4Span = document.createElement('span');
    a4Span.className = 'site-nav__a4';
    a4Span.textContent = 'a4';
    brand.appendChild(a4Span);

    var tamilSpan = document.createElement('span');
    tamilSpan.className = 'site-nav__tamil';
    tamilSpan.textContent = '\u0BAE\u0BC2\u0BB2'; // மூல
    brand.appendChild(tamilSpan);

    nav.appendChild(brand);

    // Links container
    var linksDiv = document.createElement('div');
    linksDiv.className = 'site-nav__links';

    var links = [
        { href: '/#begin', text: 'Questionnaire', key: 'questionnaire' },
        { href: '/about.html', text: 'About', key: 'about' },
        { href: '/contact.html', text: 'Contact', key: 'contact' },
        { href: '/privacy.html', text: 'Privacy', key: 'privacy' }
    ];

    links.forEach(function (item) {
        var a = document.createElement('a');
        a.href = item.href;
        a.className = 'site-nav__link site-nav__link--' + item.key;
        if (active === item.key) a.classList.add('site-nav__link--active');
        a.textContent = item.text;
        linksDiv.appendChild(a);
    });

    nav.appendChild(linksDiv);
    document.body.insertBefore(nav, document.body.firstChild);
    document.body.classList.add('has-site-nav');
})();
