/* Bundle Builder — ported from mate theme, adapted for crosshatch.
 * Posts the bundle as a single cart line item using the `_components`
 * line-property convention (Shopify Bundles "Method 2": the app expands
 * the JSON array into child cart lines, exposed in Liquid as the
 * parent line item's `item_components` collection).
 */
(function () {
  'use strict';

  class BundleProductForm extends HTMLElement {
    get formId() {
      return this.getAttribute('id');
    }

    get rowIndex() {
      return this.closest('[data-bundle-row-index]').dataset.bundleRowIndex;
    }

    get productIndex() {
      return this.closest('[data-product-index]').dataset.productIndex;
    }

    connectedCallback() {
      this.form = this.querySelector('form');
      this.masterSelect = this.querySelector("[name='id']");
      this.variants = JSON.parse(
        this.querySelector('[data-variants]')?.textContent || '[]'
      );
      this.product = JSON.parse(
        this.querySelector('[data-product]')?.textContent || '{}'
      );
      this.addEventListener('variant:change', this.handleVariantChange.bind(this));
      this.form.addEventListener('submit', this.handleSubmit.bind(this));
      this.addEventListener('add-to-cart', this.handleSubmit.bind(this));
    }

    handleVariantChange(event) {
      const variant = event.detail.variant;
      this.masterSelect.value = variant.id;
    }

    handleSubmit(event) {
      event.preventDefault();
      this.addToBundle();
    }

    addToBundle() {
      const variant = this.variants.find((v) => v.id == this.masterSelect.value);
      if (!variant) return;

      const imageUrl = variant.featured_image
        ? variant.featured_image.src || variant.featured_image
        : this.product.featured_image;

      this.dispatchEvent(
        new CustomEvent('addToBundle', {
          detail: {
            variant: {
              id: variant.id,
              imageUrl,
              title: variant.title,
              price: variant.price,
              option1: variant.option1,
              option2: variant.option2,
              option3: variant.option3,
              options: variant.options,
            },
            product: this.product,
            rowIndex: this.rowIndex,
            productIndex: this.productIndex,
          },
          bubbles: true,
        })
      );
    }
  }

  class BundleVariantPicker extends HTMLElement {
    connectedCallback() {
      this.variants = JSON.parse(this.querySelector('[data-variants]').textContent);
      this.currentVariant = null;
      this.optionInputs = this.querySelectorAll('input[type="radio"]');
      this.linkedProductInputs = this.querySelectorAll('[data-linked-product-url]');

      this.optionInputs.forEach((input) =>
        input.addEventListener('change', this.updateCurrentVariant.bind(this, input))
      );
      this.linkedProductInputs.forEach((input) =>
        input.addEventListener('click', this.linkedProductClick.bind(this))
      );
    }

    linkedProductClick(e) {
      e.preventDefault();
      this.dispatchEvent(
        new CustomEvent('linked-product-change', {
          detail: { productUrl: e.currentTarget.dataset.linkedProductUrl },
          bubbles: true,
        })
      );
    }

    updateCheckedInputs() {
      this.optionInputs.forEach((input) => {
        if (input.checked) {
          input.setAttribute('checked', 'checked');
        } else {
          input.removeAttribute('checked');
        }
      });
    }

    getSelectedValues() {
      return Array.from(this.querySelectorAll('input:checked')).reduce((acc, input) => {
        acc[input.name] = input.value;
        return acc;
      }, {});
    }

    updateCurrentVariant() {
      this.updateCheckedInputs();
      const selectedValues = this.getSelectedValues();

      this.currentVariant =
        this.variants.find((variant) =>
          Object.entries(selectedValues).every(([name, value]) => variant[name] === value)
        ) || null;

      this.querySelectorAll('.bundle-variant-picker__option').forEach((optionEl) => {
        const valueDisplay = optionEl.querySelector('[data-option-name-value]');
        const selectedInput = optionEl.querySelector('input:checked');
        if (valueDisplay && selectedInput) {
          valueDisplay.textContent = selectedInput.value;
        }
      });

      if (this.currentVariant) {
        this.dispatchEvent(
          new CustomEvent('variant:change', {
            detail: { variant: this.currentVariant },
            bubbles: true,
          })
        );
      }
    }
  }

  class BundleProductCard extends HTMLElement {
    connectedCallback() {
      this.templateName = this.dataset.template ?? 'bundle-builder-product-card';
      this.addEventListener('linked-product-change', (e) => this.handleProductChange(e));
    }

    handleProductChange(e) {
      const productUrl = e.detail.productUrl;
      this.classList.add('loading');
      fetch(productUrl + '?view=' + this.templateName)
        .then((res) => res.text())
        .then((html) => {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const card = doc.querySelector('bundle-product-card');
          if (card) {
            this.innerHTML = card.innerHTML;
            this.dataset.productId = card.dataset.productId;
          }
          this.classList.remove('loading');
        })
        .catch((err) => {
          console.error(err);
          this.classList.remove('loading');
        });
    }
  }

  class BundleBuilder extends HTMLElement {
    connectedCallback() {
      this.numberOfRows = parseInt(this.dataset.numberOfRows, 10);
      this.chosenVariants = Array.from({ length: this.numberOfRows }).reduce((acc, _, i) => {
        acc[i] = null;
        return acc;
      }, {});
      this.atcButtons = this.querySelectorAll('[data-bundle-add-product]');
      this.bundleVariantId = this.dataset.bundleVariantId;
      this.fixedPriceCents = parseInt(this.dataset.bundleFixedPrice || '0', 10) || 0;
      this.discountPercent = parseFloat(this.dataset.bundleDiscountPercent || '0') || 0;
      this.resetBundleButtons = this.querySelectorAll('[data-reset-bundle]');
      this.chosenProductRows = this.querySelectorAll('[data-row-chosen-product]');
      this.bindEvents();
    }

    bindEvents() {
      this.addEventListener('addToBundle', (e) => this.addToBundle(e));
      this.querySelectorAll('[data-bundle-remove-product]').forEach((button) => {
        button.addEventListener('click', (e) => {
          e.stopPropagation();
          const rowIndex = e.target.closest('[data-row-chosen-product]').dataset.rowChosenProduct;
          this.removeFromBundle(rowIndex);
        });
      });
      this.resetBundleButtons.forEach((el) =>
        el.addEventListener('click', this.resetBundle.bind(this))
      );
      this.atcButtons.forEach((el) =>
        el.addEventListener('click', this.addBundleToCart.bind(this))
      );
      this.chosenProductRows.forEach((el) =>
        el.addEventListener('click', () => this.handleEmptyCardClick(el))
      );
    }

    handleEmptyCardClick(el) {
      this.focusRow(el.dataset.rowChosenProduct);
    }

    focusRow(rowIndex) {
      this.querySelectorAll('[data-bundle-row-index]').forEach((r) => {
        const details = r.querySelector('details');
        if (details) details.open = r.dataset.bundleRowIndex == rowIndex;
      });
      this.closeMobileOverview();
      const row = this.querySelector(`[data-bundle-row-index="${rowIndex}"]`);
      if (row) {
        const rect = row.getBoundingClientRect();
        const isDesktop = window.matchMedia('(min-width: 48em)').matches;
        const offset = isDesktop ? 168 : 68;
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        window.scrollTo({ top: scrollTop + rect.top - offset, behavior: 'smooth' });
      }
    }

    resetBundle() {
      this.chosenVariants = Array.from({ length: this.numberOfRows }).reduce((acc, _, i) => {
        acc[i] = null;
        return acc;
      }, {});
      this.render();
    }

    closeMobileOverview() {
      this.querySelector('bundle-overview-mobile')?.close();
    }

    addBundleToCart() {
      const chosen = Object.values(this.chosenVariants).filter(Boolean);
      if (chosen.length < this.numberOfRows) {
        this.closeMobileOverview();
        return;
      }

      const subtotalCents = chosen.reduce((s, { variant }) => s + variant.price, 0);
      const components = chosen.map(({ variant }) => {
        let unitCents = variant.price;
        if (this.fixedPriceCents > 0 && subtotalCents > 0) {
          unitCents = Math.round((variant.price / subtotalCents) * this.fixedPriceCents);
        } else if (this.discountPercent > 0) {
          unitCents = Math.round(variant.price * (1 - this.discountPercent / 100));
        }
        const component = {
          id: String(variant.id),
          qty: 1,
          price: (unitCents / 100).toFixed(2),
        };
        if (unitCents !== variant.price) {
          component.properties = { _original_price: (variant.price / 100).toFixed(2) };
        }
        return component;
      });

      // Absorb cents drift from proportional rounding into the last component
      // so the line-sum exactly hits the configured fixed price.
      if (this.fixedPriceCents > 0 && components.length > 0) {
        const sumCents = components.reduce(
          (s, c) => s + Math.round(parseFloat(c.price) * 100),
          0
        );
        const drift = this.fixedPriceCents - sumCents;
        if (drift !== 0) {
          const last = components[components.length - 1];
          last.price = (
            (Math.round(parseFloat(last.price) * 100) + drift) /
            100
          ).toFixed(2);
        }
      }

      const item = {
        id: Number(this.bundleVariantId),
        quantity: 1,
        properties: {
          _components: JSON.stringify(components),
        },
      };

      this.atcButtons.forEach((b) => b.classList.add('is-loading'));

      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items: [item] }),
      })
        .then((res) => res.json())
        .then(() => {
          if (window.Shopify && typeof Shopify.getCart === 'function') {
            Shopify.getCart((cart) => {
              document.querySelectorAll('[data-cart-count]').forEach((el) => {
                el.innerText = cart.item_count;
              });
              document.body.classList.add('cart-sidebar-show');
              const cartItems = document.querySelector('quick-cart-items');
              if (cartItems && typeof cartItems.update === 'function') {
                cartItems.update(cart);
              }
            });
          }
          this.dispatchEvent(new CustomEvent('bundle:added', { bubbles: true }));
        })
        .catch((err) => console.error(err))
        .finally(() => {
          this.atcButtons.forEach((b) => b.classList.remove('is-loading'));
        });
    }

    addToBundle(e) {
      const { variant, product, rowIndex } = e.detail;
      this.chosenVariants[rowIndex] = { variant, product };
      this.render();
      this.focusRow(Number(rowIndex) + 1);
    }

    removeFromBundle(rowIndex) {
      this.chosenVariants[rowIndex] = null;
      this.render();
    }

    render() {
      this.renderCardButtons();
      this.renderChosenProducts();
      this.renderTotal();
      this.renderButton();
    }

    renderCardButtons() {
      const productCards = document.querySelectorAll('bundle-product-card[data-product-id]');
      const chosenProductIds = Object.values(this.chosenVariants)
        .filter(Boolean)
        .map((item) => item.product.id.toString());

      productCards.forEach((card) => {
        const atcButton = card.querySelector('[data-atc-button]');
        if (atcButton) {
          atcButton.classList.toggle('added', chosenProductIds.includes(card.dataset.productId));
        }
      });
    }

    renderChosenProducts() {
      this.querySelectorAll('[data-row-chosen-product]').forEach((el) => {
        const rowIndex = el.dataset.rowChosenProduct;
        const variantAndProduct = this.chosenVariants[rowIndex];
        const titleAndOptions = el.querySelector('[data-title-and-options]');
        const innerContent = el.querySelector('[data-inner-content]');

        if (!variantAndProduct) {
          innerContent.innerHTML = innerContent.dataset.title;
          titleAndOptions.innerHTML = '';
          el.querySelector('[data-bundle-remove-product]').classList.add('hidden');
          return;
        }

        const { variant, product } = variantAndProduct;
        innerContent.innerHTML = `<img src="${variant.imageUrl}" alt="${variant.title}" />`;
        el.querySelector('[data-bundle-remove-product]').classList.remove('hidden');
        titleAndOptions.innerHTML = this.renderTitleAndOptions(product, variant);
      });
    }

    renderTitleAndOptions(product, variant) {
      const optionNames = (product.options || '').split(',').filter(Boolean);
      const optionRows = optionNames
        .map((option, index) =>
          `<p class="bundle-chosen-product-option">${option}: ${variant.options[index] || ''}</p>`
        )
        .join('');
      return `<div class="bundle-chosen-product-title">${product.title}</div>${optionRows}`;
    }

    renderTotal() {
      const chosen = Object.values(this.chosenVariants).filter(Boolean);
      const subtotal = chosen.reduce((s, { variant }) => s + variant.price, 0);

      let final;
      if (this.fixedPriceCents > 0 && chosen.length === this.numberOfRows) {
        final = this.fixedPriceCents;
      } else if (this.discountPercent > 0) {
        final = Math.round(subtotal * (1 - this.discountPercent / 100));
      } else {
        final = subtotal;
      }

      let original = 0;
      chosen.forEach(({ variant }) => {
        const compareAt = variant.compare_at_price;
        original += compareAt && compareAt > variant.price ? compareAt : variant.price;
      });

      const moneyFormat = window.money_format || '${{amount}}';
      this.updateAllEls('[data-bundle-final-price]', Shopify.formatMoney(final, moneyFormat));
      this.updateAllEls(
        '[data-bundle-original-price]',
        original > final ? Shopify.formatMoney(original, moneyFormat) : ''
      );
    }

    renderButton() {
      const disabled = Object.values(this.chosenVariants).some((v) => !v);
      this.atcButtons.forEach((el) => el.classList.toggle('disabled', disabled));
    }

    updateAllEls(selector, value) {
      this.querySelectorAll(selector).forEach((el) => {
        el.innerHTML = value;
      });
    }
  }

  class BundleOverviewMobile extends HTMLElement {
    connectedCallback() {
      this.summaryToggle = this.querySelector('[data-summary-toggle]');
      this.summaryToggle.addEventListener('click', this.toggleSummary.bind(this));
    }

    toggleSummary() {
      this.classList.toggle('active');
    }

    close() {
      this.classList.remove('active');
    }
  }

  const defs = [
    ['bundle-product-form', BundleProductForm],
    ['bundle-variant-picker', BundleVariantPicker],
    ['bundle-product-card', BundleProductCard],
    ['bundle-builder', BundleBuilder],
    ['bundle-overview-mobile', BundleOverviewMobile],
  ];
  defs.forEach(([name, cls]) => {
    if (!customElements.get(name)) customElements.define(name, cls);
  });
})();
