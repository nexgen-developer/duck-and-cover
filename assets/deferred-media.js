if (!customElements.get('deferred-media')) {
    customElements.define('deferred-media', class DeferredMedia extends HTMLElement {
        constructor() {
            super();
            this.querySelector('[id^="Deferred-Poster-"]')?.addEventListener('click', () => this.loadContent(true));
        }

        connectedCallback() {
            if (!this.dataset.autoplayPdp || !this.closest('.productView-mediaList')) return;
            if (this.querySelector('product-model, model-viewer')) return;

            const slider = this.closest('.productView-mediaList.slider');
            const observerOptions = {
                threshold: [0, 0.75]
            };

            if (slider && window.matchMedia('(max-width: 991px)').matches) {
                observerOptions.root = slider;
            }

            this.autoplayObserver = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.intersectionRatio >= 0.75) {
                        this.loadContent(false);
                        this.playMedia();
                    } else if (entry.intersectionRatio < 0.25) {
                        this.pauseMedia();
                    }
                });
            }, observerOptions);

            this.autoplayObserver.observe(this);
        }

        disconnectedCallback() {
            this.autoplayObserver?.disconnect();
        }

        getMediaElement() {
            return this.querySelector('video, iframe');
        }

        playMedia() {
            const mediaElement = this.getMediaElement();
            if (mediaElement?.tagName === 'VIDEO') {
                mediaElement.muted = true;
                mediaElement.defaultMuted = true;
                const playPromise = mediaElement.play();
                if (playPromise?.catch) playPromise.catch(() => {});
            }
        }

        pauseMedia() {
            const mediaElement = this.getMediaElement();
            if (mediaElement?.tagName === 'VIDEO') {
                mediaElement.pause();
            }
        }

        bindControlsOnTap(video) {
            if (video.dataset.controlsBound === 'true') return;

            video.dataset.controlsBound = 'true';
            video.addEventListener('click', () => {
                video.controls = true;
            });
        }

        loadContent(focus = true) {
            if (!this.getAttribute('loaded')) {
                window.pauseAllMedia();

                const content = document.createElement('div');
                content.appendChild(this.querySelector('template').content.firstElementChild.cloneNode(true));

                this.setAttribute('loaded', true);
                const deferredElement = this.appendChild(content.querySelector('video, model-viewer, iframe'));
                if (focus) deferredElement?.focus();

                if (deferredElement?.tagName === 'VIDEO') {
                    deferredElement.muted = true;
                    deferredElement.defaultMuted = true;
                    deferredElement.controls = false;
                    deferredElement.setAttribute('muted', '');
                    deferredElement.setAttribute('playsinline', '');
                    deferredElement.setAttribute('webkit-playsinline', '');
                    this.bindControlsOnTap(deferredElement);
                    const playPromise = deferredElement.play();
                    if (playPromise?.catch) playPromise.catch(() => {});
                }

                return;
            }

            this.playMedia();
        }
    });
}
