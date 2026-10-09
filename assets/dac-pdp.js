/* Product information, redesigned product page. No dependencies. */
(() => {
  if (window.DacPdp) return;

  const DESKTOP = window.matchMedia('(min-width: 1025px)');
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
      this.renderDelivery();
      this.syncOptions();
      if (this.variant) this.applyVariant(this.variant, false);
      this.updateNudge();
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
    }

    setVariantInput(variant) {
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
          const total = Number(cart.total_price || 0) + itemPrice;
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

  const init = (scope) => {
    (scope || document).querySelectorAll('[data-dac-pdp]').forEach((root) => {
      if (!root.dacPdp) root.dacPdp = new DacPdp(root);
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
