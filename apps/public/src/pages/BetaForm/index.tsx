import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import * as Lucide from "lucide-react";

import Banner from "@/components/Banner";
import { Button } from "@jaci/ui/Button";
import {
  Card,
  CardBody,
  CardContent,
  CardIcon,
  CardTitle,
} from "@jaci/ui/Card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogHeading,
  DialogIcon,
  DialogTitle,
} from "@jaci/ui/Dialog";
import { getThirdPartyImage } from "@/utils/common";
import { WizardForm } from "./components/WizardForm";
import { ExternalLink } from "@/components/common/ExternalLink";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { Skeleton } from "@jaci/ui/Skeleton";

import styles from "./Form.module.css";

const FALLBACK_FORM =
  "https://docs.google.com/forms/d/e/1FAIpQLSdA_l2KNzT5NflkGgCCOik0wCoCxlVuLRsEStacvWDaV4_hMA/viewform";

export default function BetaForm() {
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successId, setSuccessId] = useState<string>("");
  const [successWarning, setSuccessWarning] = useState<string | null>(null);
  const heroImage = getThirdPartyImage("form")?.url;
  const navigate = useNavigate();
  const { settings, loading: loadingSettings } = useSystemSettings();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <main>
      <Dialog
        open={showSuccessDialog}
        onOpenChange={(open) => {
          if (!open) navigate("/");
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogIcon tone="success">
              <Lucide.CheckCircle />
            </DialogIcon>
            <DialogHeading>
              <DialogTitle>Formulário enviado com sucesso!</DialogTitle>
              <DialogDescription>
                {successId && (
                  <span
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "0.8em",
                    }}
                  >
                    ID da sua candidatura: {successId}
                  </span>
                )}
                {successWarning && (
                  <span className={styles.submissionWarning} role="status">
                    {successWarning}
                  </span>
                )}
              </DialogDescription>
            </DialogHeading>
          </DialogHeader>
          <div className={styles.modalContent}>
            <p>
              A equipe de voluntários do Abrigo do Wlad vai analisar seu perfil
              com carinho. Entraremos em contato caso o perfil seja compatível.
            </p>
          </div>
          <DialogFooter>
            <div>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Em caso de dúvidas
              </span>
              <p>Estamos disponíveis em</p>
            </div>
            <div
              style={{ display: "flex", gap: "0.8rem" }}
              className={styles.modalContact}
            >
              <ExternalLink href="https://www.instagram.com/abrigodowlad/">
                <Button
                  size="md"
                  variant="secondary"
                  leftIcon={<Lucide.Instagram size={16} />}
                >
                  Instagram
                </Button>
              </ExternalLink>
              <ExternalLink href="mailto:abrigodowlad@gmail.com">
                <Button
                  size="md"
                  variant="secondary"
                  leftIcon={<Lucide.Mail size={16} />}
                >
                  E-mail
                </Button>
              </ExternalLink>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Banner
        image={heroImage as string}
        badge="Questionário"
        title="Intenção de adoção"
        description="Por favor, responda com sinceridade. Adoção é um ato de amor e responsabilidade."
      />
      <div className="container">
        {loadingSettings ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "2rem" }}>
            <Skeleton style={{ width: "100%", height: "150px" }} />
            <Skeleton style={{ width: "100%", height: "400px" }} />
          </div>
        ) : settings?.acceptingApplications === false ? (
          <div className={styles.notAcceptingContainer}>
            <Lucide.Info size={48} color="var(--primary)" />
            <h2>Solicitações temporariamente pausadas</h2>
            <p>
              No momento não estamos recebendo novas solicitações de adoção.
              Por favor, acompanhe nossas redes sociais para saber quando
              voltaremos a receber candidaturas!
            </p>
            <div style={{ marginTop: "1rem" }}>
              <ExternalLink href="https://www.instagram.com/abrigodowlad/">
                <Button variant="secondary" leftIcon={<Lucide.Instagram />}>
                  Acompanhar no Instagram
                </Button>
              </ExternalLink>
            </div>
          </div>
        ) : (
          <WizardForm
            onSubmitSuccess={({ applicationId, warning }) => {
              setSuccessId(applicationId);
              setSuccessWarning(warning ?? null);
              setShowSuccessDialog(true);
            }}
          />
        )}
        <div className={styles.betaDisclaimer}>
          <Card variant="callout" tone="info" size="xs" layout="inline">
            <CardBody>
              <CardIcon>
                <Lucide.Sparkles size={20} aria-hidden="true" />
              </CardIcon>
              <CardTitle>Estamos aprimorando este formulário</CardTitle>
              <CardContent>
                <p>
                  Se encontrar algum problema, você pode usar o{" "}
                  <ExternalLink href={FALLBACK_FORM} className={styles.betaFallbackLink}>
                    formulário alternativo
                    <Lucide.ArrowUpRight size={15} aria-hidden="true" />
                  </ExternalLink>
                </p>
              </CardContent>
            </CardBody>
          </Card>

          {import.meta.env.DEV && (
            <div className={styles.betaTestAction}>
              <Button
                size="sm"
                variant="success"
                leftIcon={<Lucide.TestTube size={18} />}
                onClick={async () => {
                  try {
                    const res = await fetch('/api/tests/email');
                    const body = await res.json();
                    alert(res.ok ? `Sucesso: ${body.message}` : `Erro: ${body.message}`);
                  } catch (e) {
                    alert('Falha na requisição. O servidor está rodando?');
                    console.error(e);
                  }
                }}
              >
                Testar e-mail de notificação
              </Button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
