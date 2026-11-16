import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "@jaci/ui/Button";
import { DogForm } from "../../components/DogForm";
import { getDogById, updateDog } from "../../services/dogs";
import type { DogInput, DogProps } from "../../types/dogs";

export default function EditDog() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [dogData, setDogData] = useState<DogProps | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const dogId = Number(id);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!id || !Number.isInteger(dogId)) {
        setLoadError("O identificador do cachorro é inválido.");
        setLoading(false);
        return;
      }

      try {
        const data = await getDogById(dogId);
        if (!active) return;

        if (data) setDogData(data);
        else setLoadError("Cachorro não encontrado.");
      } catch {
        if (active) {
          setLoadError("Não foi possível carregar os dados do cachorro.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [dogId, id]);

  const handleUpdate = async (finalData: DogInput) => {
    await updateDog(dogId, { ...finalData, expectedUpdateTime: dogData?.revision });
  };

  if (loading) {
    return <div className="container" style={{ padding: "2rem" }}>Carregando...</div>;
  }

  if (loadError || !dogData) {
    return (
      <div className="container" style={{ padding: "2rem" }} role="alert">
        <p>{loadError ?? "Cachorro não encontrado."}</p>
        <Button type="button" variant="secondary" onClick={() => navigate("/admin/dog")}>
          Voltar para cachorros
        </Button>
      </div>
    );
  }

  return (
    <DogForm
      title={`Editar: ${dogData.nome}`}
      buttonLabel="Salvar Alterações"
      initialData={dogData}
      onSubmit={handleUpdate}
    />
  );
}
