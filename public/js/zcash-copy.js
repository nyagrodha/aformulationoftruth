function copyZcashAddress(event) {
  const address = document.getElementById('zcash-address').textContent;
  const button = event.target.closest('.copy-btn');
  const copyText = button.querySelector('.copy-text');

  navigator.clipboard.writeText(address).then(() => {
    copyText.textContent = 'Copied!';
    button.style.background = 'var(--peacock-blue)';
    button.style.color = 'var(--kolam-white)';

    setTimeout(() => {
      copyText.textContent = 'Copy';
      button.style.background = '';
      button.style.color = '';
    }, 2000);
  }).catch((err) => {
    console.error('clipboard write failed');
    copyText.textContent = 'Failed';
    setTimeout(() => {
      copyText.textContent = 'Copy';
    }, 2000);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const button = document.querySelector('.copy-btn');
  if (button) {
    button.addEventListener('click', copyZcashAddress);
  }
});
