/* ============================================
   XiX Landing Page - Pattern 01
   Main JavaScript
   ============================================ */

(function () {
  'use strict';

  // ========== NAVIGATION ==========
  const nav = document.getElementById('nav');
  const hamburger = document.getElementById('nav-hamburger');
  const mobileMenu = document.getElementById('nav-mobile');

  // Scroll behavior
  let lastScroll = 0;
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    nav.classList.toggle('scrolled', scrollY > 50);
    lastScroll = scrollY;
  });

  // Hamburger menu
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    mobileMenu.classList.toggle('open');
  });

  // Close mobile menu on link click
  document.querySelectorAll('.nav-mobile-link').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('active');
      mobileMenu.classList.remove('open');
    });
  });

  // ========== HERO CHART ==========
  function generateChartData(points) {
    const data = [];
    let value = 100;
    for (let i = 0; i < points; i++) {
      value += (Math.random() - 0.4) * 30;
      value = Math.max(20, Math.min(180, value));
      data.push(value);
    }
    return data;
  }

  function drawChart(data) {
    const svg = document.getElementById('hero-chart-svg');
    if (!svg) return;

    const width = 500;
    const height = 200;
    const padding = 5;
    const stepX = (width - padding * 2) / (data.length - 1);

    // Create smooth path
    let linePath = '';
    let areaPath = '';
    const points = data.map((v, i) => ({
      x: padding + i * stepX,
      y: height - padding - (v / 200) * (height - padding * 2)
    }));

    // Catmull-Rom to Bezier conversion for smooth curves
    function catmullRomToBezier(pts) {
      let d = `M ${pts[0].x},${pts[0].y}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(i - 1, 0)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(i + 2, pts.length - 1)];

        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
      }
      return d;
    }

    linePath = catmullRomToBezier(points);
    areaPath = linePath + ` L ${points[points.length - 1].x},${height} L ${points[0].x},${height} Z`;

    document.getElementById('chart-line').setAttribute('d', linePath);
    document.getElementById('chart-area').setAttribute('d', areaPath);

    // Position the animated dot at the last point
    const lastPoint = points[points.length - 1];
    const dot = document.getElementById('chart-dot');
    dot.setAttribute('cx', lastPoint.x);
    dot.setAttribute('cy', lastPoint.y);
  }

  // Initial chart draw
  let chartData = generateChartData(24);
  drawChart(chartData);

  // Update chart periodically
  setInterval(() => {
    chartData.shift();
    let lastVal = chartData[chartData.length - 1];
    let newVal = lastVal + (Math.random() - 0.4) * 25;
    newVal = Math.max(20, Math.min(180, newVal));
    chartData.push(newVal);
    drawChart(chartData);
  }, 3000);

  // ========== TICKER DUPLICATION ==========
  function setupTicker() {
    const content = document.getElementById('ticker-content');
    if (!content) return;
    // Duplicate content for seamless loop
    const clone = content.innerHTML;
    content.innerHTML = clone + clone;
  }
  setupTicker();

  // ========== SCROLL REVEAL ==========
  function setupReveal() {
    const revealElements = [
      ...document.querySelectorAll('.section-header'),
      ...document.querySelectorAll('.feature-card'),
      ...document.querySelectorAll('.comparison-card'),
      ...document.querySelectorAll('.comparison-divider'),
      ...document.querySelectorAll('.number-card'),
      ...document.querySelectorAll('.cta-content')
    ];

    revealElements.forEach(el => el.classList.add('reveal'));

    // Stagger grids
    document.querySelectorAll('.features-grid, .numbers-grid').forEach(el => {
      el.classList.add('reveal-stagger');
    });

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
        }
      });
    }, {
      threshold: 0.15,
      rootMargin: '0px 0px -50px 0px'
    });

    revealElements.forEach(el => observer.observe(el));
    document.querySelectorAll('.features-grid, .numbers-grid').forEach(el => observer.observe(el));
  }
  setupReveal();

  // ========== COUNT UP ANIMATION ==========
  function animateCount(element, target, duration) {
    const start = performance.now();
    const format = (num) => num.toLocaleString();

    function update(currentTime) {
      const elapsed = currentTime - start;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(eased * target);

      element.textContent = format(current);

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        element.textContent = format(target);
      }
    }

    requestAnimationFrame(update);
  }

  function setupCounters() {
    const counterMap = {
      'count-guests': 3009,
      'count-reporters': 1575
    };

    const counterCards = document.querySelectorAll('.number-card');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !entry.target.classList.contains('counted')) {
          entry.target.classList.add('counted');

          const countEl = entry.target.querySelector('.number-count');
          if (countEl && counterMap[countEl.id] !== undefined) {
            const target = counterMap[countEl.id];
            const duration = target > 10000 ? 2500 : target > 1000 ? 2000 : 1500;
            animateCount(countEl, target, duration);
          }
        }
      });
    }, {
      threshold: 0.3
    });

    counterCards.forEach(card => observer.observe(card));
  }
  setupCounters();

  // ========== COUNTDOWN TIMER ==========
  function updateCountdown() {
    const releaseDate = new Date('2026-04-25T00:00:00+09:00');
    const now = new Date();
    const diff = releaseDate - now;

    if (diff <= 0) {
      document.getElementById('countdown-days').textContent = '00';
      document.getElementById('countdown-hours').textContent = '00';
      document.getElementById('countdown-minutes').textContent = '00';
      document.getElementById('countdown-seconds').textContent = '00';
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    document.getElementById('countdown-days').textContent = String(days).padStart(2, '0');
    document.getElementById('countdown-hours').textContent = String(hours).padStart(2, '0');
    document.getElementById('countdown-minutes').textContent = String(minutes).padStart(2, '0');
    document.getElementById('countdown-seconds').textContent = String(seconds).padStart(2, '0');
  }

  updateCountdown();
  setInterval(updateCountdown, 1000);

  // ========== SMOOTH SCROLL FOR ANCHOR LINKS ==========
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const offsetTop = target.offsetTop - 80;
        window.scrollTo({
          top: offsetTop,
          behavior: 'smooth'
        });
      }
    });
  });

  // ========== FEATURE CARD GLOW FOLLOW MOUSE ==========
  document.querySelectorAll('.feature-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const glow = card.querySelector('.feature-card-glow');
      if (glow) {
        glow.style.left = x + 'px';
        glow.style.top = y + 'px';
        glow.style.transform = 'translate(-50%, -50%)';
      }
    });
  });

  // ========== HERO STAT RANDOM UPDATE ==========
  function randomHeroStat() {
    const el = document.getElementById('hero-stat-today');
    if (!el) return;
    const base = 142;
    const variation = Math.floor(Math.random() * 14) - 4;
    el.textContent = '+' + (base + variation).toLocaleString();
  }
  setInterval(randomHeroStat, 5000);

  // ========== PARALLAX ON HERO GLOW ==========
  let ticking = false;
  window.addEventListener('mousemove', (e) => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const x = (e.clientX / window.innerWidth - 0.5) * 30;
      const y = (e.clientY / window.innerHeight - 0.5) * 30;
      const glow1 = document.querySelector('.hero-glow-1');
      const glow2 = document.querySelector('.hero-glow-2');
      if (glow1) glow1.style.transform = `translate(${x}px, ${y}px)`;
      if (glow2) glow2.style.transform = `translate(${-x}px, ${-y}px)`;
      ticking = false;
    });
  });

  // ========== PAGE LOAD ANIMATION ==========
  window.addEventListener('load', () => {
    document.body.style.opacity = '1';

    // Trigger hero animations with delay
    setTimeout(() => {
      const heroText = document.querySelector('.hero-text');
      if (heroText) heroText.style.opacity = '1';
    }, 200);

    setTimeout(() => {
      const heroChart = document.querySelector('.hero-chart');
      if (heroChart) heroChart.style.opacity = '1';
    }, 500);
  });

  // Initial state for load animation
  document.body.style.opacity = '0';
  document.body.style.transition = 'opacity 0.5s ease';

  const heroText = document.querySelector('.hero-text');
  if (heroText) {
    heroText.style.opacity = '0';
    heroText.style.transition = 'opacity 0.8s ease, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
    heroText.style.transform = 'translateY(20px)';
    setTimeout(() => {
      heroText.style.opacity = '1';
      heroText.style.transform = 'translateY(0)';
    }, 300);
  }

  const heroChart = document.querySelector('.hero-chart');
  if (heroChart) {
    heroChart.style.opacity = '0';
    heroChart.style.transition = 'opacity 0.8s ease, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
    heroChart.style.transform = 'translateY(20px)';
    setTimeout(() => {
      heroChart.style.opacity = '1';
      heroChart.style.transform = 'translateY(0)';
    }, 600);
  }

})();
