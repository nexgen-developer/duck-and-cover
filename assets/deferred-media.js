if (!customElements.get('deferred-media')) {
    customElements.define('deferred-media', class DeferredMedia extends HTMLElement {
        constructor() {
            super();
            this.querySelector('[id^="Deferred-Poster-"]')?.addEventListener('click', this.loadContent.bind(this));
        }

        connectedCallback() {
            if (!this.closest('.productView-mediaList')) return;
            if (this.querySelector('product-model, model-viewer')) return;

            this.autoplayObserver = new IntersectionObserver((entries) => {
                if (!entries.some((entry) => entry.isIntersecting)) return;
                this.loadContent(false);
                this.autoplayObserver.disconnect();
            }, { threshold: 0.35 });

            this.autoplayObserver.observe(this);
        }

        disconnectedCallback() {
            this.autoplayObserver?.disconnect();
        }

        loadContent(focus = true) {
            window.pauseAllMedia();
            if (!this.getAttribute('loaded')) {
                const content = document.createElement('div');
                content.appendChild(this.querySelector('template').content.firstElementChild.cloneNode(true));

                this.setAttribute('loaded', true);
                const deferredElement = this.appendChild(content.querySelector('video, model-viewer, iframe'));
                if (focus) deferredElement.focus();

                if (deferredElement?.tagName === 'VIDEO') {
                    deferredElement.muted = true;
                    deferredElement.defaultMuted = true;
                    deferredElement.setAttribute('muted', '');
                    deferredElement.setAttribute('playsinline', '');
                    deferredElement.setAttribute('webkit-playsinline', '');
                    const playPromise = deferredElement.play();
                    if (playPromise?.catch) playPromise.catch(() => {});
                }
            }
        }
    });
}
