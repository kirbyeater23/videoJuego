'use strict';

if (!window.Vue || !window.gsap) {
  window.GameUI = null;
  document.getElementById('app')?.removeAttribute('v-cloak');
  document.querySelector('.vue-hud')?.remove();
} else {
const { createApp, nextTick } = Vue;

createApp({
  data() {
    return {
      sceneName: 'EMPATIA',
      clock: '07:00',
      notification: '',
      currentTasks: [],
      completedTasks: [],
      missedTasks: [],
      titleActive: true,
      _noticeTween: null,
    };
  },

  mounted() {
    window.GameUI = {
      setScene: sceneName => { this.sceneName = sceneName || 'EMPATIA'; },
      setTitleActive: active => { this.titleActive = !!active; },
      setClock: clock => { this.clock = clock; },
      setTasks: ({ current = [], completed = [], missed = [] }) => {
        this.currentTasks = current;
        this.completedTasks = completed;
        this.missedTasks = missed;
      },
      setNotification: text => this.showNotification(text),
      clearNotification: () => { this.notification = ''; },
      fadeToBlack: () => this.fadeTo(1),
      fadeFromBlack: () => this.fadeTo(0),
    };

    gsap.from('.tasks-paper, .clock-object, .hint-chip', {
      opacity: 0,
      y: -10,
      duration: 0.55,
      stagger: 0.06,
      ease: 'power2.out',
    });
  },

  methods: {
    fadeTo(opacity) {
      gsap.to(this.$refs.fadeLayer, {
        opacity,
        duration: 0.22,
        ease: opacity > 0 ? 'power2.inOut' : 'power2.out',
      });
    },

    showNotification(text) {
      this.notification = text || '';
      nextTick(() => {
        if (this._noticeTween) this._noticeTween.kill();
        this._noticeTween = gsap.fromTo('.notice',
          { opacity: 0, x: 42, scale: 0.98 },
          { opacity: 1, x: 0, scale: 1, duration: 0.35, ease: 'back.out(1.5)' }
        );
      });
    },
  },
}).mount('#app');
}
