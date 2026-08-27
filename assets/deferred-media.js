if (!customElements.get('deferred-media')) {
    customElements.define('deferred-media', class DeferredMedia extends HTMLElement {
        constructor() {
            super();
            this.querySelector('[id^="Deferred-Poster-"]')?.addEventListener('click', () => this.loadContent(true));
        }

        connectedCallback() {
            if (!this.hasAttribute('data-autoplay-pdp') || !this.closest('.productView-mediaList')) return;
            if (this.querySelector('product-model, model-viewer')) return;

            this.slider = this.closest('.productView-mediaList.slider');
            this.isMobileSlider = this.slider && window.matchMedia('(max-width: 991px)').matches;

            const observerOptions = {
                threshold: [0, 0.25, 0.5, 0.75]
            };

            if (this.isMobileSlider) {
                observerOptions.root = this.slider;
            }

            this.autoplayObserver = new IntersectionObserver((entries) => {
                entries.forEach((entry) => this.handleVisibility(entry));
            }, observerOptions);

            this.autoplayObserver.observe(this);

            if (this.isMobileSlider) {
                this.onSliderScroll = () => this.evaluateVisibility();
                this.slider.addEventListener('scroll', this.onSliderScroll, { passive: true });
            }

            this.onViewportChange = () => this.evaluateVisibility();
            window.addEventListener('scroll', this.onViewportChange, { passive: true });
            window.addEventListener('resize', this.onViewportChange, { passive: true });

            requestAnimationFrame(() => this.evaluateVisibility());
            window.setTimeout(() => this.evaluateVisibility(), 150);
            window.setTimeout(() => this.evaluateVisibility(), 500);
        }

        disconnectedCallback() {
            this.autoplayObserver?.disconnect();
            if (this.slider && this.onSliderScroll) {
                this.slider.removeEventListener('scroll', this.onSliderScroll);
            }
            window.removeEventListener('scroll', this.onViewportChange);
            window.removeEventListener('resize', this.onViewportChange);
        }

        getVisibilityRatio() {
            const rect = this.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return 0;

            if (this.isMobileSlider) {
                const rootRect = this.slider.getBoundingClientRect();
                const visibleWidth = Math.min(rect.right, rootRect.right) - Math.max(rect.left, rootRect.left);
                const visibleHeight = Math.min(rect.bottom, rootRect.bottom) - Math.max(rect.top, rootRect.top);

                if (visibleWidth <= 0 || visibleHeight <= 0) return 0;

                return Math.min(visibleWidth / rect.width, visibleHeight / rect.height);
            }

            const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
            const visibleWidth = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);

            if (visibleWidth <= 0 || visibleHeight <= 0) return 0;

            return Math.min(visibleWidth / rect.width, visibleHeight / rect.height);
        }

        evaluateVisibility() {
            const ratio = this.getVisibilityRatio();

            if (ratio >= 0.35) {
                this.loadContent(false);
                this.playMedia();
            } else if (ratio < 0.15) {
                this.pauseMedia();
            }
        }

        handleVisibility(entry) {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
                this.loadContent(false);
                this.playMedia();
            } else if (!entry.isIntersecting || entry.intersectionRatio < 0.15) {
                this.pauseMedia();
            }
        }

        getMediaElement() {
            return this.querySelector('video, iframe');
        }

        playMedia() {
            const mediaElement = this.getMediaElement();
            if (mediaElement?.tagName === 'VIDEO') {
                mediaElement.muted = true;
                mediaElement.defaultMuted = true;
                mediaElement.setAttribute('muted', '');
                mediaElement.setAttribute('playsinline', '');
                mediaElement.setAttribute('webkit-playsinline', '');

                const playPromise = mediaElement.play();
                if (playPromise?.catch) {
                    playPromise.catch(() => {
                        window.setTimeout(() => {
                            mediaElement.play()?.catch(() => {});
                        }, 200);
                    });
                }
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

        bindAutoplayEvents(video) {
            if (video.dataset.autoplayBound === 'true') return;

            video.dataset.autoplayBound = 'true';
            ['loadeddata', 'canplay'].forEach((eventName) => {
                video.addEventListener(eventName, () => this.playMedia(), { once: true });
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
                    deferredElement.autoplay = true;
                    deferredElement.setAttribute('muted', '');
                    deferredElement.setAttribute('autoplay', '');
                    deferredElement.setAttribute('playsinline', '');
                    deferredElement.setAttribute('webkit-playsinline', '');
                    this.bindControlsOnTap(deferredElement);
                    this.bindAutoplayEvents(deferredElement);
                    this.playMedia();
                }

                return;
            }

            this.playMedia();
        }
    });
}
