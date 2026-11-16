import { DOG_DOCUMENT_SCHEMA_VERSION, RECYCLE_POINT_DOCUMENT_SCHEMA_VERSION, supportsDocumentVersion } from "../../../../workers/shared/document-schema";
import { isPublished, publicationMetadata } from "../../../../workers/shared/publication";
import type { DogProps } from "../types/dogs";
import { systemSettingsSchema, type SystemSettings } from "../../shared/system-settings";
import { adoptionStatusUpdate, AdoptionTransitionError } from "../../shared/adoption-retention";
import type {
  AdminNotification,
  NotificationExpiration,
  NotificationInput,
} from "../types/notifications";
import type { RecyclePoint } from "../types/recycle";
import type { SystemKey } from "../types/systemKeys";
import type { MigrationOverview } from "../../shared/migrations";
import {
  dogInputSchema,
  dogUpdateSchema,
  recyclePointInputSchema,
  recyclePointUpdateSchema,
} from "../../shared/entities";
import { dogArchiveDates, isDogArchived } from "../../../../workers/shared/api/dogs/archive";
import { createMockMediaUrl, deleteMockMediaUrl, resetMockMedia } from "./media";

type AdoptionStatus = "pending" | "approved" | "rejected";

interface MockAdoption {
  id: string;
  nome_adotante: string;
  telefone: string;
  animal_especifico: string;
  status: AdoptionStatus;
  submittedAt: string;
  expiresAt: string;
  [key: string]: string;
}

interface MockState {
  migrations: MigrationOverview;
  systemSettings: SystemSettings;
  dogs: DogProps[];
  recyclePoints: RecyclePoint[];
  adoptions: MockAdoption[];
  notification: AdminNotification | null;
  systemKeys: SystemKey[];
  adoptionsViaSite: number;
  auditLog: Array<Record<string, unknown>>;
  nextDogId: number;
  nextRecycleId: number;
}

const MOCK_AUTHOR = "desenvolvedor@localhost.test";

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

