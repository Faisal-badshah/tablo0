import { useRef, useState } from 'react';
import { Loader2, UploadCloud, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  value: string | null;
  uploading?: boolean;
  onSelect: (file: File) => void;
  onClear: () => void;
  hint?: string;
  /** Square px size for preview */
  size?: number;
}

export const ImageUploadZone = ({ value, uploading, onSelect, onClear, hint = 'PNG, JPG up to 2MB', size = 100 }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files || !files[0]) return;
    onSelect(files[0]);
  };

  if (value) {
    return (
      <div className="relative inline-block" style={{ width: size, height: size }}>
        <img src={value} alt="preview" className="w-full h-full object-cover rounded-lg border" />
        <button
          type="button"
          onClick={onClear}
          aria-label="Remove image"
          className="absolute -top-2 -right-2 bg-background border rounded-full w-6 h-6 flex items-center justify-center shadow hover:bg-destructive hover:text-destructive-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`w-full flex flex-col items-center justify-center gap-1 py-6 px-4 rounded-lg border-2 border-dashed transition-colors ${
        dragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/30 hover:bg-muted/50'
      }`}
    >
      {uploading ? (
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      ) : (
        <UploadCloud className="w-6 h-6 text-muted-foreground" />
      )}
      <span className="text-sm font-medium text-foreground">
        {uploading ? 'Uploading…' : 'Click to upload or drag image here'}
      </span>
      <span className="text-xs text-muted-foreground">{hint}</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </button>
  );
};
