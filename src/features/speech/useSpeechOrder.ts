import { useCallback, useEffect, useRef, useState } from 'react';
import type { Order } from '@/context/RestaurantContext';
import {
  buildSummary,
  buildFullDetail,
  buildAllOrdersIntro,
  buildShortForAll,
  type SpeechLang,
} from './speechScripts';

const LANG_KEY = 'speech.lang';

export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

let voicesCache: SpeechSynthesisVoice[] | null = null;
const loadVoices = (): Promise<SpeechSynthesisVoice[]> => {
  return new Promise(resolve => {
    if (!speechSupported) return resolve([]);
    const existing = window.speechSynthesis.getVoices();
    if (existing.length) {
      voicesCache = existing;
      return resolve(existing);
    }
    const handler = () => {
      const v = window.speechSynthesis.getVoices();
      voicesCache = v;
      window.speechSynthesis.removeEventListener('voiceschanged', handler);
      resolve(v);
    };
    window.speechSynthesis.addEventListener('voiceschanged', handler);
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1000);
  });
};

const pickVoice = (voices: SpeechSynthesisVoice[], lang: SpeechLang): SpeechSynthesisVoice | undefined => {
  const priorities = lang === 'hi'
    ? ['hi-IN', 'hi', 'en-IN', 'en-US', 'en-GB', 'en']
    : ['en-IN', 'en-US', 'en-GB', 'en'];
  for (const p of priorities) {
    const v = voices.find(v => v.lang.toLowerCase().startsWith(p.toLowerCase()));
    if (v) return v;
  }
  return voices[0];
};

export const playChime = () => {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 440;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch { /* noop */ }
};

export interface UseSpeechOrder {
  speakSummary: (o: Order) => void;
  speakFullDetail: (o: Order) => void;
  speakAllOrders: (orders: Order[]) => void;
  stopSpeech: () => void;
  isSpeaking: boolean;
  activeSpeakingOrderId: string | null;
  language: SpeechLang;
  setLanguage: (l: SpeechLang) => void;
  supported: boolean;
}

export const useSpeechOrder = (): UseSpeechOrder => {
  const [language, setLanguageState] = useState<SpeechLang>(() => {
    if (typeof window === 'undefined') return 'hi';
    return (localStorage.getItem(LANG_KEY) as SpeechLang) || 'hi';
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeSpeakingOrderId, setActiveSpeakingOrderId] = useState<string | null>(null);
  const queueAbort = useRef(false);

  useEffect(() => {
    if (speechSupported) loadVoices();
    return () => {
      if (speechSupported) window.speechSynthesis.cancel();
    };
  }, []);

  const setLanguage = useCallback((l: SpeechLang) => {
    setLanguageState(l);
    try { localStorage.setItem(LANG_KEY, l); } catch { /* noop */ }
  }, []);

  const stopSpeech = useCallback(() => {
    queueAbort.current = true;
    if (speechSupported) window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setActiveSpeakingOrderId(null);
  }, []);

  const speakText = useCallback(async (text: string, orderId: string | null) => {
    if (!speechSupported) return;
    window.speechSynthesis.cancel();
    queueAbort.current = false;
    const voices = voicesCache || await loadVoices();
    const voice = pickVoice(voices, language);
    const utter = new SpeechSynthesisUtterance(text);
    if (voice) utter.voice = voice;
    utter.lang = voice?.lang || (language === 'hi' ? 'hi-IN' : 'en-IN');
    utter.rate = 1;
    utter.pitch = 1;
    setIsSpeaking(true);
    setActiveSpeakingOrderId(orderId);
    return new Promise<void>(resolve => {
      utter.onend = () => {
        setIsSpeaking(false);
        setActiveSpeakingOrderId(null);
        resolve();
      };
      utter.onerror = () => {
        setIsSpeaking(false);
        setActiveSpeakingOrderId(null);
        resolve();
      };
      window.speechSynthesis.speak(utter);
    });
  }, [language]);

  const speakSummary = useCallback((o: Order) => {
    void speakText(buildSummary(o, language), o.id);
  }, [language, speakText]);

  const speakFullDetail = useCallback((o: Order) => {
    void speakText(buildFullDetail(o, language), o.id);
  }, [language, speakText]);

  const speakAllOrders = useCallback(async (orders: Order[]) => {
    if (!speechSupported || orders.length === 0) return;
    queueAbort.current = false;
    await speakText(buildAllOrdersIntro(orders.length, language), null);
    for (const o of orders) {
      if (queueAbort.current) break;
      await new Promise(r => setTimeout(r, 1000));
      if (queueAbort.current) break;
      await speakText(buildShortForAll(o, language), o.id);
    }
  }, [language, speakText]);

  return {
    speakSummary,
    speakFullDetail,
    speakAllOrders,
    stopSpeech,
    isSpeaking,
    activeSpeakingOrderId,
    language,
    setLanguage,
    supported: speechSupported,
  };
};
