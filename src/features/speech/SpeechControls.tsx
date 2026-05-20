import { Volume2, VolumeX, List, Megaphone, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { Order } from '@/context/RestaurantContext';
import type { UseSpeechOrder } from './useSpeechOrder';

const SoundWave = () => (
  <span className="inline-flex items-end gap-[2px] h-3 ml-1" aria-hidden>
    <span className="w-[2px] bg-current rounded-sm animate-[soundwave_0.9s_ease-in-out_infinite]" style={{ height: '60%' }} />
    <span className="w-[2px] bg-current rounded-sm animate-[soundwave_0.9s_ease-in-out_infinite_0.15s]" style={{ height: '100%' }} />
    <span className="w-[2px] bg-current rounded-sm animate-[soundwave_0.9s_ease-in-out_infinite_0.3s]" style={{ height: '70%' }} />
  </span>
);

interface VoiceButtonsProps {
  order: Order;
  speech: UseSpeechOrder;
}

export const VoiceButtons = ({ order, speech }: VoiceButtonsProps) => {
  if (!speech.supported) return null;
  const isActive = speech.activeSpeakingOrderId === order.id && speech.isSpeaking;

  const handleSummary = () => {
    if (isActive) speech.stopSpeech();
    else speech.speakSummary(order);
  };
  const handleDetail = () => {
    if (isActive) speech.stopSpeech();
    else speech.speakFullDetail(order);
  };

  const baseCls = 'flex-1 min-h-[44px] flex-col gap-0 py-1.5 leading-tight';
  const activeCls = 'bg-amber-500/15 border-amber-500 text-amber-600 dark:text-amber-400 animate-pulse';

  return (
    <div className="flex gap-2 pt-1">
      <Button
        variant="outline"
        onClick={handleSummary}
        className={cn(baseCls, isActive && activeCls)}
        aria-label="Listen to order summary"
      >
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          {isActive ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          सुनें
          {isActive && <SoundWave />}
        </span>
        <span className="text-[10px] text-muted-foreground font-normal">Listen</span>
      </Button>
      <Button
        variant="outline"
        onClick={handleDetail}
        className={cn(baseCls, isActive && activeCls)}
        aria-label="Listen to full order detail"
      >
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          {isActive ? <VolumeX className="w-4 h-4" /> : <List className="w-4 h-4" />}
          पूरा विवरण
          {isActive && <SoundWave />}
        </span>
        <span className="text-[10px] text-muted-foreground font-normal">Full detail</span>
      </Button>
    </div>
  );
};

interface SpeechTopBarProps {
  speech: UseSpeechOrder;
  orders: Order[];
  showAutoAnnounce?: boolean;
  autoAnnounce?: boolean;
  onAutoAnnounceChange?: (v: boolean) => void;
}

export const SpeechTopBar = ({ speech, orders, showAutoAnnounce, autoAnnounce, onAutoAnnounceChange }: SpeechTopBarProps) => {
  if (!speech.supported) return null;
  const allActive = speech.isSpeaking;

  return (
    <div className="flex items-center gap-2 flex-wrap px-4 py-2 border-b bg-background/60 max-w-2xl mx-auto w-full">
      <div className="inline-flex rounded-full border overflow-hidden text-xs">
        <button
          type="button"
          onClick={() => speech.setLanguage('hi')}
          className={cn('px-3 py-1.5 font-medium', speech.language === 'hi' ? 'bg-primary text-primary-foreground' : 'bg-transparent')}
        >
          हिंदी
        </button>
        <button
          type="button"
          onClick={() => speech.setLanguage('en')}
          className={cn('px-3 py-1.5 font-medium', speech.language === 'en' ? 'bg-primary text-primary-foreground' : 'bg-transparent')}
        >
          English
        </button>
      </div>

      <Button
        size="sm"
        variant="outline"
        onClick={() => allActive ? speech.stopSpeech() : speech.speakAllOrders(orders)}
        className={cn('gap-1.5', allActive && 'bg-amber-500/15 border-amber-500 text-amber-600 dark:text-amber-400 animate-pulse')}
        disabled={!allActive && orders.length === 0}
      >
        {allActive ? <Square className="w-4 h-4" /> : <Megaphone className="w-4 h-4" />}
        {allActive ? 'रोकें / Stop' : 'सभी सुनें / Read all'}
      </Button>

      {showAutoAnnounce && (
        <label className="flex items-center gap-2 text-xs ml-auto">
          <span>नया ऑर्डर बोलें / Announce new</span>
          <Switch checked={!!autoAnnounce} onCheckedChange={onAutoAnnounceChange} />
        </label>
      )}
    </div>
  );
};
