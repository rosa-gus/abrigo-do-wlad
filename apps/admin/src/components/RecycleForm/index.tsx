import { useState } from "react";
import { useNavigate } from "react-router";
import { MapPin } from "lucide-react";
import { Field, Input } from "@jaci/ui/Field";
import * as SelectComponent from "@jaci/ui/Select";
import { ConfirmModal } from "../ConfirmModal";
import { PublicationActions, PublicationSection } from "../Publication";
import type { PublicationStatus } from "@abrigo/contracts/entities";
import { SuccessModal } from "../SuccessModal";
import { ErrorModal } from "../ErrorModal";
import {
  FormRow,
  FormSection,
  FormShell,
} from "../FormShell";
import { areFormValuesEqual } from "../FormShell/changes";
import type { RecyclePoint, RecyclePointInput } from "../../types/recycle";
import { recyclePointInputSchema } from "@abrigo/contracts/entities";

interface RecycleFormProps {
  initialData?: RecyclePoint;
  onSubmit: (data: RecyclePointInput) => Promise<void>;
  title: string;
  buttonLabel: string;
}

function createRecyclePointInput(initialData?: RecyclePoint): RecyclePointInput {
  return {
    publicationStatus: initialData?.publicationStatus ?? "draft",
    zone: initialData?.zone ?? "",
    neighborhood: initialData?.neighborhood ?? "",
    name: initialData?.name ?? "",
    address: initialData?.address ?? "",
    googleMapsUrl: initialData?.googleMapsUrl ?? "",
  };
}

export function RecycleForm({ initialData, onSubmit, title, buttonLabel }: RecycleFormProps) {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [savedStatus, setSavedStatus] = useState<PublicationStatus>("draft");
  const [errorInfo, setErrorInfo] = useState({ show: false, message: "" });

  const [formData, setFormData] = useState<RecyclePointInput>(() =>
    createRecyclePointInput(initialData)
  );
  const isDirty = !areFormValuesEqual(createRecyclePointInput(initialData), formData);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const status = submitter?.value === "published" ? "published" : "draft";
    if (status === "draft" && initialData?.publicationStatus === "published") {
      setConfirmUnpublish(true);
      return;
    }
    await save(status);
  };

  const save = async (publicationStatus: PublicationStatus) => {
    if (isSubmitting) return;
    const validatedData = recyclePointInputSchema.safeParse({ ...formData, publicationStatus });
    if (!validatedData.success) {
      setErrorInfo({
        show: true,
        message: [...new Set(validatedData.error.issues.map(issue => issue.message))].join(" ")
          ?? "Revise os dados do ponto de coleta antes de continuar.",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit(validatedData.data);
      setSavedStatus(publicationStatus);
      setConfirmUnpublish(false);
      setShowSuccess(true);
    } catch (error: unknown) {
      console.error(error);
      setErrorInfo({ show: true, message: error instanceof Error ? error.message : "Não foi possível salvar os dados." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseSuccess = () => {
    setShowSuccess(false);
    navigate("/admin/recycle");
  };

  return (
    <>

      <SuccessModal
        isOpen={showSuccess}
        onClose={handleCloseSuccess}
        title="Tudo certo!"
        message={savedStatus === "published" ? "Ponto publicado. As alterações estão salvas." : "Rascunho salvo. O ponto não está disponível ao público."}
      />

      <ErrorModal
        onReload={() => window.location.reload()}
        isOpen={errorInfo.show}
        onClose={() => setErrorInfo({ show: false, message: "" })}
        message={errorInfo.message}
      />

      <ConfirmModal isOpen={confirmUnpublish} onClose={() => setConfirmUnpublish(false)}
        onConfirm={() => void save("draft")} title="Voltar para rascunho?"
        message="O ponto será retirado do site. As informações serão preservadas."
        confirmText="Salvar e retirar do site" isConfirming={isSubmitting} />

      <FormShell
        title={title}
        backTo="/admin/recycle"
        isDirty={isDirty && !showSuccess}
        isSubmitting={isSubmitting}
        submitLabel={buttonLabel}
        onSubmit={handleSubmit}
        noValidate
        actions={<PublicationActions status={initialData?.publicationStatus ?? "draft"} isSubmitting={isSubmitting} />}
      >
        <PublicationSection status={initialData?.publicationStatus ?? "draft"} updatedAt={initialData?.updatedAt} />
        <FormSection
          icon={<MapPin size={24} />}
          title="Informações do local"
          description="Endereço e link do local exibidos no site público."
        >
          <FormRow>
            <Field controlId="recycle-zone" label="Zona da cidade" required>
              <SelectComponent.Select
                value={formData.zone}
                onValueChange={zone => setFormData({...formData, zone})}
                required
              >
                <SelectComponent.SelectTrigger id="recycle-zone">
                  <SelectComponent.SelectValue placeholder="Selecione a zona" />
                </SelectComponent.SelectTrigger>
                <SelectComponent.SelectContent>
                  <SelectComponent.SelectItem value="ZONA SUL">ZONA SUL</SelectComponent.SelectItem>
                  <SelectComponent.SelectItem value="ZONA OESTE">ZONA OESTE</SelectComponent.SelectItem>
                  <SelectComponent.SelectItem value="ZONA LESTE">ZONA LESTE</SelectComponent.SelectItem>
                  <SelectComponent.SelectItem value="ZONA NORTE">ZONA NORTE</SelectComponent.SelectItem>
                  <SelectComponent.SelectItem value="CENTRO">CENTRO</SelectComponent.SelectItem>
                </SelectComponent.SelectContent>
              </SelectComponent.Select>
            </Field>

            <Field controlId="recycle-neighborhood" label="Bairro" required>
              <Input
                maxLength={120}
                placeholder="Ex: Vila Mariana"
                value={formData.neighborhood}
                onChange={e => setFormData({...formData, neighborhood: e.target.value})}
              />
            </Field>
          </FormRow>

          <Field controlId="recycle-name" label="Nome do local" description="Informe o nome ou o bairro para identificar o rascunho.">
            <Input
              maxLength={160}
              placeholder="Ex: PetShop Latmia"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </Field>

          <Field
            controlId="recycle-address"
            label="Endereço completo e horário"
            required
          >
            <Input
              maxLength={300}
              placeholder="Ex: Rua Antônio de Macedo Soares, 1350 (Seg a Sex das 8h às 20h)"
              value={formData.address}
              onChange={e => setFormData({...formData, address: e.target.value})}
            />
          </Field>

          <Field
            controlId="recycle-google-maps-url"
            label="Link do Google Maps (opcional)"
            description="No Google Maps, abra o local, selecione Compartilhar e copie o link."
          >
            <Input
              type="url"
              inputMode="url"
              maxLength={2_048}
              placeholder="Ex: https://maps.app.goo.gl/..."
              value={formData.googleMapsUrl}
              onChange={e => setFormData({...formData, googleMapsUrl: e.target.value})}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>
        </FormSection>
      </FormShell>
    </>
  );
}
