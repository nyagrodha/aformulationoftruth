// Easter Egg System
// Three activation methods:
// 1. Image click/long-press (most frictionless)
// 2. Typographic signal (Sanskrit/Tamil hotkey)
// 3. CSS hover dilation on specific letters

document.addEventListener('DOMContentLoaded', () => {

    // ============================================
    // METHOD 1: IMAGE INTERACTION
    // Click or long-press on images with data-easter-egg
    // ============================================

    const easterEggImages = document.querySelectorAll('[data-easter-egg]');
    let longPressTimer = null;
    const LONG_PRESS_DURATION = 800; // ms

    easterEggImages.forEach(img => {
        const eggType = img.dataset.easterEgg;

        // Desktop: Click
        img.addEventListener('click', (e) => {
            if (!isMobile()) {
                activateEasterEgg(eggType, e);
            }
        });

        // Mobile: Long press
        img.addEventListener('touchstart', (e) => {
            longPressTimer = setTimeout(() => {
                activateEasterEgg(eggType, e);
                navigator.vibrate?.(50); // Haptic feedback if available
            }, LONG_PRESS_DURATION);
        });

        img.addEventListener('touchend', () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
            }
        });

        img.addEventListener('touchmove', () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
            }
        });
    });

    // ============================================
    // METHOD 2: TYPOGRAPHIC SIGNAL
    // Sanskrit/Tamil transliteration hotkey
    // ============================================

    const MAGIC_WORDS = [
        'pratyabhijna',      // Sanskrit: recognition
        'kēlvi',             // Tamil: question
        'pratyabhijñā',      // With diacritics
        'அறிவு',            // Tamil: knowledge
    ];

    let typedKeys = '';
    let typingTimer = null;

    document.addEventListener('keypress', (e) => {
        // Clear after 2 seconds of no typing
        clearTimeout(typingTimer);

        typedKeys += e.key.toLowerCase();

        // Check if any magic word is typed
        for (const word of MAGIC_WORDS) {
            if (typedKeys.includes(word)) {
                activateEasterEgg('typographic', e);
                typedKeys = '';
                return;
            }
        }

        // Limit buffer size
        if (typedKeys.length > 50) {
            typedKeys = typedKeys.slice(-50);
        }

        // Reset typing buffer after 2 seconds
        typingTimer = setTimeout(() => {
            typedKeys = '';
        }, 2000);
    });

    // ============================================
    // METHOD 3: CSS HOVER DILATION
    // Specific letters in headings stretch on hover
    // ============================================

    // Add hover-dilatable class to specific letters in h1, h2
    function makeLettersDilatable() {
        const headings = document.querySelectorAll('h1, h2, h3');

        headings.forEach(heading => {
            const text = heading.textContent;
            // Make every 7th character dilatable (or specific pattern)
            const chars = text.split('');

            // Target specific significant letters
            const targets = ['த', 'ண', 'ள', 'ர'];  // Tamil letters

            let newHTML = '';
            chars.forEach((char, i) => {
                if (targets.includes(char) || i % 7 === 0) {
                    newHTML += `<span class="dilatable-letter" data-index="${i}">${char}</span>`;
                } else {
                    newHTML += char;
                }
            });

            heading.innerHTML = newHTML;
        });

        // Add click handlers to dilatable letters
        document.querySelectorAll('.dilatable-letter').forEach(letter => {
            letter.addEventListener('click', (e) => {
                activateEasterEgg('dilation', e);
            });

            // Long press for mobile
            let dilationTimer = null;
            letter.addEventListener('touchstart', (e) => {
                dilationTimer = setTimeout(() => {
                    activateEasterEgg('dilation', e);
                }, LONG_PRESS_DURATION);
            });
            letter.addEventListener('touchend', () => clearTimeout(dilationTimer));
        });
    }

    // Apply after a short delay to ensure DOM is ready
    setTimeout(makeLettersDilatable, 500);

    // ============================================
    // EASTER EGG ACTIVATION
    // ============================================

    function activateEasterEgg(type, event) {
        console.log(`Easter egg activated: ${type}`);

        // Visual feedback
        createActivationEffect(event);

        // Navigate to hidden page or reveal content
        setTimeout(() => {
            if (window.location.pathname === '/') {
                window.location.href = '/hidden';
            } else {
                // Reveal hidden content on current page
                revealHiddenContent();
            }
        }, 800);
    }

    function createActivationEffect(event) {
        const x = event.clientX || (event.touches?.[0]?.clientX ?? window.innerWidth / 2);
        const y = event.clientY || (event.touches?.[0]?.clientY ?? window.innerHeight / 2);

        // Create ripple effect
        const ripple = document.createElement('div');
        ripple.className = 'easter-egg-ripple';
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        document.body.appendChild(ripple);

        setTimeout(() => ripple.remove(), 1000);

        // Flash effect
        document.body.style.animation = 'easter-egg-flash 0.6s ease';
        setTimeout(() => {
            document.body.style.animation = '';
        }, 600);
    }

    function revealHiddenContent() {
        const hiddenElements = document.querySelectorAll('.hidden-content');
        hiddenElements.forEach(el => {
            el.classList.remove('hidden');
            el.classList.add('revealed');
        });
    }

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================

    function isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    // ============================================
    // CSS INJECTION FOR EFFECTS
    // ============================================

    const style = document.createElement('style');
    style.textContent = `
        .dilatable-letter {
            display: inline-block;
            transition: transform 0.3s ease, color 0.3s ease;
            cursor: pointer;
        }

        .dilatable-letter:hover {
            transform: scale(1.3) translateY(-2px);
            color: var(--neon-pink);
            text-shadow: 0 0 20px var(--neon-pink-glow);
        }

        .easter-egg-ripple {
            position: fixed;
            width: 100px;
            height: 100px;
            border-radius: 50%;
            background: radial-gradient(
                circle,
                var(--neon-pink) 0%,
                var(--neon-orange) 50%,
                transparent 70%
            );
            transform: translate(-50%, -50%) scale(0);
            animation: ripple-expand 1s ease-out forwards;
            pointer-events: none;
            z-index: 9999;
        }

        @keyframes ripple-expand {
            to {
                transform: translate(-50%, -50%) scale(8);
                opacity: 0;
            }
        }

        @keyframes easter-egg-flash {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; filter: brightness(1.3); }
        }

        .hidden-content {
            opacity: 0;
            transform: translateY(20px);
            pointer-events: none;
            transition: all 0.8s ease;
        }

        .hidden-content.revealed {
            opacity: 1;
            transform: translateY(0);
            pointer-events: all;
        }
    `;
    document.head.appendChild(style);

});
