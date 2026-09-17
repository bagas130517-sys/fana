"use client";

import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import {
  Globe,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Palette,
  Settings,
  ShieldAlert,
  Users,
  Webhook,
  Wrench,
} from "lucide-react";
import { DashboardShell, type NavItem } from "./DashboardShell";
import { useRole } from "./RoleContext";
import { SkeletonRows } from "@/components/ui/Skeleton";

/**
 * One dashboard at /dashboard, one shell — but each role gets its own set of
 * sections, not a shared list with extras bolted on. `/dashboard` is the
 * instance overview for an operator and the account overview for a customer;
 * neither sees the other's navigation.
 *
 * Operators still *sign in* at the (configurable, unadvertised) admin path.
 * Serving their pages here gives up nothing: `POST /api/admin/login` was always
 * at a fixed URL, and every operator section answers 403 at the API.
 */
const loading = () => <SkeletonRows rows={4} />;

interface Section {
  Comp: React.ComponentType;
  nav: NavItem;
}

const lazily = (load: () => Promise<{ default: React.ComponentType }>) =>
  dynamic(load, { loading });

// Literal paths, not a template: a dynamic import expression makes webpack
// bundle the whole directory into one context chunk, which is exactly the code
// splitting this is here to get.
const CUSTOMER: Record<string, Section> = {
  overview: {
    Comp: lazily(() =>
      import("./sections/OverviewSection").then((m) => ({ default: m.OverviewSection })),
    ),
    nav: { key: "overview", href: "", label: "Overview", icon: LayoutDashboard },
  },
  inboxes: {
    Comp: lazily(() =>
      import("./sections/InboxesSection").then((m) => ({ default: m.InboxesSection })),
    ),
    nav: { key: "inboxes", href: "/inboxes", label: "Inboxes", icon: Inbox },
  },
  webhooks: {
    Comp: lazily(() =>
      import("./sections/WebhooksSection").then((m) => ({ default: m.WebhooksSection })),
    ),
    nav: { key: "webhooks", href: "/webhooks", label: "Webhooks", icon: Webhook },
  },
  keys: {
    Comp: lazily(() =>
      import("./sections/KeysSection").then((m) => ({ default: m.KeysSection })),
    ),
    nav: { key: "keys", href: "/keys", label: "API keys", icon: KeyRound },
  },
};

const ADMIN: Record<string, Section> = {
  overview: {
    Comp: lazily(() =>
      import("@/components/admin/sections/OverviewSection").then((m) => ({
        default: m.OverviewSection,
      })),
    ),
    nav: { key: "overview", href: "", label: "Overview", icon: LayoutDashboard },
  },
  inbox: {
    Comp: lazily(() =>
      import("@/components/admin/sections/InboxSection").then((m) => ({
        default: m.InboxSection,
      })),
    ),
    nav: { key: "inbox", href: "/inbox", label: "Inbox", icon: Inbox },
  },
  domains: {
    Comp: lazily(() =>
      import("@/components/admin/sections/DomainsSection").then((m) => ({
        default: m.DomainsSection,
      })),
    ),
    nav: { key: "domains", href: "/domains", label: "Domains", icon: Globe },
  },
  abuse: {
    Comp: lazily(() =>
      import("@/components/admin/sections/AbuseSection").then((m) => ({
        default: m.AbuseSection,
      })),
    ),
    nav: { key: "abuse", href: "/abuse", label: "Abuse", icon: ShieldAlert },
  },
  maintenance: {
    Comp: lazily(() =>
      import("@/components/admin/sections/MaintenanceSection").then((m) => ({
        default: m.MaintenanceSection,
      })),
    ),
    nav: { key: "maintenance", href: "/maintenance", label: "Maintenance", icon: Wrench },
  },
  branding: {
    Comp: lazily(() =>
      import("@/components/admin/sections/BrandingSection").then((m) => ({
        default: m.BrandingSection,
      })),
    ),
    nav: { key: "branding", href: "/branding", label: "Branding", icon: Palette },
  },
  customers: {
    Comp: lazily(() =>
      import("@/components/admin/sections/CustomersSection").then((m) => ({
        default: m.CustomersSection,
      })),
    ),
    nav: { key: "customers", href: "/customers", label: "Customers", icon: Users },
  },
  access: {
    Comp: lazily(() =>
      import("@/components/admin/sections/AccessSection").then((m) => ({
        default: m.AccessSection,
      })),
    ),
    nav: { key: "access", href: "/access", label: "Access", icon: KeyRound },
  },
  config: {
    Comp: lazily(() =>
      import("@/components/admin/sections/ConfigSection").then((m) => ({
        default: m.ConfigSection,
      })),
    ),
    nav: { key: "config", href: "/config", label: "Config", icon: Settings },
  },
};

const sectionsFor = (role: string) => (role === "admin" ? ADMIN : CUSTOMER);

function navFor(role: string): NavItem[] {
  return Object.values(sectionsFor(role)).map((s) => s.nav);
}

/** Renders the section for this role, or 404s if that role has no such page. */
function SectionView({ section }: { section: string }) {
  const role = useRole();
  const entry = sectionsFor(role)[section];
  if (!entry) notFound();

  const Comp = entry.Comp;
  return <Comp />;
}

export function DashboardPage({ section }: { section: string | null }) {
  const key = section ?? "overview";
  // A name no role defines fails before the shell even mounts.
  if (!(key in CUSTOMER) && !(key in ADMIN)) notFound();

  return (
    <DashboardShell
      basePath="/dashboard"
      section={key}
      nav={navFor}
      signInHref="/login"
    >
      <SectionView section={key} />
    </DashboardShell>
  );
}
