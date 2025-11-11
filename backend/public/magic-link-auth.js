// public/js/magic-link-auth.js - Frontend email capture modal

class MagicLinkAuth {
  constructor(options = {}) {
    this.apiEndpoint = options.apiEndpoint || '/auth/magic-link';
    this.redirectUrl = options.redirectUrl || '/questionnaire';
    this.translations = this.getTranslations();
    this.currentLanguage = this.detectLanguage(options.defaultLanguage);
    this.init();
  }

  detectLanguage(defaultLang) {
    if (defaultLang) return defaultLang;

    // First try browser language
    const browserLang = navigator.language || navigator.userLanguage;
    const langCode = browserLang.split('-')[0].toLowerCase();

    // Map browser language codes to our supported languages
    const langMap = {
      'en': 'en',
      'ta': 'ta',
      'es': 'es',
      'uk': 'uk',
      'ru': 'uk' // Russian speakers might prefer Ukrainian
    };

    if (langMap[langCode]) {
      return langMap[langCode];
    }

    // Try to detect from IP geolocation (optional async)
    this.detectLanguageFromIP();

    return 'en'; // Default fallback
  }

  async detectLanguageFromIP() {
    try {
      // Use a free geolocation API
      const response = await fetch('https://ipapi.co/json/');
      if (response.ok) {
        const data = await response.json();
        const countryCode = data.country_code?.toLowerCase();

        // Map country codes to languages
        const countryLangMap = {
          'in': 'ta',  // India -> Tamil
          'lk': 'ta',  // Sri Lanka -> Tamil
          'es': 'es',  // Spain -> Spanish
          'mx': 'es',  // Mexico -> Spanish
          'ar': 'es',  // Argentina -> Spanish
          'co': 'es',  // Colombia -> Spanish
          'ua': 'uk',  // Ukraine -> Ukrainian
          'us': 'en',  // USA -> English
          'gb': 'en',  // UK -> English
          'ca': 'en',  // Canada -> English
          'au': 'en'   // Australia -> English
        };

        if (countryLangMap[countryCode] && this.currentLanguage === 'en') {
          this.setLanguage(countryLangMap[countryCode]);
        }
      }
    } catch (error) {
      console.log('Could not detect language from IP:', error);
    }
  }

  getTranslations() {
    return {
      en: {
        title: 'Access Required',
        description: 'Enter an address you receive email @ to access the questionnaire:',
        emailLabel: 'email address',
        placeholder: 'your@email.com',
        sendButton: 'Send Magic Link',
        sending: 'Sending...',
        successMessage: 'An apotropaic link was sent! Now you are to await that email...',
        successTitle: 'Huzzah!',
        errorMessage: 'Failed to send login link. Kindly try again.',
        invalidEmail: 'Please enter a valid email address.'
      },
      ta: {
        title: 'அனுமதி தேவை',
        description: 'கேள்வித்தாளை அணுக மின்னஞ்சல் முகவரியை உள்ளிடவும்:',
        emailLabel: 'மின்னஞ்சல் முகவரி',
        placeholder: 'உங்கள்@மின்னஞ்சல்.com',
        sendButton: 'மேஜிக் இணைப்பை அனுப்பு',
        sending: 'அனுப்புகிறது...',
        successMessage: 'ஒரு பாதுகாப்பு இணைப்பு அனுப்பப்பட்டது! இப்போது அந்த மின்னஞ்சலுக்காக காத்திருக்கவும்...',
        successTitle: 'வெற்றி!',
        errorMessage: 'உள்நுழைவு இணைப்பை அனுப்ப முடியவில்லை. தயவுசெய்து மீண்டும் முயற்சிக்கவும்.',
        invalidEmail: 'சரியான மின்னஞ்சல் முகவரியை உள்ளிடவும்.'
      },
      es: {
        title: 'Acceso Requerido',
        description: 'Ingresa una dirección de correo electrónico para acceder al cuestionario:',
        emailLabel: 'correo electrónico',
        placeholder: 'tu@correo.com',
        sendButton: 'Enviar Enlace Mágico',
        sending: 'Enviando...',
        successMessage: '¡Se envió un enlace apotropaico! Ahora espera ese correo...',
        successTitle: '¡Hurra!',
        errorMessage: 'No se pudo enviar el enlace de inicio de sesión. Por favor, inténtalo de nuevo.',
        invalidEmail: 'Por favor, ingresa una dirección de correo electrónico válida.'
      },
      uk: {
        title: 'Необхідний доступ',
        description: 'Введіть адресу електронної пошти для доступу до анкети:',
        emailLabel: 'електронна адреса',
        placeholder: 'ваша@пошта.com',
        sendButton: 'Надіслати магічне посилання',
        sending: 'Надсилання...',
        successMessage: 'Апотропаїчне посилання надіслано! Тепер чекайте на цей лист...',
        successTitle: 'Ура!',
        errorMessage: 'Не вдалося надіслати посилання для входу. Будь ласка, спробуйте ще раз.',
        invalidEmail: 'Будь ласка, введіть дійсну адресу електронної пошти.'
      }
    };
  }

