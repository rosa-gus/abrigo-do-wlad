import { Hero } from "@/pages/Home/components/Hero";
import { useDailyDog } from "@/hooks/useDailyDog";

import { ActionCards } from "./components/ActionCards";
import { AdoptionBanner } from "@/components/AdoptionBanner";
import { HistorySection } from "./components/HistorySection";
import { FaqSection } from "./components/FaqSection";

import styles from "./Home.module.css";
import { StoreSection } from "./components/StoreSection";

export default function Home() {
  const dog = useDailyDog();

  return (
    <main>
      <div className={`container ${styles.homeContainer}`}>
        <Hero dog={dog} />
        <AdoptionBanner />
        <ActionCards />
        <HistorySection />
        <StoreSection />
        <FaqSection />
      </div>
    </main>
  );
}
