/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from "react";
import {
  ArrowRight,
  Check,
  ClipboardCheck,
  Dog,
  Heart,
  Home,
  Info,
  Leaf,
  MapPin,
  PawPrint,
  SearchX,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../src/Accordion";
import { Badge } from "../../src/Badge";
import { Button } from "../../src/Button";
import {
  Card,
  CardBody,
  CardContent,
  CardFooter,
  CardHeader,
  CardIcon,
  CardTitle,
} from "../../src/Card";
import { Combobox } from "../../src/Combobox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogHeading,
  DialogIcon,
  DialogTitle,
} from "../../src/Dialog";
import { EmptyState } from "../../src/EmptyState";
import { Field, Input, NativeSelect, Textarea } from "../../src/Field";
import { FilterChip } from "../../src/FilterChip";
import { Label } from "../../src/Label";
import { Pagination } from "../../src/Pagination";
import { RadioGroup, RadioGroupItem } from "../../src/RadioGroup";
import { SearchField } from "../../src/SearchField";
import { Skeleton } from "../../src/Skeleton";
import { Stepper } from "../../src/Stepper";
import { ToggleGroup, ToggleGroupItem } from "../../src/ToggleGroup";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../src/Tooltip";

export type GalleryTheme = "light" | "dark";

export interface GalleryScene {
  id: string;
  title: string;
  description: string;
  themes: GalleryTheme[];
  viewport: {
    width: number;
    height: number;
  };
  render: () => ReactNode;
}

function SceneHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="scene-heading">
      <span className="scene-eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

function ActionsScene() {
  return (
    <div className="scene-layout">
      <SceneHeading
        eyebrow="Jaci · Ações"
        title="Ações claras, em qualquer contexto"
        description="Hierarquia, intenção e feedback reunidos em uma linguagem acolhedora."
      />

      <section className="specimen-panel specimen-panel-large">
        <div className="specimen-group">
          <span className="specimen-label">Ações principais</span>
          <div className="component-row component-row-wrap">
            <Button leftIcon={<Heart size={18} />}>Quero adotar</Button>
            <Button variant="secondary" leftIcon={<PawPrint size={18} />}>
              Conhecer os cães
            </Button>
            <Button variant="success" leftIcon={<Check size={18} />}>
              Cadastro aprovado
            </Button>
          </div>
        </div>

        <div className="specimen-divider" />

        <div className="specimen-group">
          <span className="specimen-label">Variações de suporte</span>
          <div className="component-row component-row-wrap">
            <Button variant="outline">Ver detalhes</Button>
            <Button variant="ghost">Salvar para depois</Button>
            <Button variant="text" rightIcon={<ArrowRight size={18} />}>
              Saiba como funciona
            </Button>
            <Button variant="danger" leftIcon={<Trash2 size={18} />}>
              Remover
            </Button>
          </div>
        </div>

        <div className="specimen-divider" />

        <div className="specimen-group">
          <span className="specimen-label">Status e contexto</span>
          <div className="component-row component-row-wrap">
            <Badge variant="primary" leftIcon={<Sparkles />}>Novo</Badge>
            <Badge variant="secondary" leftIcon={<Dog />}>Adoção</Badge>
            <Badge variant="success" leftIcon={<Check />}>Disponível</Badge>
            <Badge variant="danger">Atenção</Badge>
            <Badge variant="outline">São Paulo</Badge>
          </div>
        </div>
      </section>
    </div>
  );
}

function FormsScene() {
  return (
    <div className="scene-layout scene-layout-compact">
      <SceneHeading
        eyebrow="Jaci · Formulários"
        title="Informação com ritmo e orientação"
        description="Controles consistentes ajudam pessoas a avançar com segurança."
      />

      <section className="specimen-panel form-specimen">
        <div className="form-grid">
          <Field
            controlId="gallery-name"
            label="Nome completo"
            description="Como aparece no documento de identificação."
            required
          >
            <Input defaultValue="Marina Oliveira" />
          </Field>

          <Field controlId="gallery-city" label="Cidade" required>
            <NativeSelect defaultValue="sao-paulo">
              <option value="">Selecione uma cidade</option>
              <option value="sao-paulo">São Paulo</option>
              <option value="campinas">Campinas</option>
              <option value="santos">Santos</option>
            </NativeSelect>
          </Field>

          <Field
            controlId="gallery-message"
            label="Conte um pouco sobre sua rotina"
            description="Essas informações ajudam a encontrar o melhor encontro."
          >
            <Textarea
              rows={3}
              defaultValue="Tenho uma rotina tranquila e adoro caminhadas no fim da tarde."
            />
          </Field>

          <Field
            controlId="gallery-email"
            label="E-mail"
            error="Revise o endereço de e-mail informado."
            required
          >
            <Input type="email" defaultValue="marina@exemplo" />
          </Field>
        </div>

        <div className="specimen-divider" />

        <div className="form-options-grid">
          <div className="specimen-group">
            <span className="specimen-label">Tipo de moradia</span>
            <RadioGroup defaultValue="casa" aria-label="Tipo de moradia">
              <div className="radio-option">
                <RadioGroupItem value="casa" id="gallery-house" />
                <Label htmlFor="gallery-house">Casa</Label>
              </div>
              <div className="radio-option">
                <RadioGroupItem value="apartamento" id="gallery-apartment" />
                <Label htmlFor="gallery-apartment">Apartamento</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="specimen-group">
            <span className="specimen-label">Preferência de porte</span>
            <ToggleGroup type="multiple" defaultValue={["medio", "grande"]}>
              <ToggleGroupItem value="pequeno">Pequeno</ToggleGroupItem>
              <ToggleGroupItem value="medio">Médio</ToggleGroupItem>
              <ToggleGroupItem value="grande">Grande</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </section>
    </div>
  );
}

