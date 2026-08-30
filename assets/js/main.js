/* ==========================================================================
   Girish Soman — Portfolio
   Interaction layer. No dependencies.

   Part 1: utilities, theme, scroll behaviour, reveals, counters
   ========================================================================== */

(function () {
  'use strict';

  /* ---------------------------------------------------------------- utils */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const prefersReducedMotion = () => motionQuery.matches;

  /* Coalesce bursty events (scroll, pointermove) into one frame */
  function rafThrottle(fn) {
    let queued = false;
    let lastArgs;
    return function (...args) {
      lastArgs = args;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        fn.apply(this, lastArgs);
      });
    };
  }

  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
  const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

  /* Shared focus trap used by both the drawer and the command palette */
  const FOCUSABLE = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  function trapFocus(container, event) {
    const items = $$(FOCUSABLE, container).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* Only one overlay may own the scroll lock at a time */
  const scrollLock = {
    owners: new Set(),
    acquire(id) {
      this.owners.add(id);
      document.body.setAttribute('data-scroll-locked', '');
    },
    release(id) {
      this.owners.delete(id);
      if (!this.owners.size) document.body.removeAttribute('data-scroll-locked');
    }
  };

  /* ---------------------------------------------------------------- toast */
  const toastRegion = $('#toast-region');

  function toast(message) {
    if (!toastRegion) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-check"/></svg>' +
      '<span></span>';
    $('span', el).textContent = message;
    toastRegion.appendChild(el);

    setTimeout(() => {
      el.setAttribute('data-leaving', 'true');
      setTimeout(() => el.remove(), 300);
    }, 2200);
  }

  /* ---------------------------------------------------------------- theme */
  const theme = (function () {
    const STORAGE_KEY = 'theme';
    const MODES = ['light', 'system', 'dark'];
    const systemQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const options = $$('[data-theme-set]');
    const thumb = $('[data-theme-thumb]');
    let mode = 'system';

    function read() {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return MODES.includes(stored) ? stored : 'system';
      } catch (e) {
        return 'system';
      }
    }

    function resolve(next) {
      return next === 'system' ? (systemQuery.matches ? 'dark' : 'light') : next;
    }

    function paint() {
      const resolved = resolve(mode);
      document.documentElement.dataset.theme = resolved;

      /* Keep the browser chrome in step. Both media-scoped tags get the same
         value so an explicit override still wins over the OS preference. */
      const chrome = resolved === 'dark' ? '#000000' : '#ffffff';
      $$('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', chrome));

      options.forEach((btn) => {
        const active = btn.dataset.themeSet === mode;
        btn.setAttribute('aria-checked', String(active));
      });

      if (thumb) {
        const index = MODES.indexOf(mode);
        thumb.style.transform = `translateX(${index * 28}px)`;
      }

      document.dispatchEvent(new CustomEvent('themechange', { detail: { resolved, mode } }));
    }

    function set(next) {
      mode = MODES.includes(next) ? next : 'system';
      try {
        localStorage.setItem(STORAGE_KEY, mode);
      } catch (e) { /* private mode — session-only is fine */ }
      paint();
    }

    function cycle() {
      const resolved = resolve(mode);
      set(resolved === 'dark' ? 'light' : 'dark');
    }

    function init() {
      mode = read();
      paint();
      options.forEach((btn) => {
        btn.addEventListener('click', () => set(btn.dataset.themeSet));
      });
      /* Follow the OS only while in system mode */
      systemQuery.addEventListener('change', () => {
        if (mode === 'system') paint();
      });
    }

    return { init, set, cycle, get resolved() { return resolve(mode); } };
  })();

  /* -------------------------------------------------- scroll-driven chrome */
  const header = $('#header');
  const progressBar = $('.scroll-progress');
  const toTopBtn = $('[data-to-top]');
  const nav = $('#primary-nav');
  const navIndicator = $('.nav__indicator', nav || document);
  const navLinks = $$('.nav__link');

  const sections = navLinks
    .map((link) => {
      const id = link.getAttribute('href');
      return id && id.startsWith('#') ? { link, el: $(id) } : null;
    })
    .filter((entry) => entry && entry.el);

  let activeLink = null;

  function moveIndicator(link) {
    if (!navIndicator || !link) return;
    navIndicator.style.width = `${link.offsetWidth}px`;
    navIndicator.style.transform = `translateX(${link.offsetLeft}px)`;
    navIndicator.style.opacity = '1';
  }

  function updateScrollSpy() {
    const probe = (header ? header.offsetHeight : 60) + 96;
    let current = null;

    sections.forEach(({ link, el }) => {
      if (el.getBoundingClientRect().top <= probe) current = link;
    });

    /* Near the very bottom, favour the last section so the final link lights up */
    if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) {
      current = sections.length ? sections[sections.length - 1].link : current;
    }

    if (current === activeLink) return;

    navLinks.forEach((link) => link.removeAttribute('aria-current'));
    activeLink = current;

    if (current) {
      current.setAttribute('aria-current', 'true');
      moveIndicator(current);
    } else if (navIndicator) {
      navIndicator.style.opacity = '0';
    }
  }

  const onScroll = rafThrottle(function () {
    const y = window.scrollY;

    if (header) header.setAttribute('data-condensed', String(y > 8));
    if (toTopBtn) toTopBtn.setAttribute('data-visible', String(y > 600));

    if (progressBar) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progressBar.style.setProperty('--progress', max > 0 ? String(clamp(y / max, 0, 1)) : '0');
    }

    updateScrollSpy();
  });

  const onResize = rafThrottle(function () {
    if (activeLink) moveIndicator(activeLink);
  });

  /* ------------------------------------------------------- reveals & count */
  function animateCount(el) {
    const target = parseFloat(el.dataset.count);
    if (Number.isNaN(target)) return;

    const decimals = parseInt(el.dataset.decimals || '0', 10);

    if (prefersReducedMotion()) {
      el.textContent = target.toFixed(decimals);
      return;
    }

    const duration = 1400;
    const start = performance.now();

    function step(now) {
      const t = clamp((now - start) / duration, 0, 1);
      el.textContent = (target * easeOutExpo(t)).toFixed(decimals);
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = target.toFixed(decimals);
    }

    requestAnimationFrame(step);
  }

  function initReveals() {
    const targets = $$('[data-reveal]');
    const counters = $$('[data-count]');

    if (!('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-visible'));
      counters.forEach(animateCount);
      return;
    }

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );

    targets.forEach((el) => revealObserver.observe(el));

    const countObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          animateCount(entry.target);
          countObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.5 }
    );

    counters.forEach((el) => countObserver.observe(el));
  }

  /* ===================================================================
     Part 2: pointer effects, overlays, command palette, integrations
     =================================================================== */

  /* ------------------------------------------------------ pointer effects */

  /* Cards track the cursor to position their spotlight and glowing border */
  function initSpotlight() {
    const cards = $$('[data-spotlight]');
    if (!cards.length || !window.matchMedia('(hover: hover)').matches) return;

    cards.forEach((card) => {
      const move = rafThrottle((event) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
        card.style.setProperty('--my', `${event.clientY - rect.top}px`);
      });

      card.addEventListener('pointermove', move);
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--mx', '50%');
        card.style.setProperty('--my', '50%');
      });
    });
  }

  /* Subtle parallax tilt on the hero terminal */
  function initTilt() {
    const target = $('[data-tilt]');
    if (!target || prefersReducedMotion() || !window.matchMedia('(hover: hover)').matches) return;

    const MAX = 5; /* degrees */

    const move = rafThrottle((event) => {
      const rect = target.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      target.style.transform =
        `perspective(1000px) rotateY(${px * MAX * 2}deg) rotateX(${-py * MAX * 2}deg)`;
    });

    target.addEventListener('pointermove', move);
    target.addEventListener('pointerleave', () => {
      target.style.transform = '';
    });
  }

  /* Terminal lines fade in sequentially, like output arriving */
  function initTypewriter() {
    const body = $('[data-typewriter]');
    if (!body) return;

    const lines = Array.from(body.children);
    if (prefersReducedMotion()) return;

    lines.forEach((line, i) => {
      line.style.opacity = '0';
      line.style.transform = 'translateY(4px)';
      line.style.transition = 'opacity 340ms ease, transform 340ms ease';
      setTimeout(() => {
        line.style.opacity = '1';
        line.style.transform = 'none';
      }, 500 + i * 220);
    });
  }

  /* A second identical track makes the marquee loop without a visible seam */
  function initMarquee() {
    const marquee = $('[data-marquee]');
    if (!marquee) return;
    const track = $('.marquee__track', marquee);
    if (!track) return;

    const clone = track.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    marquee.appendChild(clone);
  }

  /* ------------------------------------------------------------ overlays */

  /* Generic show/hide for the modal surfaces, including focus restoration */
  function createOverlay({ root, id, onOpen, onClose, initialFocus }) {
    if (!root) return null;
    let lastFocused = null;

    const api = {
      get isOpen() {
        return root.dataset.open === 'true';
      },
      open() {
        if (api.isOpen) return;
        lastFocused = document.activeElement;
        root.removeAttribute('inert');
        root.dataset.open = 'true';
        scrollLock.acquire(id);
        if (onOpen) onOpen();

        const focusTarget = typeof initialFocus === 'function' ? initialFocus() : null;
        if (focusTarget) {
          /* Wait a frame so the panel is laid out before we move focus */
          requestAnimationFrame(() => focusTarget.focus());
        }
      },
      close() {
        if (!api.isOpen) return;
        root.dataset.open = 'false';
        root.setAttribute('inert', '');
        scrollLock.release(id);
        if (onClose) onClose();
        if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
      },
      toggle() {
        api.isOpen ? api.close() : api.open();
      }
    };

    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        api.close();
      } else if (event.key === 'Tab') {
        trapFocus(root, event);
      }
    });

    return api;
  }

  /* ------------------------------------------------------------- drawer */
  const drawerRoot = $('#drawer');
  const drawerToggle = $('[data-drawer-toggle]');

  const drawer = createOverlay({
    root: drawerRoot,
    id: 'drawer',
    initialFocus: () => $('.drawer__link', drawerRoot),
    onOpen() {
      if (drawerToggle) {
        drawerToggle.setAttribute('aria-expanded', 'true');
        drawerToggle.setAttribute('aria-label', 'Close menu');
      }
    },
    onClose() {
      if (drawerToggle) {
        drawerToggle.setAttribute('aria-expanded', 'false');
        drawerToggle.setAttribute('aria-label', 'Open menu');
      }
    }
  });

  function initDrawer() {
    if (!drawer || !drawerRoot) return;

    if (drawerToggle) drawerToggle.addEventListener('click', () => drawer.toggle());
    $$('[data-drawer-close]', drawerRoot).forEach((el) =>
      el.addEventListener('click', () => drawer.close())
    );
    /* Navigating away should dismiss the panel */
    $$('.drawer__link', drawerRoot).forEach((link) =>
      link.addEventListener('click', () => drawer.close())
    );

    /* If the viewport grows past the breakpoint the drawer is no longer reachable */
    window.matchMedia('(min-width: 900px)').addEventListener('change', (e) => {
      if (e.matches) drawer.close();
    });
  }

  /* --------------------------------------------------- command palette */
  const paletteRoot = $('#palette');
  const paletteInput = $('#palette-input');
  const paletteList = $('#palette-list');

  const palette = createOverlay({
    root: paletteRoot,
    id: 'palette',
    initialFocus: () => paletteInput,
    onOpen() {
      if (paletteInput) paletteInput.value = '';
      render('');
    },
    onClose() {
      activeIndex = 0;
    }
  });

  function go(hash) {
    const target = $(hash);
    if (!target) return;
    /* scroll-padding-top on <html> keeps the fixed header from covering the heading */
    target.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start'
    });
    history.replaceState(null, '', hash);
  }

  function copyText(value) {
    const done = () => toast('Email copied to clipboard');

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(value).then(done).catch(fallback);
    } else {
      fallback();
    }

    /* file:// and plain http contexts have no async clipboard */
    function fallback() {
      const field = document.createElement('textarea');
      field.value = value;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      try {
        document.execCommand('copy');
        done();
      } catch (e) {
        toast('Copy failed — ' + value);
      }
      field.remove();
    }
  }

  const EMAIL = 'giri943@gmail.com';
  const CV_PATH = 'assets/cv/Girish-Soman-Senior-Software-Engineer.pdf';
  const CV_FILENAME = 'Girish-Soman-Senior-Software-Engineer.pdf';

  /* Trigger the actual file download. Verified with a HEAD request first so a
     missing or not-yet-added PDF degrades to the print view rather than
     dumping the visitor on a 404. */
  function downloadCV(href) {
    const url = href || CV_PATH;

    const send = () => {
      const a = document.createElement('a');
      a.href = url;
      a.download = CV_FILENAME;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };

    /* fetch() cannot inspect file:// URLs, so only guard over http(s) */
    if (!/^https?:/.test(window.location.protocol)) {
      send();
      return;
    }

    fetch(url, { method: 'HEAD' })
      .then((res) => {
        if (!res.ok) throw new Error('cv missing ' + res.status);
        send();
      })
      .catch(() => {
        toast('CV file not uploaded yet — opening print view');
        setTimeout(() => window.print(), 700);
      });
  }

  function initCV() {
    $$('[data-cv]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        downloadCV(link.getAttribute('href'));
      });
    });
  }

  const COMMANDS = [
    { group: 'Navigate', icon: 'i-code', label: 'About', keywords: 'intro bio how i work', run: () => go('#about') },
    { group: 'Navigate', icon: 'i-briefcase', label: 'Experience', keywords: 'role job schbang career', run: () => go('#experience') },
    { group: 'Navigate', icon: 'i-layers', label: 'Skills', keywords: 'capabilities stack tech', run: () => go('#skills') },
    { group: 'Navigate', icon: 'i-branch', label: 'Selected work', keywords: 'projects portfolio pulse', run: () => go('#work') },
    { group: 'Navigate', icon: 'i-github', label: 'GitHub activity', keywords: 'contributions graph repos', run: () => go('#activity') },
    { group: 'Navigate', icon: 'i-mail', label: 'Contact', keywords: 'hire email reach out', run: () => go('#contact') },

    { group: 'Actions', icon: 'i-copy', label: 'Copy email address', keywords: 'clipboard mail', hint: EMAIL, run: () => copyText(EMAIL) },
    { group: 'Actions', icon: 'i-mail', label: 'Send an email', keywords: 'contact hire', run: () => { window.location.href = 'mailto:' + EMAIL; } },
    { group: 'Actions', icon: 'i-download', label: 'Download CV', keywords: 'resume pdf cv', run: () => downloadCV() },
    { group: 'Actions', icon: 'i-printer', label: 'Print this page', keywords: 'print paper', run: () => window.print() },
    { group: 'Actions', icon: 'i-arrow-up', label: 'Back to top', keywords: 'scroll home', run: () => window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' }) },

    { group: 'Theme', icon: 'i-sun', label: 'Light theme', keywords: 'bright day', run: () => theme.set('light') },
    { group: 'Theme', icon: 'i-moon', label: 'Dark theme', keywords: 'night', run: () => theme.set('dark') },
    { group: 'Theme', icon: 'i-monitor', label: 'Match system theme', keywords: 'auto os default', run: () => theme.set('system') },

    { group: 'Links', icon: 'i-github', label: 'Open GitHub profile', keywords: 'code repos', run: () => window.open('https://github.com/giri943', '_blank', 'noopener') },
    { group: 'Links', icon: 'i-linkedin', label: 'Open LinkedIn profile', keywords: 'network cv', run: () => window.open('https://www.linkedin.com/in/girish-soman', '_blank', 'noopener') }
  ];

  let results = [];
  let activeIndex = 0;

  function setActive(index) {
    if (!results.length) return;
    activeIndex = (index + results.length) % results.length;

    $$('.palette__item', paletteList).forEach((el) => {
      const isActive = Number(el.dataset.index) === activeIndex;
      el.setAttribute('data-active', String(isActive));
      el.setAttribute('aria-selected', String(isActive));
      if (isActive) {
        el.scrollIntoView({ block: 'nearest' });
        if (paletteInput) paletteInput.setAttribute('aria-activedescendant', el.id);
      }
    });
  }

  function render(query) {
    if (!paletteList) return;

    const q = query.trim().toLowerCase();
    results = q
      ? COMMANDS.filter((cmd) =>
          (cmd.label + ' ' + cmd.group + ' ' + (cmd.keywords || '')).toLowerCase().includes(q)
        )
      : COMMANDS.slice();

    if (!results.length) {
      paletteList.innerHTML = '<p class="palette__empty">No matching commands</p>';
      if (paletteInput) paletteInput.removeAttribute('aria-activedescendant');
      return;
    }

    let html = '';
    let group = null;

    results.forEach((cmd, index) => {
      if (cmd.group !== group) {
        group = cmd.group;
        html += `<p class="palette__group-label">${group}</p>`;
      }
      html +=
        `<button class="palette__item" type="button" role="option" aria-selected="false"` +
        ` id="palette-item-${index}" data-index="${index}">` +
        `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#${cmd.icon}"/></svg>` +
        `<span>${cmd.label}</span>` +
        (cmd.hint ? `<span class="palette__item-hint">${cmd.hint}</span>` : '') +
        `</button>`;
    });

    paletteList.innerHTML = html;

    $$('.palette__item', paletteList).forEach((el) => {
      const index = Number(el.dataset.index);
      el.addEventListener('click', () => runCommand(index));
      el.addEventListener('pointermove', () => setActive(index));
    });

    setActive(0);
  }

  function runCommand(index) {
    const cmd = results[index];
    if (!cmd) return;
    palette.close();
    /* Let the overlay finish closing before the command moves the viewport */
    setTimeout(() => cmd.run(), 120);
  }

  function initPalette() {
    if (!palette || !paletteRoot) return;

    $$('[data-palette-open]').forEach((btn) =>
      btn.addEventListener('click', () => palette.open())
    );
    $$('[data-palette-close]', paletteRoot).forEach((el) =>
      el.addEventListener('click', () => palette.close())
    );

    if (paletteInput) {
      paletteInput.addEventListener('input', () => render(paletteInput.value));

      paletteInput.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setActive(activeIndex + 1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          setActive(activeIndex - 1);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          runCommand(activeIndex);
        }
      });
    }

    /* Cmd/Ctrl+K anywhere on the page */
    document.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (drawer && drawer.isOpen) drawer.close();
        palette.toggle();
      }
    });
  }

  /* ------------------------------------------------- GitHub integration */

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* Build the week x weekday grid GitHub uses.
     Days arrive as a flat chronological list, so pad the first column with
     blanks up to the starting weekday, then fill column by column. */
  function renderCalendar(card, days) {
    const grid = $('[data-cal]', card);
    const monthsRow = $('[data-cal-months]', card);
    if (!grid || !days.length) return;

    const cells = [];
    const leadingBlanks = new Date(days[0].date + 'T00:00:00').getDay();

    for (let i = 0; i < leadingBlanks; i += 1) {
      cells.push('<span class="cal__day" data-level="0" style="visibility:hidden"></span>');
    }

    days.forEach((day) => {
      const count = day.count || 0;
      const label = `${count} contribution${count === 1 ? '' : 's'} on ${day.date}`;
      cells.push(
        `<span class="cal__day" data-level="${day.level || 0}" title="${label}"></span>`
      );
    });

    grid.innerHTML = cells.join('');

    /* One label per month, spanning that month's week columns */
    if (monthsRow) {
      const totalCells = cells.length;
      const weeks = Math.ceil(totalCells / 7);
      const monthByWeek = [];

      for (let w = 0; w < weeks; w += 1) {
        /* Sample the middle of the week so partial weeks don't mislabel */
        const dayIndex = w * 7 + 3 - leadingBlanks;
        const day = days[clamp(dayIndex, 0, days.length - 1)];
        monthByWeek.push(new Date(day.date + 'T00:00:00').getMonth());
      }

      let html = '';
      let w = 0;
      while (w < weeks) {
        const month = monthByWeek[w];
        let span = 1;
        while (w + span < weeks && monthByWeek[w + span] === month) span += 1;
        /* Skip a stub first column so the label isn't clipped */
        html += `<span style="grid-column:span ${span}">${span > 1 ? MONTH_NAMES[month] : ''}</span>`;
        w += span;
      }
      monthsRow.innerHTML = html;
    }
  }

  function initGitHub() {
    const cards = $$('[data-gh-account]');
    if (!cards.length) return;

    cards.forEach((card) => {
      const user = card.dataset.ghAccount;

      const fill = (key, value) => {
        const el = $(`[data-gh="${key}"]`, card);
        if (!el) return;
        el.classList.remove('is-loading');
        el.textContent = value;
      };

      const note = $('[data-cal-note]', card);

      /* Profile: avatar, repo count, account age, freshest push */
      fetch(`https://api.github.com/users/${user}`)
        .then((res) => {
          if (!res.ok) throw new Error('profile ' + res.status);
          return res.json();
        })
        .then((data) => {
          const avatar = $('[data-gh-avatar]', card);
          if (avatar && data.avatar_url) {
            avatar.src = data.avatar_url + '&s=88';
            avatar.alt = `${user} avatar`;
          }

          fill('repos', String(data.public_repos ?? '—'));

          if (data.created_at) {
            const years = Math.max(
              1,
              Math.floor((Date.now() - new Date(data.created_at)) / 31557600000)
            );
            fill('years', String(years));
          }

          return fetch(`https://api.github.com/users/${user}/repos?per_page=100&sort=pushed`);
        })
        .then((res) => (res && res.ok ? res.json() : []))
        .then((repos) => {
          if (!Array.isArray(repos) || !repos.length) return;

          const tally = repos.reduce((acc, repo) => {
            if (repo.language) acc[repo.language] = (acc[repo.language] || 0) + 1;
            return acc;
          }, {});
          const top = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
          if (top) fill('language', top);

          const pushed = repos[0] && repos[0].pushed_at;
          if (pushed) {
            fill('active', new Date(pushed).toLocaleDateString(undefined, {
              month: 'short',
              year: 'numeric'
            }));
          }
        })
        .catch(() => { /* settled by the sweep below */ })
        .finally(() => {
          $$('[data-gh].is-loading', card).forEach((el) => {
            el.classList.remove('is-loading');
            el.textContent = '—';
          });
        });

      /* Contribution calendar. Public proxy over GitHub's contribution data —
         the official endpoint is GraphQL-only and needs a token, which cannot
         live in a static page. Returns a per-day level of 0-4. */
      fetch(`https://github-contributions-api.jogruber.de/v4/${user}?y=last`)
        .then((res) => {
          if (!res.ok) throw new Error('contributions ' + res.status);
          return res.json();
        })
        .then((data) => {
          const days = Array.isArray(data.contributions) ? data.contributions : [];
          if (!days.length) throw new Error('no contribution data');

          renderCalendar(card, days);

          const total = days.reduce((sum, day) => sum + (day.count || 0), 0);
          fill('contributions', total.toLocaleString());
          if (note) {
            note.textContent = `${total.toLocaleString()} contributions in the last year`;
          }
        })
        .catch(() => {
          fill('contributions', '—');
          if (note) note.textContent = 'Contribution graph unavailable right now';
        });
    });
  }

  /* ------------------------------------------------------ small bindings */
  function initMisc() {
    /* Show the correct modifier key for the platform */
    const modKey = $('[data-mod-key]');
    if (modKey) {
      const isApple = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
      modKey.textContent = isApple ? '\u2318 K' : 'Ctrl K';
    }

    $$('[data-copy]').forEach((btn) =>
      btn.addEventListener('click', () => copyText(btn.dataset.copy))
    );

    $$('[data-print]').forEach((btn) => btn.addEventListener('click', () => window.print()));

    if (toTopBtn) {
      toTopBtn.addEventListener('click', () =>
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
      );
    }

    const yearEl = $('[data-year]');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());
  }

  /* ------------------------------------------------------------- bootstrap */
  function init() {
    theme.init();
    initReveals();
    initSpotlight();
    initTilt();
    initTypewriter();
    initMarquee();
    initDrawer();
    initPalette();
    initGitHub();
    initCV();
    initMisc();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);

    /* Fonts land after first paint and change link widths, so re-measure */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(onResize);
    }

    onScroll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
