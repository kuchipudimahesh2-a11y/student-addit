// WhatsApp-style sound effects engine powered by zero-latency Web Audio API
// with fallback to native Capacitor channels on Android/iOS devices.

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const CHAT_SOUNDS_KEY = 'adda_chat_sounds_enabled';
const CHAT_VIBRATE_KEY = 'adda_chat_vibrate_enabled';

class SoundEffectsEngine {
  private ctx: AudioContext | null = null;
  private isUnlocked = false;
  private channelInitialized = false;

  constructor() {
    this.initAudioContext();
    this.setupUnlockListeners();
    void this.initNativeChannel();
  }

  private initAudioContext() {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx && !this.ctx) {
        this.ctx = new AudioCtx();
      }
    } catch {
      // AudioContext unavailable in non-browser context
    }
  }

  private setupUnlockListeners() {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') {
          void this.ctx.resume().then(() => {
            this.isUnlocked = true;
          }).catch(() => {});
        } else {
          this.isUnlocked = true;
        }
      }
    };
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true, passive: true });
    window.addEventListener('touchstart', unlock, { once: true, passive: true });
  }

  /**
   * Initializes high-importance Android Notification Channel via Capacitor if running native
   */
  private async initNativeChannel() {
    if (!Capacitor.isNativePlatform() || this.channelInitialized) return;
    try {
      await LocalNotifications.createChannel({
        id: 'whatsapp_chat_messages',
        name: 'Chat Messages',
        description: 'WhatsApp-style incoming message notifications with sound and pop-up preview',
        importance: 5, // High / Heads-up
        visibility: 1, // Public
        sound: 'whatsapp_notification.wav',
        vibration: true,
        lights: true,
        lightColor: '#25D366',
      });
      this.channelInitialized = true;
    } catch {
      // Running on web or channel creation ignored
    }
  }

  public isSoundsEnabled(): boolean {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(CHAT_SOUNDS_KEY) !== 'false';
  }

  public setSoundsEnabled(enabled: boolean) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(CHAT_SOUNDS_KEY, enabled ? 'true' : 'false');
  }

  public isVibrateEnabled(): boolean {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(CHAT_VIBRATE_KEY) !== 'false';
  }

  public setVibrateEnabled(enabled: boolean) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(CHAT_VIBRATE_KEY, enabled ? 'true' : 'false');
  }

  public isAudioUnlocked(): boolean {
    return this.isUnlocked;
  }

  private ensureContextReady(): boolean {
    if (!this.ctx) this.initAudioContext();
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return true;
  }

  /**
   * Signature WhatsApp Incoming Message Tone (Authentic 2-Tone Melodic Marimba Chime)
   * High-definition harmonic synthesis with instant zero-latency playback.
   */
  public playIncomingMessageSound() {
    if (!this.isSoundsEnabled()) return;
    if (!this.ensureContextReady() || !this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      // Master output gain
      const master = this.ctx.createGain();
      master.gain.setValueAtTime(0.32, now);
      master.connect(this.ctx.destination);

      // 1. Primary fundamental bell tone (880 Hz - A5)
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(876, now + 0.38);

      gain1.gain.setValueAtTime(0.0001, now);
      gain1.gain.exponentialRampToValueAtTime(0.85, now + 0.005);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
      osc1.connect(gain1);
      gain1.connect(master);

      // 2. High sparkle overtone (1760 Hz - A6)
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1760, now);
      osc2.frequency.exponentialRampToValueAtTime(1750, now + 0.22);

      gain2.gain.setValueAtTime(0.0001, now);
      gain2.gain.exponentialRampToValueAtTime(0.45, now + 0.003);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      osc2.connect(gain2);
      gain2.connect(master);

      // 3. Warm wood body transient (440 Hz - A4)
      const osc3 = this.ctx.createOscillator();
      const gain3 = this.ctx.createGain();
      osc3.type = 'triangle';
      osc3.frequency.setValueAtTime(440, now);

      gain3.gain.setValueAtTime(0.0001, now);
      gain3.gain.exponentialRampToValueAtTime(0.3, now + 0.004);
      gain3.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc3.connect(gain3);
      gain3.connect(master);

      // Fire harmonics
      osc1.start(now);
      osc2.start(now);
      osc3.start(now);

      osc1.stop(now + 0.4);
      osc2.stop(now + 0.25);
      osc3.stop(now + 0.15);

      // WhatsApp vibration pattern
      if (this.isVibrateEnabled() && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([0, 180, 80, 180]);
        } catch {}
      }
    } catch {
      // Ignore audio synthesis exceptions
    }
  }

  /**
   * Signature WhatsApp Outgoing Message Sent Sound (Crisp Tactile Pop / Tick)
   */
  public playOutgoingMessageSound() {
    if (!this.isSoundsEnabled()) return;
    if (!this.ensureContextReady() || !this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1350, now);
      osc.frequency.exponentialRampToValueAtTime(420, now + 0.045);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.22, now + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.05);

      // Subtle haptic tick for send
      if (this.isVibrateEnabled() && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(35);
        } catch {}
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Native Mobile Heads-Up Notification Trigger (Capacitor)
   */
  public async triggerNativeNotification(params: {
    title: string;
    body: string;
    id?: number;
    extra?: Record<string, unknown>;
  }) {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: params.id || Math.floor(Math.random() * 1000000),
            title: params.title,
            body: params.body,
            channelId: 'whatsapp_chat_messages',
            smallIcon: 'ic_stat_icon_config_sample',
            iconColor: '#25D366',
            sound: 'whatsapp_notification.wav',
            extra: params.extra || {},
          },
        ],
      });
    } catch {}
  }
}

export const soundEffects = new SoundEffectsEngine();
