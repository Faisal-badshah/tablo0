import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { UtensilsCrossed } from 'lucide-react';

const RestaurantNotFound = () => (
  <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
    <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
      <UtensilsCrossed className="w-8 h-8 text-muted-foreground" />
    </div>
    <h1 className="text-2xl font-bold mb-2">Restaurant not found</h1>
    <p className="text-muted-foreground max-w-sm mb-6">
      This menu link is invalid or the restaurant is currently unavailable. Please check the URL or scan the QR code again.
    </p>
    <Link to="/"><Button variant="outline">Back to home</Button></Link>
  </div>
);

export default RestaurantNotFound;
