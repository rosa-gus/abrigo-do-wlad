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
  revision: string;
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
  systemSettings: SystemSettings & { revision?: string };
  dogs: DogProps[];
  recyclePoints: RecyclePoint[];
  adoptions: MockAdoption[];
  notification: AdminNotification | null;
  systemKeys: SystemKey[];
  systemKeysRevision: string;
  adoptionsViaSite: number;
  auditLog: Array<Record<string, unknown>>;
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
    systemSettings: { acceptingApplications: true, revision: "2026-01-01T00:00:00.000Z" },
    dogs: [
      {
        id: 103,
        documentId: "mock-dog-103",
        revision: "2026-01-01T00:00:00.000Z",
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
        documentId: "mock-dog-102",
        revision: "2026-01-01T00:00:00.000Z",
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
        documentId: "mock-dog-101",
        revision: "2026-01-01T00:00:00.000Z",
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
        id: "eco-morumbi", revision: "2026-01-01T00:00:00.000Z",
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
        id: "pet-vila-sonia", revision: "2026-01-01T00:00:00.000Z",
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
        id: "coleta-campo-limpo", revision: "2026-01-01T00:00:00.000Z",
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
        revision: "2026-01-01T00:00:00.000Z",
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
        revision: "2026-01-01T00:00:00.000Z",
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
        revision: "2026-01-01T00:00:00.000Z",
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
      revision: "2026-01-01T00:00:00.000Z",
      message: "Este painel usa somente dados simulados locais.",
      type: "info",
      target: "admin",
      updatedAt: new Date().toISOString(),
      author: MOCK_AUTHOR,
      expiration: "until_deleted",
      expiresAt: null,
    },
    systemKeysRevision: "2026-01-01T00:00:00.000Z",
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
    revision,
    nome_adotante,
    telefone,
    animal_especifico,
    status,
    submittedAt,
    expiresAt,
  } = adoption;
  return {
    id,
    revision,
    nome_adotante,
    telefone,
    animal_especifico,
    status,
    submittedAt,
    expiresAt,
  };
}

function readableAdoption(adoption: MockAdoption): boolean {
  const expiry = Date.parse(adoption.expiresAt);
  return Number.isFinite(expiry) && expiry > Date.now();
}

function currentNotification(): AdminNotification | null {
  return state.notification?.expiresAt && Date.parse(state.notification.expiresAt) <= Date.now()
    ? null : state.notification;
}

