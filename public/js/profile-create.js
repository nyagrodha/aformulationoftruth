// Progressive enhancement for /profile-create.
// Per-answer publishing is deferred; only visibility, nameplate, and mail opt-in are sent.
(function () {
  var form = document.querySelector('.profile-create-form');
  var btn = document.getElementById('profile-save-btn');
  if (!form || !btn) return;
  var status = document.getElementById('profile-save-status');

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function radio(name) {
    var nodes = document.getElementsByName(name);
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].checked) return nodes[i].value;
    }
    return '';
  }

  function say(msg) {
    if (status) status.textContent = msg;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var vis = radio('visibility');
    var visibility = vis === 'selected' ? 'public' : 'private';
    var acceptsAnonymousMail = vis === 'anonymous-mail';
    var handle = val('profile-handle').toLowerCase();

    if (visibility === 'public' && !handle) {
      say('A public profile needs a handle.');
      return;
    }

    var original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'saving…';
    say('');

    fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visibility: visibility,
        acceptsAnonymousMail: acceptsAnonymousMail,
        displayName: val('profile-name'),
        bio: val('profile-note'),
        handle: handle,
      }),
    }).then(function (res) {
      return res.json().catch(function () {
        return {};
      }).then(function (data) {
        if (res.ok) {
          window.location.href = data.handle ? ('/p/' + encodeURIComponent(data.handle)) : '/completion';
        } else {
          say(data.error || 'Could not save your profile.');
          btn.disabled = false;
          btn.textContent = original;
        }
      });
    }).catch(function () {
      say('Network error. Please try again.');
      btn.disabled = false;
      btn.textContent = original;
    });
  });
})();