function CardsScene() {
  return (
    <div className="scene-layout">
      <SceneHeading
        eyebrow="Jaci · Superfícies"
        title="Conteúdo que encontra seu próprio espaço"
        description="Cards combinam tom, hierarquia e propósito sem perder a identidade."
      />

      <section className="cards-grid">
        <Card tone="info">
          <CardBody>
            <CardHeader>
              <CardIcon><Heart size={32} /></CardIcon>
              <CardTitle>Adoção responsável</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Um encontro cuidadoso começa entendendo a rotina de cada família.</p>
            </CardContent>
          </CardBody>
          <CardFooter>
            <Button variant="text" rightIcon={<ArrowRight size={18} />}>
              Conhecer o processo
            </Button>
          </CardFooter>
        </Card>

        <Card tone="success">
          <CardBody>
            <CardHeader>
              <CardIcon><ShieldCheck size={32} /></CardIcon>
              <CardTitle>Cuidado contínuo</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Saúde, acolhimento e acompanhamento em cada etapa da jornada.</p>
            </CardContent>
          </CardBody>
          <CardFooter>
            <Badge variant="success" leftIcon={<Check />}>Compromisso</Badge>
          </CardFooter>
        </Card>

        <Card variant="callout" tone="coral" layout="inline">
          <CardBody>
            <CardIcon><Leaf size={28} /></CardIcon>
            <CardTitle>Design com natureza</CardTitle>
            <CardContent>
              <p>
                Uma fundação visual inspirada nos ciclos da natureza: do
                amanhecer ao encontro entre o entardecer e a noite.
              </p>
            </CardContent>
          </CardBody>
        </Card>
      </section>
    </div>
  );
}

const steps = [
  { label: "Seus dados", icon: <UserRound />, completed: true },
  { label: "Sua casa", icon: <Home />, completed: true },
  { label: "Preferências", icon: <Heart /> },
  { label: "Revisão", icon: <ClipboardCheck />, disabled: true },
];

function NavigationScene() {
  return (
    <div className="scene-layout scene-layout-compact">
      <SceneHeading
        eyebrow="Jaci · Fluxos"
        title="Progresso sempre visível"
        description="Navegação e divulgação progressiva para jornadas mais longas."
      />

      <section className="specimen-panel flow-panel">
        <Stepper
          steps={steps}
          activeStep={2}
          onStepChange={() => undefined}
          progress={{ label: "Progresso do cadastro", value: 68, valueLabel: "3 de 4" }}
        >
          <div className="step-placeholder">
            <MapPin size={28} />
            <div>
              <strong>Preferências para o encontro</strong>
              <span>Conte onde e como você imagina essa nova rotina.</span>
            </div>
          </div>
        </Stepper>

        <div className="flow-footer">
          <Accordion type="single" defaultValue="matching" collapsible>
            <AccordionItem value="matching">
              <AccordionTrigger>Como funciona a compatibilidade?</AccordionTrigger>
              <AccordionContent>
                Cruzamos rotina, espaço e perfil para sugerir encontros responsáveis.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="time">
              <AccordionTrigger>Quanto tempo leva o processo?</AccordionTrigger>
              <AccordionContent>
                Cada adoção respeita o tempo necessário para uma escolha segura.
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <Pagination
            currentPage={3}
            totalPages={8}
            onPageChange={() => undefined}
          />
        </div>
      </section>
    </div>
  );
}

const dogOptions = [
  { value: "amora", label: "Amora", description: "Dócil · 4 anos" },
  { value: "bento", label: "Bento", description: "Sociável · 6 anos" },
  { value: "caju", label: "Caju", description: "Brincalhão · 2 anos" },
  { value: "flora", label: "Flora", description: "Tranquila · 3 anos" },
];

