import { useEffect, useRef, useState } from "react";
import * as Lucide from "lucide-react";
import { Button } from "@jaci/ui/Button";
import { Badge } from "@jaci/ui/Badge";
import { EmptyState } from "@jaci/ui/EmptyState";
import {
  Card,
  CardBody,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@jaci/ui/Card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@jaci/ui/Dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@jaci/ui/Select";
import { Skeleton } from "@jaci/ui/Skeleton";
import {
  ADOPTION_REVIEW_STEPS,
  AdoptionDetailsSection,
} from "../../components/AdoptionApplicationDetails";
import {
  getAdoptionApplication,
  getAdoptionApplications,
  updateAdoptionStatus,
} from "../../services/adoptions";
import { ConfirmModal } from "../../components/ConfirmModal";
import { ErrorModal } from "../../components/ErrorModal";
import { SuccessModal } from "../../components/SuccessModal";
import type {
  AdoptionRequest,
  AdoptionRequestSummary,
} from "../../types/adoptions";
import styles from "./AdoptionsDashboard.module.css";

interface ExpirationPresentation {
  label: string;
  title: string;
  variant: "danger" | "outline";
}

const DAY_IN_MS = 86_400_000;

interface ReviewSectionNavigationProps {
  activeStep: number;
  onStepChange: (step: number) => void;
}

function ReviewSectionNavigation({
  activeStep,
  onStepChange,
}: ReviewSectionNavigationProps) {
  const activeItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeStep]);

  return (
    <>
      <div className={styles.mobileSectionPicker}>
        <label
          className={styles.mobileSectionLabel}
          htmlFor="adoption-review-section"
        >
          Seção
        </label>
        <Select
          value={String(activeStep)}
          onValueChange={(value) => onStepChange(Number(value))}
        >
          <SelectTrigger
            id="adoption-review-section"
            className={styles.mobileSectionTrigger}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Seções da ficha</SelectLabel>
              {ADOPTION_REVIEW_STEPS.map(({ label }, index) => (
                <SelectItem
                  key={label}
                  value={String(index)}
                  className={styles.mobileSectionOption}
                >
                  {index + 1}. {label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <nav
        className={styles.desktopSectionNavigation}
        aria-label="Seções da ficha de adoção"
      >
        <p className={styles.sectionNavigationLabel}>Seções da ficha</p>
        <ol className={styles.sectionNavigationList}>
          {ADOPTION_REVIEW_STEPS.map(({ label, icon: Icon }, index) => {
            const isActive = activeStep === index;

            return (
              <li key={label}>
                <button
                  ref={isActive ? activeItemRef : undefined}
                  type="button"
                  className={`${styles.sectionNavigationItem} ${isActive ? styles.sectionNavigationItemActive : ""}`}
                  aria-current={isActive ? "step" : undefined}
                  onClick={() => onStepChange(index)}
                >
                  <span
                    className={styles.sectionNavigationNumber}
                    aria-hidden="true"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <Icon
                    className={styles.sectionNavigationIcon}
                    size={17}
                    aria-hidden="true"
                  />
                  <span>{label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}

function getExpirationPresentation(
  expiresAt?: string,
): ExpirationPresentation | null {
  if (!expiresAt) return null;

  const expiration = new Date(expiresAt);
  const expirationTime = expiration.getTime();
  if (!Number.isFinite(expirationTime)) return null;

  const now = new Date();
  const formattedExpiration = expiration.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });

  if (expirationTime <= now.getTime()) {
    return {
      label: "Prazo expirado",
      title: `Expirou em ${formattedExpiration}`,
      variant: "danger",
    };
  }

  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const expirationDay = Date.UTC(
    expiration.getFullYear(),
    expiration.getMonth(),
    expiration.getDate(),
  );
  const daysLeft = Math.max(0, Math.round((expirationDay - today) / DAY_IN_MS));
  const label =
    daysLeft === 0
      ? "Expira hoje"
      : daysLeft === 1
        ? "Expira amanhã"
        : `Expira em ${daysLeft} dias`;

  return {
    label,
    title: `Expira em ${formattedExpiration}`,
    variant: daysLeft <= 2 ? "danger" : "outline",
  };
}

export default function AdoptionsDashboard() {
  const [requests, setRequests] = useState<AdoptionRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedSummary, setSelectedSummary] =
    useState<AdoptionRequestSummary | null>(null);
  const [selectedReq, setSelectedReq] = useState<AdoptionRequest | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [activeReviewStep, setActiveReviewStep] = useState(0);
  const detailsCache = useRef(new Map<string, AdoptionRequest>());
  const detailRequestToken = useRef(0);
  const reviewMainRef = useRef<HTMLDivElement>(null);

  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    type: "approved" | "rejected";
    req: AdoptionRequestSummary | null;
  }>({
    isOpen: false,
    type: "approved",
    req: null,
  });

  const [successInfo, setSuccessInfo] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  }>({
    isOpen: false,
    title: "",
    message: "",
  });
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function fetchRequests() {
      try {
        const data = await getAdoptionApplications<AdoptionRequestSummary>();
        const sortedData = [...data].sort((a, b) => {
          if (a.status === "pending" && b.status !== "pending") return -1;
          if (a.status !== "pending" && b.status === "pending") return 1;

          const timeA = a.submittedAt ? Date.parse(a.submittedAt) : 0;
          const timeB = b.submittedAt ? Date.parse(b.submittedAt) : 0;
          return timeB - timeA;
        });
        if (active) setRequests(sortedData);
      } catch {
        if (active) setListError("Não foi possível carregar as solicitações.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void fetchRequests();
    return () => {
      active = false;
    };
  }, [reloadToken]);

  const handleConfirmAction = async () => {
    if (!actionModal.req?.id || isUpdatingStatus) return;
    const { id, nome_adotante } = actionModal.req;
    const { type } = actionModal;
    setIsUpdatingStatus(true);

    try {
      await updateAdoptionStatus(id, type);

      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: type } : r)),
      );
      const cached = detailsCache.current.get(id);
      if (cached) detailsCache.current.set(id, { ...cached, status: type });
      setSelectedReq((current) =>
        current?.id === id ? { ...current, status: type } : current,
      );
      setActionModal({ isOpen: false, type: "approved", req: null });

      setSuccessInfo({
        isOpen: true,
        title:
          type === "approved" ? "Adoção Aprovada!" : "Solicitação Reprovada",
        message:
          type === "approved"
            ? `O status de ${nome_adotante} foi alterado para Aprovado.`
            : `O status de ${nome_adotante} foi alterado para Reprovado.`,
      });
    } catch {
      setActionModal({ isOpen: false, type: "approved", req: null });
      setOperationError("Não foi possível atualizar o status da solicitação.");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const getStatusBadge = (status?: string) => {
    if (status === "approved")
      return (
        <Badge variant="success" size="sm">
          Aprovado
        </Badge>
      );
    if (status === "rejected")
      return (
        <Badge variant="danger" size="sm">
          Reprovado
        </Badge>
      );
    return (
      <Badge variant="outline" size="sm">
        Pendente
      </Badge>
    );
  };

  const formatDate = (timestamp?: string) => {
    if (!timestamp) return "Data desconhecida";
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(timestamp));
    } catch {
      return "Data inválida";
    }
  };

  const getWhatsAppLink = (phone?: string, name?: string) => {
    if (!phone) return "";
    const cleanPhone = phone.replace(/\D/g, "");

    let finalPhone = cleanPhone;
    if (cleanPhone.length === 10 || cleanPhone.length === 11) {
      finalPhone = `55${cleanPhone}`;
    }

    const message = encodeURIComponent(
      `Olá ${name || "Candidato"}, sou do Abrigo do Wlad e estou entrando em contato sobre a sua solicitação de adoção.`,
    );
    return `https://wa.me/${finalPhone}?text=${message}`;
  };

  const openReview = async (requestSummary: AdoptionRequestSummary) => {
    const requestToken = ++detailRequestToken.current;
    setSelectedSummary(requestSummary);
    setSelectedReq(null);
    setDetailError(null);
    setActiveReviewStep(0);

    const cached = detailsCache.current.get(requestSummary.id);
    if (cached) {
      setSelectedReq(cached);
      return;
    }

    try {
      const detail = await getAdoptionApplication<AdoptionRequest>(
        requestSummary.id,
      );
      detailsCache.current.set(requestSummary.id, detail);
      if (detailRequestToken.current === requestToken) setSelectedReq(detail);
    } catch (requestError: unknown) {
      if (detailRequestToken.current !== requestToken) return;
      setDetailError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível carregar a ficha.",
      );
    }
  };

  const closeReview = () => {
    detailRequestToken.current += 1;
    setSelectedSummary(null);
    setSelectedReq(null);
    setDetailError(null);
    setActiveReviewStep(0);
  };

  const changeReviewStep = (step: number) => {
    setActiveReviewStep(step);
    reviewMainRef.current?.scrollTo({ top: 0 });
  };

  const openPrintView = (id: string) => {
    window.open(
      `/admin/adoptions/${encodeURIComponent(id)}/print`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const selectedStatus =
    selectedReq?.status ?? selectedSummary?.status ?? "pending";
  const selectedExpiration = getExpirationPresentation(
    selectedSummary?.expiresAt,
  );
  const selectedWhatsAppLink = getWhatsAppLink(
    selectedReq?.telefone ?? selectedSummary?.telefone,
    selectedReq?.nome_adotante ?? selectedSummary?.nome_adotante,
  );
  const currentReviewStep =
    ADOPTION_REVIEW_STEPS[activeReviewStep] ?? ADOPTION_REVIEW_STEPS[0];

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div>
          <h1 className={styles.title}>Solicitações de Adoção</h1>
          <p className={styles.subtitle}>
            Gerencie e avalie os formulários dos candidatos a adotantes.
          </p>
        </div>
      </div>

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Buscando solicitações...</p>
      ) : listError ? (
        <EmptyState
          role="alert"
          size="lg"
          icon={<Lucide.CircleAlert color="var(--error)" />}
          title={listError}
          actions={<Button
            type="button"
            variant="secondary"
            onClick={() => {
              setLoading(true);
              setListError(null);
              setReloadToken(token => token + 1);
            }}
          >Tentar novamente</Button>}
        />
      ) : requests.length === 0 ? (
        <EmptyState
          size="lg"
          icon={<Lucide.Inbox />}
          title="Nenhuma solicitação de adoção pendente."
        />
      ) : (
        <div className={styles.listContainer}>
          {requests.map((req) => {
            const expiration = getExpirationPresentation(req.expiresAt);
            const isPending =
              req.status !== "approved" && req.status !== "rejected";
            const reviewActionLabel = isPending
              ? "Revisar solicitação"
              : "Consultar análise";

            return (
              <Card key={req.id} size="sm" className={styles.card}>
                <CardBody className={styles.cardBody}>
                  <CardContent className={styles.cardInfo}>
                    <div className={styles.cardHeading}>
                      <div className={styles.applicantName}>
                        {req.nome_adotante || "Candidato Sem Nome"}
                        {getStatusBadge(req.status)}
                      </div>
                      {expiration && (
                        <Badge
                          className={styles.expirationBadge}
                          variant={expiration.variant}
                          size="sm"
                          leftIcon={<Lucide.Clock size={14} />}
                          title={expiration.title}
                        >
                          {expiration.label}
                        </Badge>
                      )}
                    </div>
                    <div className={styles.detailsRow}>
                      <div className={styles.detailItem}>
                        <Lucide.Dog size={16} />
                        <span>
                          {req.animal_especifico || "Qualquer cãozinho"}
                        </span>
                      </div>

                      {/* Link para o whatsapp no telefone */}
                      {req.telefone ? (
                        <a
                          href={getWhatsAppLink(
                            req.telefone,
                            req.nome_adotante,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${styles.detailItem} ${styles.wppLink}`}
                          title="Chamar no WhatsApp"
                        >
                          <Lucide.MessageCircle size={16} />
                          <span>{req.telefone}</span>
                        </a>
                      ) : (
                        <div className={styles.detailItem}>
                          <Lucide.Phone size={16} />
                          <span>Sem telefone</span>
                        </div>
                      )}

                      <div className={styles.detailItem}>
                        <Lucide.Calendar size={16} />
                        <span>{formatDate(req.submittedAt)}</span>
                      </div>
                    </div>
                  </CardContent>
                </CardBody>

                <CardFooter className={styles.cardActions}>
                  <div className={styles.utilityActions}>
                    <Button
                      variant={isPending ? "primary" : "secondary"}
                      size="sm"
                      className={`${styles.reviewButton} ${isPending ? styles.reviewButtonPending : ""}`}
                      leftIcon={<Lucide.ClipboardCheck size={18} />}
                      rightIcon={<Lucide.ChevronUp size={16} />}
                      onClick={() => void openReview(req)}
                      aria-label={`${reviewActionLabel} de ${req.nome_adotante || "candidato"}`}
                    >
                      {reviewActionLabel}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className={styles.printCardButton}
                      onClick={() => openPrintView(req.id)}
                      aria-label={`Imprimir ficha de ${req.nome_adotante || "candidato"}`}
                      title="Imprimir ficha"
                    >
                      <Lucide.Printer size={17} />
                    </Button>
                  </div>

                  {isPending && (
                    <div className={styles.decisionActions}>
                      <Button
                        size="sm"
                        variant="success"
                        className={`${styles.actionBtn} ${styles.approveBtn}`}
                        leftIcon={<Lucide.Check size={16} />}
                        onClick={() =>
                          setActionModal({
                            isOpen: true,
                            type: "approved",
                            req,
                          })
                        }
                      >
                        Aprovar
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        className={`${styles.actionBtn} ${styles.rejectBtn}`}
                        leftIcon={<Lucide.XCircle size={16} />}
                        onClick={() =>
                          setActionModal({
                            isOpen: true,
                            type: "rejected",
                            req,
                          })
                        }
                      >
                        Reprovar
                      </Button>
                    </div>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={Boolean(selectedSummary)}
        onOpenChange={(open) => !open && closeReview()}
      >
        <DialogContent
          size="xl"
          layout="structured"
          mobileMode="fullscreen"
          className={selectedReq ? styles.workspaceDialog : undefined}
        >
          <DialogHeader className={styles.workspaceHeader}>
            <div className={styles.workspaceHeaderMain}>
              <div className={styles.workspaceIdentity}>
                <span className={styles.workspaceEyebrow}>
                  Revisão da solicitação
                </span>
                <div className={styles.workspaceTitleRow}>
                  <DialogTitle className={styles.workspaceTitle}>
                    {selectedSummary?.nome_adotante || "Candidato sem nome"}
                  </DialogTitle>
                  {getStatusBadge(selectedStatus)}
                </div>
                <DialogDescription className={styles.workspaceMeta}>
                  <span>
                    <Lucide.Dog size={15} aria-hidden="true" />
                    {selectedSummary?.animal_especifico || "Qualquer cãozinho"}
                  </span>
                  <span>
                    <Lucide.Calendar size={15} aria-hidden="true" />
                    {formatDate(selectedSummary?.submittedAt)}
                  </span>
                  {selectedExpiration && (
                    <span title={selectedExpiration.title}>
                      <Lucide.Clock size={15} aria-hidden="true" />
                      {selectedExpiration.label}
                    </span>
                  )}
                </DialogDescription>
              </div>

              {selectedSummary && (
                <div
                  className={styles.workspaceUtilities}
                  role="toolbar"
                  aria-label="Ações da ficha"
                >
                  {selectedWhatsAppLink && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      leftIcon={<Lucide.MessageCircle size={17} />}
                      onClick={() =>
                        window.open(
                          selectedWhatsAppLink,
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                      title="Conversar pelo WhatsApp"
                    >
                      WhatsApp
                    </Button>
                  )}
                  {selectedReq?.email && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      leftIcon={<Lucide.Mail size={17} />}
                      onClick={() => {
                        window.location.href = `mailto:${selectedReq.email}`;
                      }}
                      title="Enviar e-mail"
                    >
                      E-mail
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={() => openPrintView(selectedSummary.id)}
                    aria-label="Imprimir ficha"
                    title="Imprimir ficha"
                  >
                    <Lucide.Printer size={17} />
                  </Button>
                </div>
              )}
            </div>
          </DialogHeader>

          <DialogBody scrollable={false} className={styles.workspaceBody}>
            {detailError && selectedSummary ? (
              <div className={styles.detailState}>
                <Card variant="callout" tone="danger" size="sm">
                  <CardBody>
                    <CardHeader>
                      <CardTitle>Não foi possível carregar a ficha</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p>{detailError}</p>
                    </CardContent>
                  </CardBody>
                </Card>
                <Button
                  variant="secondary"
                  onClick={() => void openReview(selectedSummary)}
                >
                  Tentar novamente
                </Button>
              </div>
            ) : !selectedReq ? (
              <div
                className={styles.loadingState}
                role="status"
                aria-live="polite"
              >
                <span>Carregando respostas...</span>
                <div className={styles.skeletonGrid} aria-hidden="true">
                  {[0, 1, 2, 3].map((item) => (
                    <div key={item} className={styles.skeletonItem}>
                      <Skeleton className={styles.skeletonLabel} />
                      <Skeleton className={styles.skeletonValue} />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className={styles.workspaceLayout}>
                <ReviewSectionNavigation
                  activeStep={activeReviewStep}
                  onStepChange={changeReviewStep}
                />
                <div
                  ref={reviewMainRef}
                  className={styles.workspaceMain}
                  role="region"
                  aria-labelledby="active-review-section-title"
                  tabIndex={-1}
                >
                  <div className={styles.workspaceSectionHeader}>
                    <div>
                      <span className={styles.workspaceSectionEyebrow}>
                        Seção {activeReviewStep + 1} de{" "}
                        {ADOPTION_REVIEW_STEPS.length}
                      </span>
                      <h3 id="active-review-section-title">
                        {currentReviewStep.label}
                      </h3>
                    </div>
                    <Badge variant="outline" size="sm">
                      {currentReviewStep.fields.length} respostas
                    </Badge>
                  </div>
                  <div className={styles.stepBody}>
                    <AdoptionDetailsSection
                      application={selectedReq}
                      step={currentReviewStep}
                    />
                  </div>
                </div>
              </div>
            )}
          </DialogBody>

          {selectedReq && (
            <DialogFooter className={styles.workspaceFooter}>
              <div className={styles.workspaceFooterNavigation}>
                <span className={styles.workspaceFooterProgress}>
                  {activeReviewStep + 1} / {ADOPTION_REVIEW_STEPS.length}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  leftIcon={<Lucide.ArrowLeft size={17} />}
                  disabled={activeReviewStep === 0}
                  onClick={() =>
                    changeReviewStep(Math.max(0, activeReviewStep - 1))
                  }
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  size="sm"
                  rightIcon={<Lucide.ArrowRight size={17} />}
                  disabled={
                    activeReviewStep === ADOPTION_REVIEW_STEPS.length - 1
                  }
                  onClick={() =>
                    changeReviewStep(
                      Math.min(
                        ADOPTION_REVIEW_STEPS.length - 1,
                        activeReviewStep + 1,
                      ),
                    )
                  }
                >
                  Próxima
                </Button>
              </div>

              {selectedStatus === "pending" ? (
                <div className={styles.workspaceDecisionActions}>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    leftIcon={<Lucide.XCircle size={16} />}
                    onClick={() =>
                      setActionModal({
                        isOpen: true,
                        type: "rejected",
                        req: selectedSummary,
                      })
                    }
                  >
                    Reprovar
                  </Button>
                  <Button
                    type="button"
                    variant="success"
                    size="sm"
                    leftIcon={<Lucide.Check size={16} />}
                    onClick={() =>
                      setActionModal({
                        isOpen: true,
                        type: "approved",
                        req: selectedSummary,
                      })
                    }
                  >
                    Aprovar
                  </Button>
                </div>
              ) : (
                <div className={styles.workspaceCompletedState}>
                  <span>Análise concluída</span>
                  {getStatusBadge(selectedStatus)}
                </div>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmModal
        isOpen={actionModal.isOpen}
        onClose={() =>
          setActionModal({ isOpen: false, type: "approved", req: null })
        }
        onConfirm={handleConfirmAction}
        title={
          actionModal.type === "approved"
            ? "Aprovar Solicitação"
            : "Reprovar Solicitação"
        }
        confirmText={
          actionModal.type === "approved" ? "Sim, Aprovar" : "Sim, Reprovar"
        }
        confirmingText="Atualizando..."
        isConfirming={isUpdatingStatus}
        isDestructive={actionModal.type === "rejected"}
        message={
          <>
            Tem certeza que deseja{" "}
            <strong>
              {actionModal.type === "approved" ? "APROVAR" : "REPROVAR"}
            </strong>{" "}
            a solicitação de <strong>{actionModal.req?.nome_adotante}</strong>?
          </>
        }
      />

      <ErrorModal
        isOpen={operationError !== null}
        onClose={() => setOperationError(null)}
        message={operationError ?? undefined}
      />

      <SuccessModal
        isOpen={successInfo.isOpen}
        onClose={() =>
          setSuccessInfo({ isOpen: false, title: "", message: "" })
        }
        title={successInfo.title}
        message={successInfo.message}
      />
    </div>
  );
}
