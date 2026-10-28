import { Badge } from "@jaci/ui/Badge";
import { Button } from "@jaci/ui/Button";
import { Card, CardBody, CardContent, CardHeader, CardIcon, CardTitle } from "@jaci/ui/Card";
import { EmptyState } from "@jaci/ui/EmptyState";
import { Textarea } from "@jaci/ui/Field";
import { Label } from "@jaci/ui/Label";
import { RadioGroup, RadioGroupItem } from "@jaci/ui/RadioGroup";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@jaci/ui/Select";
import { KeyRound, RefreshCw, Save, ShieldCheck, Trash2 } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { ConfirmModal } from "../../components/ConfirmModal";
import { useAuth } from "../../contexts/AuthContext";
import {
  deleteAdminNotification,
  getAdminNotification,
  saveAdminNotification,
} from "../../services/notifications";
import { getSystemKeys, rotateSystemKey } from "../../services/systemKeys";
import type {
  NotificationExpiration,
  NotificationType,
} from "../../types/notifications";
import type { SystemKey } from "../../types/systemKeys";
import styles from "./DeveloperOptions.module.css";

function formatDate(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Data desconhecida";
  return date.toLocaleString("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

const expirationOptions: Array<{
  label: string;
  value: NotificationExpiration;
}> = [
  { label: "1 hora", value: "1h" },
  { label: "6 horas", value: "6h" },
  { label: "12 horas", value: "12h" },
  { label: "Até apagar", value: "until_deleted" },
];

function isNotificationExpiration(value: string): value is NotificationExpiration {
  return value === "1h" ||
    value === "6h" ||
    value === "12h" ||
    value === "until_deleted";
}

function isNotificationType(value: string): value is NotificationType {
  return value === "trivial" || value === "urgent" ||
    value === "success" || value === "info";
}

export default function DeveloperOptions() {
  const { user } = useAuth();
  const [keys, setKeys] = useState<SystemKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationType, setNotificationType] = useState<NotificationType>("info");
  const [notificationExpiration, setNotificationExpiration] =
    useState<NotificationExpiration>("6h");
  const [notificationExists, setNotificationExists] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(true);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [notificationNotice, setNotificationNotice] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setKeys(await getSystemKeys());
    } catch (cause) {
      console.error("Erro ao carregar metadados das chaves:", cause);
      setError("Não foi possível carregar as chaves do sistema.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    getSystemKeys()
      .then((loadedKeys) => {
        if (active) setKeys(loadedKeys);
      })
      .catch((cause: unknown) => {
        console.error("Erro ao carregar metadados das chaves:", cause);
        if (active) setError("Não foi possível carregar as chaves do sistema.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    getAdminNotification()
      .then((notification) => {
        if (!active || !notification) return;
        setNotificationMessage(notification.message);
        setNotificationType(notification.type);
        setNotificationExpiration(notification.expiration);
        setNotificationExists(true);
      })
      .catch((cause: unknown) => {
        console.error("Erro ao carregar notificação do painel:", cause);
        if (active) setNotificationError("Não foi possível carregar a notificação do painel.");
      })
      .finally(() => {
        if (active) setNotificationLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleRotate() {
    setConfirming(false);
    setRotating(true);
    setError(null);
    setNotice(null);
    try {
      const created = await rotateSystemKey();
      setNotice(`A chave ${created.version} foi criada e ativada.`);
      await loadKeys();
    } catch (cause) {
      console.error("Erro ao rotacionar chave do sistema:", cause);
      setError("A rotação não foi concluída. Nenhuma confirmação de alteração foi recebida.");
    } finally {
      setRotating(false);
    }
  }

  async function handleNotificationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotificationSaving(true);
    setNotificationError(null);
    setNotificationNotice(null);

    try {
      const saved = await saveAdminNotification({
        message: notificationMessage,
        type: notificationType,
        expiration: notificationExpiration,
      });
      setNotificationMessage(saved.message);
      setNotificationType(saved.type);
      setNotificationExpiration(saved.expiration);
      setNotificationExists(true);
      setNotificationNotice("A notificação do painel foi publicada.");
    } catch (cause) {
      console.error("Erro ao salvar notificação do painel:", cause);
      setNotificationError("Não foi possível publicar a notificação.");
    } finally {
      setNotificationSaving(false);
    }
  }

  async function handleNotificationDelete() {
    setNotificationSaving(true);
    setNotificationError(null);
    setNotificationNotice(null);

    try {
      await deleteAdminNotification();
      setNotificationMessage("");
      setNotificationType("info");
      setNotificationExpiration("6h");
      setNotificationExists(false);
      setNotificationNotice("A notificação foi removida da visão geral.");
    } catch (cause) {
      console.error("Erro ao remover notificação do painel:", cause);
      setNotificationError("Não foi possível remover a notificação.");
    } finally {
      setNotificationSaving(false);
    }
  }

  const activeKey = keys.find((key) => key.active);

  return (
    <div className={styles.container}>
      <header className={styles.pageHeader}>
        <div className={styles.eyebrow}><ShieldCheck size={18} /> Área de desenvolvedor</div>
        <h1 className={styles.title}>Opções de desenvolvedor</h1>
        <p className={styles.subtitle}>
          Gerencie configurações técnicas e ferramentas restritas do painel.
        </p>
      </header>

      <section className={styles.optionSection} aria-labelledby="admin-notification-title">
        <div className={styles.optionHeader}>
          <div>
            <h2 id="admin-notification-title" className={styles.optionTitle}>
              Notificação do painel
            </h2>
            <p className={styles.optionDescription}>
              Publique uma mensagem curta em Avisos e Pendências. Uma nova publicação substitui a atual.
            </p>
          </div>
        </div>

        <div className={styles.feedback} aria-live="polite">
          {notificationError && <p className={styles.error}>{notificationError}</p>}
          {notificationNotice && <p className={styles.notice}>{notificationNotice}</p>}
        </div>

        <Card className={styles.notificationEditor} tone="info" size="sm">
          <CardBody>
            <form className={styles.notificationForm} onSubmit={handleNotificationSubmit}>
              <div className={styles.notificationMessageField}>
                <Label htmlFor="notification-message">Mensagem</Label>
                <Textarea
                  id="notification-message"
                  value={notificationMessage}
                  maxLength={240}
                  placeholder="Ex.: O cadastro ficará indisponível às 18h."
                  disabled={notificationLoading || notificationSaving}
                  required
                  onChange={(event) => setNotificationMessage(event.target.value)}
                />
                <span className={styles.characterCount}>{notificationMessage.length}/240</span>
              </div>

              <div className={styles.notificationTypeField}>
                <Label htmlFor="notification-type">Tipo</Label>
                <Select
                  value={notificationType}
                  disabled={notificationLoading || notificationSaving}
                  onValueChange={(value) => {
                    if (isNotificationType(value)) setNotificationType(value);
                  }}
                >
                  <SelectTrigger id="notification-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trivial">Trivial</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                    <SelectItem value="success">Sucesso</SelectItem>
                    <SelectItem value="info">Informação</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <fieldset className={styles.expirationField}>
                <legend>Expiração</legend>
                <RadioGroup
                  className={styles.expirationOptions}
                  value={notificationExpiration}
                  disabled={notificationLoading || notificationSaving}
                  onValueChange={(value) => {
                    if (isNotificationExpiration(value)) {
                      setNotificationExpiration(value);
                    }
                  }}
                >
                  {expirationOptions.map((option) => {
                    const id = `notification-expiration-${option.value}`;
                    return (
                      <div key={option.value} className={styles.expirationOption}>
                        <RadioGroupItem id={id} value={option.value} />
                        <Label htmlFor={id}>{option.label}</Label>
                      </div>
                    );
                  })}
                </RadioGroup>
              </fieldset>

              <div className={styles.notificationActions}>
                <Button
                  type="submit"
                  leftIcon={<Save size={18} />}
                  disabled={notificationLoading || notificationSaving || !notificationMessage.trim()}
                >
                  {notificationSaving ? "Salvando..." : "Publicar notificação"}
                </Button>
                {notificationExists && (
                  <Button
                    type="button"
                    variant="outline"
                    leftIcon={<Trash2 size={18} />}
                    disabled={notificationSaving}
                    onClick={() => void handleNotificationDelete()}
                  >
                    Remover atual
                  </Button>
                )}
              </div>
            </form>
          </CardBody>
        </Card>
      </section>

      <section className={styles.optionSection} aria-labelledby="system-keys-title">
        <div className={styles.optionHeader}>
          <div>
            <h2 id="system-keys-title" className={styles.optionTitle}>Chaves do sistema</h2>
            <p className={styles.optionDescription}>
              Rotacione a chave usada para novos dados sensíveis sem invalidar os registros anteriores.
            </p>
          </div>
          <Button
            type="button"
            leftIcon={<RefreshCw size={18} />}
            disabled={loading || rotating}
            onClick={() => setConfirming(true)}
          >
            {rotating ? "Rotacionando..." : "Rotacionar chave"}
          </Button>
        </div>

        <div className={styles.feedback} aria-live="polite">
          {error && <p className={styles.error}>{error}</p>}
          {notice && <p className={styles.notice}>{notice}</p>}
        </div>

        <Card className={styles.summary} tone="info" size="sm" layout="inline">
          <CardBody className={styles.summaryBody}>
            <CardIcon className={styles.summaryIcon}>
              <KeyRound size={28} />
            </CardIcon>
            <CardContent className={styles.summaryContent}>
              <span className={styles.summaryLabel}>Chave ativa</span>
              <strong>{activeKey?.version ?? (loading ? "Carregando..." : "Nenhuma")}</strong>
              <span className={styles.summaryDetail}>
                Acesso concedido a {user?.email ?? "desenvolvedor autenticado"}
              </span>
            </CardContent>
          </CardBody>
        </Card>

        <div className={styles.listSection} aria-busy={loading}>
          <h3>Histórico de chaves</h3>
          {loading ? (
            <p className={styles.loadingState}>Carregando metadados...</p>
          ) : keys.length === 0 ? (
            <EmptyState size="md" icon={<KeyRound />} title="Nenhuma chave foi encontrada." />
          ) : (
            <div className={styles.list}>
              {keys.map((key) => (
                <Card
                  key={key.id}
                  className={styles.keyCard}
                  tone={key.active ? "success" : "neutral"}
                  size="sm"
                >
                  <CardBody className={styles.keyBody}>
                    <CardHeader className={styles.keyHeader}>
                      <CardTitle>{key.version}</CardTitle>
                      <Badge variant={key.active ? "success" : "outline"} size="sm">
                        {key.active ? "Ativa" : "Arquivada"}
                      </Badge>
                    </CardHeader>
                    <CardContent className={styles.keyDetails}>
                      <dl>
                        <div><dt>Criada em</dt><dd>{formatDate(key.createdAt)}</dd></div>
                        <div><dt>Autor</dt><dd>{key.author ?? "Não informado"}</dd></div>
                        <div><dt>Itens criptografados</dt><dd>{key.counter}</dd></div>
                      </dl>
                    </CardContent>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>

      <ConfirmModal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void handleRotate()}
        title="Rotacionar a chave ativa?"
        message="Novos dados passarão a usar uma nova chave. As chaves anteriores serão preservadas para leitura dos registros já armazenados."
        confirmText="Rotacionar"
      />
    </div>
  );
}
