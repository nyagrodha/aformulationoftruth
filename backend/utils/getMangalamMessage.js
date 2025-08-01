//mangalam variants
export function getMangalamMessage() {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();

  // Bhairava: 01:00–01:14
  if (hour === 1 && minute >= 0 && minute <= 14) {
    return `
      <p style="color: #f99; font-size: 14px; font-style: italic;">
        At this hour, Lord Bhairava walks the seam between worlds. As Abhinavagupta taught in the <em>Tantrasāra</em>:<br/><br/>
        “Fix your gaze on a point upon the wall. Let your eyes remain gently open. As the breath leaves the body, attend to the resting point just beyond the tip of the nose. There, in that break — Bhairava.”<br/><br/>
        <strong>This link is no link at all — it is that pause before becoming.</strong>
      </p>`;
  }

  // Ardhanārīśvara: 00:00–00:20
  if (hour === 0 && minute <= 20) {
    return `
      <p style="color: #fefefe; font-size: 14px; font-style: italic;">
        In this quietest hour, Śiva is not alone.<br/><br/>
        He walks as Ardhanārīśvara — left side moon-soft with Śakti, right side ash-smeared with stillness.<br/>
        The breath curls inward, neither masculine nor feminine, neither word nor silence.<br/><br/>
        <strong>This link bears the trace of both: the motionless and the becoming.</strong>
      </p>`;
  }

  // Morning Mangalam: < 12:00 PM
  if (hour < 12) {
    return `
      <p style="color: #9ef; font-size: 14px;">
        <em>Your day’s dose of morning mangalam in a link!</em>
      </p>`;
  }

  // Default: No mangalam
  return '';
}
