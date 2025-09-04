import React from 'react';
import './TamilConstructionPage.css';

const TamilConstructionPage = () => {
  return (
    <div className="container">
      {/* Main Tamil watermark background */}
      <div className="tamil-watermark main-watermark">
        சத்தியத்தின் உருவாக்கம்
      </div>

      {/* Additional Tamil Verses (Thirukkural) */}
      {/* Kural 295: Speaking truth with a pure heart is superior to tapas and dana */}
      <div className="tamil-watermark verse-watermark top-left">
        மனத்தொடு வாய்மை மொழியின்<br />தவத்தொடு தானஞ்செய் வாரின் தலை.
      </div>
      
      {/* Kural 423: Wisdom is discerning the true essence of whatever is heard, regardless of who says it. */}
      <div className="tamil-watermark verse-watermark bottom-right">
        எப்பொருள் யார்யார்வாய்க் கேட்பினும் அப்பொருள்<br />மெய்ப்பொருள் காண்பது அறிவு.
      </div>

      <h1>just as around an inside cl4y the emptiness of a pot</h1>

      <p>
        as such recognize the self as an <span className="absence">absence</span> that words alone create the possibility for
      </p>

      <div className="scrolling-mantra">
        {/* Expanded scrolling mantra with Kalabhairava Ashtakam snippets */}
        <span>
          ॐ&nbsp;कालभैरवाय&nbsp;नमः&nbsp;BHAIRAVA&nbsp;OM&nbsp;
          <span className="tamil-text">ஓம்&nbsp;காலபைரவாய&nbsp;நமः</span>&nbsp;
          ॥&nbsp;कालकालमंबुजाक्षमक्षशूलमक्षरं&nbsp;॥&nbsp;
          ॐ&nbsp;कालभैरवाय नमः&nbsp;OM&nbsp;BHAIRAVA&nbsp;
          ॥&nbsp;मृत्युदर्पनाशनं&nbsp;॥&nbsp;
          ॐ कालभैरवाय नमः&nbsp;
        </span>
      </div>

      {/* SoundCloud Hidden Embed for Autoplay (Boris REM) */}
      {/* Track ID 1835787867 used based on previous context */}
      <iframe
        width="0"
        height="0"
        scrolling="no"
        frameBorder="no"
        allow="autoplay"
        src="https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/1835787867&color=%23ff5500&auto_play=true&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true"
        title="SoundCloud Autoplay"
      ></iframe>
    </div>
  );
};

export default TamilConstructionPage;
