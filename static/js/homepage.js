
(function() {
    var heroRoot = document.querySelector('.hero-root');
    var bgUrl = '{{ $bg }}';

    // --- TYPEWRITER CONFIG ---
    var textEl = document.querySelector('.typewriter-text');
    var fullText = textEl.innerText; // Read text from HTML
    textEl.innerText = '';           // Clear it initially
    textEl.classList.add('blinking'); // Start blinking cursor

    // Configurable Delays
    var typeSpeed = 40;       // ms per character
    var eraseSpeed = 20;      // ms per character
    var startDelay = 2000;    // 2s (Slide Duration + 1s Buffer)
    var loopPause = 60000;    // 60s (1 Minute Pause)

    function typeWriter(text, i, fnCallback) {
    if (i < text.length) {
    textEl.innerHTML = text.substring(0, i+1);
    setTimeout(function() {
    typeWriter(text, i + 1, fnCallback)
}, typeSpeed);
} else if (typeof fnCallback == 'function') {
    // Done typing, wait then callback (erase)
    setTimeout(fnCallback, loopPause);
}
}

    function eraseText(fnCallback) {
    var text = textEl.innerText;
    if (text.length > 0) {
    textEl.innerText = text.substring(0, text.length - 1);
    setTimeout(function() {
    eraseText(fnCallback)
}, eraseSpeed);
} else if (typeof fnCallback == 'function') {
    fnCallback();
}
}

    function startAnimation() {
    typeWriter(fullText, 0, function() {
    eraseText(function() {
    startAnimation(); // Loop
});
});
}

    // --- HERO LOADER ---
    var unlock = function() {
    heroRoot.classList.add('is-loaded');
    // Start typewriter 2 seconds after slides trigger
    setTimeout(startAnimation, startDelay);
};

    if (!bgUrl) {
    unlock();
    return;
}

    var img = new Image();
    img.src = bgUrl;
    if (img.complete) {
    unlock();
} else {
    img.onload = unlock;
    img.onerror = unlock;
}
})();