function revisionResponse(body: unknown, revision?: string, status = 200): Response {
  const response = jsonResponse(body, status);
  response.headers.set("ETag", `"${revision ?? "absent"}"`);
  return response;
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

function mockPage<T extends { id?: string | number; documentId?: string; expiresAt?: string; publicationStatus?: string; status?: string }>(request: Request, data: T[], scope: string, byExpiry = false): Response {
  const params = new URL(request.url).searchParams;
  const limit = Number(params.get("limit") ?? 25);
  const publication = params.get("publicationStatus");
  const status = params.get("status");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (publication && !["draft", "published"].includes(publication)) || (status && !["pending", "approved", "rejected"].includes(status))) return jsonResponse({ error: "Invalid pagination filter." }, 400);
  const key = (item: T) => `${byExpiry ? `${item.expiresAt}:` : ""}${item.documentId ?? item.id}`;
  const bound = JSON.stringify({ scope, publication, status });
  let after = "";
  if (params.has("cursor")) {
    try {
      const cursor = JSON.parse(decodeURIComponent(atob(params.get("cursor")!)));
      if (cursor.scope !== bound || typeof cursor.after !== "string") throw new Error();
      after = cursor.after;
    } catch { return jsonResponse({ error: "Invalid pagination cursor." }, 400); }
  }
  const ordered = data.filter(item => (!publication || item.publicationStatus === publication) && (!status || item.status === status))
    .sort((left, right) => key(left) < key(right) ? -1 : key(left) > key(right) ? 1 : 0)
    .filter(item => key(item) > after);
  const items = ordered.slice(0, limit);
  const nextCursor = ordered.length > limit ? btoa(encodeURIComponent(JSON.stringify({ scope: bound, after: key(items.at(-1)!) }))) : null;
  return jsonResponse({ items, nextCursor });
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
      return mockPage(request, state.dogs.filter((dog) =>
        isDogArchived(dog) === (listState === "archived")
      ), `dogs:${listState}`);
    }
    if (request.method !== "POST") return methodNotAllowed(["GET", "POST"]);

    const parsedInput = dogInputSchema.safeParse(await readJson<unknown>(request));
    if (!parsedInput.success) {
      return validationErrorResponse(
        parsedInput.error.issues[0]?.message ?? "Dados do cachorro inválidos.",
      );
    }
    const input = parsedInput.data;
    const documentId = crypto.randomUUID();
    const dog = { ...input, schemaVersion: DOG_DOCUMENT_SCHEMA_VERSION, documentId, revision: new Date().toISOString(), ...publicationMetadata({}, input.publicationStatus) };
    state.dogs.push(dog);
    recordMutation(request, `dogs/${documentId}`);
    return jsonResponse({ id: documentId, documentId }, 201);
  }

  let routeId: string;
  try { routeId = decodeURIComponent(idSegment); } catch { return jsonResponse({ error: "Invalid dog ID." }, 400); }
  if (operation && request.method !== "POST") return methodNotAllowed(["POST"]);
  if (!operation && !["GET", "PATCH", "DELETE"].includes(request.method)) {
    return methodNotAllowed(["GET", "PATCH", "DELETE"]);
  }
  const matches = state.dogs.flatMap((dog, index) =>
    (routeId.startsWith("doc:") ? dog.documentId === routeId.slice(4) : dog.id === Number(routeId)) ? [index] : []
  );
  if (matches.length > 1) return jsonResponse({ error: "O identificador antigo corresponde a mais de uma ficha." }, 409);
  const index = matches[0] ?? -1;
  if (index < 0) return jsonResponse({ error: "Dog not found." }, 404);
  const id = state.dogs[index].documentId;

  if (request.method === "GET") {
    const response = jsonResponse(state.dogs[index]);
    response.headers.set("ETag", `"${state.dogs[index].revision}"`);
    return response;
  }
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
    const precondition = mockDogPrecondition(request, state.dogs[index], parsedUpdate.data.expectedUpdateTime);
    if (precondition) return precondition;
    const merged = dogInputSchema.safeParse({ ...state.dogs[index], ...parsedUpdate.data });
    if (!merged.success) return validationErrorResponse(merged.error.issues[0]?.message ?? "Ficha incompleta.");
    const previous = state.dogs[index];
    const removedPhotos = parsedUpdate.data.fotos
      ? previous.fotos.filter((photo) => !parsedUpdate.data.fotos?.includes(photo))
      : [];
    state.dogs[index] = {
      ...previous, ...merged.data, ...publicationMetadata(previous, merged.data.publicationStatus),
      revision: nextDogRevision(previous),
      retainedPhotos: Array.from(new Set([...(previous.retainedPhotos ?? []), ...removedPhotos])),
    };
    recordMutation(request, `dogs/${id}`);
    return jsonResponse({ ok: true });
  }
  if (request.method === "DELETE") {
    const precondition = mockDogPrecondition(request, state.dogs[index]);
    if (precondition) return precondition;
    if (isDogArchived(state.dogs[index]) || state.dogs[index].publicationStatus !== "draft") {
      return jsonResponse({ error: "Somente rascunhos não arquivados podem ser excluídos." }, 409);
    }
    state.dogs.splice(index, 1);
    recordMutation(request, `dogs/${id}`);
    return noContentResponse();
  }
  if (operation === "archive" && request.method === "POST") {
    const precondition = mockDogPrecondition(request, state.dogs[index]);
    if (precondition) return precondition;
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
      ...state.dogs[index], ...dates, revision: nextDogRevision(state.dogs[index]),
      archiveReason: input.reason,
      archivedBy: MOCK_AUTHOR,
      ...(shouldCountAdoption ? { adoptionCountedAt: dates.archivedAt } : {}),
    };
    if (shouldCountAdoption) state.adoptionsViaSite += 1;
    recordMutation(request, `dogs/${id}`);
    return jsonResponse({ ...dates, id });
  }
  if (operation === "restore" && request.method === "POST") {
    const precondition = mockDogPrecondition(request, state.dogs[index]);
    if (precondition) return precondition;
    if (!isDogArchived(state.dogs[index])) return jsonResponse({ ok: true });
    state.dogs[index] = {
      ...state.dogs[index], archivedAt: null, purgeAfter: null,
      archiveReason: null, archivedBy: null, publicationStatus: "draft",
      updatedAt: new Date().toISOString(),
      revision: nextDogRevision(state.dogs[index]),
    };
    recordMutation(request, `dogs/${id}`);
    return jsonResponse({ ok: true });
  }
  return methodNotAllowed(operation ? ["POST"] : ["GET", "PATCH"]);
}

