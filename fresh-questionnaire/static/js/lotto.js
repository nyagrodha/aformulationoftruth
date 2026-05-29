const enc = new TextEncoder();
const hex = (bytes) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
async function sha256(text) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

document.getElementById("salt").value = hex(
  crypto.getRandomValues(new Uint8Array(16)),
);
document.getElementById("commit").onclick = async () => {
  const secret = document.getElementById("secret").value;
  const salt = document.getElementById("salt").value;
  document.getElementById("commitment").textContent = await sha256(
    `${salt}:${secret}`,
  );
};
document.getElementById("submit").onclick = async () => {
  const commitment = document.getElementById("commitment").textContent.trim();
  const res = await fetch("/api/lotto/commit", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/json",
    },
    body: JSON.stringify({ commitment, participant_token: "browser" }),
  });
  document.getElementById("receipt").textContent = JSON.stringify(
    await res.json(),
    null,
    2,
  );
};
document.getElementById("verify").onclick = async () => {
  const proof = document.getElementById("proof").value.split(/\n+/).map((s) =>
    s.trim()
  ).filter(Boolean);
  const body = {
    commitment: verifyCommitment.value,
    proof,
    leaf_index: leafIndex.value,
    merkle_root: root.value,
  };
  const res = await fetch("/api/lotto/verify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/json",
    },
    body: JSON.stringify(body),
  });
  document.getElementById("verification").textContent = JSON.stringify(
    await res.json(),
    null,
    2,
  );
};
