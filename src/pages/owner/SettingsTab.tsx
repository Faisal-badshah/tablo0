import { useEffect, useRef, useState } from 'react';
import { useRestaurant } from '@/context/RestaurantContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Loader2, Upload, Check, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

export const SettingsTab = () => {
  const {
    restaurantName, restaurantSlug, restaurantId, logoUrl, brandColor, address, phone, isActive,
    updateRestaurantSettings, uploadLogo, checkSlugAvailable,
  } = useRestaurant();

  const [name, setName] = useState(restaurantName);
  const [slug, setSlug] = useState(restaurantSlug || '');
  const [color, setColor] = useState(brandColor);
  const [addr, setAddr] = useState(address || '');
  const [ph, setPh] = useState(phone || '');
  const [active, setActive] = useState(isActive);
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'free' | 'taken'>('idle');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => { setName(restaurantName); }, [restaurantName]);
  useEffect(() => { setSlug(restaurantSlug || ''); }, [restaurantSlug]);
  useEffect(() => { setColor(brandColor); }, [brandColor]);
  useEffect(() => { setAddr(address || ''); }, [address]);
  useEffect(() => { setPh(phone || ''); }, [phone]);
  useEffect(() => { setActive(isActive); }, [isActive]);

  // Debounced slug uniqueness check
  useEffect(() => {
    if (!slug || slug === restaurantSlug) { setSlugStatus('idle'); return; }
    setSlugStatus('checking');
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      const ok = await checkSlugAvailable(slug);
      setSlugStatus(ok ? 'free' : 'taken');
    }, 400);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [slug, restaurantSlug, checkSlugAvailable]);

  const handleLogoUpload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) { toast.error('Logo must be under 2MB'); return; }
    setUploadingLogo(true);
    const url = await uploadLogo(file);
    if (url) {
      const { error } = await updateRestaurantSettings({ logo_url: url });
      if (error) toast.error(error); else toast.success('Logo updated');
    } else {
      toast.error('Logo upload failed');
    }
    setUploadingLogo(false);
  };

  const handleSave = async () => {
    if (slug && slug !== restaurantSlug && slugStatus !== 'free') {
      toast.error('Pick an available slug first');
      return;
    }
    setSaving(true);
    const { error } = await updateRestaurantSettings({
      name: name.trim(),
      slug: slug.trim(),
      primary_color: color,
      address: addr || null,
      owner_phone: ph || null,
    });
    setSaving(false);
    if (error) toast.error(error); else toast.success('Settings saved');
  };

  const handleToggleActive = async (next: boolean) => {
    setActive(next);
    const { error } = await updateRestaurantSettings({ is_active: next });
    if (error) {
      toast.error(error);
      setActive(!next);
    } else {
      toast.success(next ? 'Restaurant is live' : 'Restaurant deactivated');
    }
  };

  const publicUrl = slug ? `${window.location.origin}/r/${slug}` : '';

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardContent className="p-4 space-y-4">
          <div>
            <Label>Restaurant Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <Label>Public URL slug</Label>
            <div className="flex gap-2 items-center">
              <span className="text-sm text-muted-foreground">/r/</span>
              <Input
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                placeholder="my-restaurant"
              />
              {slugStatus === 'checking' && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              {slugStatus === 'free' && <Check className="w-4 h-4 text-green-600" />}
              {slugStatus === 'taken' && <X className="w-4 h-4 text-destructive" />}
            </div>
            {publicUrl && (
              <p className="text-xs text-muted-foreground mt-1 break-all">{publicUrl}</p>
            )}
          </div>

          <div>
            <Label>Logo</Label>
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-14 h-14 rounded-lg object-cover border" />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground">
                  No logo
                </div>
              )}
              <label className="inline-flex">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])}
                />
                <Button type="button" variant="outline" size="sm" disabled={uploadingLogo} asChild>
                  <span>
                    {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Upload className="w-4 h-4 mr-1" /> Upload</>}
                  </span>
                </Button>
              </label>
              {logoUrl && (
                <Button type="button" variant="ghost" size="sm" onClick={() => updateRestaurantSettings({ logo_url: null })}>
                  Remove
                </Button>
              )}
            </div>
          </div>

          <div>
            <Label>Brand color</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-12 h-10 rounded border cursor-pointer bg-transparent"
              />
              <Input value={color} onChange={(e) => setColor(e.target.value)} className="font-mono text-sm" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Used for buttons, prices, and accents on your customer menu.</p>
          </div>

          <div>
            <Label>Address</Label>
            <Input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Street, City" />
          </div>

          <div>
            <Label>Phone</Label>
            <Input value={ph} onChange={(e) => setPh(e.target.value)} placeholder="+91 9876543210" />
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save changes'}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <h3 className="font-semibold text-destructive">Danger zone</h3>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Restaurant is {active ? 'live' : 'deactivated'}</p>
              <p className="text-xs text-muted-foreground">
                {active
                  ? 'Customers can view your menu and place orders.'
                  : 'Public menu is hidden. Existing data is preserved.'}
              </p>
            </div>
            <Switch checked={active} onCheckedChange={handleToggleActive} />
          </div>
        </CardContent>
      </Card>

      <DeliverySection restaurantId={restaurantId} />
    </div>
  );
};

