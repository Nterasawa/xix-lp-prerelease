/* Simple lightbox — click any .feature-shot or .trust-slider image to open */
(function () {
  'use strict';

  const dialog = document.getElementById('lightbox');
  if (!dialog) return;

  const imgEl = dialog.querySelector('.lightbox-img');
  const capEl = dialog.querySelector('.lightbox-caption');
  const counterEl = dialog.querySelector('.lightbox-counter');
  const btnClose = dialog.querySelector('.lightbox-close');
  const btnPrev = dialog.querySelector('.lightbox-prev');
  const btnNext = dialog.querySelector('.lightbox-next');

  // Collect all lightbox-eligible images
  const imgs = Array.from(document.querySelectorAll('.feature-shot img, .trust-slider img'));
  let currentIndex = -1;

  function open(index) {
    currentIndex = index;
    const img = imgs[index];
    imgEl.src = img.src;
    imgEl.alt = img.alt || '';
    const fig = img.closest('figure');
    const cap = fig ? fig.querySelector('figcaption') : null;
    capEl.textContent = cap ? cap.textContent.trim() : (img.alt || '');
    counterEl.textContent = (index + 1) + ' / ' + imgs.length;
    if (!dialog.open) dialog.showModal();
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (dialog.open) dialog.close();
    document.body.style.overflow = '';
  }

  function prev() { open((currentIndex - 1 + imgs.length) % imgs.length); }
  function next() { open((currentIndex + 1) % imgs.length); }

  imgs.forEach((img, i) => {
    img.style.cursor = 'zoom-in';
    img.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      open(i);
    });
  });

  btnClose.addEventListener('click', close);
  btnPrev.addEventListener('click', prev);
  btnNext.addEventListener('click', next);

  // Close on backdrop click
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });

  // Keyboard navigation
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'ArrowRight') next();
  });

  // Native close event
  dialog.addEventListener('close', () => {
    document.body.style.overflow = '';
  });
})();