  t(key) {
    return this.translations[this.currentLanguage]?.[key] || this.translations.en[key];
  }

  setLanguage(lang) {
    if (this.translations[lang]) {
      this.currentLanguage = lang;
      this.updateModalContent();
    }
  }

  init() {
    this.createEmailModal();
    this.attachEventListeners();
  }

  createEmailModal() {
    // Create modal HTML
    const modalHTML = `
      <div id="magic-link-modal" class="modal-overlay" style="display: none;">
        <div class="modal-content">
          <div class="modal-header">
            <h2 id="modal-title">${this.t('title')}</h2>
            <div class="language-selector">
              <button class="lang-btn" data-lang="en" title="English">EN</button>
              <button class="lang-btn" data-lang="ta" title="தமிழ்">த</button>
              <button class="lang-btn" data-lang="es" title="Español">ES</button>
              <button class="lang-btn" data-lang="uk" title="Українська">UA</button>
            </div>
            <button class="modal-close" aria-label="Close">&times;</button>
          </div>
          <div class="modal-body">
            <p id="modal-description">${this.t('description')}</p>
            <form id="magic-link-form" class="email-form">
              <div class="form-group">
                <label for="email-input" id="email-label">${this.t('emailLabel')}</label>
                <input
                  type="email"
                  id="email-input"
                  name="email"
                  required
                  placeholder="${this.t('placeholder')}"
                  class="email-input"
                />
              </div>
              <div class="form-actions">
                <button type="submit" class="btn-primary" id="send-magic-link">
                  <span class="btn-text" id="btn-text">${this.t('sendButton')}</span>
                  <span class="btn-loading" id="btn-loading" style="display: none;">${this.t('sending')}</span>
                </button>
              </div>
              <div id="form-message" class="form-message"></div>
            </form>
          </div>
        </div>
      </div>
    `;

    // Add modal to DOM
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Add CSS styles
    this.addStyles();
  }

  addStyles() {
    const styles = `
      <style>
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.8);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 10000;
          backdrop-filter: blur(5px);
        }

        .modal-content {
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          padding: 2rem;
          border-radius: 12px;
          max-width: 400px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding-bottom: 1rem;
          gap: 1rem;
        }

        .modal-header h2 {
          color: #ffffff;
          margin: 0;
          font-size: 1.5rem;
          font-weight: 600;
          flex: 1;
        }

        .language-selector {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .lang-btn {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #ffffff;
          padding: 0.4rem 0.6rem;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.85rem;
          transition: all 0.2s;
        }

        .lang-btn:hover {
          background: rgba(79, 70, 229, 0.3);
          border-color: #4f46e5;
        }

        .lang-btn.active {
          background: #4f46e5;
          border-color: #4f46e5;
        }

        .modal-close {
          background: none;
          border: none;
          color: #ffffff;
          font-size: 2rem;
          cursor: pointer;
          padding: 0;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: background-color 0.2s;
        }

        .modal-close:hover {
          background-color: rgba(255, 255, 255, 0.1);
        }

        .modal-body p {
          color: #cccccc;
          margin-bottom: 1.5rem;
          line-height: 1.6;
        }

        .form-group {
          margin-bottom: 1.5rem;
        }

        .form-group label {
          display: block;
          color: #ffffff;
          margin-bottom: 0.5rem;
          font-weight: 500;
        }

        .email-input {
          width: 100%;
          padding: 12px 16px;
          border: 2px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          background-color: rgba(255, 255, 255, 0.05);
          color: #ffffff;
          font-size: 1rem;
          transition: all 0.3s ease;
          box-sizing: border-box;
        }

        .email-input:focus {
          outline: none;
          border-color: #4f46e5;
          background-color: rgba(255, 255, 255, 0.1);
          box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
        }

        .email-input::placeholder {
          color: rgba(255, 255, 255, 0.5);
        }

        .form-actions {
          margin-bottom: 1rem;
        }

        .btn-primary {
          width: 100%;
          padding: 12px 24px;
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          color: #ffffff;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(79, 70, 229, 0.3);
        }

        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .btn-loading {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .form-message {
          padding: 0.75rem 1rem;
          border-radius: 6px;
          font-size: 0.9rem;
          text-align: center;
          margin-top: 1rem;
        }

        .form-message.success {
          background-color: rgba(34, 197, 94, 0.1);
          color: #22c55e;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }

        .form-message.error {
          background-color: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        @media (max-width: 480px) {
          .modal-content {
            margin: 1rem;
            padding: 1.5rem;
          }
        }
      </style>
    `;
    document.head.insertAdjacentHTML('beforeend', styles);
  }

