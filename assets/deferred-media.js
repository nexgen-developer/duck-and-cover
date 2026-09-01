if (!customElements.get('deferred-media')) {
    customElements.define('deferred-media', class DeferredMedia extends HTMLElement {
        constructor() {
            super();
            this.querySelector('[id^="Deferred-Poster-"]')?.addEventListener('click', () => this.loadContent(true));
            this.shouldAutoplay = false;
            this.playRetryTimer = null;
            this.pauseDelayTimer = null;
            this.scrollSettleTimer = null;
        }

        connectedCallback() {
            if (!this.hasAttribute('data-autoplay-pdp') || !this.closest('.productView-mediaList')) return;
            if (this.querySelector('product-model, model-viewer')) return;

            this.slider = this.closest('.productView-mediaList.slider');
            this.sliderComponent = this.closest('slider-component');
            this.isMobileSlider = this.slider && window.matchMedia('(max-width: 991px)').matches;

            const observerOptions = {
                threshold: [0, 0.2, 0.35, 0.5, 0.75, 1]
            };

            if (this.isMobileSlider) {
                observerOptions.root = this.slider;
            }

            this.autoplayObserver = new IntersectionObserver((entries) => {
                entries.forEach((entry) => this.handleVisibility(entry));
            }, observerOptions);

            this.autoplayObserver.observe(this);

            if (this.isMobileSlider) {
                this.onSliderScroll = () => this.scheduleVisibilityCheck();
                this.slider.addEventListener('scroll', this.onSliderScroll, { passive: true });
                this.slider.addEventListener('scrollend', this.onSliderScrollSettle = () => this.evaluateVisibility(true), { passive: true });

                this.onSliderButtonClick = () => {
                    window.setTimeout(() => this.evaluateVisibility(true), 50);
                    window.setTimeout(() => this.evaluateVisibility(true), 320);
                };
                this.sliderComponent?.querySelectorAll('.slider-button').forEach((button) => {
                    button.addEventListener('click', this.onSliderButtonClick);
                });
            }

            this.onViewportChange = () => this.scheduleVisibilityCheck();
            window.addEventListener('scroll', this.onViewportChange, { passive: true });
            window.addEventListener('resize', this.onViewportChange, { passive: true });

            requestAnimationFrame(() => this.evaluateVisibility(true));
            window.setTimeout(() => this.evaluateVisibility(true), 150);
            window.setTimeout(() => this.evaluateVisibility(true), 500);
        }

        disconnectedCallback() {
            this.autoplayObserver?.disconnect();
            this.clearPlayRetries();
            this.clearPauseDelay();
            this.clearScrollSettle();

            if (this.slider && this.onSliderScroll) {
                this.slider.removeEventListener('scroll', this.onSliderScroll);
            }
            if (this.slider && this.onSliderScrollSettle) {
                this.slider.removeEventListener('scrollend', this.onSliderScrollSettle);
            }
            if (this.onSliderButtonClick) {
                this.sliderComponent?.querySelectorAll('.slider-button').forEach((button) => {
                    button.removeEventListener('click', this.onSliderButtonClick);
                });
            }

            window.removeEventListener('scroll', this.onViewportChange);
            window.removeEventListener('resize', this.onViewportChange);
        }

        scheduleVisibilityCheck() {
            this.clearScrollSettle();
            this.evaluateVisibility(false);
            this.scrollSettleTimer = window.setTimeout(() => this.evaluateVisibility(true), 180);
        }

        clearScrollSettle() {
            if (this.scrollSettleTimer) {
                window.clearTimeout(this.scrollSettleTimer);
                this.scrollSettleTimer = null;
            }
        }

        clearPauseDelay() {
            if (this.pauseDelayTimer) {
                window.clearTimeout(this.pauseDelayTimer);
                this.pauseDelayTimer = null;
            }
        }

        clearPlayRetries() {
            if (this.playRetryTimer) {
                window.clearTimeout(this.playRetryTimer);
                this.playRetryTimer = null;
            }
        }

        getVisibilityRatio() {
            const rect = this.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return 0;

            if (this.isMobileSlider) {
                const rootRect = this.slider.getBoundingClientRect();
                const visibleWidth = Math.min(rect.right, rootRect.right) - Math.max(rect.left, rootRect.left);
                const visibleHeight = Math.min(rect.bottom, rootRect.bottom) - Math.max(rect.top, rootRect.top);

                if (visibleWidth <= 0 || visibleHeight <= 0) return 0;

                // Also require some overlap with the viewport so off-screen slides
                // do not keep trying to play after the user scrolls the page away.
                const viewportHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
                if (viewportHeight <= 0) return 0;

                return Math.min(visibleWidth / rect.width, visibleHeight / rect.height);
            }

            const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
            const visibleWidth = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);

            if (visibleWidth <= 0 || visibleHeight <= 0) return 0;

            return Math.min(visibleWidth / rect.width, visibleHeight / rect.height);
        }

        activateAutoplay() {
            this.clearPauseDelay();
            this.shouldAutoplay = true;
            this.loadContent(false);
            this.playMedia();
        }

        deactivateAutoplay() {
            this.shouldAutoplay = false;
            this.clearPlayRetries();
            this.pauseMedia();
        }

        evaluateVisibility(forceSettle = false) {
            const ratio = this.getVisibilityRatio();

            if (ratio >= 0.35) {
                this.activateAutoplay();
            } else if (ratio < 0.15) {
                // Delay pause so scroll-snap flicker mid-swipe does not kill playback.
                this.clearPauseDelay();
                this.pauseDelayTimer = window.setTimeout(() => {
                    if (this.getVisibilityRatio() < 0.15) {
                        this.deactivateAutoplay();
                    } else if (this.getVisibilityRatio() >= 0.35) {
                        this.activateAutoplay();
                    }
                }, forceSettle ? 0 : 220);
            } else if (forceSettle && this.shouldAutoplay) {
                this.playMedia();
            }
        }

        handleVisibility(entry) {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
                this.activateAutoplay();
            } else if (!entry.isIntersecting || entry.intersectionRatio < 0.15) {
                this.clearPauseDelay();
                this.pauseDelayTimer = window.setTimeout(() => {
                    const ratio = this.getVisibilityRatio();
                    if (ratio < 0.15) {
                        this.deactivateAutoplay();
                    } else if (ratio >= 0.35) {
                        this.activateAutoplay();
                    }
                }, 220);
            }
        }

        getMediaElement() {
            return this.querySelector('video, iframe');
        }

        playMedia() {
            const mediaElement = this.getMediaElement();
            if (mediaElement?.tagName !== 'VIDEO') return;
            if (!this.shouldAutoplay) return;

            mediaElement.muted = true;
            mediaElement.defaultMuted = true;
            mediaElement.setAttribute('muted', '');
            mediaElement.setAttribute('playsinline', '');
            mediaElement.setAttribute('webkit-playsinline', '');

            this.attemptPlay(mediaElement, 0);
        }

        attemptPlay(mediaElement, attempt) {
            if (!this.shouldAutoplay && attempt > 0) return;
            if (!mediaElement || mediaElement.tagName !== 'VIDEO') return;
            if (!mediaElement.paused && !mediaElement.ended) {
                this.clearPlayRetries();
                return;
            }

            const playPromise = mediaElement.play();
            if (playPromise?.then) {
                playPromise.then(() => {
                    this.clearPlayRetries();
                }).catch(() => {
                    this.schedulePlayRetry(mediaElement, attempt);
                });
            } else {
                this.schedulePlayRetry(mediaElement, attempt);
            }
        }

        schedulePlayRetry(mediaElement, attempt) {
            if (attempt >= 10) return;

            this.clearPlayRetries();
            this.playRetryTimer = window.setTimeout(() => {
                this.attemptPlay(mediaElement, attempt + 1);
            }, 150 + attempt * 100);
        }

        pauseMedia() {
            this.clearPlayRetries();
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
            ['loadeddata', 'canplay', 'canplaythrough'].forEach((eventName) => {
                video.addEventListener(eventName, () => {
                    if (this.shouldAutoplay) this.playMedia();
                });
            });
        }

        loadContent(focus = true) {
            if (!this.getAttribute('loaded')) {
                // Avoid pausing the video we are about to create/play.
                document.querySelectorAll('.js-youtube').forEach((video) => {
                    video.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
                });
                document.querySelectorAll('.js-vimeo').forEach((video) => {
                    video.contentWindow.postMessage('{"method":"pause"}', '*');
                });
                document.querySelectorAll('video').forEach((video) => {
                    if (!this.contains(video)) video.pause();
                });
                document.querySelectorAll('product-model').forEach((model) => model.modelViewerUI?.pause());

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

                    if (focus) this.shouldAutoplay = true;
                    this.playMedia();
                }

                return;
            }

            this.playMedia();
        }
    });
}