function createInitialState(): MockState {
  return {
    migrations: {
      project: "abrigo-mock", environment: "mock", database: "(default)", release: "0".repeat(64),
      migrations: [{ id: "0001-publication-status", description: "Publicação de cães e pontos de coleta (simulado).",
        status: "pending", scanned: 0, changed: 0, attempts: 0, checkpoint: null }],
    },
    systemSettings: { acceptingApplications: true },
    dogs: [
      {
        id: 103,
        publicationStatus: "published",
        schemaVersion: 1,
        publishedAt: "2026-01-01T00:00:00.000Z",
        nome: "Simba",
        idade: "3 anos",
        cateIdade: "adulto",
        sexo: "Macho",
        temperamento: "Companheiro e brincalhão",
        tags: ["docil", "brincalhao", "sociavel"],
        status: "Vacinado e Castrado",
        fotos: [],
        cor: "caramelo",
        instaLink: "",
        descricaoCompleta: "Gosta de passeios, carinho e companhia.",
      },
      {
        id: 102,
        publicationStatus: "published",
        schemaVersion: 1,
        publishedAt: "2026-01-01T00:00:00.000Z",
        nome: "Amora",
        idade: "8 meses",
        cateIdade: "filhote",
        sexo: "Fêmea",
        temperamento: "Curiosa e carinhosa",
        tags: ["curioso", "carinhoso", "ativo"],
        status: "Em Protocolo Vacinal",
        fotos: [],
        cor: "pretinho",
        instaLink: "",
        descricaoCompleta: "Está aprendendo a passear na guia.",
      },
      {
        id: 101,
        publicationStatus: "published",
        schemaVersion: 1,
        publishedAt: "2026-01-01T00:00:00.000Z",
        nome: "Bento",
        idade: "9 anos",
        cateIdade: "idoso",
        sexo: "Macho",
        temperamento: "Calmo e muito afetuoso",
        tags: ["tranquilo", "amavel", "companheiro"],
        status: "Apenas Castrado",
        fotos: [],
        cor: "fiapoManga",
        instaLink: "",
        descricaoCompleta: "Prefere uma rotina tranquila e muitos cochilos.",
      },
    ],
    recyclePoints: [
      {
        id: "eco-morumbi",
        publicationStatus: "published",
        schemaVersion: 1,
        publishedAt: "2026-01-01T00:00:00.000Z",
        zone: "ZONA OESTE",
        neighborhood: "Morumbi",
        name: "Mercadinho do Bairro",
        address: "Avenida Giovanni Gronchi, 120 — segunda a sábado, 8h às 18h",
        googleMapsUrl: "https://maps.google.com/?q=Morumbi,+São+Paulo+-+SP",
      },
      {
        id: "pet-vila-sonia",
        publicationStatus: "published",
        schemaVersion: 1,
        publishedAt: "2026-01-01T00:00:00.000Z",
        zone: "ZONA OESTE",
        neighborhood: "Vila Sônia",
        name: "Pet Amigo",
        address: "Avenida Professor Francisco Morato, 850 — segunda a sexta, 9h às 17h",
        googleMapsUrl: "https://www.google.com/maps/place/Vila+Sônia,+São+Paulo+-+SP",
      },
      {
        id: "coleta-campo-limpo",
        publicationStatus: "published",
        schemaVersion: 1,
        publishedAt: "2026-01-01T00:00:00.000Z",
        zone: "ZONA SUL",
        neighborhood: "Campo Limpo",
        name: "Ponto Solidário",
        address: "Estrada do Campo Limpo, 45 — todos os dias, 8h às 20h",
        googleMapsUrl: "https://maps.google.com/?q=Campo+Limpo,+São+Paulo+-+SP",
      },
    ],
    adoptions: [
      {
        id: "adoption-livia",
        nome_adotante: "Fulana de Tal",
        telefone: "(11) 99999-1001",
        animal_especifico: "Simba",
        status: "pending",
        submittedAt: hoursFromNow(-6),
        expiresAt: daysFromNow(2),
        idade: "31 anos",
        estado_civil: "Casada",
        profissao: "Professora",
        empresa: "Escola Horizonte",
        endereco: "Morumbi, São Paulo - SP",
        email: "livia@example.test",
        redes_sociais: "@livia.exemplo",
        qtd_adultos: "2",
        criancas: "Nenhuma",
        renda_mensal: "Acima de 5 salários mínimos",
        acordo: "Sim",
        alergia: "Não",
        motivo: "Companhia e adoção responsável",
        porte: "Médio",
        sexo: "Sem preferência",
        idade_animal: "Adulto",
        personalidade: "Sociável",
        atividade: "Passeios diários",
        responsavel: "A candidata",
        horas_sozinho: "Até 4 horas",
        passeios: "Duas vezes por dia",
        tipo_moradia: "Apartamento telado",
        proprietario_permite: "Sim",
        detalhes_moradia: "Apartamento próprio com telas",
        moradores: "Duas pessoas",
        areas_frequentar: "Todos os cômodos",
        periodos: "Livre acesso",
        dormir: "Dentro de casa",
        acesso: "Toda a residência",
        outros_animais: "Um gato",
        castrados: "Sim",
        ja_teve: "Sim",
        destino_antigos: "Falecimento por idade avançada",
        veterinario: "Clínica próxima da residência",
        racao: "Premium",
        coleira: "Sim",
        ciencia_adaptacao: "Sim",
        tempo_adaptacao: "O tempo necessário",
        adestrador: "Sim, se necessário",
        motivo_nao_adestrar: "Não se aplica",
        carro: "Sim",
        financeiro_vet: "Possui reserva",
        vacinas: "Concorda",
        gasto_mensal: "R$ 500",
        divulgacao: "Sim",
        noticias: "Sim",
        visitas: "Sim",
        fotos_adocao: "Sim",
        contribuicao: "Sim",
        compromisso_vida: "Sim",
        gravidez: "O animal permanece com a família",
        viagem: "Ficará com familiar",
        mudanca_menor: "Será levado junto",
        mudanca_longe: "Será levado junto",
        separacao: "Ficará com a responsável",
        falecimento: "A família assumirá os cuidados",
        perder: "Busca imediata e divulgação",
        doenca: "Atendimento veterinário",
        morder: "Avaliação comportamental",
        destruicao: "Adaptação e enriquecimento ambiental",
        xixi_errado: "Treinamento com reforço positivo",
        enxoval: "Ciente",
        devolucao: "Entrará em contato com o abrigo",
        termo_nao_repassar: "Concorda",
        obs: "Disponível para entrevista aos sábados.",
      },
      {
        id: "adoption-rafael",
        nome_adotante: "Rafael Nogueira",
        telefone: "(11) 98888-2002",
        animal_especifico: "Amora",
        status: "approved",
        submittedAt: daysFromNow(-3),
        expiresAt: daysFromNow(4),
        idade: "27 anos",
        email: "rafael@example.test",
        endereco: "Vila Sônia, São Paulo - SP",
        tipo_moradia: "Casa com quintal murado",
        motivo: "Aumentar a família",
        obs: "Entrevista inicial concluída.",
      },
      {
        id: "adoption-camila",
        nome_adotante: "Camila Oliveira",
        telefone: "(11) 97777-3003",
        animal_especifico: "Sem preferência",
        status: "rejected",
        submittedAt: daysFromNow(-8),
        expiresAt: daysFromNow(12),
        idade: "22 anos",
        email: "camila@example.test",
        endereco: "Campo Limpo, São Paulo - SP",
        tipo_moradia: "Apartamento",
        motivo: "Companhia",
        obs: "Registro simulado para testar o estado reprovado.",
      },
    ],
    notification: {
      message: "Este painel usa somente dados simulados locais.",
      type: "info",
      target: "admin",
      updatedAt: new Date().toISOString(),
      author: MOCK_AUTHOR,
      expiration: "until_deleted",
      expiresAt: null,
    },
    systemKeys: [
      {
        id: "mock-key-v2",
        version: "mock-v2",
        createdAt: daysFromNow(-14),
        author: MOCK_AUTHOR,
        counter: 12,
        active: true,
      },
      {
        id: "mock-key-v1",
        version: "mock-v1",
        createdAt: daysFromNow(-60),
        author: MOCK_AUTHOR,
        counter: 34,
        active: false,
      },
    ],
    adoptionsViaSite: 7,
    auditLog: [],
    nextDogId: 104,
    nextRecycleId: 1,
  };
}

