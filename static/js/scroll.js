// static/js/scroll.js
document.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('scroll-down');
    if (!btn) return;

    btn.addEventListener('click', function (e) {
        e.preventDefault();
        // find the first .content element to scroll to
        const target = document.querySelector('.content') || document.querySelector('#content');
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            // fallback: scroll 100vh
            window.scrollTo({ top: window.innerHeight, behavior: 'smooth' });
        }
    });
});