  updateModalContent() {
    document.getElementById('modal-title').textContent = this.t('title');
    document.getElementById('modal-description').textContent = this.t('description');
    document.getElementById('email-label').textContent = this.t('emailLabel');
    document.getElementById('email-input').placeholder = this.t('placeholder');
    document.getElementById('btn-text').textContent = this.t('sendButton');
    document.getElementById('btn-loading').textContent = this.t('sending');

    // Update active language button
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === this.currentLanguage);
    });
  }

  attachEventListeners() {
    // Language selector
    document.addEventListener('click', (e) => {
      if (e.target.matches('.lang-btn')) {
        this.setLanguage(e.target.dataset.lang);
      }
    });

    // Show modal when auth-required buttons are clicked
    document.addEventListener('click', (e) => {
      if (e.target.matches('.auth-required, [data-auth-required]')) {
        e.preventDefault();
        this.showModal();
      }
    });

    // Close modal events
    document.addEventListener('click', (e) => {
      if (e.target.matches('.modal-close, .modal-overlay')) {
        this.hideModal();
      }
    });

    // Prevent modal from closing when clicking inside
    document.addEventListener('click', (e) => {
      if (e.target.matches('.modal-content, .modal-content *')) {
        e.stopPropagation();
      }
    });

    // Handle form submission
    document.addEventListener('submit', (e) => {
      if (e.target.matches('#magic-link-form')) {
        e.preventDefault();
        this.handleEmailSubmission(e.target);
      }
    });

    // ESC key to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideModal();
      }
    });
  }

  showModal() {
    const modal = document.getElementById('magic-link-modal');
    if (modal) {
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      
      // Focus on email input
      setTimeout(() => {
        const emailInput = document.getElementById('email-input');
        if (emailInput) emailInput.focus();
      }, 100);
    }
  }

  hideModal() {
    const modal = document.getElementById('magic-link-modal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
      this.resetForm();
    }
  }

  resetForm() {
    const form = document.getElementById('magic-link-form');
    const message = document.getElementById('form-message');
    
    if (form) form.reset();
    if (message) {
      message.textContent = '';
      message.className = 'form-message';
    }
  }

  async handleEmailSubmission(form) {
    const emailInput = form.querySelector('#email-input');
    const submitBtn = form.querySelector('#send-magic-link');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoading = submitBtn.querySelector('.btn-loading');
    const messageEl = document.getElementById('form-message');

    const email = emailInput.value.trim();

    if (!this.validateEmail(email)) {
      this.showMessage(this.t('invalidEmail'), 'error');
      return;
    }

    // Show loading state
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'block';
    this.clearMessage();

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email,
          redirectUrl: this.redirectUrl 
        })
      });

      const data = await response.json();

      if (response.ok) {
        this.showMessage(this.t('successMessage'), 'success');

        // Redirect to Bhairava waiting page after successful submission
        setTimeout(() => {
          this.hideModal();
          window.location.href = '/bhairava-await';
        }, 2000);
      } else {
        throw new Error(data.error || this.t('errorMessage'));
      }
    } catch (error) {
      console.error('Login link error:', error);
      this.showMessage(
        error.message || this.t('errorMessage'),
        'error'
      );
    } finally {
      // Reset button state
      submitBtn.disabled = false;
      btnText.style.display = 'block';
      btnLoading.style.display = 'none';
    }
  }

  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  showMessage(message, type) {
    const messageEl = document.getElementById('form-message');
    if (messageEl) {
      messageEl.textContent = message;
      messageEl.className = `form-message ${type}`;
    }
  }

  clearMessage() {
    const messageEl = document.getElementById('form-message');
    if (messageEl) {
      messageEl.textContent = '';
      messageEl.className = 'form-message';
    }
  }
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.magicLinkAuth = new MagicLinkAuth({
    apiEndpoint: '/auth/magic-link',
    redirectUrl: '/questionnaire'
  });
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MagicLinkAuth;
}
