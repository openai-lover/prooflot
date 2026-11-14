// Keep the original key so the redesign does not interrupt returning visitors.
const key = 'botpassport-first-visit-v1';
const dialog = document.querySelector('#intro-dialog');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const chapters = [
  { title: ['Your bot.', 'Ready for the market.'], caption: 'Upload your bot. Sell it with the evidence.', duration: 3900 },
  { title: ['See the returns.', 'Know the risks.'], caption: 'Backtest on the same data. See what needs a closer look.', duration: 4800 },
  { title: ['Buy the version', 'you just tested.'], caption: 'Inspect. Purchase. Download. Test again.', duration: 4300 },
];
const heading = dialog.querySelector('#intro-heading');
const caption = dialog.querySelector('#intro-caption');
const playButton = dialog.querySelector('#intro-play');
const stepButtons = [...dialog.querySelectorAll('[data-intro-step]')];
const scenes = [...dialog.querySelectorAll('.intro-scene')];
const poster = dialog.querySelector('.intro-object img');
const stage = dialog.querySelector('.intro-visual');
let step = 0, elapsed = 0, lastTime = 0, frame = 0, generation = 0;
let playing = false, previousFocus, textAnimation;
let exiting = false, closingFromIntro = false;

function seen() {
  try { return localStorage.getItem(key) === 'seen'; }
  catch { try { return sessionStorage.getItem(key) === 'seen'; } catch { return false; } }
}
function remember() {
  try { localStorage.setItem(key, 'seen'); }
  catch { try { sessionStorage.setItem(key, 'seen'); } catch { /* Replay remains available in private browsers. */ } }
}
const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => 1 - Math.pow(1 - clamp(value), 3);

function paint() {
  const progress = clamp(elapsed / chapters[step].duration);
  dialog.style.setProperty('--intro-progress', progress);
  dialog.style.setProperty('--intro-reveal', ease((progress - .1) / .26));
  dialog.style.setProperty('--intro-detail', ease((progress - .35) / .25));
  dialog.style.setProperty('--intro-draw', clamp((progress - .15) / .53));
  dialog.style.setProperty('--intro-float', (reduced.matches ? 0 : Math.sin(progress * Math.PI * 2) * -5) + 'px');
}

