// Landing Page Interactions

document.addEventListener('DOMContentLoaded', () => {

    // ============================================
    // ARCHETYPE BUTTON - Reveal DOPAMINA
    // ============================================

    const archetypeButtons = document.querySelectorAll('.archetype-button');

    archetypeButtons.forEach(button => {
        button.addEventListener('click', function() {
            const archetype = this.dataset.archetype;

            if (archetype === 'lover') {
                const dopaminaReveal = document.getElementById('dopamina-reveal');
                if (dopaminaReveal) {
                    dopaminaReveal.classList.toggle('active');

                    // Animate button
                    this.style.transform = 'scale(0.9)';
                    setTimeout(() => {
                        this.style.transform = 'scale(1)';
                    }, 200);
                }
            }
        });
    });

    // ============================================
    // NAV TRIGGER ZONE - Touch support
    // ============================================

    const navTrigger = document.querySelector('.nav-trigger-zone');
    const breadcrumbNav = document.querySelector('.breadcrumb-nav');

    if (navTrigger && breadcrumbNav) {
        let touchTimer;

        navTrigger.addEventListener('touchstart', () => {
            navTrigger.classList.add('touched');
            breadcrumbNav.classList.add('touched');

            // Auto-hide after 5 seconds
            clearTimeout(touchTimer);
            touchTimer = setTimeout(() => {
                navTrigger.classList.remove('touched');
                breadcrumbNav.classList.remove('touched');
            }, 5000);
        });

        // Hide on touch outside
        document.addEventListener('touchstart', (e) => {
            if (!navTrigger.contains(e.target) && !breadcrumbNav.contains(e.target)) {
                navTrigger.classList.remove('touched');
                breadcrumbNav.classList.remove('touched');
            }
        });
    }

    // ============================================
    // TIME-BASED THEME MODIFIER
    // Based on solar data from Pondicherry
    // ============================================

    function updateTimeTheme() {
        const now = new Date();
        const hour = now.getHours();

        // Simplified day/night cycle
        // Dawn: 5-7, Day: 7-17, Twilight: 17-19, Night: 19-5
        const body = document.body;

        body.classList.remove('time-day', 'time-night', 'time-twilight');

        if (hour >= 5 && hour < 7) {
            body.classList.add('time-twilight');
        } else if (hour >= 7 && hour < 17) {
            body.classList.add('time-day');
        } else if (hour >= 17 && hour < 19) {
            body.classList.add('time-twilight');
        } else {
            body.classList.add('time-night');
        }
    }

    // Update theme immediately and every 10 minutes
    updateTimeTheme();
    setInterval(updateTimeTheme, 600000);

    // ============================================
    // TOR DETECTION - Noir mode
    // ============================================

    function detectTor() {
        // Check if accessed via .onion domain
        if (window.location.hostname.endsWith('.onion')) {
            document.body.classList.add('noir-mode');
        }
    }

    detectTor();

});
