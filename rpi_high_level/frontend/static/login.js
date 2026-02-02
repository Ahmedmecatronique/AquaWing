document.addEventListener('DOMContentLoaded', function(){
  const form = document.querySelector('.login-form');
  const usernameInput = form.querySelector('input[name="username"]');
  const passwordInput = form.querySelector('input[name="password"]');
  const remember = form.querySelector('input[name="remember"]');

  // Populate username if remembered
  try{
    const saved = localStorage.getItem('aqua_username');
    if(saved){ usernameInput.value = saved; remember.checked = true; }
  }catch(e){}

  form.addEventListener('submit', function(e){
    // small client-side validation
    if(!usernameInput.value.trim() || !passwordInput.value.trim()){
      e.preventDefault();
      // simple visual feedback
      form.animate([{transform:'translateX(0)'},{transform:'translateX(-8px)'},{transform:'translateX(8px)'},{transform:'translateX(0)'}],{duration:300});
      return false;
    }

    // remember username if asked
    try{
      if(remember.checked) localStorage.setItem('aqua_username', usernameInput.value.trim());
      else localStorage.removeItem('aqua_username');
    }catch(e){}

    // allow form to submit (POST to /login)
  });

  // --- Inject CTA buttons (non-intrusive, respects existing HTML/logic) ---
  try {
    const wrap = document.querySelector('.login-wrap');
    if (wrap) {
      const ctaWrap = document.createElement('div');
      ctaWrap.className = 'login-ctas';

      const primary = document.createElement('a');
      primary.className = 'cta-primary';
      primary.href = '#';
      primary.textContent = 'Get Started';
      primary.setAttribute('role','button');
      primary.addEventListener('click', (ev) => {
        ev.preventDefault();
        // Focus the username input and add a subtle pulse to the login box
        usernameInput.focus();
        const box = document.querySelector('.login-box');
        if (box) {
          box.animate([{transform: 'translateY(0)'},{transform:'translateY(-6px)'},{transform:'translateY(0)'}], {duration:380, easing:'ease-out'});
        }
      });

      const secondary = document.createElement('a');
      secondary.className = 'cta-secondary';
      secondary.href = 'mailto:contact@aqua-wing.local';
      secondary.textContent = 'Contact Us';
      secondary.setAttribute('role','button');

      ctaWrap.appendChild(primary);
      ctaWrap.appendChild(secondary);

      wrap.appendChild(ctaWrap);
    }
  } catch (e) { /* silent */ }
});