function SearchScene() {
  return (
    <div className="scene-layout scene-layout-compact">
      <SceneHeading
        eyebrow="Jaci · Descoberta"
        title="Encontrar também pode ser acolhedor"
        description="Busca, filtros e seleção trabalham juntos sem aumentar o esforço."
      />

      <section className="specimen-panel search-panel">
        <div className="search-column">
          <Field
            controlId="gallery-dog-search"
            label="Buscar por nome"
            description="Digite um nome ou explore todas as opções."
          >
            <Combobox
              autoFocus
              options={dogOptions}
              placeholder="Nome do cão"
              defaultValue=""
            />
          </Field>
        </div>

        <div className="filter-column">
          <span className="specimen-label">Filtros ativos</span>
          <div className="component-row component-row-wrap">
            <FilterChip onRemove={() => undefined} removeLabel="Remover temperamento dócil">
              Dócil
            </FilterChip>
            <FilterChip onRemove={() => undefined} removeLabel="Remover adulto">
              Adulto
            </FilterChip>
          </div>

          <span className="specimen-label">Visualização</span>
          <ToggleGroup type="single" defaultValue="todos">
            <ToggleGroupItem value="todos">Todos</ToggleGroupItem>
            <ToggleGroupItem value="favoritos">Favoritos</ToggleGroupItem>
            <ToggleGroupItem value="recentes">Recentes</ToggleGroupItem>
          </ToggleGroup>

          <span className="specimen-label">Busca preenchida</span>
          <SearchField defaultValue="Amora" aria-label="Busca preenchida" />
        </div>
      </section>
    </div>
  );
}

function DialogScene() {
  return (
    <div className="dialog-backdrop-scene">
      <SceneHeading
        eyebrow="Jaci · Feedback"
        title="Decisões importantes pedem clareza"
        description="Diálogos semânticos mantêm contexto, consequência e próxima ação próximos."
      />

      <Dialog defaultOpen>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogIcon tone="danger">
              <Trash2 />
            </DialogIcon>
            <DialogHeading>
              <DialogTitle>Remover este cadastro?</DialogTitle>
              <DialogDescription>
                Essa ação remove as informações da lista e não poderá ser desfeita.
              </DialogDescription>
            </DialogHeading>
          </DialogHeader>
          <DialogBody>
            <div className="dialog-note">
              <Info size={18} />
              O histórico de atendimento continuará disponível para a equipe.
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline">Cancelar</Button>
            <Button variant="danger" leftIcon={<Trash2 size={18} />}>
              Remover cadastro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusScene() {
  return (
    <div className="scene-layout">
      <SceneHeading
        eyebrow="Jaci · Estados"
        title="Cada espera merece uma resposta"
        description="Ausência, carregamento e orientação fazem parte da experiência."
      />

      <section className="status-grid">
        <div className="specimen-panel status-card">
          <EmptyState
            icon={<SearchX size={38} />}
            title="Nenhum resultado por aqui"
            description="Tente remover alguns filtros ou buscar por outro nome."
            actions={<Button variant="outline">Limpar filtros</Button>}
          />
        </div>

        <div className="specimen-panel status-card loading-card">
          <div className="loading-heading">
            <div>
              <span className="specimen-label">Carregando perfil</span>
              <strong>Preparando os detalhes</strong>
            </div>
            <TooltipProvider>
              <Tooltip alwaysOpen>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Sobre o carregamento">
                    <Info size={20} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Os dados chegam em instantes.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Skeleton className="skeleton-hero" />
          <Skeleton className="skeleton-title" />
          <Skeleton className="skeleton-line" />
          <Skeleton className="skeleton-line skeleton-line-short" />
        </div>
      </section>
    </div>
  );
}

const defaultViewport = { width: 1200, height: 900 };

export const galleryScenes: GalleryScene[] = [
  {
    id: "actions",
    title: "Ações e status",
    description: "Botões e badges em suas principais variações.",
    themes: ["light", "dark"],
    viewport: defaultViewport,
    render: () => <ActionsScene />,
  },
  {
    id: "forms",
    title: "Formulários",
    description: "Campos, seleção e mensagens de orientação.",
    themes: ["light", "dark"],
    viewport: defaultViewport,
    render: () => <FormsScene />,
  },
  {
    id: "cards",
    title: "Cards",
    description: "Superfícies com diferentes tons e propósitos.",
    themes: ["light", "dark"],
    viewport: defaultViewport,
    render: () => <CardsScene />,
  },
  {
    id: "navigation",
    title: "Fluxos e navegação",
    description: "Stepper, accordion e paginação em uma jornada.",
    themes: ["light"],
    viewport: defaultViewport,
    render: () => <NavigationScene />,
  },
  {
    id: "search",
    title: "Busca e filtros",
    description: "Combobox, chips e seleção de visualização.",
    themes: ["light", "dark"],
    viewport: defaultViewport,
    render: () => <SearchScene />,
  },
  {
    id: "dialog",
    title: "Diálogo semântico",
    description: "Confirmação destrutiva com contexto e hierarquia.",
    themes: ["light", "dark"],
    viewport: defaultViewport,
    render: () => <DialogScene />,
  },
  {
    id: "status",
    title: "Estados da interface",
    description: "Vazio, carregamento e ajuda contextual.",
    themes: ["light", "dark"],
    viewport: defaultViewport,
    render: () => <StatusScene />,
  },
];
