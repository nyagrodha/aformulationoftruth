// backend/public/questionnaire.js

document.addEventListener('DOMContentLoaded', () => {
  // For now, prompt for the user’s email.
  const email = prompt('Enter your email to begin:');
  const container = document.getElementById('question-list');

  async function loadNext() {
    const res  = await fetch(`/api/questions/next?email=${encodeURIComponent(email)}`);
    const data = await res.json();
    container.innerHTML = '';

    if (data.completed) {
      container.innerHTML = '<h2>🎉 You’ve completed the questionnaire!</h2>';
      return;
    }

    const { id, text } = data;
    container.innerHTML = `
      <p>${text}</p>
      <textarea id="answer" rows="4" style="width:100%"></textarea><br/>
      <button id="submit">Next</button>
    `;
    document.getElementById('submit').onclick = async () => {
      const answer = document.getElementById('answer').value.trim();
      if (!answer) return alert('Please enter an answer.');
      await fetch('/api/answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, questionId: id, answer })
      });
      loadNext();
    };
  }

  loadNext();
});
