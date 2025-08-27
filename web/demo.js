// Password Strength Tester Demo JS

document.getElementById('togglePw').addEventListener('click', function() {
  const pwInput = document.getElementById('pw');
  if (pwInput.type === "password") {
    pwInput.type = "text";
    this.innerHTML = "&#128064;";
  } else {
    pwInput.type = "password";
    this.innerHTML = "&#128065;";
  }
});

function updateStrengthBar(score) {
  const bar = document.getElementById('strength-bar').children;
  for (let i = 0; i < 4; i++) {
    bar[i].className = (i <= score) ? `active-${score}` : '';
  }
  document.getElementById('strength-desc').textContent =
    ["Very weak","Weak","Fair","Good","Excellent"][score];
}

async function sha1Hex(str) {
  const enc = new TextEncoder();
  const data = enc.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2,'0')).join('').toUpperCase();
}

document.getElementById('pw').addEventListener('input', () => {
  const pw = document.getElementById('pw').value;
  const z = zxcvbn(pw);
  updateStrengthBar(z.score);
  let msg = `<span class="success">Strength: ${z.score}/4 (${["Very weak","Weak","Fair","Good","Excellent"][z.score]})</span>\n`;
  if (z.feedback.suggestions.length) msg += `<span class="suggestion">Suggestions: ${z.feedback.suggestions.join("; ")}</span>`;
  document.getElementById('out').innerHTML = msg;
});

document.getElementById('check').addEventListener('click', async () => {
  const pw = document.getElementById('pw').value;
  const out = document.getElementById('out');
  if (!pw) { out.innerHTML = '<span class="danger">Please enter a password.</span>'; return; }
  out.innerHTML = 'Checking...';
  const h = await sha1Hex(pw);
  const prefix = h.slice(0,5);
  const suffix = h.slice(5);
  try {
    const res = await fetch('/api/v1/pwned-range', {
      method:'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ prefix })
    });
    if (!res.ok) {
      out.innerHTML = '<span class="danger">Error contacting the server.</span>';
      return;
    }
    const data = await res.json();
    const found = data.results.find(r => r.suffix === suffix);
    const z = zxcvbn(pw);
    updateStrengthBar(z.score);
    let msg = '';
    if (found) {
      msg += `<span class="danger">⚠️ This password has been exposed!<br>Count: ${found.count}</span><br><br>`;
    } else {
      msg += '<span class="success">✅ This password was not found in known leaks.</span><br><br>';
    }
    msg += `<span class="success">Strength: ${z.score}/4 (${["Very weak","Weak","Fair","Good","Excellent"][z.score]})</span><br>`;
    if (z.feedback.suggestions.length) msg += `<span class="suggestion">Suggestions: ${z.feedback.suggestions.join("; ")}</span>`;
    msg += `<div class="meta">Checked at: ${new Date().toLocaleTimeString()}</div>`;
    out.innerHTML = msg;
  } catch (e) {
    out.innerHTML = '<span class="danger">Error contacting the server.</span>';
  }
});
