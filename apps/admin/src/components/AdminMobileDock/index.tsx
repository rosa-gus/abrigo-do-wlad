import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import { MobileDock, type MobileDockDestination } from "@jaci/ui/MobileDock";
import { useAuth } from "../../contexts/AuthContext";
import { adminNavigation } from "../adminNavigation";

export function AdminMobileDock() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const destinations = useMemo<MobileDockDestination[]>(() =>
    adminNavigation
      .filter((item) => !('developerOnly' in item) || user?.role === "developer")
      .slice(1)
      .map(({ href, mobileLabel, icon: Icon }) => ({
        href,
        label: mobileLabel,
        icon: <Icon size={22} strokeWidth={2} />,
      })),
  [user?.role]);
  const first = adminNavigation[0];

  return (
    <MobileDock
      pathname={pathname}
      onNavigate={navigate}
      primary={{ href: first.href, label: first.mobileLabel, icon: <first.icon size={22} strokeWidth={2} /> }}
      destinations={destinations}
      ariaLabel="Navegação administrativa"
    />
  );
}
