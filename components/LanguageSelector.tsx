import type { LanguageMode } from '../lib/language.ts';

const OPTIONS: Array<{ mode: LanguageMode; label: string; hint: string }> = [
  { mode: 'all', label: 'all', hint: 'Tamil, transliteration, English' },
  { mode: 'tamil-only', label: 'ta', hint: 'Tamil only' },
  { mode: 'tamil-translit', label: 'ta+tr', hint: 'Tamil and transliteration' },
  { mode: 'english-only', label: 'en', hint: 'English only' },
  { mode: 'spanish-only', label: 'es', hint: 'Spanish only' },
];

interface LanguageSelectorProps {
  currentMode: LanguageMode;
}

export default function LanguageSelector({ currentMode }: LanguageSelectorProps) {
  return (
    <div class='language-selector' role='group' aria-label='Language preference'>
      <span class='language-selector__label'>Language</span>
      <div class='language-selector__options'>
        {OPTIONS.map((option) => (
          <button
            type='button'
            class='language-selector__button'
            data-lang-mode-option={option.mode}
            aria-pressed={option.mode === currentMode}
            title={option.hint}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
