//frontend/public/questionnaire.js

document.addEventListener('DOMContentLoaded', () => {
  const email = /* get the user’s email from your auth context or prompt */;
  const container = document.getElementById('question-list');

  function loadNext() {
    fetch(`/api/questions/next?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(data => {
        container.innerHTML = '';
        if (data.completed) {
          container.textContent = '🎉 You’ve completed the questionnaire!';
          return;
        }
        const { id, text } = data;
        const qDiv = document.createElement('div');
        qDiv.innerHTML = `
          <p>${text}</p>
          <textarea id="answer" rows="3" style="width:100%"></textarea>
          <button id="submit">Next</button>
        `;
        container.appendChild(qDiv);

        document.getElementById('submit').addEventListener('click', () => {
          const answerText = document.getElementById('answer').value.trim();
          if (!answerText) return alert('Please enter an answer.');
          fetch('/api/answers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, questionId: id, answerText })
          })
          .then(r => r.json())
          .then(() => loadNext())
          .catch(console.error);
        });
      })
      .catch(console.error);
  }

  loadNext();
});
