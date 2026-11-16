import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "@jaci/ui/Button";
import { RecycleForm } from "../../components/RecycleForm";
import { getRecyclePointById, updateRecyclePoint } from "../../services/recycle";
import type { RecyclePoint, RecyclePointInput } from "../../types/recycle";

export default function EditRecycle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [pointData, setPointData] = useState<RecyclePoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pointId = id ?? "";

  useEffect(() => {
    let active = true;

    async function load() {
      if (!pointId) {
        setLoadError("O identificador do ponto de coleta é inválido.");
        setLoading(false);
        return;
      }

      try {
        const data = await getRecyclePointById(pointId);
        if (!active) return;

        if (data) setPointData(data);
        else setLoadError("Ponto de coleta não encontrado.");
      } catch {
        if (active) {
          setLoadError("Não foi possível carregar os dados do ponto de coleta.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [pointId]);

  const handleUpdate = async (finalData: RecyclePointInput) => {
    await updateRecyclePoint(pointId, { ...finalData, expectedUpdateTime: pointData?.revision });
  };

  if (loading) {
    return <div className="container" style={{ padding: "2rem" }}>Carregando...</div>;
  }

  if (loadError || !pointData) {
    return (
      <div className="container" style={{ padding: "2rem" }} role="alert">
        <p>{loadError ?? "Ponto de coleta não encontrado."}</p>
        <Button type="button" variant="secondary" onClick={() => navigate("/admin/recycle")}>
          Voltar para pontos de coleta
        </Button>
      </div>
    );
  }

  return (
    <RecycleForm
      title={`Editar: ${pointData.name || pointData.neighborhood}`}
      buttonLabel="Salvar Alterações"
      initialData={pointData}
      onSubmit={handleUpdate}
    />
  );
}
