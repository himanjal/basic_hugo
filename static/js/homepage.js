document.addEventListener("DOMContentLoaded", function() {

    // --- CONFIGURATION ---
    const config = {
        typeSpeed: 40,        // ms per char
        eraseSpeed: 10,       // ms per char
        startDelay: 1000,     // Wait 2s after slides finish
        loopPause: 1500      // Wait 60s before re-typing
    };

    // --- DOM ELEMENTS ---
    const heroRoot = document.querySelector('.hero-root');
    const textEl = document.querySelector('.typewriter-text');

    // Get the background URL safely from the HTML data attribute
    const bgUrl = heroRoot.dataset.bg;

    // --- TYPEWRITER ENGINE ---
    let fullText = textEl.innerText.trim(); // Store original text
    textEl.innerText = '';                  // Clear for animation
    textEl.classList.add('blinking');       // Turn on cursor

    function typeWriter(text, i, fnCallback) {
        if (i < text.length) {
            textEl.innerHTML = text.substring(0, i + 1);
            setTimeout(() => typeWriter(text, i + 1, fnCallback), config.typeSpeed);
        } else if (typeof fnCallback === 'function') {
            setTimeout(fnCallback, config.loopPause);
        }
    }

    function eraseText(fnCallback) {
        let text = textEl.innerText;
        if (text.length > 0) {
            textEl.innerText = text.substring(0, text.length - 1);
            setTimeout(() => eraseText(fnCallback), config.eraseSpeed);
        } else if (typeof fnCallback === 'function') {
            fnCallback();
        }
    }

    function startTypewriterLoop() {
        typeWriter(fullText, 0, () => {
            eraseText(() => {
                startTypewriterLoop();
            });
        });
    }

    // --- ANIMATION CONTROLLER ---
    const unlockAnimation = () => {
        // 1. Trigger CSS Slide Animation
        heroRoot.classList.add('is-loaded');

        // 2. Schedule Typewriter (Slide Duration + Buffer)
        setTimeout(startTypewriterLoop, config.startDelay);
    };

    // --- IMAGE PRELOADER ---
    if (!bgUrl) {
        unlockAnimation();
        return;
    }

    const img = new Image();
    img.src = bgUrl;

    if (img.complete) {
        unlockAnimation();
    } else {
        img.onload = unlockAnimation;
        img.onerror = unlockAnimation;
    }
});