let state = createInitialState();

export function resetMockAdminState(): void {
  resetMockMedia();
  state = createInitialState();
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function noContentResponse(): Response {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

function adoptionSummary(adoption: MockAdoption) {
  const {
    id,
    nome_adotante,
    telefone,
    animal_especifico,
    status,
    submittedAt,
    expiresAt,
  } = adoption;
  return {
    id,
    nome_adotante,
    telefone,
    animal_especifico,
    status,
    submittedAt,
    expiresAt,
  };
}

function methodNotAllowed(allowed: string[]): Response {
  return new Response(null, { status: 405, headers: { Allow: allowed.join(", ") } });
}

function validationErrorResponse(message: string): Response {
  return jsonResponse({ error: message }, 400);
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    throw new Error("Invalid JSON body");
  }
}

function expirationDate(expiration: NotificationExpiration): string | null {
  if (expiration === "until_deleted") return null;
  return hoursFromNow(Number.parseInt(expiration, 10));
}

function recordMutation(request: Request, target: string): void {
  state.auditLog.unshift({
    id: crypto.randomUUID(),
    actor: MOCK_AUTHOR,
    actorRole: "developer",
    method: request.method,
    path: new URL(request.url).pathname,
    target,
    outcome: "success",
    createdAt: new Date().toISOString(),
  });
}

async function handleDogs(
  request: Request,
  idSegment?: string,
  operation?: string,
): Promise<Response> {
  if (!idSegment) {
    if (request.method === "GET") {
      const listState = new URL(request.url).searchParams.get("state") ?? "active";
      if (listState !== "active" && listState !== "archived") {
        return jsonResponse({ error: "Invalid dog list state." }, 400);
      }
      return jsonResponse(state.dogs.filter((dog) =>
        isDogArchived(dog) === (listState === "archived")
      ));
    }
    if (request.method !== "POST") return methodNotAllowed(["GET", "POST"]);

    const parsedInput = dogInputSchema.safeParse(await readJson<unknown>(request));
    if (!parsedInput.success) {
      return validationErrorResponse(
        parsedInput.error.issues[0]?.message ?? "Dados do cachorro inválidos.",
      );
    }
    const input = parsedInput.data;
    const dog = { ...input, schemaVersion: DOG_DOCUMENT_SCHEMA_VERSION, id: state.nextDogId++, ...publicationMetadata({}, input.publicationStatus) };
    state.dogs.push(dog);
    recordMutation(request, `dogs/${dog.id}`);
    return jsonResponse({ id: dog.id }, 201);
  }

  const id = Number(idSegment);
  if (operation && request.method !== "POST") return methodNotAllowed(["POST"]);
  if (!operation && !["GET", "PATCH", "DELETE"].includes(request.method)) {
    return methodNotAllowed(["GET", "PATCH", "DELETE"]);
  }
  const index = state.dogs.findIndex((dog) => dog.id === id);
  if (index < 0) return jsonResponse({ error: "Dog not found." }, 404);

  if (request.method === "GET") return jsonResponse({
    ...state.dogs[index], revision: state.dogs[index].updatedAt ?? state.dogs[index].publishedAt,
  });
  if (!supportsDocumentVersion(state.dogs[index], DOG_DOCUMENT_SCHEMA_VERSION)) {
    return jsonResponse({ error: "A ficha usa uma versão de dados mais recente ou inválida." }, 409);
  }
  if (request.method === "PATCH") {
    if (isDogArchived(state.dogs[index])) {
      return jsonResponse({ error: "Archived dogs cannot be edited." }, 409);
    }
    const parsedUpdate = dogUpdateSchema.safeParse(await readJson<unknown>(request));
    if (!parsedUpdate.success) {
      return validationErrorResponse(
        parsedUpdate.error.issues[0]?.message ?? "Atualização do cachorro inválida.",
      );
    }
    if (parsedUpdate.data.expectedUpdateTime && parsedUpdate.data.expectedUpdateTime !== (state.dogs[index].updatedAt ?? state.dogs[index].publishedAt)) {
      return jsonResponse({ error: "A ficha foi alterada por outra pessoa. Recarregue antes de salvar." }, 409);
    }
    const merged = dogInputSchema.safeParse({ ...state.dogs[index], ...parsedUpdate.data });
    if (!merged.success) return validationErrorResponse(merged.error.issues[0]?.message ?? "Ficha incompleta.");
    const previous = state.dogs[index];
    const removedPhotos = parsedUpdate.data.fotos
      ? previous.fotos.filter((photo) => !parsedUpdate.data.fotos?.includes(photo))
      : [];
    state.dogs[index] = {
      ...previous, ...merged.data, ...publicationMetadata(previous, merged.data.publicationStatus), id,
      retainedPhotos: Array.from(new Set([...(previous.retainedPhotos ?? []), ...removedPhotos])),
    };
    recordMutation(request, `dogs/${id}`);
    return jsonResponse({ ok: true });
  }
  if (request.method === "DELETE") {
    if (isDogArchived(state.dogs[index]) || state.dogs[index].publicationStatus !== "draft") {
      return jsonResponse({ error: "Somente rascunhos não arquivados podem ser excluídos." }, 409);
    }
    state.dogs.splice(index, 1);
    recordMutation(request, `dogs/${id}`);
    return noContentResponse();
  }
  if (operation === "archive" && request.method === "POST") {
    const input = await readJson<{ reason?: unknown }>(request);
    if (input.reason !== "adopted_via_site" && input.reason !== "other") {
      return jsonResponse({ error: "Invalid archive reason." }, 400);
    }
    if (isDogArchived(state.dogs[index])) {
      if (state.dogs[index].archiveReason !== input.reason) {
        return jsonResponse({ error: "Dog is already archived." }, 409);
      }
      return jsonResponse({
        id,
        archivedAt: state.dogs[index].archivedAt,
        purgeAfter: state.dogs[index].purgeAfter,
      });
    }
    const dates = dogArchiveDates();
    const shouldCountAdoption = input.reason === "adopted_via_site"
      && !state.dogs[index].adoptionCountedAt;
    state.dogs[index] = {
      ...state.dogs[index], ...dates,
      archiveReason: input.reason,
      archivedBy: MOCK_AUTHOR,
      ...(shouldCountAdoption ? { adoptionCountedAt: dates.archivedAt } : {}),
    };
    if (shouldCountAdoption) state.adoptionsViaSite += 1;
    recordMutation(request, `dogs/${id}`);
    return jsonResponse({ ...dates, id });
  }
  if (operation === "restore" && request.method === "POST") {
    if (!isDogArchived(state.dogs[index])) return jsonResponse({ ok: true });
    state.dogs[index] = {
      ...state.dogs[index], archivedAt: null, purgeAfter: null,
      archiveReason: null, archivedBy: null, publicationStatus: "draft",
      updatedAt: new Date().toISOString(),
    };
    recordMutation(request, `dogs/${id}`);
    return jsonResponse({ ok: true });
  }
  return methodNotAllowed(operation ? ["POST"] : ["GET", "PATCH"]);
}

async function handleRecyclePoints(request: Request, idSegment?: string): Promise<Response> {
  if (!idSegment) {
    if (request.method === "GET") return jsonResponse(state.recyclePoints);
    if (request.method !== "POST") return methodNotAllowed(["GET", "POST"]);

    const parsedInput = recyclePointInputSchema.safeParse(await readJson<unknown>(request));
    if (!parsedInput.success) {
      return validationErrorResponse(
        parsedInput.error.issues[0]?.message ?? "Dados do ponto de coleta inválidos.",
      );
    }
    const input = parsedInput.data;
    const point = { ...input, schemaVersion: RECYCLE_POINT_DOCUMENT_SCHEMA_VERSION, id: `mock-recycle-${state.nextRecycleId++}`, ...publicationMetadata({}, input.publicationStatus) };
    state.recyclePoints.push(point);
    recordMutation(request, `recycle_points/${point.id}`);
    return jsonResponse({ id: point.id }, 201);
  }

  const id = decodeURIComponent(idSegment);
  const index = state.recyclePoints.findIndex((point) => point.id === id);
  if (index < 0) return jsonResponse({ error: "Recycle point not found." }, 404);

  if (request.method === "GET") return jsonResponse({
    ...state.recyclePoints[index], revision: state.recyclePoints[index].updatedAt ?? state.recyclePoints[index].publishedAt,
  });
  if (!supportsDocumentVersion(state.recyclePoints[index], RECYCLE_POINT_DOCUMENT_SCHEMA_VERSION)) {
    return jsonResponse({ error: "O ponto usa uma versão de dados mais recente ou inválida." }, 409);
  }
  if (request.method === "PATCH") {
    const parsedUpdate = recyclePointUpdateSchema.safeParse(await readJson<unknown>(request));
    if (!parsedUpdate.success) {
      return validationErrorResponse(
        parsedUpdate.error.issues[0]?.message ?? "Atualização do ponto de coleta inválida.",
      );
    }
    if (parsedUpdate.data.expectedUpdateTime && parsedUpdate.data.expectedUpdateTime !== (state.recyclePoints[index].updatedAt ?? state.recyclePoints[index].publishedAt)) {
      return jsonResponse({ error: "O ponto foi alterado por outra pessoa. Recarregue antes de salvar." }, 409);
    }
    const merged = recyclePointInputSchema.safeParse({ ...state.recyclePoints[index], ...parsedUpdate.data });
    if (!merged.success) return validationErrorResponse(merged.error.issues[0]?.message ?? "Ponto incompleto.");
    state.recyclePoints[index] = {
      ...state.recyclePoints[index], ...merged.data,
      ...publicationMetadata(state.recyclePoints[index], merged.data.publicationStatus), id,
    };
    recordMutation(request, `recycle_points/${id}`);
    return jsonResponse({ ok: true });
  }
  if (request.method === "DELETE") {
    state.recyclePoints.splice(index, 1);
    recordMutation(request, `recycle_points/${id}`);
    return noContentResponse();
  }
  return methodNotAllowed(["GET", "PATCH", "DELETE"]);
}

async function handleNotification(request: Request): Promise<Response> {
  if (request.method === "GET") return jsonResponse(state.notification);
  if (request.method === "PUT") {
    const input = await readJson<NotificationInput>(request);
    state.notification = {
      ...input,
      target: "admin",
      updatedAt: new Date().toISOString(),
      author: MOCK_AUTHOR,
      expiresAt: expirationDate(input.expiration),
    };
    recordMutation(request, "system/notifications");
    return jsonResponse(state.notification);
  }
  if (request.method === "DELETE") {
    state.notification = null;
    recordMutation(request, "system/notifications");
    return noContentResponse();
  }
  return methodNotAllowed(["GET", "PUT", "DELETE"]);
}

async function handleMedia(request: Request, operation: string): Promise<Response> {
  if (operation === "upload") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return jsonResponse({ error: "Invalid image file" }, 400);
    return jsonResponse({ url: createMockMediaUrl(file) }, 201);
  }

  if (operation === "delete") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    const { imageUrl } = await readJson<{ imageUrl?: unknown }>(request);
    if (state.dogs.some(dog => !supportsDocumentVersion(dog, DOG_DOCUMENT_SCHEMA_VERSION))) {
      return jsonResponse({ error: "Atualize a aplicação antes de excluir imagens de fichas com versões de dados mais recentes ou inválidas." }, 409);
    }
    if (state.dogs.some((dog) =>
      dog.fotos.includes(String(imageUrl)) || dog.retainedPhotos?.includes(String(imageUrl))
    )) {
      return jsonResponse({ error: "Image is linked to a dog." }, 409);
    }
    if (typeof imageUrl === "string") deleteMockMediaUrl(imageUrl);
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: "Not found" }, 404);
}

