"use client";

import { useRef, useState } from "react";
import { ImageIcon, Loader2, Upload, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";

export function FileUpload({
  bucket,
  tenantId,
  name,
  label,
  hint,
  accept = "image/*",
  defaultValue = null,
  publicBucket = true,
  preview = true,
  required = false,
}: {
  bucket: "logos" | "player-photos" | "id-documents" | "payment-proofs";
  tenantId: string;
  name: string;
  label: string;
  hint?: string;
  accept?: string;
  defaultValue?: string | null;
  publicBucket?: boolean;
  preview?: boolean;
  required?: boolean;
}) {
  const [value, setValue] = useState<string>(defaultValue ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "-").slice(-60);
      const path = `${tenantId}/${bucket}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, file, { upsert: false, contentType: file.type });

      if (uploadError) {
        setError(uploadError.message);
        return;
      }

      if (publicBucket) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        setValue(data.publicUrl);
      } else {
        setValue(path);
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <input type="hidden" name={name} value={value} />
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        required={required && !value}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-md border border-dashed border-input bg-surface px-3 text-sm font-medium transition-colors hover:border-primary hover:bg-primary-soft/40 disabled:opacity-60",
          )}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {busy ? "Uploading…" : value ? "Replace file" : "Choose file"}
        </button>

        {value ? (
          <button
            type="button"
            onClick={() => {
              setValue("");
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-rose-600"
          >
            <X className="h-3.5 w-3.5" /> Remove
          </button>
        ) : null}
      </div>

      {preview && value && publicBucket ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt="Preview"
          className="h-16 w-16 rounded-lg border object-cover"
        />
      ) : null}

      {value && !publicBucket ? (
        <p className="flex items-center gap-1.5 text-xs text-emerald-700">
          <ImageIcon className="h-3.5 w-3.5" /> File stored privately — only organisers can open it.
        </p>
      ) : null}

      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-[11px] font-medium text-rose-600">{error}</p> : null}
    </div>
  );
}
