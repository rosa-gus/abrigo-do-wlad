import { ClipboardList, Dog, LayoutDashboard, Recycle, Settings2 } from "lucide-react";

export const adminNavigation = [
  { href: "/admin", label: "Visão Geral", mobileLabel: "Início", icon: LayoutDashboard },
  { href: "/admin/dog", label: "Cachorros", mobileLabel: "Cães", icon: Dog },
  { href: "/admin/recycle", label: "Pontos de Coleta", mobileLabel: "Coleta", icon: Recycle },
  { href: "/admin/adoptions", label: "Solicitações", mobileLabel: "Adoções", icon: ClipboardList },
  { href: "/admin/dev-options", label: "Opções de Dev", mobileLabel: "Dev", icon: Settings2, developerOnly: true },
] as const;