export async function handleMockAdminRequest(request: Request): Promise<Response> {
  await Promise.resolve();

  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);

  if (url.pathname === "/api/admin/system/settings") {
    if (request.method === "GET") return jsonResponse(state.systemSettings);
    if (request.method !== "PATCH") return methodNotAllowed(["GET", "PATCH"]);
    const input = systemSettingsSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return jsonResponse({ error: "Configuração inválida." }, 400);
    state.systemSettings = input.data;
    recordMutation(request, "system/settings");
    return jsonResponse(state.systemSettings);
  }

  if (url.pathname === "/api/session") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return jsonResponse({ email: MOCK_AUTHOR, role: "developer" });
  }

  if (url.pathname === "/api/admin/migrations") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return jsonResponse(state.migrations);
  }
  if (url.pathname === "/api/admin/migrations/plan" || url.pathname === "/api/admin/migrations/apply") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    const input = await request.json().catch(() => null) as { project?: string; release?: string } | null;
    if (input?.project !== state.migrations.project || input?.release !== state.migrations.release) {
      return jsonResponse({ error: "Atualize o destino simulado." }, 409);
    }
    const scanned = state.dogs.length + state.recyclePoints.length;
    if (url.pathname.endsWith("/plan")) {
      return jsonResponse({ counts: [{ id: "0001-publication-status", scanned, changes: 0 }], cursor: null });
    }
    state.migrations.migrations = state.migrations.migrations.map(m => ({ ...m, status: "completed", scanned, attempts: m.attempts + 1 }));
    recordMutation(request, "_migrations");
    return jsonResponse(state.migrations);
  }

  if (url.pathname === "/api/admin/dashboard") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    const now = Date.now();
    const expiringAdoptions = state.adoptions
      .filter((adoption) => {
        const expiry = Date.parse(adoption.expiresAt);
        return expiry >= now && expiry <= now + 5 * 86_400_000;
      })
      .map((adoption) => ({
        id: adoption.id,
        nome: adoption.nome_adotante,
        daysLeft: Math.max(0, Math.ceil((Date.parse(adoption.expiresAt) - now) / 86_400_000)),
      }))
      .sort((left, right) => left.daysLeft - right.daysLeft);

    return jsonResponse({
      metrics: {
        dogs: state.dogs.filter((dog) => !isDogArchived(dog)).length,
        recycles: state.recyclePoints.length,
        publishedDogs: state.dogs.filter(dog => !isDogArchived(dog) && isPublished(dog)).length,
        publishedRecycles: state.recyclePoints.filter(isPublished).length,
        adoptions: state.adoptions.length,
        adoptionsViaSite: state.adoptionsViaSite,
      },
      expiringAdoptions,
      notification: state.notification,
    });
  }

  if (url.pathname === "/api/admin/adoptions") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return jsonResponse(state.adoptions.map(adoptionSummary));
  }

  if (segments[2] === "adoptions" && segments.length === 4) {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    const adoption = state.adoptions.find((item) => item.id === segments[3]);
    if (!adoption) return jsonResponse({ error: "Adoption application not found." }, 404);
    return jsonResponse(adoption);
  }

  if (
    segments[2] === "adoptions" &&
    segments[4] === "status" &&
    segments.length === 5
  ) {
    if (request.method !== "PATCH") return methodNotAllowed(["PATCH"]);
    const adoption = state.adoptions.find((item) => item.id === segments[3]);
    if (!adoption) return jsonResponse({ error: "Adoption application not found." }, 404);
    const { status } = await readJson<{ status: AdoptionStatus }>(request);
    if (!["pending", "approved", "rejected"].includes(status)) return jsonResponse({ error: "Invalid status" }, 400);
    let update;
    try {
      update = adoptionStatusUpdate(adoption, status);
    } catch (error) {
      if (error instanceof AdoptionTransitionError) return jsonResponse({ error: error.message }, 409);
      throw error;
    }
    Object.assign(adoption, update);
    recordMutation(request, `adoption_application/${adoption.id}`);
    return jsonResponse({ ok: true, ...update });
  }

  if (segments[2] === "dogs" && segments.length <= 5) {
    const operation = segments[4];
    if (operation && operation !== "archive" && operation !== "restore") {
      return jsonResponse({ error: "Not found" }, 404);
    }
    return handleDogs(request, segments[3], operation);
  }

  if (segments[2] === "recycle-points" && segments.length <= 4) {
    return handleRecyclePoints(request, segments[3]);
  }

  if (url.pathname === "/api/admin/notifications") {
    return handleNotification(request);
  }

  if (url.pathname === "/api/admin/system-keys") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return jsonResponse(state.systemKeys);
  }

  if (url.pathname === "/api/admin/system-keys/rotate") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    state.systemKeys.forEach((key) => { key.active = false; });
    const number = state.systemKeys.length + 1;
    const created: SystemKey = {
      id: `mock-key-v${number}`,
      version: `mock-v${number}`,
      createdAt: new Date().toISOString(),
      author: MOCK_AUTHOR,
      counter: 0,
      active: true,
    };
    state.systemKeys.unshift(created);
    recordMutation(request, "system/keys");
    return jsonResponse({ id: created.id, version: created.version }, 201);
  }

  if (url.pathname === "/api/admin/audit-log") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return jsonResponse(state.auditLog);
  }

  if (segments[2] === "media" && segments.length === 4) {
    return handleMedia(request, segments[3] ?? "");
  }

  return jsonResponse({ error: "Not found" }, 404);
}
