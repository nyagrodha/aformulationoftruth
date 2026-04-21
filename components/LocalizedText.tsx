import type { JSX } from 'preact';

interface LocalizedTextProps {
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  tamil?: string;
  transliteration?: string;
  english?: string;
  spanish?: string;
  [key: string]: unknown;
}

export default function LocalizedText(props: LocalizedTextProps) {
  const {
    as = 'div',
    className,
    tamil,
    transliteration,
    english,
    spanish,
    ...rest
  } = props;
  const Tag = as;

  return (
    <Tag class={className} {...rest}>
      {tamil && <span class='lang-layer lang-layer--tamil' lang='ta'>{tamil}</span>}
      {transliteration && (
        <span class='lang-layer lang-layer--translit' lang='ta-Latn'>{transliteration}</span>
      )}
      {english && <span class='lang-layer lang-layer--english'>{english}</span>}
      {spanish && <span class='lang-layer lang-layer--spanish' lang='es'>{spanish}</span>}
    </Tag>
  );
}
