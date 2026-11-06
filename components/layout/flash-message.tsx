import { Alert } from "@/components/ui/alert";

export function FlashMessage({
  flash,
  error,
  className,
}: {
  flash?: string;
  error?: string;
  className?: string;
}) {
  if (!flash && !error) return null;
  return (
    <Alert
      tone={error ? "error" : "success"}
      className={className ?? "mb-5"}
      title={error ? "That didn't work" : undefined}
    >
      {error ?? flash}
    </Alert>
  );
}