// --- Delivery section ---

import { Slider } from '@/components/ui/slider';
import { useDeliveryZone } from '@/hooks/useDeliveryZone';
import { RestaurantLocationPicker } from '@/features/delivery/RestaurantLocationPicker';
import { Truck } from 'lucide-react';

const DeliverySection = ({ restaurantId }: { restaurantId: string | null }) => {
  const zone = useDeliveryZone(restaurantId);
  const { updateRestaurantSettings } = useRestaurant();

  const [enabled, setEnabled] = useState(zone.deliveryEnabled);
  const [radius, setRadius] = useState(zone.radiusKm);
  const [fee, setFee] = useState(String(zone.deliveryFee));
  const [minOrder, setMinOrder] = useState(String(zone.minOrderAmount));
  const [eta, setEta] = useState(String(zone.estimatedMinutes));
  const [lat, setLat] = useState<number | null>(zone.restaurantLat);
  const [lng, setLng] = useState<number | null>(zone.restaurantLng);

  useEffect(() => {
    if (zone.loading) return;
    setEnabled(zone.deliveryEnabled);
    setRadius(zone.radiusKm);
    setFee(String(zone.deliveryFee));
    setMinOrder(String(zone.minOrderAmount));
    setEta(String(zone.estimatedMinutes));
    setLat(zone.restaurantLat);
    setLng(zone.restaurantLng);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone.loading]);

  const debounceRef = useRef<number | null>(null);
  const queueSave = (updates: Record<string, any>) => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      const { error } = await updateRestaurantSettings(updates as any);
      if (error) toast.error(error);
      else toast.success('Saved', { duration: 1200 });
    }, 500);
  };

  const handleToggle = async (next: boolean) => {
    if (next && (lat == null || lng == null)) {
      toast.error('Please set your restaurant location to enable delivery');
      return;
    }
    setEnabled(next);
    const { error } = await updateRestaurantSettings({ delivery_enabled: next });
    if (error) { toast.error(error); setEnabled(!next); }
    else toast.success(next ? 'Delivery enabled' : 'Delivery disabled');
  };

  const handleRadius = (v: number[]) => { setRadius(v[0]); queueSave({ delivery_radius_km: v[0] }); };
  const handleFee = (v: string) => { setFee(v); const n = Number(v); if (Number.isFinite(n) && n >= 0) queueSave({ delivery_fee: n }); };
  const handleMin = (v: string) => { setMinOrder(v); const n = Number(v); if (Number.isFinite(n) && n >= 0) queueSave({ min_order_amount: n }); };
  const handleEta = (v: string) => { setEta(v); const n = parseInt(v, 10); if (Number.isFinite(n) && n >= 1) queueSave({ estimated_delivery_minutes: n }); };
  const handleLocation = (la: number, ln: number) => { setLat(la); setLng(ln); queueSave({ restaurant_lat: la, restaurant_lng: ln }); };
  const handleAddressResolved = (addr: string) => { queueSave({ address: addr }); };

  const noLocation = lat == null || lng == null;

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-primary" />
            <h3 className="font-semibold">Delivery</h3>
          </div>
          <Switch checked={enabled} onCheckedChange={handleToggle} aria-label="Enable delivery orders" disabled={noLocation && !enabled} />
        </div>
        <p className="text-xs text-muted-foreground">
          {enabled ? 'Customers can place delivery orders within your zone.' : 'Enable to accept delivery orders.'}
        </p>

        {noLocation && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>Please set your restaurant location below to enable delivery.</span>
          </div>
        )}

        <div>
          <Label>Restaurant location</Label>
          <RestaurantLocationPicker lat={lat} lng={lng} onChange={handleLocation} onAddressResolved={handleAddressResolved} />
        </div>

        {enabled && (
          <div className="space-y-4 pt-2">
            <div>
              <div className="flex items-center justify-between">
                <Label>Delivery radius</Label>
                <span className="text-sm font-semibold">{radius.toFixed(1)} km</span>
              </div>
              <Slider value={[radius]} min={0.5} max={10} step={0.5} onValueChange={handleRadius} className="mt-2" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Delivery fee (₹)</Label>
                <Input type="number" inputMode="decimal" min={0} value={fee} onChange={(e) => handleFee(e.target.value)} />
              </div>
              <div>
                <Label>Min. order (₹)</Label>
                <Input type="number" inputMode="decimal" min={0} value={minOrder} onChange={(e) => handleMin(e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Estimated delivery time (min)</Label>
              <Input type="number" inputMode="numeric" min={1} value={eta} onChange={(e) => handleEta(e.target.value)} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