function nextDogRevision(dog: DogProps): string {
  return new Date(Math.max(Date.now(), Date.parse(dog.revision ?? "") + 1)).toISOString();
}

function mockDogPrecondition(request: Request, dog: DogProps, legacyRevision?: string): Response | null {
  const actual = dog.revision;
  const expected = request.headers.get("If-Match") ?? (legacyRevision ? `"${legacyRevision}"` : null);
  if (!expected) return jsonResponse({ error: "Recarregue a ficha e revise antes de tentar novamente." }, 428);
  if (expected !== `"${actual}"`) return jsonResponse({ error: "A ficha foi alterada por outra pessoa. Recarregue e revise antes de tentar novamente." }, 412);
  return null;
}

function mockRevisionCheck(request: Request, revision: string | undefined, legacy?: string): Response | null {
  const expected = request.headers.get("If-Match") ?? (legacy ? `"${legacy}"` : null);
  if (!expected) return jsonResponse({ error: "Recarregue e revise antes de salvar." }, 428);
  if (expected !== `"${revision ?? "absent"}"`) return jsonResponse({ error: "O registro mudou. Recarregue e revise." }, 412);
  return null;
}

function nextRevision(previous?: string): string {
  return new Date(Math.max(Date.now(), (Date.parse(previous ?? "") || 0) + 1)).toISOString();
}

async function handleRecyclePoints(request: Request, idSegment?: string): Promise<Response> {
  if (!idSegment) {
    if (request.method === "GET") return mockPage(request, state.recyclePoints, "recycle_points");
    if (request.method !== "POST") return methodNotAllowed(["GET", "POST"]);

    const parsedInput = recyclePointInputSchema.safeParse(await readJson<unknown>(request));
    if (!parsedInput.success) {
      return validationErrorResponse(
        parsedInput.error.issues[0]?.message ?? "Dados do ponto de coleta inválidos.",
      );
    }
    const input = parsedInput.data;
    const point = { ...input, revision: nextRevision(), schemaVersion: RECYCLE_POINT_DOCUMENT_SCHEMA_VERSION, id: `mock-recycle-${state.nextRecycleId++}`, ...publicationMetadata({}, input.publicationStatus) };
    state.recyclePoints.push(point);
    recordMutation(request, `recycle_points/${point.id}`);
    return jsonResponse({ id: point.id }, 201);
  }

  const id = decodeURIComponent(idSegment);
  const index = state.recyclePoints.findIndex((point) => point.id === id);
  if (index < 0) return jsonResponse({ error: "Recycle point not found." }, 404);

  if (request.method === "GET") return revisionResponse({
    ...state.recyclePoints[index], revision: state.recyclePoints[index].revision,
  }, state.recyclePoints[index].revision);
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
    const precondition = mockRevisionCheck(request, state.recyclePoints[index].revision, parsedUpdate.data.expectedUpdateTime);
    if (precondition) return precondition;
    const merged = recyclePointInputSchema.safeParse({ ...state.recyclePoints[index], ...parsedUpdate.data });
    if (!merged.success) return validationErrorResponse(merged.error.issues[0]?.message ?? "Ponto incompleto.");
    state.recyclePoints[index] = {
      ...state.recyclePoints[index], ...merged.data,
      ...publicationMetadata(state.recyclePoints[index], merged.data.publicationStatus), id,
      revision: nextRevision(state.recyclePoints[index].revision),
    };
    recordMutation(request, `recycle_points/${id}`);
    return jsonResponse({ ok: true });
  }
  if (request.method === "DELETE") {
    const precondition = mockRevisionCheck(request, state.recyclePoints[index].revision);
    if (precondition) return precondition;
    state.recyclePoints.splice(index, 1);
    recordMutation(request, `recycle_points/${id}`);
    return noContentResponse();
  }
  return methodNotAllowed(["GET", "PATCH", "DELETE"]);
}

