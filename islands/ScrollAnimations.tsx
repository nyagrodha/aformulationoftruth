/**
 * ScrollAnimations Island
 *
 * Handles smooth-scroll for anchor links and
 * IntersectionObserver fade-in for sections.
 */

import { useEffect } from 'preact/hooks';

export default function ScrollAnimations() {
  useEffect(() => {
    // Smooth scroll for anchor links
    const anchors = document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]');
    const handleClick = (e: Event) => {
      e.preventDefault();
      const anchor = e.currentTarget as HTMLAnchorElement;
      const href = anchor.getAttribute('href');
      if (!href) return;
      const target = document.querySelector(href);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
    anchors.forEach((a) => a.addEventListener('click', handleClick));

    // Intersection Observer for scroll animations
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' },
    );

    const sections = document.querySelectorAll<HTMLElement>(
      '.section-inner, .gate-content',
    );
    sections.forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(30px)';
      el.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
      observer.observe(el);
    });

    return () => {
      anchors.forEach((a) => a.removeEventListener('click', handleClick));
      observer.disconnect();
    };
  }, []);

  // Render nothing — this island is purely side-effects
  return null;
}
