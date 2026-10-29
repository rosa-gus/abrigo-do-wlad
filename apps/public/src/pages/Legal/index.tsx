import { useEffect, useState, useRef } from "react";
import * as Lucide from "lucide-react";
import * as CardComponent from "@jaci/ui/Card";
import { ContactLink } from "@/components/common/ContactLink";
import Banner from "../../components/Banner";
import { ScrollIndicators } from "@/components/ScrollIndicators";

import styles from "./Legal.module.css";
import { getThirdPartyImage } from "@/utils/common";

interface PrivacySection {
  id: string;
  title: string;
  content: string;
  type?: "card" | "default";
  items?: string[];
  contact?: {
    organization: string;
    email: string;
    instagram: string;
    instagramUrl: string;
  };
}

interface PrivacyData {
  title: string;
  badge: string;
  description: string;
  lastUpdate: string;
  sections: PrivacySection[];
}

export default function PrivacyPolicy() {
  const heroImage = getThirdPartyImage("privacy_policy")?.url;

  const [data, setData] = useState<PrivacyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null!);

  useEffect(() => {
    fetch("/legal/privacy-policy.json")
      .then((res) => {
        if (!res.ok) throw new Error("Falha ao carregar documento");
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className={styles.loading}>Carregando...</div>;
  if (error)
    return <div className={styles.error}>Erro ao carregar: {error}</div>;
  if (!data) return null;

  return (
    <>
      <ScrollIndicators
        containerRef={containerRef}
        sectionCount={data.sections.length}
        labels={data.sections.map((s) => s.title)}
      />
      <Banner
        image={heroImage as string}
        badge={data.badge}
        title={data.title}
        description={data.description}
      />
      <div className="container">
        <div className={styles.privacyContainer}>
          <div className={styles.privacyText}>
            <p style={{ opacity: 0.8, fontSize: "0.875rem" }}>
              Última atualização: {data.lastUpdate}
            </p>

            <div ref={containerRef} className={styles.privacySections}>
              {data.sections.map((section) => (
                <div key={section.id}>
                  <h2 className="section-title">{section.title}</h2>

                  {section.type === "card" ? (
                    <CardComponent.Card tone="success" variant="callout">
                      <CardComponent.CardBody>
                        <CardComponent.CardHeader>
                          <CardComponent.CardIcon>
                            <Lucide.Shield size={30} strokeWidth={1.5} />
                          </CardComponent.CardIcon>
                          <CardComponent.CardTitle>
                            {section.title}
                          </CardComponent.CardTitle>
                        </CardComponent.CardHeader>
                        <CardComponent.CardContent>
                          <p>{section.content}</p>
                        </CardComponent.CardContent>
                      </CardComponent.CardBody>
                    </CardComponent.Card>
                  ) : (
                    <>
                      <p>{section.content}</p>

                      {section.items && (
                        <ul className={styles.list}>
                          {section.items.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      )}

                      {section.contact && (
                        <div className={styles.contactInfo}>
                          <p className={styles.contactOrganization}>
                            <strong>{section.contact.organization}</strong>
                          </p>
                          <div className={styles.contactLinks}>
                            <ContactLink
                              href={`mailto:${section.contact.email}`}
                              icon={<Lucide.Mail size={20} aria-hidden="true" />}
                              label="Desenvolvedores da plataforma"
                            >
                              {section.contact.email}
                            </ContactLink>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
