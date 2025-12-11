// Smooth Scroll Reveal Animations

document.addEventListener('DOMContentLoaded', () => {

    // ============================================
    // INTERSECTION OBSERVER
    // Reveal sections as they scroll into view
    // ============================================

    const observerOptions = {
        root: null,
        rootMargin: '0px 0px -100px 0px', // Trigger slightly before element enters viewport
        threshold: [0, 0.1, 0.3, 0.5]
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Add visible class with staggered delay for child elements
                entry.target.classList.add('visible');

                // Stagger animation for child elements
                const children = entry.target.querySelectorAll('.image-container, .grid-item, .archetype-button');
                children.forEach((child, index) => {
                    setTimeout(() => {
                        child.classList.add('animate-on-scroll');
                    }, index * 150); // 150ms stagger
                });

                // Stop observing once revealed
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe all sections
    const sections = document.querySelectorAll('section');
    sections.forEach(section => {
        if (!section.classList.contains('visible')) {
            observer.observe(section);
        }
    });

    // ============================================
    // PARALLAX EFFECT ON SCROLL
    // Subtle movement on hero and images
    // ============================================

    let ticking = false;
    let lastScrollY = window.scrollY;

    function updateParallax() {
        const scrolled = window.scrollY;

        // Hero parallax
        const hero = document.querySelector('.hero-image');
        if (hero) {
            const parallaxSpeed = 0.3;
            const yPos = -(scrolled * parallaxSpeed);
            hero.style.transform = `translateY(${yPos}px) scale(${1 + scrolled * 0.0001})`;
        }

        // Float images slightly
        const floatingImages = document.querySelectorAll('.floating-image:not(.hero-image)');
        floatingImages.forEach((img, index) => {
            const speed = 0.1 + (index * 0.05);
            const yPos = -(scrolled * speed);
            img.style.transform = `translateY(${yPos}px)`;
        });

        ticking = false;
    }

    function requestTick() {
        if (!ticking) {
            requestAnimationFrame(updateParallax);
            ticking = true;
        }
    }

    window.addEventListener('scroll', requestTick, { passive: true });

    // ============================================
    // SMOOTH SCROLL TO ANCHORS
    // ============================================

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();

            const targetId = this.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);

            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // ============================================
    // FADE IN ON PAGE LOAD
    // ============================================

    function fadeInPage() {
        document.body.style.opacity = '0';
        setTimeout(() => {
            document.body.style.transition = 'opacity 0.8s ease';
            document.body.style.opacity = '1';
        }, 100);
    }

    // Only fade in on initial load, not on back button
    if (!window.performance || performance.navigation.type !== 2) {
        fadeInPage();
    }

    // ============================================
    // PROGRESS INDICATOR
    // Shows scroll progress at top of page
    // ============================================

    function createProgressBar() {
        const progressBar = document.createElement('div');
        progressBar.className = 'scroll-progress';
        progressBar.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 0%;
            height: 3px;
            background: linear-gradient(90deg, var(--neon-pink) 0%, var(--neon-orange) 100%);
            box-shadow: 0 0 10px var(--neon-pink-glow);
            z-index: 10000;
            transition: width 0.1s ease;
        `;
        document.body.appendChild(progressBar);

        return progressBar;
    }

    const progressBar = createProgressBar();

    function updateProgressBar() {
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        const scrollTop = window.scrollY;

        const scrollPercent = (scrollTop / (documentHeight - windowHeight)) * 100;
        progressBar.style.width = `${Math.min(scrollPercent, 100)}%`;
    }

    window.addEventListener('scroll', updateProgressBar, { passive: true });
    updateProgressBar(); // Initial call

    // ============================================
    // IMAGE LOADING EFFECT
    // Fade in images as they load
    // ============================================

    const images = document.querySelectorAll('img');
    images.forEach(img => {
        if (img.complete) {
            img.classList.add('loaded');
        } else {
            img.addEventListener('load', () => {
                img.classList.add('loaded');
            });
        }
    });

    // Add loaded class CSS
    const imageStyle = document.createElement('style');
    imageStyle.textContent = `
        img {
            opacity: 0;
            transition: opacity 0.6s ease;
        }

        img.loaded {
            opacity: 1;
        }
    `;
    document.head.appendChild(imageStyle);

});