function showStep(next, progress = 0) {
  step = Math.max(0, Math.min(2, next));
  elapsed = chapters[step].duration * progress;
  dialog.dataset.step = String(step);
  scenes.forEach((scene, index) => scene.setAttribute('aria-hidden', String(index !== step)));
  stepButtons.forEach((button, index) => {
    button.setAttribute('aria-current', index === step ? 'step' : 'false');
    button.dataset.complete = String(index < step);
  });
  heading.children[0].textContent = chapters[step].title[0];
  heading.children[1].textContent = chapters[step].title[1];
  caption.textContent = chapters[step].caption;
  dialog.querySelector('#intro-announcement').textContent = chapters[step].title.join(' ') + ' ' + chapters[step].caption;
  textAnimation?.cancel();
  if (!reduced.matches && dialog.open) {
    textAnimation = dialog.querySelector('.intro-message').animate(
      [{ opacity: 0, transform: 'translateY(15px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 650, easing: 'cubic-bezier(.22,1,.36,1)' },
    );
  }
  paint();
}

function syncPlayback() {
  dialog.dataset.playing = String(playing);
  const ended = step === 2 && elapsed >= chapters[2].duration;
  playButton.dataset.mode = playing ? 'pause' : ended ? 'replay' : 'play';
  playButton.setAttribute('aria-label', playing ? 'Pause introduction' : ended ? 'Replay introduction' : 'Play introduction');
  playButton.title = playButton.getAttribute('aria-label');
}
function tick(time) {
  frame = 0;
  if (!playing || !dialog.open || document.hidden) { lastTime = 0; return; }
  // Background tabs and suspended devices must not jump past whole chapters.
  if (lastTime) elapsed += Math.min(time - lastTime, 80);
  lastTime = time;
  if (elapsed >= chapters[step].duration) {
    if (step < 2) showStep(step + 1);
    else { elapsed = chapters[2].duration; playing = false; syncPlayback(); }
  }
  paint();
  if (playing) frame = requestAnimationFrame(tick);
}
function setPlaying(value) {
  playing = value && !reduced.matches;
  cancelAnimationFrame(frame);
  frame = 0;
  lastTime = 0;
  syncPlayback();
  if (playing && !document.hidden) frame = requestAnimationFrame(tick);
}
function chooseStep(next) {
  setPlaying(false);
  showStep(next, 1);
  syncPlayback();
}
function fitStage() {
  if (!dialog.open) return;
  const { width, height } = stage.getBoundingClientRect();
  stage.style.setProperty('--intro-scale', Math.min(width / 600, height / 480, 1.15));
}
new ResizeObserver(fitStage).observe(stage);

export async function openIntro() {
  if (dialog.open || exiting) return;
  const current = ++generation;
  previousFocus = document.activeElement;
  dialog.showModal();
  remember();
  dialog.dataset.ready = 'false';
  playButton.hidden = reduced.matches;
  showStep(reduced.matches ? 2 : 0, reduced.matches ? 1 : 0);
  setPlaying(false);
  fitStage();
  dialog.querySelector('#intro-skip').focus({ preventScroll: true });
  if (!poster.hasAttribute('src')) poster.src = poster.dataset.src;
  const assets = Promise.allSettled([
    poster.decode(),
    document.fonts.load('650 32px "Intro Pretendard"', 'Bot test'),
  ]);
  // Do not block the controls on a slow or failed asset.
  await Promise.race([assets, new Promise(resolve => setTimeout(resolve, 1300))]);
  if (current !== generation || !dialog.open) return;
  dialog.dataset.ready = 'true';
  if (!reduced.matches && elapsed === 0) setPlaying(true);
}

async function leaveIntro(destination) {
  if (!dialog.open || exiting) return;
  exiting = true; closingFromIntro = true; ++generation; setPlaying(false);
  const currentView = location.hash.slice(1) || 'market';
  const target = document.querySelector((destination || currentView) === 'studio' ? '#studio-passport' : '#hero-passport');
  const motion = !reduced.matches && !document.hidden;
  const shared = target && poster.complete && poster.naturalWidth > 0 && (destination || (currentView === 'market' && scrollY < 450));
  let swapped = false;
  const swap = async () => {
    if (swapped) return; swapped = true;
    poster.style.viewTransitionName = '';
    if (destination) {
      location.hash = destination;
      window.dispatchEvent(new CustomEvent('bp:navigate', { detail: destination }));
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    dialog.close();
    await new Promise(resolve => setTimeout(resolve, 0));
    if (shared && target.getBoundingClientRect().width) target.style.viewTransitionName = 'passport-object';
  };
  try {
    if (motion && typeof document.startViewTransition === 'function') {
      document.documentElement.setAttribute('data-intro-transition', '');
      if (shared) poster.style.viewTransitionName = 'passport-object';
      const transition = document.startViewTransition(swap);
      await transition.finished.catch(() => {});
    } else {
      if (motion) await dialog.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 230, easing: 'ease-out' }).finished;
      await swap();
      const view = document.querySelector('.view:not([hidden])');
      if (motion && view) await view.animate([{ opacity: 0, transform: 'translateY(9px)' }, { opacity: 1, transform: 'none' }], { duration: 430, easing: 'cubic-bezier(.22,1,.36,1)' }).finished;
    }
  } finally {
    await swap();
    poster.style.viewTransitionName = '';
    if (target) target.style.viewTransitionName = '';
    document.documentElement.removeAttribute('data-intro-transition');
    exiting = false;
    const focus = destination ? document.querySelector('#view-' + destination + ' h1') : previousFocus;
    focus?.focus({ preventScroll: true });
  }
}
stepButtons.forEach(button => button.addEventListener('click', () => chooseStep(Number(button.dataset.introStep))));
playButton.addEventListener('click', () => {
  if (playing) return setPlaying(false);
  if (elapsed >= chapters[step].duration) showStep(step === 2 ? 0 : step);
  setPlaying(true);
});
dialog.querySelector('#intro-skip').addEventListener('click', () => leaveIntro());
dialog.querySelector('#intro-start').addEventListener('click', () => leaveIntro('market'));
dialog.querySelector('#intro-create').addEventListener('click', () => leaveIntro('studio'));
dialog.addEventListener('cancel', event => { event.preventDefault(); leaveIntro(); });
document.querySelector('#replay-intro').addEventListener('click', openIntro);
dialog.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault();
    const next = Math.max(0, Math.min(2, step + (event.key === 'ArrowRight' ? 1 : -1)));
    chooseStep(next);
    stepButtons[next].focus();
  }
});
dialog.addEventListener('close', () => {
  ++generation;
  setPlaying(false);
  textAnimation?.cancel();
  if (closingFromIntro) closingFromIntro = false;
  else if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
});
document.addEventListener('visibilitychange', () => {
  cancelAnimationFrame(frame);
  frame = 0;
  lastTime = 0;
  if (!document.hidden && dialog.open && playing) frame = requestAnimationFrame(tick);
});
reduced.addEventListener('change', () => {
  playButton.hidden = reduced.matches;
  if (dialog.open && reduced.matches) chooseStep(step);
});

// A replay link does not reset the visitor's persistent first-visit preference.
const replayRequested = new URLSearchParams(location.search).get('intro') === '1';
if (replayRequested) {
  const cleanUrl = new URL(location.href);
  cleanUrl.searchParams.delete('intro');
  history.replaceState(history.state, '', cleanUrl);
}
if (replayRequested || !seen()) openIntro();

