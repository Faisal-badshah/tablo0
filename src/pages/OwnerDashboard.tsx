import { useState, useEffect, useCallback } from 'react';
import { useRestaurant } from '@/context/RestaurantContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Settings, LogOut, Plus, Trash2, ShoppingBag, IndianRupee, TrendingUp, Users, Loader2, Download, Upload, Pencil, Tag, Box, Eye } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { formatCurrency } from '@/types/restaurant';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArViewerModal } from '@/features/ar/ArViewerModal';
import { SettingsTab } from './owner/SettingsTab';

interface StaffMember {
  id: string;
  user_id: string;
  email: string;
  role: string;
}

const TABLE_STATUSES = ['available', 'occupied', 'cleaning'] as const;

const OwnerDashboard = () => {
  const {
    restaurantName, restaurantSlug, restaurantId, menuItems, categories, tables, orders,
    addMenuItem, updateMenuItem, deleteMenuItem, addCategory, updateCategory, deleteCategory, uploadMenuImage, uploadArModel,
    addTable, deleteTable, updateTableStatus,
  } = useRestaurant();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const defaultCategoryName = categories[0]?.name || 'Mains';
  const [newItem, setNewItem] = useState({ name: '', price: '', category: defaultCategoryName, description: '', image_url: '' as string });
  const [showAddItem, setShowAddItem] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingAr, setUploadingAr] = useState(false);
  const [editItem, setEditItem] = useState<{ id: string; name: string; price: string; category: string; description: string; image_url: string; ar_model_url: string; ar_usdz_url: string; ar_enabled: boolean } | null>(null);
  const [arPreview, setArPreview] = useState<{ name: string; modelUrl: string; iosUrl: string | null } | null>(null);
  const [newTableNumber, setNewTableNumber] = useState('');

  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<{ id: string; name: string } | null>(null);

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newStaff, setNewStaff] = useState({ email: '', password: '', role: 'kitchen' });
  const [addingStaff, setAddingStaff] = useState(false);

  const todayOrders = orders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString());
  const todayRevenue = todayOrders.filter(o => o.status === 'billed').reduce((s, o) => s + o.total_amount, 0);
  const avgOrderValue = todayOrders.length > 0 ? Math.round(todayOrders.reduce((s, o) => s + o.total_amount, 0) / todayOrders.length) : 0;

  const fetchStaff = useCallback(async () => {
    setStaffLoading(true);
    const { data, error } = await supabase.functions.invoke('manage-staff', { body: { action: 'list' } });
    if (!error && data?.staff) setStaff(data.staff);
    setStaffLoading(false);
  }, []);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  const handleAddStaff = async () => {
    if (!newStaff.email || !newStaff.password) return;
    setAddingStaff(true);
    const { data, error } = await supabase.functions.invoke('manage-staff', {
      body: { action: 'create', email: newStaff.email, password: newStaff.password, role: newStaff.role },
    });
    setAddingStaff(false);
    if (error || data?.error) {
      toast.error(data?.error || 'Failed to create staff');
    } else {
      toast.success('Staff account created');
      setNewStaff({ email: '', password: '', role: 'kitchen' });
      setShowAddStaff(false);
      fetchStaff();
    }
  };

  const handleDeleteStaff = async (userId: string) => {
    const { data, error } = await supabase.functions.invoke('manage-staff', {
      body: { action: 'delete', user_id: userId },
    });
    if (error || data?.error) {
      toast.error(data?.error || 'Failed to delete staff');
    } else {
      toast.success('Staff account removed');
      fetchStaff();
    }
  };

  const handleAddItem = async () => {
    if (!newItem.name || !newItem.price) return;
    const matchedCat = categories.find(c => c.name === newItem.category);
    await addMenuItem({
      name: newItem.name,
      price: parseInt(newItem.price),
      category: newItem.category,
      category_id: matchedCat?.id || null,
      description: newItem.description,
      available: true,
      image_url: newItem.image_url || null,
    });
    setNewItem({ name: '', price: '', category: defaultCategoryName, description: '', image_url: '' });
    setShowAddItem(false);
  };

  const handleImageUpload = async (file: File, target: 'new' | 'edit') => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return; }
    setUploadingImage(true);
    const url = await uploadMenuImage(file);
    setUploadingImage(false);
    if (!url) { toast.error('Image upload failed'); return; }
    if (target === 'new') setNewItem(p => ({ ...p, image_url: url }));
    else if (editItem) setEditItem({ ...editItem, image_url: url });
    toast.success('Image uploaded');
  };

  const handleSaveEdit = async () => {
    if (!editItem) return;
    const matchedCat = categories.find(c => c.name === editItem.category);
    await updateMenuItem(editItem.id, {
      name: editItem.name,
      price: parseInt(editItem.price) || 0,
      category: editItem.category,
      category_id: matchedCat?.id || null,
      description: editItem.description,
      image_url: editItem.image_url || null,
      ar_model_url: editItem.ar_model_url || null,
      ar_usdz_url: editItem.ar_usdz_url || null,
      ar_enabled: editItem.ar_enabled,
    } as any);
    setEditItem(null);
  };

  const handleArUpload = async (file: File, kind: 'glb' | 'usdz') => {
    if (!editItem) return;
    const max = 50 * 1024 * 1024;
    if (file.size > max) { toast.error('Model must be under 50MB'); return; }
    setUploadingAr(true);
    const url = await uploadArModel(file, kind);
    setUploadingAr(false);
    if (!url) { toast.error('Upload failed'); return; }
    setEditItem({
      ...editItem,
      ...(kind === 'glb' ? { ar_model_url: url } : { ar_usdz_url: url }),
    });
    toast.success(`${kind.toUpperCase()} uploaded`);
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      toast.error('Category already exists');
      return;
    }
    const created = await addCategory(name);
    if (created) {
      toast.success(`Added "${name}"`);
      setNewCategoryName('');
    } else {
      toast.error('Failed to add category');
    }
  };

  const handleSaveCategory = async () => {
    if (!editingCategory || !editingCategory.name.trim()) return;
    await updateCategory(editingCategory.id, editingCategory.name);
    setEditingCategory(null);
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    const inUse = menuItems.some(mi => mi.category === name);
    if (inUse && !confirm(`"${name}" is used by some menu items. Delete it anyway? Items will keep their text label.`)) return;
    await deleteCategory(id);
  };

  const handleAddTable = async () => {
    const num = parseInt(newTableNumber);
    if (!num) { toast.error('Enter a valid table number'); return; }
    if (tables.some(t => t.table_number === num)) { toast.error(`Table ${num} already exists`); return; }
    try {
      await addTable(num);
      toast.success(`Table ${num} created`);
      setNewTableNumber('');
    } catch (err: any) {
      const msg = err?.message || 'Failed to create table';
      if (msg.includes('unique_table_per_restaurant')) {
        toast.error(`Table ${num} already exists`);
      } else {
        toast.error(msg);
      }
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/staff/login');
  };

  // Build QR URL based on slug availability
  const getQrUrl = (tableNum: number) => {
    if (restaurantSlug) {
      return `${window.location.origin}/r/${restaurantSlug}/t/${tableNum}`;
    }
    return `${window.location.origin}/order/${restaurantId}/${tableNum}`;
  };

  const getTableStatusBadge = (status: string) => {
    switch (status) {
      case 'occupied': return <Badge variant="destructive" className="text-xs">Occupied</Badge>;
      case 'cleaning': return <Badge className="bg-yellow-500/20 text-yellow-600 border-0 text-xs">Cleaning</Badge>;
      default: return <Badge className="bg-green-500/20 text-green-600 border-0 text-xs">Available</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold text-foreground">{restaurantName}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/kitchen"><Button variant="ghost" size="sm">Kitchen</Button></Link>
          <Link to="/billing"><Button variant="ghost" size="sm">Billing</Button></Link>
          <Button variant="ghost" size="icon" onClick={handleLogout}><LogOut className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4">
        <Tabs defaultValue="overview">
          <TabsList className="w-full grid grid-cols-7">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="menu">Menu</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="tables">Tables</TabsTrigger>
            <TabsTrigger value="staff">Staff</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-3 gap-3">
              <Card><CardContent className="p-4 text-center">
                <ShoppingBag className="w-6 h-6 mx-auto mb-1 text-primary" />
                <p className="text-2xl font-bold">{todayOrders.length}</p>
                <p className="text-xs text-muted-foreground">Orders Today</p>
              </CardContent></Card>
              <Card><CardContent className="p-4 text-center">
                <IndianRupee className="w-6 h-6 mx-auto mb-1 text-primary" />
                <p className="text-2xl font-bold">{formatCurrency(todayRevenue)}</p>
                <p className="text-xs text-muted-foreground">Revenue</p>
              </CardContent></Card>
              <Card><CardContent className="p-4 text-center">
                <TrendingUp className="w-6 h-6 mx-auto mb-1 text-primary" />
                <p className="text-2xl font-bold">{formatCurrency(avgOrderValue)}</p>
                <p className="text-xs text-muted-foreground">Avg Order</p>
              </CardContent></Card>
            </div>
          </TabsContent>

          <TabsContent value="menu" className="space-y-4 mt-4">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">Menu Items ({menuItems.length})</h2>
              <Dialog open={showAddItem} onOpenChange={(o) => { setShowAddItem(o); if (o) setNewItem(p => ({ ...p, category: defaultCategoryName })); }}>
                <DialogTrigger asChild><Button size="sm" disabled={categories.length === 0}><Plus className="w-4 h-4 mr-1" /> Add Item</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Menu Item</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>Name</Label><Input value={newItem.name} onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))} /></div>
                    <div><Label>Price (₹)</Label><Input type="number" value={newItem.price} onChange={e => setNewItem(p => ({ ...p, price: e.target.value }))} /></div>
                    <div>
                      <Label>Category</Label>
                      <Select value={newItem.category} onValueChange={v => setNewItem(p => ({ ...p, category: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                        <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Description</Label><Input value={newItem.description} onChange={e => setNewItem(p => ({ ...p, description: e.target.value }))} /></div>
                    <div>
                      <Label>Image (optional)</Label>
                      {newItem.image_url && (
                        <img src={newItem.image_url} alt="preview" className="w-full h-32 object-cover rounded-md border my-2" />
                      )}
                      <div className="flex gap-2 items-center">
                        <Input type="file" accept="image/*" onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'new')} disabled={uploadingImage} />
                        {uploadingImage && <Loader2 className="w-4 h-4 animate-spin" />}
                        {newItem.image_url && (
                          <Button type="button" size="sm" variant="ghost" onClick={() => setNewItem(p => ({ ...p, image_url: '' }))}>Clear</Button>
                        )}
                      </div>
                    </div>
                    <Button className="w-full" onClick={handleAddItem} disabled={uploadingImage}>Add Item</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            {categories.length === 0 && (
              <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                Create at least one category in the <strong>Categories</strong> tab before adding menu items.
              </p>
            )}
            {menuItems.map(item => {
              const imgUrl = (item as any).image_url as string | null;
              const arUrl = (item as any).ar_model_url as string | null;
              const arEnabled = (item as any).ar_enabled as boolean;
              return (
                <div key={item.id} className="flex items-center justify-between p-3 bg-card rounded-lg border gap-3">
                  {imgUrl ? (
                    <img src={imgUrl} alt={item.name} className="w-14 h-14 rounded-md object-cover border flex-shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                      <ShoppingBag className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{item.name}</span>
                      <Badge variant="outline" className="text-xs">{item.category}</Badge>
                      {arUrl && (
                        <Badge className={`text-xs gap-1 ${arEnabled ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'} border-0`}>
                          <Box className="w-3 h-3" /> AR{arEnabled ? '' : ' (off)'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{formatCurrency(item.price)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Switch checked={item.available} onCheckedChange={v => updateMenuItem(item.id, { available: v })} />
                    <Button size="icon" variant="ghost" onClick={() => setEditItem({
                      id: item.id, name: item.name, price: String(item.price),
                      category: item.category, description: item.description || '', image_url: imgUrl || '',
                      ar_model_url: arUrl || '', ar_usdz_url: (item as any).ar_usdz_url || '',
                      ar_enabled: !!arEnabled,
                    })}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteMenuItem(item.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}

            <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Edit Menu Item</DialogTitle></DialogHeader>
                {editItem && (
                  <div className="space-y-3">
                    <div><Label>Name</Label><Input value={editItem.name} onChange={e => setEditItem({ ...editItem, name: e.target.value })} /></div>
                    <div><Label>Price (₹)</Label><Input type="number" value={editItem.price} onChange={e => setEditItem({ ...editItem, price: e.target.value })} /></div>
                    <div>
                      <Label>Category</Label>
                      <Select value={editItem.category} onValueChange={v => setEditItem({ ...editItem, category: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Description</Label><Input value={editItem.description} onChange={e => setEditItem({ ...editItem, description: e.target.value })} /></div>
                    <div>
                      <Label>Image</Label>
                      {editItem.image_url && (
                        <img src={editItem.image_url} alt="preview" className="w-full h-32 object-cover rounded-md border my-2" />
                      )}
                      <div className="flex gap-2 items-center">
                        <Input type="file" accept="image/*" onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'edit')} disabled={uploadingImage} />
                        {uploadingImage && <Loader2 className="w-4 h-4 animate-spin" />}
                        {editItem.image_url && (
                          <Button type="button" size="sm" variant="ghost" onClick={() => setEditItem({ ...editItem, image_url: '' })}>Clear</Button>
                        )}
                      </div>
                    </div>

                    <div className="border-t pt-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <Box className="w-4 h-4 text-primary" />
                        <Label className="font-semibold">AR / 3D Model</Label>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Upload a <code>.glb</code> for Android/desktop and an optional <code>.usdz</code> for iOS AR. Max 50MB.
                      </p>

                      <div>
                        <Label className="text-xs">3D model (.glb)</Label>
                        <div className="flex gap-2 items-center mt-1">
                          <Input type="file" accept=".glb,model/gltf-binary" onChange={e => e.target.files?.[0] && handleArUpload(e.target.files[0], 'glb')} disabled={uploadingAr} />
                          {uploadingAr && <Loader2 className="w-4 h-4 animate-spin" />}
                          {editItem.ar_model_url && (
                            <Button type="button" size="sm" variant="ghost" onClick={() => setEditItem({ ...editItem, ar_model_url: '' })}>Clear</Button>
                          )}
                        </div>
                        {editItem.ar_model_url && (
                          <div className="flex items-center gap-2 mt-2">
                            <Badge className="bg-green-500/15 text-green-700 border-0 text-xs">Uploaded</Badge>
                            <Button type="button" size="sm" variant="outline" onClick={() => setArPreview({ name: editItem.name, modelUrl: editItem.ar_model_url, iosUrl: editItem.ar_usdz_url || null })}>
                              <Eye className="w-3 h-3 mr-1" /> Preview
                            </Button>
                          </div>
                        )}
                      </div>

                      <div>
                        <Label className="text-xs">iOS model (.usdz, optional)</Label>
                        <div className="flex gap-2 items-center mt-1">
                          <Input type="file" accept=".usdz" onChange={e => e.target.files?.[0] && handleArUpload(e.target.files[0], 'usdz')} disabled={uploadingAr} />
                          {editItem.ar_usdz_url && (
                            <Button type="button" size="sm" variant="ghost" onClick={() => setEditItem({ ...editItem, ar_usdz_url: '' })}>Clear</Button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between bg-muted/50 rounded-md p-3">
                        <div>
                          <p className="text-sm font-medium">Show AR to customers</p>
                          <p className="text-xs text-muted-foreground">Customers will see a "View in AR" button.</p>
                        </div>
                        <Switch
                          checked={editItem.ar_enabled}
                          disabled={!editItem.ar_model_url}
                          onCheckedChange={v => setEditItem({ ...editItem, ar_enabled: v })}
                        />
                      </div>
                    </div>

                    <Button className="w-full" onClick={handleSaveEdit} disabled={uploadingImage || uploadingAr}>Save Changes</Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {arPreview && (
              <ArViewerModal
                open={!!arPreview}
                onOpenChange={(o) => !o && setArPreview(null)}
                itemName={arPreview.name}
                modelUrl={arPreview.modelUrl}
                iosUrl={arPreview.iosUrl}
              />
            )}
          </TabsContent>

          <TabsContent value="categories" className="space-y-4 mt-4">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label>Category Name</Label>
                <Input
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  placeholder="e.g. Pizza, Beverages, Specials"
                  onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                />
              </div>
              <Button onClick={handleAddCategory}><Plus className="w-4 h-4 mr-1" /> Add</Button>
            </div>
            {categories.length === 0 ? (
              <p className="text-center py-10 text-muted-foreground">No categories yet. Add your first one above.</p>
            ) : (
              categories.map(cat => {
                const itemCount = menuItems.filter(mi => mi.category === cat.name).length;
                const isEditing = editingCategory?.id === cat.id;
                return (
                  <div key={cat.id} className="flex items-center justify-between p-3 bg-card rounded-lg border gap-2">
                    <Tag className="w-4 h-4 text-primary flex-shrink-0" />
                    {isEditing ? (
                      <Input
                        autoFocus
                        value={editingCategory.name}
                        onChange={e => setEditingCategory({ ...editingCategory, name: e.target.value })}
                        onKeyDown={e => e.key === 'Enter' && handleSaveCategory()}
                        className="flex-1"
                      />
                    ) : (
                      <div className="flex-1">
                        <p className="font-medium">{cat.name}</p>
                        <p className="text-xs text-muted-foreground">{itemCount} item{itemCount === 1 ? '' : 's'}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      {isEditing ? (
                        <>
                          <Button size="sm" onClick={handleSaveCategory}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingCategory(null)}>Cancel</Button>
                        </>
                      ) : (
                        <>
                          <Button size="icon" variant="ghost" onClick={() => setEditingCategory({ id: cat.id, name: cat.name })}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDeleteCategory(cat.id, cat.name)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="tables" className="space-y-4 mt-4">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label>Table Number</Label>
                <Input type="number" value={newTableNumber} onChange={e => setNewTableNumber(e.target.value)} placeholder="e.g. 6" />
              </div>
              <Button onClick={handleAddTable}><Plus className="w-4 h-4 mr-1" /> Add</Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {tables.map(table => {
                const tableStatus = (table as any).status || 'available';
                return (
                  <Card key={table.id}>
                    <CardContent className="p-4 text-center space-y-3">
                      <div className="flex items-center justify-center gap-2">
                        <p className="font-bold">Table {table.table_number}</p>
                        {getTableStatusBadge(tableStatus)}
                      </div>
                      <Select value={tableStatus} onValueChange={v => updateTableStatus(table.id, v)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TABLE_STATUSES.map(s => (
                            <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div id={`qr-table-${table.table_number}`} className="bg-card p-2 rounded-lg inline-block border">
                        <QRCodeSVG value={getQrUrl(table.table_number)} size={120} />
                      </div>
                      <p className="text-xs text-muted-foreground break-all">
                        {restaurantSlug ? `/r/${restaurantSlug}/t/${table.table_number}` : `/order/${restaurantId}/${table.table_number}`}
                      </p>
                      <div className="flex gap-2 justify-center">
                        <Button size="sm" variant="outline" onClick={() => {
                          const svg = document.querySelector(`#qr-table-${table.table_number} svg`);
                          if (!svg) return;
                          const svgData = new XMLSerializer().serializeToString(svg);
                          const canvas = document.createElement('canvas');
                          canvas.width = 240; canvas.height = 240;
                          const ctx = canvas.getContext('2d');
                          const img = new Image();
                          img.onload = () => {
                            ctx?.drawImage(img, 0, 0, 240, 240);
                            const a = document.createElement('a');
                            a.download = `table-${table.table_number}-qr.png`;
                            a.href = canvas.toDataURL('image/png');
                            a.click();
                          };
                          img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
                        }}>
                          <Download className="w-3 h-3 mr-1" /> QR
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteTable(table.id)}>
                          <Trash2 className="w-3 h-3 mr-1" /> Remove
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="staff" className="space-y-4 mt-4">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold flex items-center gap-2">
                <Users className="w-5 h-5" /> Staff Accounts
              </h2>
              <Dialog open={showAddStaff} onOpenChange={setShowAddStaff}>
                <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add Staff</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Staff Account</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>Email</Label><Input type="email" value={newStaff.email} onChange={e => setNewStaff(p => ({ ...p, email: e.target.value }))} placeholder="staff@restaurant.com" /></div>
                    <div><Label>Password</Label><Input type="password" value={newStaff.password} onChange={e => setNewStaff(p => ({ ...p, password: e.target.value }))} placeholder="Min 6 characters" /></div>
                    <div>
                      <Label>Role</Label>
                      <Select value={newStaff.role} onValueChange={v => setNewStaff(p => ({ ...p, role: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="kitchen">Kitchen</SelectItem>
                          <SelectItem value="billing">Billing</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button className="w-full" onClick={handleAddStaff} disabled={addingStaff}>
                      {addingStaff ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Account'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {staffLoading ? (
              <div className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
            ) : staff.length === 0 ? (
              <p className="text-center py-10 text-muted-foreground">No staff accounts found.</p>
            ) : (
              staff.map(s => (
                <div key={s.id} className="flex items-center justify-between p-3 bg-card rounded-lg border">
                  <div>
                    <p className="font-medium">{s.email}</p>
                    <Badge variant="outline" className="text-xs capitalize">{s.role}</Badge>
                  </div>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDeleteStaff(s.user_id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="orders" className="space-y-3 mt-4">
            <OrdersTabContent />
          </TabsContent>

          <TabsContent value="settings">
            <SettingsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default OwnerDashboard;

// --- Orders tab with delivery support ---

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  pending: 'New',
  preparing: 'Preparing',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  failed: 'Failed',
};

const deliveryBadgeVariant = (s: string): any => {
  switch (s) {
    case 'delivered': return 'secondary';
    case 'out_for_delivery': return 'default';
    case 'failed': return 'destructive';
    default: return 'outline';
  }
};

const OrdersTabContent = () => {
  const { orders, updateOrderDeliveryStatus } = useRestaurant();
  const [filter, setFilter] = useState<'all' | 'dine_in' | 'delivery'>('all');

  const filtered = orders.filter((o) => {
    if (filter === 'all') return true;
    const t = (o as any).order_type || 'dine_in';
    return t === filter;
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {([
          { k: 'all', label: 'All' },
          { k: 'dine_in', label: 'Dine-in' },
          { k: 'delivery', label: 'Delivery' },
        ] as const).map((opt) => (
          <button
            key={opt.k}
            onClick={() => setFilter(opt.k)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === opt.k
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-center py-10 text-muted-foreground">No orders.</p>
      )}

      {filtered.map((order) => {
        const orderType = (order as any).order_type || 'dine_in';
        const isDelivery = orderType === 'delivery';
        const delStatus = (order as any).delivery_status || 'pending';
        const delAddress = (order as any).delivery_address as string | undefined;
        const delFee = Number((order as any).delivery_fee || 0);

        return (
          <div key={order.id} className="p-3 bg-card rounded-lg border space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {(order as any).order_number && (
                    <span className="font-mono text-xs text-muted-foreground">#{(order as any).order_number}</span>
                  )}
                  <Badge variant="outline" className="text-xs">
                    {isDelivery ? 'Delivery' : `Table ${order.table_number}`}
                  </Badge>
                  <Badge variant={
                    order.status === 'billed' ? 'secondary' :
                    order.status === 'completed' ? 'default' : 'outline'
                  }>
                    {order.status}
                  </Badge>
                  {isDelivery && (
                    <Badge variant={deliveryBadgeVariant(delStatus)} className="text-xs">
                      {DELIVERY_STATUS_LABELS[delStatus] || delStatus}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {order.customer_name || 'Guest'}
                  {order.customer_phone ? ` • ${order.customer_phone}` : ''}
                  {' • '}{order.items.length} item{order.items.length === 1 ? '' : 's'}
                </p>
                {isDelivery && delAddress && (
                  <p className="text-xs text-muted-foreground mt-1 break-words">📍 {delAddress}</p>
                )}
                {isDelivery && delFee > 0 && (
                  <p className="text-xs text-muted-foreground">Delivery fee: {formatCurrency(delFee)}</p>
                )}
              </div>
              <span className="font-bold whitespace-nowrap">{formatCurrency(order.total_amount)}</span>
            </div>

            {isDelivery && delStatus !== 'delivered' && delStatus !== 'failed' && (
              <div className="pt-1">
                <Select
                  value={delStatus}
                  onValueChange={(v) => updateOrderDeliveryStatus(order.id, v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">New</SelectItem>
                    <SelectItem value="preparing">Preparing</SelectItem>
                    <SelectItem value="out_for_delivery">Out for delivery</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

