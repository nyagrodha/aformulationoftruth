const enc = new TextEncoder();
const hex = (bytes) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
async function sha256(text) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

document.getElementById('salt').value = hex(
  crypto.getRandomValues(new Uint8Array(16)),
);
document.getElementById('commit').onclick = async () => {
  const secret = document.getElementById('secret').value;
  const salt = document.getElementById('salt').value;
  document.getElementById('commitment').textContent = await sha256(
    `${salt}:${secret}`,
  );
};
/*
 * Both handlers below post and then render res.json(). Neither failure mode was
 * handled: an offline fetch rejects, and a 502 whose body is an HTML error page
 * makes res.json() reject. Either way the onclick promise rejected unhandled
 * and the output element kept whatever it showed before -- so a failed submit
 * left the PREVIOUS receipt on screen, which reads exactly like a successful
 * one. Report the failure where the result would have gone.
 */
async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return await res.json();
}

function render(id, value) {
  document.getElementById(id).textContent = JSON.stringify(value, null, 2);
}

function renderError(id, err) {
  document.getElementById(id).textContent = `request failed: ${err.message}`;
}

document.getElementById('submit').onclick = async () => {
  const commitment = document.getElementById('commitment').textContent.trim();
  try {
    render(
      'receipt',
      await postJson('/api/lotto/commit', {
        commitment,
        participant_token: 'browser',
      }),
    );
  } catch (err) {
    renderError('receipt', err);
  }
};
document.getElementById('verify').onclick = async () => {
  const verifyCommitmentEl = document.getElementById('verifyCommitment');
  const leafIndexEl = document.getElementById('leafIndex');
  const rootEl = document.getElementById('root');
  const proof = document.getElementById('proof').value.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const body = {
    commitment: verifyCommitmentEl.value,
    proof,
    leaf_index: leafIndexEl.value,
    merkle_root: rootEl.value,
  };
  try {
    render('verification', await postJson('/api/lotto/verify', body));
  } catch (err) {
    renderError('verification', err);
  }
};
