import { Badge } from "@/components/ui/badge";
import type {
  MatchStatus,
  PaymentStatus,
  RegistrationStatus,
  TenantStatus,
  TournamentStatus,
} from "@/lib/database.types";
import { LIVE_STATUSES } from "@/lib/constants";

const registrationTone: Record<RegistrationStatus, "success" | "warning" | "danger"> = {
  APPROVED: "success",
  PENDING: "warning",
  REJECTED: "danger",
};

const paymentTone: Record<PaymentStatus, "success" | "warning" | "neutral"> = {
  PAID: "success",
  PENDING_VERIFICATION: "warning",
  UNPAID: "neutral",
};

const tenantTone: Record<TenantStatus, "success" | "danger" | "info"> = {
  active: "success",
  suspended: "danger",
  trial: "info",
};

const tournamentTone: Record<TournamentStatus, "success" | "warning" | "info" | "neutral"> = {
  REGISTRATION_OPEN: "success",
  ONGOING: "info",
  COMPLETED: "neutral",
  DRAFT: "warning",
};

/** Status pills read in full capitals everywhere and never break mid-label. */
const statusPill = "shrink-0 justify-center whitespace-nowrap uppercase tracking-wide";

export function RegistrationBadge({ status }: { status: RegistrationStatus }) {
  return (
    <Badge variant={registrationTone[status]} className={statusPill}>
      {status}
    </Badge>
  );
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge variant={paymentTone[status]} className={statusPill}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

export function TenantStatusBadge({ status }: { status: TenantStatus }) {
  return (
    <Badge variant={tenantTone[status]} className={statusPill}>
      {status}
    </Badge>
  );
}

export function TournamentStatusBadge({ status }: { status: TournamentStatus }) {
  return (
    <Badge variant={tournamentTone[status]} className={statusPill}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

export function MatchStatusBadge({ status }: { status: MatchStatus }) {
  if (LIVE_STATUSES.includes(status)) {
    return (
      <Badge variant="live" className="shrink-0 justify-center gap-1.5 whitespace-nowrap uppercase tracking-wide">
        <span className="live-dot" />
        LIVE
      </Badge>
    );
  }
  const tone: Record<string, "neutral" | "success" | "warning" | "info"> = {
    SCHEDULED: "neutral",
    COMPLETED: "success",
    POSTPONED: "warning",
  };
  return (
    <Badge variant={tone[status] ?? "neutral"} className={statusPill}>
      {status}
    </Badge>
  );
}
