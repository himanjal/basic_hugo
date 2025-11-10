// static/js/theme-toggle.js
(function () {
    'use strict';

    const root = document.documentElement;

    // 1) Prevent transitions during initial paint to avoid flash
    root.setAttribute('data-theme-initial', '1');

    // 2) Determine initial theme:
    //    - first, use saved preference from localStorage (if any)
    //    - else respect system preference
    //    - default to 'light' otherwise
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial = saved || (prefersDark ? 'dark' : 'light');

    // 3) Apply initial theme (no transitions because of data-theme-initial)
    root.dataset.theme = initial;

    // 4) Remove the "no-flash" flag on next paint so future transitions animate
    requestAnimationFrame(function () {
        root.removeAttribute('data-theme-initial');
    });

    // 5) Helper: create the toggle button
    function createToggle() {
        const btn = document.createElement('button');
        btn.className = 'theme-toggle';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Toggle theme');
        btn.textContent = root.dataset.theme === 'dark' ? '☀️' : '🌙';

        btn.addEventListener('click', function () {
            // Add class to enable smooth transition
            root.classList.add('theme-transition');

            // Flip theme
            const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
            root.dataset.theme = next;
            localStorage.setItem('theme', next);

            // Update button icon
            btn.textContent = next === 'dark' ? '☀️' : '🌙';

            // Remove transition helper after animation finishes
            window.setTimeout(function () {
                root.classList.remove('theme-transition');
            }, 420);
        }, { passive: true });

        return btn;
    }

    // 6) Insert toggle into header (if present), else append to body
    var header = document.querySelector('.site-header');
    if (header) {
        // If a toggle already exists, sync its state; otherwise create one
        var existing = header.querySelector('.theme-toggle');
        if (!existing) {
            header.appendChild(createToggle());
        } else {
            existing.textContent = root.dataset.theme === 'dark' ? '☀️' : '🌙';
            // ensure click handler exists
            if (!existing.onclick) {
                existing.addEventListener('click', function () {
                    // reuse createToggle logic by triggering a click on a fresh element
                    const tmp = createToggle();
                    tmp.click();
                }, { passive: true });
            }
        }
    } else {
        // fallback: place at end of body
        document.body.appendChild(createToggle());
    }

    // 7) If no explicit saved preference, respond to system preference changes
    if (!saved && window.matchMedia) {
        var mq = window.matchMedia('(prefers-color-scheme: dark)');
        // newer API
        if (typeof mq.addEventListener === 'function') {
            mq.addEventListener('change', function (e) {
                root.classList.add('theme-transition');
                root.dataset.theme = e.matches ? 'dark' : 'light';
                setTimeout(function () { root.classList.remove('theme-transition'); }, 420);
            });
        } else if (typeof mq.addListener === 'function') {
            // fallback for older browsers
            mq.addListener(function (e) {
                root.classList.add('theme-transition');
                root.dataset.theme = e.matches ? 'dark' : 'light';
                setTimeout(function () { root.classList.remove('theme-transition'); }, 420);
            });
        }
    }
})();
