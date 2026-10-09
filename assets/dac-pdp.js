/* Product information, redesigned product page. No dependencies. */
(() => {
  if (window.DacPdp) return;

  const DESKTOP = window.matchMedia('(min-width: 1025px)');
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
  const DAY = 86400000;

  const formatMoney = (cents, format) => {
    const value = Number(cents || 0) / 100;
    const fmt = (number, decimals, thousands, decimal) => {
      const [whole, fraction] = number.toFixed(decimals).split('.');
      return whole.replace(/\B(?=(\d{3})+(?!\d))/g, thousands) + (decimals ? decimal + fraction : '');
    };
    return (format || '£{{amount}}').replace(/\{\{\s*(\w+)\s*\}\}/, (match, key) => {
      switch (key) {
        case 'amount_no_decimals': return fmt(value, 0, ',', '.');
        case 'amount_with_comma_separator': return fmt(value, 2, '.', ',');
        case 'amount_no_decimals_with_comma_separator': return fmt(value, 0, '.', ',');
        default: return fmt(value, 2, ',', '.');
      }
    });
  };

  const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const formatHour = (hour) => {
    const h = Number(hour) % 24;
    const suffix = h < 12 ? 'am' : 'pm';
    const twelve = h % 12 === 0 ? 12 : h % 12;
    return `${twelve}${suffix}`;
  };

  const ukNow = () => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    const get = (type) => Number((parts.find((p) => p.type === type) || {}).value);
    return { y: get('year'), m: get('month'), d: get('day'), hour: get('hour') };
  };

  class DacPdp {
    constructor(root) {
      this.root = root;
      this.format = root.dataset.moneyFormat;
      const json = root.querySelector('[data-dac-product-json]');
      this.product = json ? JSON.parse(json.textContent) : { variants: [] };
      this.picker = root.querySelector('[data-dac-picker]');
      this.variant = this.product.selectedVariantId ? this.findById(this.product.selectedVariantId) : null;
      if (!this.picker) {
        const input = root.querySelector('[data-dac-variant-input]');
        if (input && input.value) this.variant = this.findById(Number(input.value));
      }

      root.addEventListener('change', (event) => {
        if (event.target.matches('[data-dac-option-input]')) this.onOptionChange();
      });
      root.addEventListener('click', (event) => this.onClickCapture(event), true);
      root.addEventListener('click', (event) => this.onClick(event));

      this.initGallery();
      this.initAccordion();
      this.initSticky();
      this.initStickyAtc();
      this.renderDelivery();
      this.syncOptions();
      if (this.variant) this.applyVariant(this.variant, false);
      this.updateNudge();
      // Halo rewrites every [data-cart-count] after each cart change, from any page widget or the cart drawer.
      const cartCount = document.querySelector('[data-cart-count]');
      if (cartCount) new MutationObserver(() => this.updateNudge()).observe(cartCount, { childList: true, characterData: true, subtree: true });
    }

    findById(id) {
      return this.product.variants.find((v) => v.id === id) || null;
    }

    /* Variant picker */
    fieldsets() {
      return this.picker ? Array.from(this.picker.querySelectorAll('[data-dac-option]')) : [];
    }

    selectedValues() {
      return this.fieldsets().map((fieldset) => {
        const checked = fieldset.querySelector('[data-dac-option-input]:checked');
        return checked ? checked.value : null;
      });
    }

    onOptionChange() {
      this.clearError();
      const values = this.selectedValues();
      if (values.length && values.every((v) => v !== null)) {
        this.variant = this.product.variants.find((v) => v.options.every((o, i) => o === values[i])) || null;
        this.applyVariant(this.variant, true);
      } else {
        this.variant = null;
        this.setVariantInput(null);
      }
      this.syncOptions();
      this.updateNudge();
    }

    syncOptions() {
      const values = this.selectedValues();
      this.fieldsets().forEach((fieldset, index) => {
        const valueEl = fieldset.querySelector('[data-dac-option-value]');
        fieldset.classList.toggle('is-selected', values[index] !== null);
        if (valueEl) valueEl.textContent = values[index] !== null ? values[index] : valueEl.dataset.placeholder;
        fieldset.querySelectorAll('[data-dac-option-input]').forEach((input) => {
          const possible = this.product.variants.some((v) => v.available && v.options[index] === input.value
            && values.every((selected, i) => i === index || selected === null || v.options[i] === selected));
          const label = input.nextElementSibling;
          if (label) label.classList.toggle('is-unavailable', !possible);
        });
      });
      this.syncStickyAtc(values);
    }

    setVariantInput(variant) {
      this.root.classList.toggle('has-variant', Boolean(variant));
      this.root.querySelectorAll('[data-dac-variant-input]').forEach((input) => {
        const value = variant ? String(variant.id) : '';
        if (input.value === value) return;
        input.value = value;
        // Apps such as Mailchimp back in stock watch this input for the chosen variant.
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }

    applyVariant(variant, updateUrl) {
      this.setVariantInput(variant);
      const available = Boolean(variant && variant.available);
      this.root.querySelectorAll('[data-dac-atc]').forEach((button) => {
        button.disabled = !available;
        button.textContent = available ? button.dataset.label : button.dataset.soldOutLabel;
      });
      this.root.querySelectorAll('[data-dac-buy-now]').forEach((button) => {
        button.disabled = !available;
      });
      this.root.querySelectorAll('[data-dac-sticky-atc]').forEach((button) => {
        button.disabled = !available;
        button.textContent = available ? button.dataset.label : button.dataset.soldOutLabel;
      });
      if (variant) this.updatePrice(variant);
      this.updateStock(variant);
      if (updateUrl && variant) {
        const url = new URL(window.location.href);
        url.searchParams.set('variant', variant.id);
        window.history.replaceState(window.history.state, '', url.toString());
      }
      this.root.dispatchEvent(new CustomEvent('dac:variant-change', { bubbles: true, detail: { variant } }));
    }

    updatePrice(variant) {
      this.root.querySelectorAll('[data-dac-price]').forEach((block) => {
        const codeOn = block.dataset.codeOn === 'true';
        const percent = Number(block.dataset.codePercent || 0);
        const price = variant.price;
        const compare = variant.compare_at_price || 0;
        const compareEl = block.querySelector('[data-dac-compare]');
        const regularEl = block.querySelector('[data-dac-regular]');
        const nowEl = block.querySelector('[data-dac-now]');
        const wasEl = block.querySelector('[data-dac-was]');
        if (compareEl) {
          compareEl.hidden = !(compare > price);
          compareEl.textContent = formatMoney(compare, this.format);
        }
        if (regularEl) regularEl.textContent = `${formatMoney(price, this.format)} ${block.dataset.withoutCode || ''}`.trim();
        if (nowEl) {
          const shown = codeOn ? Math.round((price * (100 - percent)) / 100) : price;
          nowEl.textContent = formatMoney(shown, this.format);
          nowEl.classList.toggle('is-sale', codeOn || compare > price);
        }
        if (wasEl) wasEl.hidden = !(codeOn || compare > price);
      });
    }

    updateStock(variant) {
      if (!this.picker) return;
      const stockEl = this.picker.querySelector('[data-dac-stock]');
      if (!stockEl) return;
      const threshold = Number(this.picker.dataset.lowStock || 0);
      const inventory = variant ? variant.inventory : null;
      if (!variant || !variant.available || inventory === null || threshold <= 0 || inventory <= 0 || inventory > threshold) {
        stockEl.hidden = true;
        return;
      }
      const sizeIndex = this.product.options.findIndex((name) => /size|waist/i.test(name));
      const value = sizeIndex > -1 ? variant.options[sizeIndex] : variant.title;
      stockEl.textContent = (this.picker.dataset.lowStockText || '')
        .replace('[count]', inventory)
        .replace('[value]', value);
      stockEl.hidden = false;
    }

    needsChoice() {
      return Boolean(this.picker) && !this.variant;
    }

    showError() {
      if (!this.picker) return;
      this.picker.classList.add('has-error');
      const error = this.picker.querySelector('[data-dac-error]');
      if (error) error.hidden = false;
      this.picker.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    clearError() {
      if (!this.picker) return;
      this.picker.classList.remove('has-error');
      const error = this.picker.querySelector('[data-dac-error]');
      if (error) error.hidden = true;
    }

    /* Clicks */
    onClickCapture(event) {
      // Each colour is its own product, linked by the Linkify app. Keep an alternate template (?view=) when
      // moving between colours, otherwise the next colour opens on the product's assigned template.
      const swatch = event.target.closest('linkify-product-colors-swatch[data-handle]');
      const view = new URLSearchParams(window.location.search).get('view');
      if (swatch && view && !window.location.pathname.endsWith(`/products/${swatch.dataset.handle}`)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const shopRoot = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
        window.location.href = `${shopRoot}products/${swatch.dataset.handle}?view=${encodeURIComponent(view)}`;
        return;
      }
      const button = event.target.closest('[data-dac-atc], [data-dac-buy-now]');
      if (!button || !this.root.contains(button)) return;
      if (this.needsChoice()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.showError();
        return;
      }
      if (button.matches('[data-dac-buy-now]')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.buyNow(button);
      }
    }

    onClick(event) {
      const target = event.target;
      if (target.classList && target.classList.contains('dac-modal')) {
        target.close();
        return;
      }
      const summary = target.closest('.dac-acc__summary');
      if (summary) {
        event.preventDefault();
        return this.toggleRow(summary.parentElement);
      }
      const copy = target.closest('[data-dac-copy]');
      if (copy) return this.copyCode(copy);
      const open = target.closest('[data-dac-modal-open]');
      if (open) {
        const dialog = document.getElementById(open.dataset.dacModalOpen);
        if (dialog && typeof dialog.showModal === 'function') {
          this.loadGuide(dialog);
          dialog.showModal();
        }
        return;
      }
      if (target.closest('.tabs-size-guid')) return this.onGuideClick(event);
      const close = target.closest('[data-dac-modal-close]');
      if (close) {
        const dialog = close.closest('dialog');
        if (dialog) dialog.close();
        return;
      }
      const thumb = target.closest('[data-dac-thumb]');
      if (thumb) return this.goToSlide(Number(thumb.dataset.dacThumb));
      const more = target.closest('[data-dac-read-more]');
      if (more) return this.toggleReadMore(more);
      if (target.closest('[data-dac-signup-scroll]')) return this.scrollToNewsletter();
    }

    /* Size guide pop out. Brings in the sections of the size guide page, without the page title. */
    loadGuide(dialog) {
      const body = dialog.querySelector('[data-dac-guide-src]');
      if (!body || body.dataset.loaded) return;
      body.dataset.loaded = 'true';
      fetch(body.dataset.dacGuideSrc)
        .then((response) => (response.ok ? response.text() : Promise.reject(new Error('size guide'))))
        .then((html) => {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const sections = Array.from(doc.querySelectorAll('main .shopify-section:not([id$="__main"])'));
          if (!sections.length) return;
          sections.forEach((section) => section.querySelectorAll('script').forEach((script) => script.remove()));
          body.replaceChildren(...sections);
        })
        .catch(() => { delete body.dataset.loaded; });
    }

    // The store's own size guide section (tabs-size-guide) switches tabs with an inline script,
    // which does not run once its markup is moved into the pop out. Same behaviour, done here.
    onGuideClick(event) {
      const guide = event.target.closest('.tabs-size-guid');
      const heading = event.target.closest('.block-tabs h3');
      if (heading) {
        const open = heading.classList.toggle('active');
        if (heading.nextElementSibling) heading.nextElementSibling.style.display = open ? 'block' : 'none';
        return;
      }
      const tab = event.target.closest('.block-tabs li');
      const link = tab && tab.querySelector('a[href^="#"]');
      if (!link) return;
      event.preventDefault();
      const panel = guide.querySelector(`[id="${link.getAttribute('href').slice(1)}"]`);
      if (!panel) return;
      guide.querySelectorAll('.block-tabs li').forEach((item) => item.classList.toggle('active', item === tab));
      guide.querySelectorAll('.tab-content').forEach((content) => { content.style.display = content === panel ? 'block' : 'none'; });
    }

    buyNow(button) {
      const input = this.root.querySelector('[data-dac-variant-input]');
      const id = this.variant ? this.variant.id : Number(input && input.value);
      if (!id) return;
      button.disabled = true;
      button.classList.add('is-loading');
      fetch(button.dataset.cartAddUrl || '/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items: [{ id, quantity: 1 }] })
      })
        .then((response) => {
          if (!response.ok) throw new Error('add failed');
          window.location.href = '/checkout';
        })
        .catch(() => {
          button.disabled = false;
          button.classList.remove('is-loading');
        });
    }

    copyCode(button) {
      const code = button.dataset.dacCopy;
      const label = button.querySelector('[data-dac-copy-label]');
      const status = button.closest('[data-dac-price]') && button.closest('[data-dac-price]').querySelector('[data-dac-copy-status]');
      const done = () => {
        if (!label) return;
        if (!label.dataset.original) label.dataset.original = label.textContent;
        label.textContent = button.dataset.copied || label.dataset.original;
        button.classList.add('is-copied');
        if (status) status.textContent = `${code} ${button.dataset.copied || ''}`.trim();
        clearTimeout(button.dacTimer);
        button.dacTimer = setTimeout(() => {
          label.textContent = label.dataset.original;
          button.classList.remove('is-copied');
        }, 2000);
      };
      const fallback = () => {
        const area = document.createElement('textarea');
        area.value = code;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        try { document.execCommand('copy'); done(); } catch (e) { /* nothing to copy into */ }
        area.remove();
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(code).then(done).catch(fallback);
      } else {
        fallback();
      }
    }

    scrollToNewsletter() {
      const field = document.querySelector('input[id^="NewsletterForm--"]:not(#NewsletterForm--Popup)')
        || document.querySelector('footer input[type="email"]');
      if (!field) return;
      field.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => field.focus({ preventScroll: true }), 600);
    }

    /* Gallery */
    initGallery() {
      this.track = this.root.querySelector('[data-dac-gallery-track]');
      if (!this.track) return;
      this.counter = this.root.querySelector('[data-dac-counter]');
      this.thumbs = Array.from(this.root.querySelectorAll('[data-dac-thumb]'));
      this.slideCount = this.track.querySelectorAll('[data-dac-slide]').length;
      let ticking = false;
      this.track.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          this.syncGallery();
        });
      }, { passive: true });
    }

    syncGallery() {
      if (DESKTOP.matches || !this.track) return;
      const width = this.track.clientWidth || 1;
      const index = Math.min(this.slideCount - 1, Math.max(0, Math.round(this.track.scrollLeft / width)));
      if (this.counter) this.counter.textContent = `${index + 1} / ${this.slideCount}`;
      this.thumbs.forEach((thumb, i) => thumb.classList.toggle('is-active', i === index));
    }

    goToSlide(index) {
      if (!this.track) return;
      this.track.scrollTo({ left: index * this.track.clientWidth, behavior: 'smooth' });
    }

    /* Accordion */
    initAccordion() {
      const desktop = DESKTOP.matches;
      this.root.querySelectorAll('[data-dac-acc-row]').forEach((row) => {
        row.open = desktop ? row.hasAttribute('data-open-desktop') : row.hasAttribute('data-open-mobile');
      });
    }

    // GSAP comes with the theme (vendor.js). Without it, or with reduced motion, rows just open and close.
    toggleRow(row) {
      const opening = !row.open || row.classList.contains('is-closing');
      const gsap = window.gsap;
      if (!gsap || REDUCED_MOTION.matches) {
        row.classList.remove('is-closing');
        row.open = opening;
        return;
      }
      const from = row.offsetHeight;
      gsap.killTweensOf(row);
      row.style.height = '';
      row.open = false;
      const closedHeight = row.offsetHeight;
      row.open = true;
      const openHeight = row.offsetHeight;
      row.classList.toggle('is-closing', !opening);
      gsap.fromTo(row, { height: from, overflow: 'hidden' }, {
        height: opening ? openHeight : closedHeight,
        duration: 0.35,
        ease: 'power2.inOut',
        onComplete: () => {
          if (!opening) row.open = false;
          row.classList.remove('is-closing');
          gsap.set(row, { clearProps: 'height,overflow' });
        }
      });
    }

    /* Sticky details. CSS needs the details height and the theme header height to pick where to stick. */
    initSticky() {
      const info = this.root.querySelector('.dac-pdp__info');
      if (!info || !this.root.classList.contains('dac-pdp--sticky-info') || !('ResizeObserver' in window)) return;
      const header = document.querySelector('.shopify-section-header');
      new ResizeObserver(() => {
        info.style.setProperty('--dac-info-h', `${info.offsetHeight}px`);
        if (header) this.root.style.setProperty('--dac-header-h', `${header.offsetHeight}px`);
      }).observe(info);
    }

    /* Sticky add to bag. Shows once the main button has scrolled up out of view, and drives the main picker and button. */
    initStickyAtc() {
      const bar = this.root.querySelector('[data-dac-sticky]');
      const mainAtc = this.root.querySelector('[data-dac-atc]');
      if (!bar || !mainAtc || !('IntersectionObserver' in window)) return;
      this.stickySelect = bar.querySelector('[data-dac-sticky-select]');
      this.sheet = this.root.querySelector('[data-dac-sheet]');
      // The root reaches far below the screen, so the button only stops intersecting once it is above the screen.
      // A jump from below the fold straight past the button (anchor link, restored scroll) still fires.
      new IntersectionObserver(([entry]) => {
        const show = !entry.isIntersecting;
        bar.classList.toggle('is-visible', show);
        bar.inert = !show;
      }, { rootMargin: '0px 0px 10000px 0px' }).observe(mainAtc);

      bar.querySelector('[data-dac-sticky-atc]').addEventListener('click', () => this.stickyAdd(mainAtc));
      if (this.stickySelect) {
        this.stickySelect.addEventListener('change', () => {
          this.stickySelect.parentElement.classList.remove('has-error');
          this.pickSize(this.stickySelect.value);
        });
      }
      if (!this.sheet) return;
      this.sheet.addEventListener('click', (event) => {
        if (event.target === this.sheet) return this.sheet.close();
        const size = event.target.closest('[data-dac-sheet-size]');
        if (size) {
          this.sheet.querySelector('[data-dac-sheet-error]').hidden = true;
          return this.pickSize(size.dataset.dacSheetSize);
        }
        if (event.target.closest('[data-dac-sheet-guide]')) {
          const guide = this.root.querySelector('dialog.dac-modal');
          if (guide) {
            this.loadGuide(guide);
            guide.showModal();
          }
          return;
        }
        if (!event.target.closest('[data-dac-sheet-atc]')) return;
        if (!this.variant) {
          this.sheet.querySelector('[data-dac-sheet-error]').hidden = false;
          return;
        }
        this.sheet.close();
        mainAtc.click();
      });
    }

    // Picks a value in the main picker, the change event updates price, stock, URL and the sticky bar.
    pickSize(value) {
      const input = Array.from(this.root.querySelectorAll('[data-dac-option-input]')).find((el) => el.value === value);
      if (!input || input.checked) return;
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    stickyAdd(mainAtc) {
      if (this.variant) {
        mainAtc.click();
        return;
      }
      if (!DESKTOP.matches && this.sheet) {
        this.sheet.showModal();
        return;
      }
      if (!this.stickySelect) {
        this.showError();
        return;
      }
      this.stickySelect.parentElement.classList.add('has-error');
      this.stickySelect.focus();
      if (typeof this.stickySelect.showPicker === 'function') {
        try { this.stickySelect.showPicker(); } catch (e) { /* some browsers only open it from a direct user gesture */ }
      }
    }

    syncStickyAtc(values) {
      if (this.stickySelect) this.stickySelect.value = values[0] || '';
      if (this.sheet) {
        this.sheet.querySelectorAll('[data-dac-sheet-size]').forEach((button) => {
          button.setAttribute('aria-pressed', String(button.dataset.dacSheetSize === values[0]));
        });
      }
    }

    toggleReadMore(button) {
      const content = button.parentElement.querySelector('[data-dac-clamp]');
      if (!content) return;
      const expanded = content.classList.toggle('is-expanded');
      button.textContent = expanded ? button.dataset.less : button.dataset.more;
    }

    /* Delivery estimate */
    renderDelivery() {
      this.root.querySelectorAll('[data-dac-delivery]').forEach((block) => {
        const textEl = block.querySelector('[data-dac-delivery-text]');
        if (!textEl) return;
        const cutoff = Number(block.dataset.cutoff || 12);
        const dispatchDays = new Set((block.dataset.dispatchDays || '').split(',').filter(Boolean).map(Number));
        const transit = Number(block.dataset.transitDays || 5);
        const holidays = new Set((block.dataset.holidays || '').split(',').filter(Boolean));
        const iso = (date) => date.toISOString().slice(0, 10);
        const addDays = (date, days) => new Date(date.getTime() + days * DAY);
        const isDispatchDay = (date) => dispatchDays.has(date.getUTCDay()) && !holidays.has(iso(date));
        const isWorkingDay = (date) => date.getUTCDay() !== 0 && date.getUTCDay() !== 6 && !holidays.has(iso(date));

        const now = ukNow();
        const today = new Date(Date.UTC(now.y, now.m - 1, now.d));
        let sendDay = today;
        const sendsToday = isDispatchDay(today) && now.hour < cutoff;
        if (!sendsToday) {
          let guard = 0;
          do { sendDay = addDays(sendDay, 1); } while (!isDispatchDay(sendDay) && guard++ < 30);
        }
        let arrive = sendDay;
        let counted = 0;
        let guard = 0;
        while (counted < transit && guard++ < 60) {
          arrive = addDays(arrive, 1);
          if (isWorkingDay(arrive)) counted += 1;
        }
        const dateText = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(arrive);
        const template = sendsToday ? block.dataset.textToday : block.dataset.textLater;
        textEl.innerHTML = escapeHtml(template || '')
          .replace('[cutoff]', escapeHtml(formatHour(cutoff)))
          .replace('[date]', `<strong>${escapeHtml(dateText)}</strong>`);
      });
    }

    updateNudge() {
      const block = this.root.querySelector('[data-dac-delivery]');
      const nudge = block && block.querySelector('[data-dac-nudge]');
      if (!nudge) return;
      const threshold = Number(block.dataset.threshold || 0);
      if (!threshold) return;
      const prices = this.product.variants.filter((v) => v.available).map((v) => v.price);
      const itemPrice = this.variant ? this.variant.price : (prices.length ? Math.min(...prices) : 0);
      const root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
      fetch(`${root}cart.js`, { headers: { Accept: 'application/json' } })
        .then((response) => response.json())
        .then((cart) => {
          // Count this item once: shown as if added, unless it is already in the cart.
          const inCart = (cart.items || []).some((item) => (this.variant ? item.variant_id === this.variant.id : item.product_id === this.product.id));
          const total = Number(cart.total_price || 0) + (inCart ? 0 : itemPrice);
          const remaining = threshold - total;
          const textEl = nudge.querySelector('[data-dac-nudge-text]');
          const bar = nudge.querySelector('[data-dac-nudge-bar]');
          if (textEl) {
            textEl.textContent = remaining > 0
              ? (block.dataset.nudgeText || '').replace('[amount]', formatMoney(remaining, this.format))
              : block.dataset.unlockedText || '';
          }
          if (bar) bar.style.width = `${Math.min(100, Math.max(0, (total / threshold) * 100))}%`;
          nudge.hidden = false;
        })
        .catch(() => { nudge.hidden = true; });
    }
  }

  /* Product cards (Style with, Why not add). A size picks the variant, Add to bag waits for one. */
  const bindCards = (root) => {
    // Capture runs before the theme's add to cart handler, which would post an empty variant.
    root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-dac-card-atc]');
      if (!button) return;
      const card = button.closest('[data-dac-card]');
      if (card.querySelector('[data-dac-card-input]').value) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      card.querySelector('[data-dac-card-error]').hidden = false;
    }, true);
    root.addEventListener('click', (event) => {
      const size = event.target.closest('[data-dac-card-size]');
      if (!size) return;
      const card = size.closest('[data-dac-card]');
      card.querySelectorAll('[data-dac-card-size]').forEach((button) => button.setAttribute('aria-pressed', String(button === size)));
      card.querySelector('[data-dac-card-input]').value = size.dataset.dacCardSize;
      card.querySelector('[data-dac-card-error]').hidden = true;
    });
  };

  const fetchSection = (url) => fetch(url)
    .then((response) => (response.ok ? response.text() : Promise.reject(new Error(url))))
    .then((html) => new DOMParser().parseFromString(html, 'text/html'));

  /* Style with. Cards come from the Product Recommendations API (complementary intent). With none, the section stays hidden. */
  class DacStyle {
    constructor(root) {
      bindCards(root);
      fetchSection(root.dataset.url)
        .then((doc) => {
          const cards = doc.querySelector('[data-dac-style-cards]');
          if (!cards || !cards.querySelector('[data-dac-card]')) return;
          root.querySelector('[data-dac-style-cards]').replaceChildren(...cards.childNodes);
          root.hidden = false;
        })
        .catch(() => {});
    }
  }

  /* Why not add. Pinned cards are in the page, best sellers are added after it loads. */
  class DacWna {
    constructor(root) {
      this.root = root;
      this.track = root.querySelector('[data-dac-wna-track]');
      this.prev = root.querySelector('[data-dac-wna-prev]');
      this.next = root.querySelector('[data-dac-wna-next]');
      bindCards(root);
      this.prev.addEventListener('click', () => this.track.scrollBy({ left: -this.track.clientWidth, behavior: 'smooth' }));
      this.next.addEventListener('click', () => this.track.scrollBy({ left: this.track.clientWidth, behavior: 'smooth' }));
      this.track.addEventListener('scroll', () => this.updateArrows(), { passive: true });
      this.updateArrows();
      fetchSection(root.dataset.url)
        .then((doc) => this.addBestSellers(doc))
        .catch(() => {});
    }

    addBestSellers(doc) {
      const data = this.root.dataset;
      const exclude = new Set((data.exclude || '').split(',').filter(Boolean));
      const cards = Array.from(doc.querySelectorAll('[data-dac-best-sellers] [data-dac-card]'))
        .filter((card) => !exclude.has(card.dataset.handle))
        .slice(0, Number(data.count) || 8);
      // The source section renders with its own default labels, swap in this section's settings.
      cards.forEach((card) => {
        card.querySelectorAll('button[data-dac-card-atc]').forEach((button) => { button.textContent = button.disabled ? data.soldOut : data.atc; });
        card.querySelectorAll('a.dac-card__atc').forEach((link) => { link.textContent = data.options; });
        card.querySelectorAll('[data-dac-card-error]').forEach((error) => { error.textContent = data.error; });
        card.querySelectorAll('.dac-card__badge[data-save]').forEach((badge) => {
          if (data.badge) badge.textContent = data.badge.replace('[percent]', badge.dataset.save);
          else badge.remove();
        });
      });
      this.track.append(...cards);
      this.updateArrows();
    }

    updateArrows() {
      const { scrollLeft, clientWidth, scrollWidth } = this.track;
      this.prev.disabled = scrollLeft <= 2;
      this.next.disabled = scrollLeft + clientWidth >= scrollWidth - 2;
    }
  }

  const init = (scope) => {
    (scope || document).querySelectorAll('[data-dac-pdp]').forEach((root) => {
      if (!root.dacPdp) root.dacPdp = new DacPdp(root);
    });
    (scope || document).querySelectorAll('[data-dac-style]').forEach((root) => {
      if (!root.dacStyle) root.dacStyle = new DacStyle(root);
    });
    (scope || document).querySelectorAll('[data-dac-wna]').forEach((root) => {
      if (!root.dacWna) root.dacWna = new DacWna(root);
    });
  };

  window.DacPdp = DacPdp;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    init();
  }
  document.addEventListener('shopify:section:load', (event) => init(event.target));
})();