async function handleNotification(request: Request): Promise<Response> {
  if (request.method === "GET") {
    return revisionResponse(currentNotification(), state.notification?.revision);
  }
  if (!["PUT", "DELETE"].includes(request.method)) return methodNotAllowed(["GET", "PUT", "DELETE"]);
  const precondition = mockRevisionCheck(request, state.notification?.revision);
  if (precondition) return precondition;
  if (request.method === "PUT") {
    const input = await readJson<NotificationInput>(request);
    state.notification = {
      ...input,
      revision: nextRevision(state.notification?.revision),
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
    if (request.method === "GET") return revisionResponse(state.systemSettings, state.systemSettings.revision);
    if (request.method !== "PATCH") return methodNotAllowed(["GET", "PATCH"]);
    const input = systemSettingsSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return jsonResponse({ error: "Configuração inválida." }, 400);
    const precondition = mockRevisionCheck(request, state.systemSettings.revision);
    if (precondition) return precondition;
    state.systemSettings = { ...input.data, revision: nextRevision(state.systemSettings.revision) };
    recordMutation(request, "system/settings");
    return revisionResponse(state.systemSettings, state.systemSettings.revision);
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
    const readable = state.adoptions.filter(readableAdoption);
    const expiringAdoptions = readable
      .filter((adoption) => {
        const expiry = Date.parse(adoption.expiresAt);
        return expiry > now && expiry <= now + 5 * 86_400_000;
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
        adoptions: readable.length,
        adoptionsViaSite: state.adoptionsViaSite,
      },
      expiringAdoptions,
      notification: currentNotification(),
    });
  }

  if (url.pathname === "/api/admin/adoptions") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return mockPage(request, state.adoptions.filter(readableAdoption).map(adoptionSummary), "adoptions", true);
  }

  if (segments[2] === "adoptions" && segments.length === 4) {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    const adoption = state.adoptions.find((item) => item.id === segments[3]);
    if (!adoption || !readableAdoption(adoption)) return jsonResponse({ error: "Adoption application not found." }, 404);
    return revisionResponse(adoption, adoption.revision);
  }

  if (
    segments[2] === "adoptions" &&
    segments[4] === "status" &&
    segments.length === 5
  ) {
    if (request.method !== "PATCH") return methodNotAllowed(["PATCH"]);
    const adoption = state.adoptions.find((item) => item.id === segments[3]);
    if (!adoption) return jsonResponse({ error: "Adoption application not found." }, 404);
    const precondition = mockRevisionCheck(request, adoption.revision);
    if (precondition) return precondition;
    const { status } = await readJson<{ status: AdoptionStatus }>(request);
    if (!["pending", "approved", "rejected"].includes(status)) return jsonResponse({ error: "Invalid status" }, 400);
    let update;
    try {
      update = adoptionStatusUpdate(adoption, status);
    } catch (error) {
      if (error instanceof AdoptionTransitionError) return jsonResponse({ error: error.message }, 409);
      throw error;
    }
    Object.assign(adoption, update, { revision: nextRevision(adoption.revision) });
    recordMutation(request, `adoption_application/${adoption.id}`);
    return revisionResponse({ ok: true, ...update, revision: adoption.revision }, adoption.revision);
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
    return revisionResponse(state.systemKeys, state.systemKeysRevision);
  }

  if (url.pathname === "/api/admin/system-keys/rotate") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    const precondition = mockRevisionCheck(request, state.systemKeysRevision);
    if (precondition) return precondition;
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
    state.systemKeysRevision = nextRevision(state.systemKeysRevision);
    recordMutation(request, "system/keys");
    return revisionResponse({ id: created.id, version: created.version }, state.systemKeysRevision, 201);
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
